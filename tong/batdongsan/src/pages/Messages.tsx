import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { MessageCircle, Send, Search, ChevronLeft, Smile, Loader2, UserPlus, Lock, Users, Trash2, UserMinus, ShieldCheck, X } from "lucide-react";
import { io, Socket } from "socket.io-client";
import { useAuth, apiFetch, apiJsonFetch } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type DM = { id?: number; senderId: number; receiverId: number; content: string; createdAt: string; senderName?: string };
type Convo = { user: { id: number; name: string; phone: string }; lastMessage: DM };

type GroupMsg = { id: number; groupId: number; senderId: number; senderName: string | null; content: string; isDeleted: boolean; createdAt: string };
type Group = { id: number; name: string; description: string | null; myRole: number; lastMessage: GroupMsg | null; memberCount: number };
type Member = { id: number; userId: number; role: number; name: string | null; phone: string | null; joinedAt: string };

type ActiveChat = { kind: "dm"; userId: number } | { kind: "group"; groupId: number };

function timeShort(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}p`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export function Messages() {
  const { user, token, isLoggedIn } = useAuth();
  const [convos, setConvos] = useState<Convo[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [active, setActive] = useState<ActiveChat | null>(null);
  const [dms, setDms] = useState<DM[]>([]);
  const [groupMsgs, setGroupMsgs] = useState<GroupMsg[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [input, setInput] = useState("");
  const [showList, setShowList] = useState(true);
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResult, setSearchResult] = useState<{ id: number; name: string; phone: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeConvo = convos.find(c => c.user.id === (active?.kind === "dm" ? active.userId : -1));
  const activeGroup = groups.find(g => g.id === (active?.kind === "group" ? active.groupId : -1));
  const isGroupAdmin = activeGroup ? (activeGroup.myRole === 1 || user?.role === 1) : false;

  useEffect(() => {
    if (!isLoggedIn) return;

    socketRef.current = io(window.location.origin, {
      path: `${BASE}/api/socket.io`,
      query: { userId: user!.id },
      transports: ["polling", "websocket"],
    });

    socketRef.current.on("new_message", (msg: DM) => {
      setDms(prev => {
        if (active?.kind === "dm" && (active.userId === msg.senderId || active.userId === msg.receiverId)) {
          return [...prev, msg];
        }
        return prev;
      });
      loadConvos();
    });

    socketRef.current.on("new_group_message", (msg: GroupMsg) => {
      if (active?.kind === "group" && active.groupId === msg.groupId) {
        setGroupMsgs(prev => [...prev, msg]);
      }
      loadGroups();
    });

    socketRef.current.on("group_message_deleted", ({ msgId }: { msgId: number }) => {
      setGroupMsgs(prev => prev.map(m => m.id === msgId ? { ...m, isDeleted: true } : m));
    });

    socketRef.current.on("kicked_from_group", ({ groupId }: { groupId: number }) => {
      setGroups(prev => prev.filter(g => g.id !== groupId));
      if (active?.kind === "group" && active.groupId === groupId) {
        setActive(null);
        setShowList(true);
      }
    });

    loadConvos();
    loadGroups();
    return () => { socketRef.current?.disconnect(); };
  }, [isLoggedIn, user?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [dms, groupMsgs]);

  const loadConvos = async () => {
    if (!token) return;
    const { res, data } = await apiJsonFetch<Convo[]>("/messages/conversations", [], {}, token);
    setConvos(res.ok && Array.isArray(data) ? data : []);
  };

  const loadGroups = async () => {
    if (!token) return;
    const { res, data } = await apiJsonFetch<Group[]>("/groups", [], {}, token);
    setGroups(res.ok && Array.isArray(data) ? data : []);
  };

  const openDm = async (userId: number) => {
    setActive({ kind: "dm", userId });
    setShowList(false);
    setShowMembers(false);
    setLoadingMsgs(true);
    const { res, data } = await apiJsonFetch<DM[]>(`/messages/${userId}`, [], {}, token);
    setDms(res.ok && Array.isArray(data) ? data : []);
    setLoadingMsgs(false);
  };

  const openGroup = async (groupId: number) => {
    setActive({ kind: "group", groupId });
    setShowList(false);
    setShowMembers(false);
    setLoadingMsgs(true);
    socketRef.current?.emit("join_group", groupId);
    const [{ res: msgsRes, data: msgsData }, { res: membersRes, data: membersData }] = await Promise.all([
      apiJsonFetch<GroupMsg[]>(`/groups/${groupId}/messages`, [], {}, token),
      apiJsonFetch<Member[]>(`/groups/${groupId}/members`, [], {}, token),
    ]);
    setGroupMsgs(msgsRes.ok && Array.isArray(msgsData) ? msgsData : []);
    setMembers(membersRes.ok && Array.isArray(membersData) ? membersData : []);
    setLoadingMsgs(false);
  };

  const handleSend = async () => {
    if (!input.trim() || !active) return;
    const content = input.trim();
    setInput("");

    if (active.kind === "dm") {
      socketRef.current?.emit("send_message", { senderId: user!.id, receiverId: active.userId, content, senderName: user!.name });
      await apiFetch("/messages", { method: "POST", body: JSON.stringify({ receiverId: active.userId, content }) }, token);
      setDms(prev => [...prev, { senderId: user!.id, receiverId: active.userId, content, createdAt: new Date().toISOString() }]);
      loadConvos();
    } else if (active.kind === "group") {
      const { res, data: msg } = await apiJsonFetch<GroupMsg & { message?: string }>(
        `/groups/${active.groupId}/messages`,
        {} as GroupMsg & { message?: string },
        { method: "POST", body: JSON.stringify({ content }) },
        token,
      );
      if (!res.ok || !msg.id) {
        return;
      }
      socketRef.current?.emit("send_group_message", { groupId: active.groupId, content, senderId: user!.id, senderName: user!.name, msgId: msg.id });
      setGroupMsgs(prev => [...prev, msg]);
      loadGroups();
    }
  };

  const deleteGroupMsg = async (msgId: number) => {
    if (!active || active.kind !== "group") return;
    await apiFetch(`/groups/${active.groupId}/messages/${msgId}`, { method: "DELETE" }, token);
    socketRef.current?.emit("delete_group_message", { groupId: active.groupId, msgId });
    setGroupMsgs(prev => prev.map(m => m.id === msgId ? { ...m, isDeleted: true } : m));
  };

  const kickMember = async (targetUserId: number) => {
    if (!active || active.kind !== "group") return;
    if (!confirm("Kick thành viên này khỏi nhóm?")) return;
    await apiFetch(`/groups/${active.groupId}/members/${targetUserId}`, { method: "DELETE" }, token);
    socketRef.current?.emit("kick_member", { groupId: active.groupId, userId: targetUserId });
    setMembers(prev => prev.filter(m => m.userId !== targetUserId));
  };

  const handleSearch = async () => {
    setSearchResult(null);
    setSearching(true);
    const { res, data } = await apiJsonFetch<Array<{ id: number; name: string; phone: string }>>(
      `/users/search?phone=${encodeURIComponent(searchPhone)}`,
      [],
      {},
      token,
    );
    setSearching(false);
    if (res.ok && data.length > 0) setSearchResult(data[0]);
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Đăng nhập để nhắn tin</h2>
          <p className="text-muted-foreground text-sm mb-6">Kết nối trực tiếp với chủ nhà qua tin nhắn realtime</p>
          <div className="flex flex-col gap-3">
            <Link href="/dang-nhap"><Button className="w-full bg-primary">Đăng nhập</Button></Link>
            <Link href="/dang-ky"><Button variant="outline" className="w-full">Tạo tài khoản mới</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] lg:h-[calc(100vh-80px)] bg-[#f0f2f5]">
      {/* ── Sidebar ── */}
      <div className={`${showList ? "flex" : "hidden"} lg:flex flex-col w-full lg:w-80 bg-white border-r border-border shrink-0`}>
        <div className="p-4 border-b border-border">
          <h2 className="text-xl font-bold text-foreground mb-3">Tin nhắn</h2>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                className="w-full pl-9 pr-4 py-2 bg-muted/50 rounded-full text-sm focus:outline-none"
                placeholder="Tìm theo SĐT..."
                value={searchPhone}
                onChange={e => setSearchPhone(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
              />
            </div>
            <button onClick={handleSearch} disabled={!searchPhone} className="bg-primary text-white rounded-full w-9 h-9 flex items-center justify-center shrink-0 disabled:opacity-40">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>
          {searchResult && (
            <div className="mt-2 bg-primary/5 rounded-xl p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0">{searchResult.name[0]}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground truncate">{searchResult.name}</p>
                <p className="text-xs text-muted-foreground">{searchResult.phone}</p>
              </div>
              <button onClick={() => { openDm(searchResult.id); setSearchPhone(""); setSearchResult(null); }} className="text-primary hover:text-primary/80">
                <UserPlus className="w-5 h-5" />
              </button>
            </div>
          )}
          {searchPhone && !searchResult && !searching && <p className="text-xs text-muted-foreground mt-2 px-1">Không tìm thấy người dùng</p>}
        </div>

        <div className="overflow-y-auto flex-1">
          {groups.map(g => (
            <button
              key={`group-${g.id}`}
              onClick={() => openGroup(g.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left ${active?.kind === "group" && active.groupId === g.id ? "bg-primary/5" : ""}`}
            >
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-bold text-foreground truncate">{g.name}</p>
                  {g.myRole === 1 && <ShieldCheck className="w-3 h-3 text-amber-500 shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {g.lastMessage ? (g.lastMessage.isDeleted ? "Tin nhắn đã bị xóa" : `${g.lastMessage.senderName}: ${g.lastMessage.content}`) : `${g.memberCount} thành viên`}
                </p>
              </div>
              {g.lastMessage && <span className="text-[10px] text-muted-foreground shrink-0">{timeShort(g.lastMessage.createdAt)}</span>}
            </button>
          ))}

          {convos.length === 0 && groups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm px-4">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <p>Chưa có tin nhắn nào</p>
              <p className="text-xs mt-1">Tìm người dùng theo SĐT để bắt đầu chat</p>
            </div>
          ) : (
            convos.map(c => (
              <button
                key={`dm-${c.user.id}`}
                onClick={() => openDm(c.user.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left ${active?.kind === "dm" && active.userId === c.user.id ? "bg-primary/5" : ""}`}
              >
                <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center text-white font-bold shrink-0">{c.user.name[0].toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{c.user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.lastMessage?.content}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Chat area ── */}
      <div className={`${!showList ? "flex" : "hidden"} lg:flex flex-col flex-1 min-w-0`}>
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-3">
            <MessageCircle className="w-16 h-16 text-muted-foreground/20" />
            <p className="text-sm">Chọn một cuộc trò chuyện</p>
          </div>
        ) : active.kind === "dm" ? (
          <>
            <div className="bg-white border-b border-border px-4 py-3 flex items-center gap-3">
              <button className="lg:hidden text-muted-foreground" onClick={() => setShowList(true)}><ChevronLeft className="w-5 h-5" /></button>
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white font-bold shrink-0">{activeConvo?.user.name[0].toUpperCase() ?? "?"}</div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-foreground">{activeConvo?.user.name}</p>
                <p className="text-xs text-green-500 font-medium">Đang hoạt động</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMsgs ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : dms.map((msg, i) => {
                const isMe = msg.senderId === user!.id;
                return (
                  <div key={i} className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                    {!isMe && <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">{activeConvo?.user.name[0].toUpperCase() ?? "?"}</div>}
                    <div className={`max-w-[70%] flex flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
                      <div className={`px-3 py-2 rounded-2xl text-sm ${isMe ? "bg-primary text-white rounded-br-sm" : "bg-white text-foreground rounded-bl-sm shadow-sm"}`}>{msg.content}</div>
                      <span className="text-[10px] text-muted-foreground px-1">{new Date(msg.createdAt).toLocaleTimeString("vi", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            <div className="bg-white border-t border-border p-3 flex items-center gap-2">
              <button className="text-primary p-2 hover:bg-muted rounded-full shrink-0"><Smile className="w-5 h-5" /></button>
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()} placeholder="Nhập tin nhắn..." className="flex-1 bg-muted/50 rounded-full px-4 py-2 text-sm focus:outline-none" />
              <button onClick={handleSend} disabled={!input.trim()} className="w-9 h-9 bg-primary text-white rounded-full flex items-center justify-center disabled:opacity-40 shrink-0"><Send className="w-4 h-4" /></button>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white border-b border-border px-4 py-3 flex items-center gap-3">
              <button className="lg:hidden text-muted-foreground" onClick={() => setShowList(true)}><ChevronLeft className="w-5 h-5" /></button>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white shrink-0"><Users className="w-4 h-4" /></div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-foreground">{activeGroup?.name}</p>
                <p className="text-xs text-muted-foreground">{activeGroup?.memberCount} thành viên</p>
              </div>
              {isGroupAdmin && (
                <button onClick={() => setShowMembers(!showMembers)} className={`p-2 rounded-full transition-colors ${showMembers ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`} title="Quản lý thành viên">
                  <Users className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {loadingMsgs ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : groupMsgs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p>Chưa có tin nhắn nào trong nhóm</p>
                  </div>
                ) : groupMsgs.map(msg => {
                  const isMe = msg.senderId === user!.id;
                  const canDelete = isGroupAdmin || isMe;
                  return (
                    <div key={msg.id} className={`flex items-end gap-2 group ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                      {!isMe && (
                        <div className="w-7 h-7 rounded-full bg-primary/80 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {msg.senderName?.[0]?.toUpperCase() ?? "?"}
                        </div>
                      )}
                      <div className={`max-w-[65%] flex flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}>
                        {!isMe && <span className="text-[10px] text-muted-foreground px-1 font-semibold">{msg.senderName}</span>}
                        <div className={`relative px-3 py-2 rounded-2xl text-sm ${msg.isDeleted ? "bg-muted text-muted-foreground italic text-xs" : isMe ? "bg-primary text-white rounded-br-sm" : "bg-white text-foreground rounded-bl-sm shadow-sm"}`}>
                          {msg.isDeleted ? "Tin nhắn đã bị xóa" : msg.content}
                          {!msg.isDeleted && canDelete && (
                            <button
                              onClick={() => deleteGroupMsg(msg.id)}
                              className={`absolute -top-1 ${isMe ? "-left-6" : "-right-6"} opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-full bg-white shadow-sm border border-border text-red-500 hover:bg-red-50`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground px-1">{new Date(msg.createdAt).toLocaleTimeString("vi", { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {showMembers && isGroupAdmin && (
                <div className="w-64 bg-white border-l border-border overflow-y-auto shrink-0">
                  <div className="p-3 border-b border-border flex items-center justify-between">
                    <h3 className="font-bold text-sm">Thành viên ({members.length})</h3>
                    <button onClick={() => setShowMembers(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                  </div>
                  {members.map(m => (
                    <div key={m.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40">
                      <div className="w-8 h-8 rounded-full bg-primary/80 flex items-center justify-center text-white text-xs font-bold shrink-0">{m.name?.[0]?.toUpperCase() ?? "?"}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate flex items-center gap-1">
                          {m.name}
                          {m.role === 1 && <ShieldCheck className="w-3 h-3 text-amber-500 shrink-0" />}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{m.phone}</p>
                      </div>
                      {m.userId !== user!.id && m.role !== 1 && (
                        <button onClick={() => kickMember(m.userId)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors" title="Kick khỏi nhóm">
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border-t border-border p-3 flex items-center gap-2">
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()} placeholder={`Nhắn tin trong ${activeGroup?.name}...`} className="flex-1 bg-muted/50 rounded-full px-4 py-2 text-sm focus:outline-none" />
              <button onClick={handleSend} disabled={!input.trim()} className="w-9 h-9 bg-primary text-white rounded-full flex items-center justify-center disabled:opacity-40 shrink-0"><Send className="w-4 h-4" /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
