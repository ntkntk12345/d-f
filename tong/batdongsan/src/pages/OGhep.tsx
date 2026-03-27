import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Heart, MessageCircle, Send, Trash2, MapPin, Users, Wallet, ChevronDown, ChevronUp, PlusCircle, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { useAuth, apiFetch, apiJsonFetch } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

interface RoommatePost {
  id: number;
  userId: number;
  authorName: string;
  authorAvatar: string | null;
  content: string;
  images: string[];
  province: string | null;
  district: string | null;
  budget: number | null;
  gender: string | null;
  slots: number | null;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
}

interface RoommateComment {
  id: number;
  userId: number;
  authorName: string;
  authorAvatar: string | null;
  content: string;
  createdAt: string;
}

function normalizeImageList(images: unknown): string[] {
  const sanitize = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];

  if (Array.isArray(images)) {
    return sanitize(images);
  }

  if (typeof images === "string") {
    const trimmed = images.trim();
    if (!trimmed) return [];

    try {
      return sanitize(JSON.parse(trimmed));
    } catch {
      return [trimmed];
    }
  }

  return [];
}

function normalizeRoommatePost(post: RoommatePost): RoommatePost {
  return {
    ...post,
    images: normalizeImageList(post.images),
  };
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} phút`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} ngày`;
  return new Date(dateStr).toLocaleDateString("vi-VN");
}

