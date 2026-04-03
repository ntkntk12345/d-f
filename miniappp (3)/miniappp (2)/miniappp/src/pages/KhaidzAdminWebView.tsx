import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Tab = "dashboard" | "users" | "tasks" | "withdrawals" | "giftcodes" | "economy" | "lucky";

const API = "/api";
const TOKEN_KEY = "admin_token";
const DEFAULT_ECONOMY = {
  newUserGold: 1000,
  referralRewardGold: 0,
  referralRewardUsdt: 0.02,
  withdrawMinGold: 6000000,
  withdrawVndPerGold: 1,
  usdToVndRateK: 28,
  taskMilestoneCount: 0,
  taskMilestoneRewardGold: 0,
};

const n = (v: unknown, f = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : f;
};
const fmtInt = (v: number) => Math.floor(n(v)).toLocaleString("vi-VN");
const fmtUsd = (v: number) => `$${n(v).toFixed(6).replace(/\.?0+$/, "")}`;

export function KhaidzAdminWebView() {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || "");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");

  const [snapshot, setSnapshot] = useState<any>({
    users: [],
    totalGold: 0,
    totalUsdt: 0,
    pendingWithdraws: [],
    giftCodes: [],
    tasks: [],
    levels: [],
    flappyConfig: { rewardGold: 15000 },
    economyConfig: DEFAULT_ECONOMY,
  });
  const [schedules, setSchedules] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [editGold, setEditGold] = useState(0);
  const [editUsd, setEditUsd] = useState(0);
  const [newUserId, setNewUserId] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [adjUserId, setAdjUserId] = useState("");
  const [adjType, setAdjType] = useState<"gold" | "usdt">("gold");
  const [adjAmount, setAdjAmount] = useState("");

  const [taskIdEditing, setTaskIdEditing] = useState("");
  const [taskForm, setTaskForm] = useState<any>({
    id: "",
    title: "",
    icon: "TASK",
    rewardType: "gold",
    rewardAmount: 1000,
    url: "",
    type: "community",
    actionType: "click",
    telegramChatId: "",
  });

  const [giftCode, setGiftCode] = useState("");
  const [giftGold, setGiftGold] = useState(0);
  const [giftMax, setGiftMax] = useState(100);

  const [economy, setEconomy] = useState(DEFAULT_ECONOMY);
  const [flappyReward, setFlappyReward] = useState(15000);
  const [levelDraft, setLevelDraft] = useState<Record<number, { dailyGoldCap: number; upgradeCost: number }>>({});

  const [schDate, setSchDate] = useState("");
  const [schRank, setSchRank] = useState(1);
  const [schType, setSchType] = useState<"fake" | "real">("fake");
  const [schValue, setSchValue] = useState("");

  const api = useCallback(
    async (path: string, method = "GET", body?: unknown) => {
      if (!token) throw new Error("Thieu token admin.");
      const res = await fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `AdminPass ${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.message || `Request failed (${res.status})`);
      return data;
    },
    [token],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [data, lucky] = await Promise.all([api("/admin/data"), api("/admin/lucky-draw/schedule")]);
      data.levels = [...(data.levels || [])].sort((a: any, b: any) => n(a.level) - n(b.level));
      setSnapshot({
        ...data,
        flappyConfig: { rewardGold: n(data?.flappyConfig?.rewardGold, 15000) },
        economyConfig: { ...DEFAULT_ECONOMY, ...(data?.economyConfig || {}) },
      });
      setEconomy({ ...DEFAULT_ECONOMY, ...(data?.economyConfig || {}) });
      setFlappyReward(n(data?.flappyConfig?.rewardGold, 15000));
      setLevelDraft(
        (data.levels || []).reduce((acc: Record<number, { dailyGoldCap: number; upgradeCost: number }>, lv: any) => {
          acc[n(lv.level)] = { dailyGoldCap: n(lv.dailyGoldCap, 1000), upgradeCost: n(lv.upgradeCost, 0) };
          return acc;
        }, {}),
      );
      setSchedules(Array.isArray(lucky) ? lucky : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Khong tai duoc du lieu.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!token) return;
    void loadData();
  }, [loadData, token]);

  useEffect(() => {
    if (!token) return;
    const source = new EventSource(`${API}/admin/events?token=${encodeURIComponent(token)}`);
    const onRefresh = () => void loadData();
    source.addEventListener("connected", onRefresh);
    source.addEventListener("admin-refresh", onRefresh);
    source.onerror = () => source.close();
    return () => source.close();
  }, [loadData, token]);

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
  };

  const onLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError("");
    try {
      const res = await fetch(`${API}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.token) {
        setLoginError(data?.message || "Dang nhap that bai.");
        return;
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
    } catch {
      setLoginError("Khong ket noi duoc server.");
    }
  };

  const usersFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return snapshot.users || [];
    return (snapshot.users || []).filter((u: any) => String(u.teleId).includes(q) || String(u.username || "").toLowerCase().includes(q));
  }, [search, snapshot.users]);

  const openEditUser = (u: any) => {
    setEditUserId(n(u.teleId));
    setEditGold(Math.floor(n(u.gold)));
    setEditUsd(n(u.usdtBalance));
  };

  const saveUser = async () => {
    if (!editUserId) return;
    await api("/admin/user/update", "POST", { teleId: editUserId, gold: Math.max(0, Math.floor(editGold)), usdtBalance: Math.max(0, Number(editUsd.toFixed(6))) });
    setEditUserId(null);
    await loadData();
  };

  const createUser = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await api("/admin/user/create", "POST", { teleId: newUserId.trim(), username: newUsername.trim() });
    setNewUserId("");
    setNewUsername("");
    await loadData();
  };

  const adjust = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await api("/admin/adjust", "POST", { targetTeleId: adjUserId.trim(), type: adjType, amount: Number(adjAmount) });
    setAdjAmount("");
    await loadData();
  };

  const saveTask = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await api("/admin/config/task", "POST", {
      id: String(taskForm.id || "").trim(),
      title: String(taskForm.title || "").trim(),
      icon: String(taskForm.icon || "").trim(),
      rewardType: taskForm.rewardType === "usdt" ? "usdt" : "gold",
      rewardAmount: Math.max(0, Number(taskForm.rewardAmount || 0)),
      url: String(taskForm.url || "").trim() || null,
      type: taskForm.type || "community",
      actionType: taskForm.actionType || "click",
      telegramChatId: String(taskForm.telegramChatId || "").trim() || null,
    });
    setTaskIdEditing("");
    setTaskForm({ id: "", title: "", icon: "TASK", rewardType: "gold", rewardAmount: 1000, url: "", type: "community", actionType: "click", telegramChatId: "" });
    await loadData();
  };

  const editTask = (t: any) => {
    setTaskIdEditing(String(t.id));
    setTaskForm({ ...t, rewardType: t.rewardType === "usdt" ? "usdt" : "gold", url: t.url || "", telegramChatId: t.telegramChatId || "" });
  };

  const removeTask = async (id: string) => {
    if (!window.confirm(`Xoa nhiem vu "${id}"?`)) return;
    await api(`/admin/config/task/${encodeURIComponent(id)}`, "DELETE");
    await loadData();
  };

  const saveGift = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await api("/admin/giftcode/add", "POST", { code: giftCode.trim().toUpperCase(), rewardGold: Math.max(0, Math.floor(giftGold)), maxUses: Math.max(1, Math.floor(giftMax)) });
    setGiftCode("");
    setGiftGold(0);
    setGiftMax(100);
    await loadData();
  };

  const removeGift = async (code: string) => {
    if (!window.confirm(`Xoa giftcode "${code}"?`)) return;
    await api("/admin/giftcode/delete", "POST", { code });
    await loadData();
  };

  const changeWithdraw = async (id: number, status: string) => {
    const reason = status === "Bi tu choi" ? window.prompt("Ly do tu choi:", "Vi pham chinh sach") || "" : "";
    if (!window.confirm(`Cap nhat don #${id} => ${status}?`)) return;
    await api("/admin/withdraw/status", "POST", { withdrawId: id, newStatus: status, reason });
    await loadData();
  };

  const saveLevel = async (lv: number) => {
    const d = levelDraft[lv];
    if (!d) return;
    await api("/admin/config/level", "POST", { level: lv, dailyGoldCap: Math.max(1, Math.floor(d.dailyGoldCap)), upgradeCost: Math.max(0, Number(d.upgradeCost)) });
    await loadData();
  };

  const saveEconomy = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await api("/admin/economy-config", "POST", { ...economy, withdrawVndPerGold: 1, usdToVndRateK: Math.max(1, Number(economy.usdToVndRateK)) });
    await loadData();
  };

  const saveFlappy = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await api("/admin/flappy/config", "POST", { rewardGold: Math.max(0, Math.floor(flappyReward)) });
    await loadData();
  };

  const saveSchedule = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const payload = schType === "fake" ? { date: schDate, rank: schRank, fakeName: schValue.trim() } : { date: schDate, rank: schRank, teleId: schValue.trim() };
    await api("/admin/lucky-draw/schedule", "POST", payload);
    setSchValue("");
    await loadData();
  };

  const removeSchedule = async (id: number) => {
    if (!window.confirm("Xoa lich nay?")) return;
    await api(`/admin/lucky-draw/schedule/${id}`, "DELETE");
    await loadData();
  };

  const triggerLucky = async () => {
    if (!window.confirm("Chay lucky draw ngay bay gio?")) return;
    await api("/admin/lucky-draw/trigger", "POST");
    await loadData();
  };

  const resetUsers = async () => {
    if (!window.confirm("Xoa toan bo du lieu user de test?")) return;
    await api("/admin/reset-db", "POST");
    await loadData();
  };

  if (!token) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <form onSubmit={onLogin} className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-6 space-y-3">
          <h1 className="text-2xl font-bold text-cyan-400">Admin Login</h1>
          <input className="w-full p-2 rounded bg-slate-800 border border-slate-700" placeholder="Username" value={loginUser} onChange={(e) => setLoginUser(e.target.value)} />
          <input className="w-full p-2 rounded bg-slate-800 border border-slate-700" placeholder="Password" type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} />
          <button className="w-full py-2 rounded bg-cyan-600 hover:bg-cyan-500">Dang nhap</button>
          {loginError ? <p className="text-sm text-red-400">{loginError}</p> : null}
        </form>
      </main>
    );
  }

  const tabs: Array<{ k: Tab; l: string }> = [
    { k: "dashboard", l: "Tong quan" }, { k: "users", l: "Nguoi dung" }, { k: "tasks", l: "Nhiem vu" }, { k: "withdrawals", l: "Rut tien" }, { k: "giftcodes", l: "Giftcode" }, { k: "economy", l: "Kinh te" }, { k: "lucky", l: "Lich quay" },
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 bg-slate-900/95 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap gap-2 items-center">
          <h1 className="font-bold text-cyan-400 mr-2">Khai Dz Admin</h1>
          {tabs.map((t) => <button key={t.k} onClick={() => setTab(t.k)} className={`px-3 py-1.5 rounded text-sm ${tab === t.k ? "bg-cyan-600" : "bg-slate-800 hover:bg-slate-700"}`}>{t.l}</button>)}
          <div className="ml-auto flex gap-2">
            <button onClick={() => void loadData()} className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700">Refresh</button>
            <button onClick={logout} className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500">Logout</button>
          </div>
        </div>
      </header>
      <section className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {loading ? <p className="text-slate-400 text-sm">Dang tai...</p> : null}
        {error ? <p className="text-red-400 text-sm">{error}</p> : null}

        {tab === "dashboard" ? (
          <div className="grid md:grid-cols-4 gap-3">
            <div className="p-4 rounded border border-slate-700 bg-slate-900"><p className="text-xs text-slate-400">Users</p><p className="text-2xl font-bold">{fmtInt(snapshot.users.length)}</p></div>
            <div className="p-4 rounded border border-slate-700 bg-slate-900"><p className="text-xs text-slate-400">Total Gold</p><p className="text-2xl font-bold text-yellow-400">{fmtInt(snapshot.totalGold)}</p></div>
            <div className="p-4 rounded border border-slate-700 bg-slate-900"><p className="text-xs text-slate-400">Total $</p><p className="text-2xl font-bold text-cyan-400">{fmtUsd(snapshot.totalUsdt)}</p></div>
            <div className="p-4 rounded border border-slate-700 bg-slate-900"><p className="text-xs text-slate-400">Pending Withdraw</p><p className="text-2xl font-bold text-amber-400">{fmtInt(snapshot.pendingWithdraws.length)}</p></div>
          </div>
        ) : null}

        {tab === "users" ? (
          <div className="space-y-3">
            <div className="grid md:grid-cols-3 gap-3">
              <form onSubmit={createUser} className="rounded border border-slate-700 bg-slate-900 p-3 space-y-2">
                <p className="font-semibold text-cyan-300">Tao user</p>
                <input className="w-full p-2 rounded bg-slate-800 border border-slate-700" placeholder="TeleID" value={newUserId} onChange={(e) => setNewUserId(e.target.value)} />
                <input className="w-full p-2 rounded bg-slate-800 border border-slate-700" placeholder="Username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
                <button className="w-full py-2 rounded bg-cyan-600 hover:bg-cyan-500">Tao</button>
              </form>
              <form onSubmit={adjust} className="rounded border border-slate-700 bg-slate-900 p-3 space-y-2">
                <p className="font-semibold text-cyan-300">Cong / tru nhanh</p>
                <input className="w-full p-2 rounded bg-slate-800 border border-slate-700" placeholder="TeleID" value={adjUserId} onChange={(e) => setAdjUserId(e.target.value)} />
                <select className="w-full p-2 rounded bg-slate-800 border border-slate-700" value={adjType} onChange={(e) => setAdjType(e.target.value as "gold" | "usdt")}><option value="gold">Gold</option><option value="usdt">$</option></select>
                <input className="w-full p-2 rounded bg-slate-800 border border-slate-700" placeholder="Amount (+/-)" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} />
                <button className="w-full py-2 rounded bg-cyan-600 hover:bg-cyan-500">Ap dung</button>
              </form>
              <div className="rounded border border-slate-700 bg-slate-900 p-3 space-y-2">
                <p className="font-semibold text-cyan-300">Tools</p>
                <button onClick={() => void triggerLucky()} className="w-full py-2 rounded bg-indigo-600 hover:bg-indigo-500">Trigger Lucky Draw</button>
                <button onClick={() => void resetUsers()} className="w-full py-2 rounded bg-red-600 hover:bg-red-500">Reset User Data</button>
              </div>
            </div>
            <input className="w-full p-2 rounded bg-slate-900 border border-slate-700" placeholder="Search teleId/name" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="overflow-auto rounded border border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-900"><tr><th className="p-2 text-left">TeleID</th><th className="p-2 text-left">Name</th><th className="p-2 text-left">Gold</th><th className="p-2 text-left">$</th><th className="p-2 text-left">Lv</th><th className="p-2 text-left">Cap/day</th><th className="p-2 text-left">Action</th></tr></thead>
                <tbody>{usersFiltered.map((u: any) => <tr key={u.teleId} className="border-t border-slate-800"><td className="p-2 font-mono">{u.teleId}</td><td className="p-2">{u.username || "N/A"}</td><td className="p-2 text-yellow-400">{fmtInt(u.gold)}</td><td className="p-2 text-cyan-400">{fmtUsd(u.usdtBalance)}</td><td className="p-2">{u.level}</td><td className="p-2">{fmtInt(u.dailyGoldCap)}</td><td className="p-2"><button onClick={() => openEditUser(u)} className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600">Edit</button></td></tr>)}</tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "tasks" ? (
          <div className="grid md:grid-cols-[340px_1fr] gap-3">
            <form onSubmit={saveTask} className="rounded border border-slate-700 bg-slate-900 p-3 space-y-2">
              <p className="font-semibold text-cyan-300">{taskIdEditing ? `Sua task ${taskIdEditing}` : "Tao task"}</p>
              <input className="w-full p-2 rounded bg-slate-800 border border-slate-700" placeholder="id" value={taskForm.id} readOnly={!!taskIdEditing} onChange={(e) => setTaskForm((v: any) => ({ ...v, id: e.target.value }))} />
              <input className="w-full p-2 rounded bg-slate-800 border border-slate-700" placeholder="title" value={taskForm.title} onChange={(e) => setTaskForm((v: any) => ({ ...v, title: e.target.value }))} />
              <input className="w-full p-2 rounded bg-slate-800 border border-slate-700" placeholder="icon" value={taskForm.icon} onChange={(e) => setTaskForm((v: any) => ({ ...v, icon: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <select className="p-2 rounded bg-slate-800 border border-slate-700" value={taskForm.rewardType === "usdt" ? "usdt" : "gold"} onChange={(e) => setTaskForm((v: any) => ({ ...v, rewardType: e.target.value }))}><option value="gold">Gold</option><option value="usdt">$</option></select>
                <input className="p-2 rounded bg-slate-800 border border-slate-700" type="number" value={taskForm.rewardAmount} onChange={(e) => setTaskForm((v: any) => ({ ...v, rewardAmount: Number(e.target.value) }))} />
              </div>
              <input className="w-full p-2 rounded bg-slate-800 border border-slate-700" placeholder="url" value={taskForm.url || ""} onChange={(e) => setTaskForm((v: any) => ({ ...v, url: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <select className="p-2 rounded bg-slate-800 border border-slate-700" value={taskForm.type} onChange={(e) => setTaskForm((v: any) => ({ ...v, type: e.target.value }))}><option value="community">community</option><option value="newbie">newbie</option><option value="daily">daily</option><option value="one_time">one_time</option><option value="ad">ad</option></select>
                <select className="p-2 rounded bg-slate-800 border border-slate-700" value={taskForm.actionType} onChange={(e) => setTaskForm((v: any) => ({ ...v, actionType: e.target.value }))}><option value="click">click</option><option value="join">join</option><option value="react_heart">react_heart</option></select>
              </div>
              {taskForm.actionType === "join" || taskForm.actionType === "react_heart" ? <input className="w-full p-2 rounded bg-slate-800 border border-slate-700" placeholder="telegramChatId" value={taskForm.telegramChatId || ""} onChange={(e) => setTaskForm((v: any) => ({ ...v, telegramChatId: e.target.value }))} /> : null}
              <div className="flex gap-2">
                <button className="flex-1 py-2 rounded bg-cyan-600 hover:bg-cyan-500">{taskIdEditing ? "Cap nhat" : "Luu"}</button>
                {taskIdEditing ? <button type="button" onClick={() => { setTaskIdEditing(""); setTaskForm({ id: "", title: "", icon: "TASK", rewardType: "gold", rewardAmount: 1000, url: "", type: "community", actionType: "click", telegramChatId: "" }); }} className="py-2 px-3 rounded bg-slate-700 hover:bg-slate-600">Huy</button> : null}
              </div>
            </form>
            <div className="overflow-auto rounded border border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-900"><tr><th className="p-2 text-left">Task</th><th className="p-2 text-left">Reward</th><th className="p-2 text-left">Type</th><th className="p-2 text-left">Action</th></tr></thead>
                <tbody>{(snapshot.tasks || []).map((t: any) => <tr key={t.id} className="border-t border-slate-800"><td className="p-2"><div>{t.icon || "TASK"} {t.title}</div><div className="text-xs text-slate-500">{t.id}</div></td><td className="p-2">{t.rewardType === "usdt" ? fmtUsd(t.rewardAmount) : `${fmtInt(t.rewardAmount)} gold`}</td><td className="p-2">{t.type}</td><td className="p-2"><div className="flex gap-2"><button onClick={() => editTask(t)} className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600">Edit</button><button onClick={() => void removeTask(String(t.id))} className="px-2 py-1 rounded bg-red-600 hover:bg-red-500">Delete</button></div></td></tr>)}</tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "withdrawals" ? (
          <div className="overflow-auto rounded border border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-900"><tr><th className="p-2 text-left">ID</th><th className="p-2 text-left">User</th><th className="p-2 text-left">Source</th><th className="p-2 text-left">Payout</th><th className="p-2 text-left">To</th><th className="p-2 text-left">Action</th></tr></thead>
              <tbody>{(snapshot.pendingWithdraws || []).map((w: any) => <tr key={w.id} className="border-t border-slate-800"><td className="p-2">#{w.id}<div className="text-xs text-slate-500">{w.createdAt ? new Date(w.createdAt).toLocaleString("vi-VN") : ""}</div></td><td className="p-2">{w.username}<div className="text-xs text-slate-500">{w.userTeleId || w.teleId}</div></td><td className="p-2">{w.sourceWallet === "usdt" ? `${fmtUsd(w.sourceAmount)} ($)` : `${fmtInt(w.sourceAmount)} gold`}</td><td className="p-2">{w.payoutCurrency === "$" ? fmtUsd(w.payoutAmount) : `${fmtInt(w.vnd)} VND`}<div className="text-xs text-slate-500">fee {n(w.feePercent)}%</div></td><td className="p-2"><div>{w.bankName}</div><div className="text-xs text-slate-500">{w.accountNumber}</div><div className="text-xs text-slate-500">{w.accountName}</div></td><td className="p-2"><div className="flex gap-2"><button onClick={() => void changeWithdraw(n(w.id), "Thanh cong")} className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500">Duyet</button><button onClick={() => void changeWithdraw(n(w.id), "Bi tu choi")} className="px-2 py-1 rounded bg-red-600 hover:bg-red-500">Tu choi</button></div></td></tr>)}</tbody>
            </table>
          </div>
        ) : null}

        {tab === "giftcodes" ? (
          <div className="grid md:grid-cols-[320px_1fr] gap-3">
            <form onSubmit={saveGift} className="rounded border border-slate-700 bg-slate-900 p-3 space-y-2">
              <p className="font-semibold text-cyan-300">Tao giftcode</p>
              <input className="w-full p-2 rounded bg-slate-800 border border-slate-700 uppercase" placeholder="CODE" value={giftCode} onChange={(e) => setGiftCode(e.target.value.toUpperCase())} />
              <input className="w-full p-2 rounded bg-slate-800 border border-slate-700" type="number" value={giftGold} onChange={(e) => setGiftGold(Number(e.target.value))} placeholder="reward gold" />
              <input className="w-full p-2 rounded bg-slate-800 border border-slate-700" type="number" value={giftMax} onChange={(e) => setGiftMax(Number(e.target.value))} placeholder="max uses" />
              <button className="w-full py-2 rounded bg-cyan-600 hover:bg-cyan-500">Luu</button>
            </form>
            <div className="overflow-auto rounded border border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-900"><tr><th className="p-2 text-left">Code</th><th className="p-2 text-left">Reward</th><th className="p-2 text-left">Usage</th><th className="p-2 text-left">Action</th></tr></thead>
                <tbody>{(snapshot.giftCodes || []).map((g: any) => <tr key={g.code} className="border-t border-slate-800"><td className="p-2 font-mono text-yellow-400">{g.code}</td><td className="p-2">{fmtInt(g.rewardGold)} gold</td><td className="p-2">{fmtInt(g.usedCount)} / {fmtInt(g.maxUses)}</td><td className="p-2"><button onClick={() => void removeGift(g.code)} className="px-2 py-1 rounded bg-red-600 hover:bg-red-500">Delete</button></td></tr>)}</tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "economy" ? (
          <div className="space-y-3">
            <form onSubmit={saveEconomy} className="rounded border border-slate-700 bg-slate-900 p-3 grid md:grid-cols-2 gap-2">
              <p className="md:col-span-2 font-semibold text-cyan-300">Economy (chi gold + $)</p>
              <input className="p-2 rounded bg-slate-800 border border-slate-700" type="number" value={economy.newUserGold} onChange={(e) => setEconomy((v) => ({ ...v, newUserGold: Number(e.target.value) }))} placeholder="newUserGold" />
              <input className="p-2 rounded bg-slate-800 border border-slate-700" type="number" value={economy.referralRewardGold} onChange={(e) => setEconomy((v) => ({ ...v, referralRewardGold: Number(e.target.value) }))} placeholder="referralRewardGold" />
              <input className="p-2 rounded bg-slate-800 border border-slate-700" type="number" step="0.000001" value={economy.referralRewardUsdt} onChange={(e) => setEconomy((v) => ({ ...v, referralRewardUsdt: Number(e.target.value) }))} placeholder="referralReward$" />
              <input className="p-2 rounded bg-slate-800 border border-slate-700" type="number" value={economy.withdrawMinGold} onChange={(e) => setEconomy((v) => ({ ...v, withdrawMinGold: Number(e.target.value) }))} placeholder="withdrawMinGold" />
              <input className="p-2 rounded bg-slate-800 border border-slate-700" type="number" value={economy.usdToVndRateK} onChange={(e) => setEconomy((v) => ({ ...v, usdToVndRateK: Number(e.target.value) }))} placeholder="usdToVndRateK (28)" />
              <input className="p-2 rounded bg-slate-800 border border-slate-700" type="number" value={1} readOnly />
              <input className="p-2 rounded bg-slate-800 border border-slate-700" type="number" value={economy.taskMilestoneCount} onChange={(e) => setEconomy((v) => ({ ...v, taskMilestoneCount: Number(e.target.value) }))} placeholder="milestoneCount" />
              <input className="p-2 rounded bg-slate-800 border border-slate-700" type="number" value={economy.taskMilestoneRewardGold} onChange={(e) => setEconomy((v) => ({ ...v, taskMilestoneRewardGold: Number(e.target.value) }))} placeholder="milestoneGold" />
              <button className="md:col-span-2 py-2 rounded bg-cyan-600 hover:bg-cyan-500">Luu economy</button>
            </form>

            <form onSubmit={saveFlappy} className="rounded border border-slate-700 bg-slate-900 p-3 grid md:grid-cols-[1fr_auto] gap-2 items-end">
              <div><p className="font-semibold text-cyan-300 mb-1">Flappy reward (gold)</p><input className="w-full p-2 rounded bg-slate-800 border border-slate-700" type="number" value={flappyReward} onChange={(e) => setFlappyReward(Number(e.target.value))} /></div>
              <button className="py-2 px-4 rounded bg-cyan-600 hover:bg-cyan-500">Luu flappy</button>
            </form>

            <div className="overflow-auto rounded border border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-900"><tr><th className="p-2 text-left">Lv</th><th className="p-2 text-left">Cap/day</th><th className="p-2 text-left">Upgrade $</th><th className="p-2 text-left">Tang cap</th><th className="p-2 text-left">Action</th></tr></thead>
                <tbody>{(snapshot.levels || []).map((lv: any, i: number) => { const level = n(lv.level); const d = levelDraft[level] || { dailyGoldCap: n(lv.dailyGoldCap, 1000), upgradeCost: n(lv.upgradeCost, 0) }; const prev = i > 0 ? n(snapshot.levels[i - 1]?.dailyGoldCap, 0) : 0; const pct = prev > 0 ? ((d.dailyGoldCap - prev) / prev) * 100 : 0; return <tr key={level} className="border-t border-slate-800"><td className="p-2 font-semibold">Lv {level}</td><td className="p-2"><input className="p-1.5 rounded bg-slate-800 border border-slate-700 w-40" type="number" value={d.dailyGoldCap} onChange={(e) => setLevelDraft((v) => ({ ...v, [level]: { ...d, dailyGoldCap: Number(e.target.value) } }))} /></td><td className="p-2"><input className="p-1.5 rounded bg-slate-800 border border-slate-700 w-40" type="number" step="0.000001" value={d.upgradeCost} onChange={(e) => setLevelDraft((v) => ({ ...v, [level]: { ...d, upgradeCost: Number(e.target.value) } }))} /></td><td className="p-2">{i === 0 ? "N/A" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}</td><td className="p-2"><button onClick={() => void saveLevel(level)} className="px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500">Luu</button></td></tr>; })}</tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "lucky" ? (
          <div className="grid md:grid-cols-[340px_1fr] gap-3">
            <form onSubmit={saveSchedule} className="rounded border border-slate-700 bg-slate-900 p-3 space-y-2">
              <p className="font-semibold text-cyan-300">Len lich trung thuong</p>
              <input className="w-full p-2 rounded bg-slate-800 border border-slate-700" type="date" value={schDate} onChange={(e) => setSchDate(e.target.value)} required />
              <select className="w-full p-2 rounded bg-slate-800 border border-slate-700" value={schRank} onChange={(e) => setSchRank(Number(e.target.value))}><option value={1}>Top 1</option><option value={2}>Top 2</option><option value={3}>Top 3</option><option value={4}>Top 4</option><option value={5}>Top 5</option></select>
              <div className="flex gap-2"><button type="button" onClick={() => setSchType("fake")} className={`flex-1 py-1.5 rounded ${schType === "fake" ? "bg-cyan-600" : "bg-slate-700"}`}>Fake</button><button type="button" onClick={() => setSchType("real")} className={`flex-1 py-1.5 rounded ${schType === "real" ? "bg-cyan-600" : "bg-slate-700"}`}>TeleID</button></div>
              <input className="w-full p-2 rounded bg-slate-800 border border-slate-700" value={schValue} onChange={(e) => setSchValue(e.target.value)} placeholder={schType === "fake" ? "Ten gia" : "TeleID"} required />
              <button className="w-full py-2 rounded bg-cyan-600 hover:bg-cyan-500">Luu lich</button>
              <button type="button" onClick={() => void triggerLucky()} className="w-full py-2 rounded bg-indigo-600 hover:bg-indigo-500">Trigger ngay</button>
            </form>
            <div className="space-y-2">{schedules.map((s: any) => <div key={s.id} className="rounded border border-slate-700 bg-slate-900 p-3 flex justify-between items-center"><div><p className="font-semibold">Top {n(s.rankPos)} - {String(s.drawDate || "").split("T")[0]}</p><p className="text-sm text-slate-400">{s.fakeName ? `Fake: ${s.fakeName}` : `TeleID: ${s.teleId}`}</p></div><button onClick={() => void removeSchedule(n(s.id))} className="px-2 py-1 rounded bg-red-600 hover:bg-red-500">Delete</button></div>)}{schedules.length === 0 ? <p className="text-sm text-slate-500">Chua co lich.</p> : null}</div>
          </div>
        ) : null}
      </section>

      {editUserId !== null ? (
        <div className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded border border-slate-700 bg-slate-900 p-4 space-y-2">
            <p className="font-semibold text-cyan-300">Sua user #{editUserId}</p>
            <input className="w-full p-2 rounded bg-slate-800 border border-slate-700" type="number" value={editGold} onChange={(e) => setEditGold(Number(e.target.value))} />
            <input className="w-full p-2 rounded bg-slate-800 border border-slate-700" type="number" step="0.000001" value={editUsd} onChange={(e) => setEditUsd(Number(e.target.value))} />
            <div className="flex gap-2"><button onClick={() => void saveUser()} className="flex-1 py-2 rounded bg-cyan-600 hover:bg-cyan-500">Luu</button><button onClick={() => setEditUserId(null)} className="flex-1 py-2 rounded bg-slate-700 hover:bg-slate-600">Huy</button></div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