function Avatar({ name, avatar, size = 40 }: { name: string; avatar: string | null; size?: number }) {
  const colors = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6"];
  const color = colors[(name.charCodeAt(0) || 0) % colors.length];
  if (avatar) return <img src={avatar} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  return (
    <div className="rounded-full flex items-center justify-center shrink-0 text-white font-bold" style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function CommentSection({ postId, token, user, onCountChange }: {
  postId: number;
  token: string | null;
  user: { id: number; name: string } | null;
  onCountChange: (delta: number) => void;
}) {
  const [comments, setComments] = useState<RoommateComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiJsonFetch<RoommateComment[]>(`/roommate/posts/${postId}/comments`, [])
      .then(({ res, data }) => {
        setComments(res.ok && Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setComments([]);
      })
      .finally(() => setLoading(false));
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [postId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const { res, data } = await apiJsonFetch<RoommateComment & { message?: string }>(
        `/roommate/posts/${postId}/comments`,
        {} as RoommateComment & { message?: string },
        {
          method: "POST",
          body: JSON.stringify({ content: text.trim() }),
        },
        token,
      );
      if (!res.ok) { toast({ title: data.message, variant: "destructive" }); return; }
      setComments(prev => [...prev, data]);
      onCountChange(1);
      setText("");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (id: number) => {
    await apiFetch(`/roommate/comments/${id}`, { method: "DELETE" }, token);
    setComments(prev => prev.filter(c => c.id !== id));
    onCountChange(-1);
  };

  return (
    <div className="border-t border-border bg-muted/35 px-4 pb-3">
      {loading ? (
        <div className="py-3 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="space-y-3 py-2 max-h-64 overflow-y-auto">
            {comments.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Chưa có bình luận nào</p>}
            {comments.map(c => (
              <div key={c.id} className="flex gap-2">
                <Avatar name={c.authorName} avatar={c.authorAvatar} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="inline-block max-w-full rounded-2xl border border-border bg-white px-3 py-2 shadow-sm">
                    <p className="text-xs font-bold text-foreground">{c.authorName}</p>
                    <p className="text-sm text-foreground break-words">{c.content}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-1 pl-1">
                    <span className="text-[10px] text-muted-foreground">{timeAgo(c.createdAt)}</span>
                    {user && c.userId === user.id && (
                      <button onClick={() => deleteComment(c.id)} className="text-[10px] text-red-400 hover:text-red-600">Xóa</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {user ? (
            <form onSubmit={submit} className="flex gap-2 pt-2">
              <Avatar name={user.name} avatar={null} size={28} />
              <div className="flex-1 flex gap-2">
                <input
                  ref={inputRef}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Viết bình luận..."
                  className="flex-1 rounded-full border border-border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button type="submit" disabled={submitting || !text.trim()} className="text-primary disabled:opacity-40">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              <Link href="/dang-nhap" className="text-primary font-semibold hover:underline">Đăng nhập</Link> để bình luận
            </p>
          )}
        </>
      )}
    </div>
  );
}

function PostCard({ post: initialPost, token, user, onDelete }: {
  post: RoommatePost;
  token: string | null;
  user: { id: number; name: string } | null;
  onDelete: (id: number) => void;
}) {
  const [post, setPost] = useState(() => normalizeRoommatePost(initialPost));
  const [showComments, setShowComments] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    setPost(normalizeRoommatePost(initialPost));
  }, [initialPost]);

  useEffect(() => {
    if (imgIdx >= post.images.length) {
      setImgIdx(0);
    }
  }, [imgIdx, post.images.length]);

  const toggleLike = async () => {
    if (!user) { toast({ title: "Đăng nhập để thích bài viết", variant: "destructive" }); return; }
    const { res, data } = await apiJsonFetch<{ liked?: boolean; likeCount?: number; message?: string }>(
      `/roommate/posts/${post.id}/like`,
      {},
      { method: "POST" },
      token,
    );
    if (!res.ok) {
      toast({ title: data.message || "Không thể thực hiện thao tác", variant: "destructive" });
      return;
    }
    setPost((p) => ({
      ...p,
      isLiked: data.liked ?? p.isLiked,
      likeCount: data.likeCount ?? p.likeCount,
    }));
  };

  const handleCommentCountChange = (delta: number) => {
    setPost(p => ({ ...p, commentCount: p.commentCount + delta }));
  };

  const handleDelete = async () => {
    if (!confirm("Xóa bài đăng này?")) return;
    await apiFetch(`/roommate/posts/${post.id}`, { method: "DELETE" }, token);
    onDelete(post.id);
  };

  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <Avatar name={post.authorName} avatar={post.authorAvatar} size={42} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-sm text-foreground leading-tight">{post.authorName}</p>
                <p className="text-xs text-muted-foreground">{timeAgo(post.createdAt)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {post.province && (
                  <span className="flex items-center gap-1 rounded-full border border-primary/15 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    <MapPin className="w-3 h-3" />
                    {post.district ? `${post.district}, ${post.province}` : post.province}
                  </span>
                )}
                {user && post.userId === user.id && (
                  <button onClick={handleDelete} className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-primary/5 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap">{post.content}</p>

        {(post.budget || post.gender || (post.slots && post.slots > 1)) && (
          <div className="flex flex-wrap gap-2 mt-3">
            {post.budget && (
              <span className="flex items-center gap-1 rounded-full border border-primary/15 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                <Wallet className="w-3 h-3" />
                {post.budget >= 1000 ? `${(post.budget / 1000000).toFixed(1)}tr` : `${post.budget}đ`}/tháng
              </span>
            )}
            {post.gender && (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                {post.gender === "male" ? "🚹 Nam" : post.gender === "female" ? "🚺 Nữ" : "🚻 Không phân biệt"}
              </span>
            )}
            {post.slots && post.slots > 1 && (
              <span className="flex items-center gap-1 rounded-full border border-primary/10 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary">
                <Users className="w-3 h-3" />
                {post.slots} người ghép
              </span>
            )}
          </div>
        )}
      </div>

      {post.images.length > 0 && (
        <div className="relative">
          <img src={post.images[imgIdx]} alt="" className="w-full max-h-80 object-cover" />
          {post.images.length > 1 && (
            <div className="absolute bottom-2 right-2 flex gap-1">
              {post.images.map((_, i) => (
                <button key={i} onClick={() => setImgIdx(i)} className={`w-2 h-2 rounded-full transition-all ${i === imgIdx ? "bg-white scale-125" : "bg-white/50"}`} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="px-4 py-1 border-t border-border">
        {(post.likeCount > 0 || post.commentCount > 0) && (
          <div className="flex items-center justify-between py-1.5 text-xs text-muted-foreground">
            {post.likeCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                  <Heart className="w-2.5 h-2.5 text-white fill-white" />
                </span>
                {post.likeCount}
              </span>
            )}
            {post.commentCount > 0 && (
              <button onClick={() => setShowComments(!showComments)} className="ml-auto hover:text-primary hover:underline">
                {post.commentCount} bình luận
              </button>
            )}
          </div>
        )}
        <div className="flex border-t border-border/60">
          <button
            onClick={toggleLike}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors hover:bg-primary/5 ${post.isLiked ? "text-primary" : "text-muted-foreground"}`}
          >
            <Heart className={`w-4 h-4 ${post.isLiked ? "fill-primary" : ""}`} />
            Thích
          </button>
          <button
            onClick={() => setShowComments(!showComments)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary"
          >
            <MessageCircle className="w-4 h-4" />
            Bình luận
          </button>
        </div>
      </div>

      {showComments && (
        <CommentSection
          postId={post.id}
          token={token}
          user={user}
          onCountChange={handleCommentCountChange}
        />
      )}
    </div>
  );
}

function CreatePostModal({ token, user, onCreated, onClose }: {
  token: string | null;
  user: { id: number; name: string } | null;
  onCreated: (post: RoommatePost) => void;
  onClose: () => void;
}) {
  const [content, setContent] = useState("");
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [budget, setBudget] = useState("");
  const [gender, setGender] = useState("");
  const [slots, setSlots] = useState("1");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) { toast({ title: "Vui lòng nhập nội dung", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const { res, data } = await apiJsonFetch<RoommatePost & { message?: string }>(
        "/roommate/posts",
        {} as RoommatePost & { message?: string },
        {
          method: "POST",
          body: JSON.stringify({
            content,
            province: province || undefined,
            district: district || undefined,
            budget: budget ? Number(budget) * 1000000 : undefined,
            gender: gender || undefined,
            slots: slots ? Number(slots) : 1,
          }),
        },
        token,
      );
      if (!res.ok) { toast({ title: data.message, variant: "destructive" }); return; }
      onCreated(data);
      onClose();
      toast({ title: "Đã đăng bài thành công!" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 px-4 pb-4 backdrop-blur-sm sm:items-center sm:pb-0" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-primary/5 px-5 py-4">
          <h2 className="font-bold text-lg text-foreground">Đăng bài tìm người ghép</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted/50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="flex gap-3">
            {user && <Avatar name={user.name} avatar={null} size={40} />}
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={`${user?.name ?? "Bạn"} đang tìm người ghép phòng...`}
              rows={4}
              className="flex-1 resize-none rounded-xl border border-border bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">📍 Tỉnh/Thành</label>
              <input
                value={province}
                onChange={e => setProvince(e.target.value)}
                placeholder="VD: Hà Nội"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">🗺️ Quận/Huyện</label>
              <input
                value={district}
                onChange={e => setDistrict(e.target.value)}
                placeholder="VD: Cầu Giấy"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">💰 Ngân sách (triệu/tháng)</label>
              <input
                type="number"
                value={budget}
                onChange={e => setBudget(e.target.value)}
                placeholder="VD: 3"
                min="0"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">👥 Số người ghép</label>
              <input
                type="number"
                value={slots}
                onChange={e => setSlots(e.target.value)}
                min="1"
                max="10"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">🚻 Giới tính ưu tiên</label>
            <select value={gender} onChange={e => setGender(e.target.value)} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">Không phân biệt</option>
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
            </select>
          </div>

          <Button type="submit" disabled={loading || !content.trim()} className="w-full h-11 rounded-xl font-semibold">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Đang đăng...</> : "Đăng bài"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export function OGhep() {
  const { user, token, isLoggedIn } = useAuth();
  const [posts, setPosts] = useState<RoommatePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const { toast } = useToast();

  const fetchPosts = async (p = 1, append = false) => {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const { res, data } = await apiJsonFetch<{ data?: RoommatePost[]; totalPages?: number }>(
        `/roommate/posts?page=${p}`,
        {},
        {},
        token,
      );
      const nextPosts = res.ok && Array.isArray(data.data) ? data.data.map(normalizeRoommatePost) : [];
      setPosts(prev => append ? [...prev, ...nextPosts] : nextPosts);
      setTotalPages(res.ok ? (data.totalPages ?? 1) : 1);
      setPage(p);
      if (!res.ok && p === 1) {
        toast({ title: "Không thể tải bài đăng ở ghép", variant: "destructive" });
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { fetchPosts(1); }, [token]);

  const handleCreated = (post: RoommatePost) => {
    setPosts(prev => [normalizeRoommatePost(post), ...prev]);
  };

  const handleDelete = (id: number) => {
    setPosts(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#f8f8f8] pt-16 pb-8">
      <div className="mx-auto max-w-xl px-4 py-6">

        <div className="mb-5 rounded-[28px] border border-primary/10 bg-gradient-to-br from-white via-white to-primary/5 px-5 py-5 shadow-sm">
          <h1 className="text-xl font-extrabold text-foreground">👥 Tìm người ở ghép</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Chia sẻ, kết nối, tìm bạn cùng phòng</p>
        </div>

        {isLoggedIn ? (
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-border bg-white p-3 shadow-sm">
            <Avatar name={user!.name} avatar={null} size={40} />
            <button
              onClick={() => setShowCreate(true)}
              className="flex-1 rounded-full bg-muted px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/80"
            >
              Bạn đang tìm người ở ghép?
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              <PlusCircle className="w-4 h-4" />
              Đăng
            </button>
          </div>
        ) : (
          <div className="mb-5 rounded-2xl border border-border bg-white p-4 text-center shadow-sm">
            <p className="text-sm text-muted-foreground mb-3">Đăng nhập để đăng bài, thích và bình luận</p>
            <div className="flex gap-2 justify-center">
              <Link href="/dang-nhap">
                <Button size="sm" className="rounded-xl">Đăng nhập</Button>
              </Link>
              <Link href="/dang-ky">
                <Button size="sm" variant="outline" className="rounded-xl">Đăng ký</Button>
              </Link>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse rounded-2xl border border-border bg-white p-4 shadow-sm">
                <div className="mb-3 flex gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/3 rounded bg-muted" />
                    <div className="h-2 w-1/4 rounded bg-muted" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 rounded bg-muted" />
                  <div className="h-3 w-4/5 rounded bg-muted" />
                  <div className="h-3 w-2/3 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white py-16 text-center shadow-sm">
            <div className="text-5xl mb-3">👥</div>
            <p className="font-bold text-foreground mb-1">Chưa có bài đăng nào</p>
            <p className="text-sm text-muted-foreground mb-4">Hãy là người đầu tiên tìm người ở ghép!</p>
            {isLoggedIn && (
              <Button onClick={() => setShowCreate(true)} className="rounded-xl">
                <PlusCircle className="w-4 h-4 mr-2" />
                Đăng bài ngay
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map(post => (
              <PostCard key={post.id} post={post} token={token} user={user} onDelete={handleDelete} />
            ))}

            {page < totalPages && (
              <div className="text-center pt-2">
                <Button variant="outline" onClick={() => fetchPosts(page + 1, true)} disabled={loadingMore} className="rounded-xl">
                  {loadingMore ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Đang tải...</> : "Xem thêm bài đăng"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <CreatePostModal
          token={token}
          user={user}
          onCreated={handleCreated}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
