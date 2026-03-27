import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import { Copy, Link2, LogOut, Plus, Power, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { CollageImagePreview } from "@/components/media/CollageImagePreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiJsonFetch } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { fileToOptimizedImageDataUrl, getDataUrlByteSize } from "@/lib/image-data-url";

const STORAGE_KEY = "bichha_admin_dashboard_token";
const MAX_FEATURED_IMAGE_COUNT = 10;
const MAX_TOTAL_FEATURED_IMAGE_BYTES = 6 * 1024 * 1024;

type Summary = { totalHits: number; totalVisitors: number; uniqueIps: number; knownAccountsVisited: number };
type IpVisit = { ipAddress: string; hits: number };
type DailyStat = { date: string; totalHits: number; uniqueIps: number; knownAccountsVisited: number; ipVisits: IpVisit[] };
type User = { id: number; name: string; phone: string; role: number; createdAt: string };
type BotService = {
  enabled: boolean;
  running: boolean;
  state: string;
  lastHeartbeatAt?: string;
  lastWorkAt?: string;
  restartCount: number;
  lastError?: string | null;
};
type FeaturedPost = {
  id: string;
  title: string;
  summary: string;
  content: string;
  address?: string;
  roomType?: string;
  priceLabel?: string;
  imageUrls?: string[];
  imageUrl?: string;
  routingKeywords: string[];
  createdByType?: "admin" | "ctv";
  createdByUsername?: string;
  createdByNickname?: string;
  createdAt: string;
  updatedAt: string;
};
type CtvAccount = { id: number; username: string; nickname: string; isEnabled: boolean; createdAt: string; updatedAt: string };
type Dashboard = {
  generatedAt: string;
  summary1Day: Summary;
  summary7Days: Summary;
  summary30Days: Summary;
  dailyStats1: DailyStat[];
  dailyStats7: DailyStat[];
  dailyStats30: DailyStat[];
  postingControl: { isEnabled: boolean; message: string; updatedAt?: string };
  maintenanceControl: { isEnabled: boolean; message: string; updatedAt?: string };
  contactControl: { contactLink: string; message: string; updatedAt?: string };
  botServices: { listener: BotService; sender: BotService };
  featuredPosts: FeaturedPost[];
  ctvAccounts: CtvAccount[];
  accounts: { total: number; users: User[] };
};
type CtvEdit = { username: string; nickname: string; password: string; isEnabled: boolean };
type FeaturedForm = {
  title: string;
  summary: string;
  content: string;
  address: string;
  roomType: string;
  priceLabel: string;
  routingKeywordsText: string;
  actionLabel: string;
  actionUrl: string;
};

const EMPTY_SUMMARY: Summary = { totalHits: 0, totalVisitors: 0, uniqueIps: 0, knownAccountsVisited: 0 };
const EMPTY_DASHBOARD: Dashboard = {
  generatedAt: "",
  summary1Day: EMPTY_SUMMARY,
  summary7Days: EMPTY_SUMMARY,
  summary30Days: EMPTY_SUMMARY,
  dailyStats1: [],
  dailyStats7: [],
  dailyStats30: [],
  postingControl: { isEnabled: true, message: "" },
  maintenanceControl: { isEnabled: false, message: "" },
  contactControl: { contactLink: "", message: "" },
  botServices: {
    listener: { enabled: true, running: false, state: "unknown", restartCount: 0 },
    sender: { enabled: true, running: false, state: "unknown", restartCount: 0 },
  },
  featuredPosts: [],
  ctvAccounts: [],
  accounts: { total: 0, users: [] },
};
const EMPTY_FEATURED_FORM: FeaturedForm = {
  title: "",
  summary: "",
  content: "",
  address: "",
  roomType: "",
  priceLabel: "",
  routingKeywordsText: "",
  actionLabel: "Lien he ngay",
  actionUrl: "",
};

function fmtDate(value?: string) {
  if (!value) return "Chua co";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function fmtDay(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function postImages(post: FeaturedPost) {
  return post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : [];
}

function postRoom(post: FeaturedPost) {
  return post.roomType?.trim() || "Phong cho thue";
}

function postAddress(post: FeaturedPost) {
  return post.address?.trim() || post.title;
}

function postPrice(post: FeaturedPost) {
  return post.priceLabel?.trim() || post.summary || "Lien he";
}

function postAuthor(post: FeaturedPost) {
  return post.createdByNickname?.trim() || post.createdByUsername?.trim() || (post.createdByType === "ctv" ? "CTV" : "Admin");
}

function compactIp(value: string) {
  return value.includes(":") && value.length > 24 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

function getMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "message" in data && typeof data.message === "string") {
    return data.message;
  }
  return fallback;
}

function parseKeywords(value: string) {
  return Array.from(new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)));
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

export function AdminBichHa() {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(() => (typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY)));
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loginForm, setLoginForm] = useState({ username: "admin", password: "" });
  const [loading, setLoading] = useState(Boolean(token));
  const [loggingIn, setLoggingIn] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("bot");
  const [trafficRange, setTrafficRange] = useState<1 | 7 | 30>(1);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [contactLink, setContactLink] = useState("");
  const [featuredForm, setFeaturedForm] = useState<FeaturedForm>(EMPTY_FEATURED_FORM);
  const [featuredImages, setFeaturedImages] = useState<string[]>([]);
  const [ctvForm, setCtvForm] = useState<CtvEdit>({ username: "", nickname: "", password: "", isEnabled: true });
  const [ctvEdits, setCtvEdits] = useState<Record<number, CtvEdit>>({});

  const trafficData = useMemo(() => {
    if (!dashboard) return { summary: EMPTY_SUMMARY, days: [] as DailyStat[] };
    if (trafficRange === 30) return { summary: dashboard.summary30Days, days: dashboard.dailyStats30 };
    if (trafficRange === 7) return { summary: dashboard.summary7Days, days: dashboard.dailyStats7 };
    return { summary: dashboard.summary1Day, days: dashboard.dailyStats1 };
  }, [dashboard, trafficRange]);

  function clearSession() {
    setToken(null);
    setDashboard(null);
    setLoading(false);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  async function loadDashboard(nextToken: string | null, silent = false) {
    if (!nextToken) {
      clearSession();
      return;
    }

    if (silent) setRefreshing(true);
    else setLoading(true);

    const { res, data } = await apiJsonFetch<Dashboard>("/admin/bichha/dashboard", EMPTY_DASHBOARD, {}, nextToken);

    if (!res.ok) {
      if (res.status === 401) {
        clearSession();
        toast({ title: "Phien dang nhap het han", variant: "destructive" });
      } else {
        toast({ title: "Khong the tai dashboard", description: getMessage(data, "Thu lai sau."), variant: "destructive" });
      }
      setRefreshing(false);
      setLoading(false);
      return;
    }

    setDashboard(data);
    setRefreshing(false);
    setLoading(false);
  }

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    void loadDashboard(token);
  }, [token]);

  useEffect(() => {
    if (!dashboard) return;
    setContactLink(dashboard.contactControl.contactLink || "");
    setCtvEdits(Object.fromEntries(dashboard.ctvAccounts.map((account) => [
      account.id,
      { username: account.username, nickname: account.nickname, password: "", isEnabled: account.isEnabled },
    ])));
  }, [dashboard]);

  async function runRequest(path: string, options: RequestInit, successTitle: string) {
    if (!token) return false;
    const { res, data } = await apiJsonFetch<Record<string, unknown>>(path, {}, options, token);
    if (!res.ok) {
      if (res.status === 401) {
        clearSession();
      }
      toast({ title: getMessage(data, "Khong the cap nhat"), variant: "destructive" });
      return false;
    }
    toast({ title: successTitle });
    await loadDashboard(token, true);
    return true;
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoggingIn(true);

    const { res, data } = await apiJsonFetch<{ token?: string; message?: string }>(
      "/admin/bichha/login",
      {},
      { method: "POST", body: JSON.stringify(loginForm) },
    );

    setLoggingIn(false);
    if (!res.ok || !data.token) {
      toast({ title: data.message || "Dang nhap that bai", variant: "destructive" });
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, data.token);
    }
    setToken(data.token);
    setLoginForm((current) => ({ ...current, password: "" }));
  }

  async function handleCopy(value: string, label: string) {
    try {
      await copyText(value);
      toast({ title: `Da copy ${label}` });
    } catch {
      toast({ title: `Khong the copy ${label}`, variant: "destructive" });
    }
  }

  async function handleFeaturedImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    try {
      let nextImages = [...featuredImages];
      for (const file of files) {
        if (nextImages.length >= MAX_FEATURED_IMAGE_COUNT) break;
        nextImages.push(await fileToOptimizedImageDataUrl(file, { maxSize: 1600, outputType: "image/jpeg", quality: 0.82 }));
      }
      const totalBytes = nextImages.reduce((sum, item) => sum + getDataUrlByteSize(item), 0);
      if (totalBytes > MAX_TOTAL_FEATURED_IMAGE_BYTES) {
        toast({ title: "Tong dung luong anh qua lon", variant: "destructive" });
        return;
      }
      if (nextImages.length > MAX_FEATURED_IMAGE_COUNT) {
        nextImages = nextImages.slice(0, MAX_FEATURED_IMAGE_COUNT);
      }
      setFeaturedImages(nextImages);
    } catch {
      toast({ title: "Khong the xu ly anh", variant: "destructive" });
    }
  }

  async function handleCreateFeatured(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingKey("featured-create");
    const payload = {
      title: featuredForm.title,
      summary: featuredForm.summary,
      content: featuredForm.content,
      address: featuredForm.address,
      roomType: featuredForm.roomType.trim() || undefined,
      priceLabel: featuredForm.priceLabel,
      routingKeywords: parseKeywords(featuredForm.routingKeywordsText),
      actionLabel: featuredForm.actionLabel.trim() || undefined,
      actionUrl: featuredForm.actionUrl.trim() || contactLink || undefined,
      imageDataUrls: featuredImages,
    };

    const done = await runRequest("/admin/bichha/featured-posts", { method: "POST", body: JSON.stringify(payload) }, "Da tao bai noi bat");
    setSavingKey(null);
    if (!done) return;

    setFeaturedForm({ ...EMPTY_FEATURED_FORM, actionUrl: contactLink || "" });
    setFeaturedImages([]);
  }

  async function handleDeleteFeatured(postId: string) {
    if (!window.confirm("Xoa bai noi bat nay?")) return;
    setSavingKey(`featured-delete-${postId}`);
    await runRequest(`/admin/bichha/featured-posts/${postId}`, { method: "DELETE" }, "Da xoa bai noi bat");
    setSavingKey(null);
  }

  async function handleCreateCtv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingKey("ctv-create");
    const done = await runRequest("/admin/bichha/ctv-accounts", { method: "POST", body: JSON.stringify(ctvForm) }, "Da tao tai khoan CTV");
    setSavingKey(null);
    if (!done) return;
    setCtvForm({ username: "", nickname: "", password: "", isEnabled: true });
  }

  async function handleUpdateCtv(accountId: number) {
    setSavingKey(`ctv-save-${accountId}`);
    const edit = ctvEdits[accountId];
    await runRequest(`/admin/bichha/ctv-accounts/${accountId}`, {
      method: "PATCH",
      body: JSON.stringify({
        username: edit.username,
        nickname: edit.nickname,
        password: edit.password.trim() || undefined,
        isEnabled: edit.isEnabled,
      }),
    }, "Da cap nhat CTV");
    setSavingKey(null);
  }

  async function handleDeleteCtv(accountId: number) {
    if (!window.confirm("Xoa tai khoan CTV nay?")) return;
    setSavingKey(`ctv-delete-${accountId}`);
    await runRequest(`/admin/bichha/ctv-accounts/${accountId}`, { method: "DELETE" }, "Da xoa tai khoan CTV");
    setSavingKey(null);
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(145deg,#f8fafc,#eef2ff_45%,#fff7ed)] px-4 py-10">
        <form onSubmit={handleLogin} className="w-full max-w-md space-y-5 rounded-3xl border bg-white p-8 shadow-2xl">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <ShieldCheck className="h-4 w-4" /> Admin BichHa
            </div>
            <h1 className="text-3xl font-bold text-foreground">Dang nhap dashboard</h1>
            <p className="text-sm text-muted-foreground">Trang dieu khien rieng cho bot, traffic, bai noi bat va CTV.</p>
          </div>

          <div className="space-y-3">
            <Input value={loginForm.username} onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))} placeholder="Username" />
            <Input type="password" value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} placeholder="Password" />
          </div>

          <Button type="submit" className="w-full" disabled={loggingIn}>
            {loggingIn ? "Dang xu ly..." : "Dang nhap"}
          </Button>
        </form>
      </div>
    );
  }

  if (loading || !dashboard) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="flex items-center gap-3 rounded-2xl border bg-white px-6 py-4 text-sm font-medium text-muted-foreground shadow-sm">
          <RefreshCw className="h-4 w-4 animate-spin" /> Dang tai dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <ShieldCheck className="h-4 w-4" /> BichHa Dashboard
            </div>
            <h1 className="text-2xl font-bold text-foreground">Bot, featured post, CTV va traffic</h1>
            <p className="text-sm text-muted-foreground">Cap nhat luc {fmtDate(dashboard.generatedAt)}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void loadDashboard(token, true)} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Lam moi
            </Button>
            <Button variant="outline" asChild>
              <a href="/" target="_blank" rel="noreferrer">Mo website</a>
            </Button>
            <Button variant="outline" onClick={clearSession}>
              <LogOut className="h-4 w-4" /> Dang xuat
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs uppercase text-muted-foreground">Hit 1 ngay</p><p className="mt-2 text-3xl font-bold">{dashboard.summary1Day.totalHits}</p></div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs uppercase text-muted-foreground">IP 1 ngay</p><p className="mt-2 text-3xl font-bold">{dashboard.summary1Day.uniqueIps}</p></div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs uppercase text-muted-foreground">Bai noi bat</p><p className="mt-2 text-3xl font-bold">{dashboard.featuredPosts.length}</p></div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs uppercase text-muted-foreground">CTV / Tai khoan</p><p className="mt-2 text-3xl font-bold">{dashboard.ctvAccounts.length} / {dashboard.accounts.total}</p></div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-none bg-transparent p-0">
            <TabsTrigger value="bot" className="border bg-white data-[state=active]:border-primary">Bot & Site</TabsTrigger>
            <TabsTrigger value="featured" className="border bg-white data-[state=active]:border-primary">Bai noi bat</TabsTrigger>
            <TabsTrigger value="ctv" className="border bg-white data-[state=active]:border-primary">CTV</TabsTrigger>
            <TabsTrigger value="traffic" className="border bg-white data-[state=active]:border-primary">Traffic</TabsTrigger>
            <TabsTrigger value="accounts" className="border bg-white data-[state=active]:border-primary">Tai khoan</TabsTrigger>
          </TabsList>

          <TabsContent value="bot" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              {(["listener", "sender"] as const).map((serviceName) => {
                const service = dashboard.botServices[serviceName];
                const stateTone = service.running ? "bg-emerald-50 text-emerald-700" : service.enabled ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700";
                return (
                  <div key={serviceName} className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground">
                          <Power className="h-4 w-4" /> {serviceName}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={stateTone}>{service.state || "unknown"}</Badge>
                          <Badge variant="outline">Restart {service.restartCount}</Badge>
                        </div>
                      </div>
                      <Switch
                        checked={service.enabled}
                        disabled={savingKey === `service-${serviceName}`}
                        onCheckedChange={(checked) => {
                          setSavingKey(`service-${serviceName}`);
                          void runRequest(`/admin/bichha/bot-services/${serviceName}`, { method: "POST", body: JSON.stringify({ isEnabled: checked }) }, `Da cap nhat ${serviceName}`).finally(() => setSavingKey(null));
                        }}
                      />
                    </div>

                    <div className="grid gap-3 text-sm md:grid-cols-2">
                      <div className="rounded-xl bg-slate-50 p-3">Enabled: <strong>{service.enabled ? "On" : "Off"}</strong></div>
                      <div className="rounded-xl bg-slate-50 p-3">Running: <strong>{service.running ? "Yes" : "No"}</strong></div>
                      <div className="rounded-xl bg-slate-50 p-3">Heartbeat: <strong>{fmtDate(service.lastHeartbeatAt)}</strong></div>
                      <div className="rounded-xl bg-slate-50 p-3">Last work: <strong>{fmtDate(service.lastWorkAt)}</strong></div>
                    </div>

                    {service.lastError ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{service.lastError}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">Bot & site control</h2>
                    <p className="text-sm text-muted-foreground">Toggle logic chay bot va trang web ngay trong dashboard.</p>
                  </div>
                </div>

                <div className="grid gap-3">
                  <div className="flex items-center justify-between rounded-xl border p-4">
                    <div>
                      <p className="font-medium">Dang bai cong khai</p>
                      <p className="text-sm text-muted-foreground">{dashboard.postingControl.message || "Bat tat viec dang bai tu site."}</p>
                    </div>
                    <Switch
                      checked={dashboard.postingControl.isEnabled}
                      disabled={savingKey === "posting"}
                      onCheckedChange={(checked) => {
                        setSavingKey("posting");
                        void runRequest("/admin/bichha/posting-status", { method: "POST", body: JSON.stringify({ isEnabled: checked }) }, "Da cap nhat trang thai dang bai").finally(() => setSavingKey(null));
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-xl border p-4">
                    <div>
                      <p className="font-medium">Bao tri website</p>
                      <p className="text-sm text-muted-foreground">{dashboard.maintenanceControl.message || "Bat se chuyen web sang trang bao tri."}</p>
                    </div>
                    <Switch
                      checked={dashboard.maintenanceControl.isEnabled}
                      disabled={savingKey === "maintenance"}
                      onCheckedChange={(checked) => {
                        setSavingKey("maintenance");
                        void runRequest("/admin/bichha/maintenance-status", { method: "POST", body: JSON.stringify({ isEnabled: checked }) }, "Da cap nhat trang thai bao tri").finally(() => setSavingKey(null));
                      }}
                    />
                  </div>
                </div>

                <form
                  className="space-y-3 rounded-2xl border bg-slate-50 p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setSavingKey("contact");
                    void runRequest("/admin/bichha/contact-settings", { method: "POST", body: JSON.stringify({ contactLink }) }, "Da cap nhat link lien he").finally(() => setSavingKey(null));
                  }}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Link2 className="h-4 w-4" /> Link lien he mac dinh
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Input value={contactLink} onChange={(event) => setContactLink(event.target.value)} placeholder="https://zalo.me/..." />
                    <Button type="submit" disabled={savingKey === "contact"}>Luu</Button>
                    <Button type="button" variant="outline" onClick={() => void handleCopy(contactLink, "link lien he")} disabled={!contactLink}>Copy</Button>
                  </div>
                </form>
              </div>

              <div className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Tong quan nhanh</h2>
                <div className="grid gap-3 text-sm">
                  <div className="rounded-xl bg-slate-50 p-4">Bai noi bat dang chay: <strong>{dashboard.featuredPosts.length}</strong></div>
                  <div className="rounded-xl bg-slate-50 p-4">Tai khoan CTV: <strong>{dashboard.ctvAccounts.length}</strong></div>
                  <div className="rounded-xl bg-slate-50 p-4">Tai khoan website: <strong>{dashboard.accounts.total}</strong></div>
                  <div className="rounded-xl bg-slate-50 p-4">Hit 30 ngay: <strong>{dashboard.summary30Days.totalHits}</strong></div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="featured" className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <form onSubmit={handleCreateFeatured} className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold">Tao bai noi bat</h2>
                <p className="text-sm text-muted-foreground">Room type khong bat buoc. Bot van resend 4 ngay 1 lan cho den khi xoa.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Input value={featuredForm.title} onChange={(event) => setFeaturedForm((current) => ({ ...current, title: event.target.value }))} placeholder="Tieu de" />
                <Input value={featuredForm.address} onChange={(event) => setFeaturedForm((current) => ({ ...current, address: event.target.value }))} placeholder="Dia chi" />
                <Input value={featuredForm.roomType} onChange={(event) => setFeaturedForm((current) => ({ ...current, roomType: event.target.value }))} placeholder="Dang phong (khong bat buoc)" />
                <Input value={featuredForm.priceLabel} onChange={(event) => setFeaturedForm((current) => ({ ...current, priceLabel: event.target.value }))} placeholder="Gia phong" />
              </div>

              <Input value={featuredForm.summary} onChange={(event) => setFeaturedForm((current) => ({ ...current, summary: event.target.value }))} placeholder="Summary ngan (khong bat buoc)" />
              <Textarea value={featuredForm.content} onChange={(event) => setFeaturedForm((current) => ({ ...current, content: event.target.value }))} placeholder="Noi dung bai dang" className="min-h-[180px]" />
              <Textarea value={featuredForm.routingKeywordsText} onChange={(event) => setFeaturedForm((current) => ({ ...current, routingKeywordsText: event.target.value }))} placeholder="Keyword routing, cach nhau boi dau phay hoac xuong dong" className="min-h-[92px]" />

              <div className="grid gap-3 md:grid-cols-2">
                <Input value={featuredForm.actionLabel} onChange={(event) => setFeaturedForm((current) => ({ ...current, actionLabel: event.target.value }))} placeholder="Nhan nut lien he" />
                <Input value={featuredForm.actionUrl} onChange={(event) => setFeaturedForm((current) => ({ ...current, actionUrl: event.target.value }))} placeholder="Action URL" />
              </div>

              <div className="space-y-3 rounded-2xl border bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Anh bai viet</p>
                    <p className="text-sm text-muted-foreground">Sender se gom thanh group album thay vi gui roi tung anh.</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium">
                    <Plus className="h-4 w-4" /> Them anh
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleFeaturedImages} />
                  </label>
                </div>

                {featuredImages.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {featuredImages.map((image, index) => (
                      <div key={`${image.slice(0, 32)}-${index}`} className="overflow-hidden rounded-2xl border bg-white">
                        <div className="relative aspect-[4/3]">
                          <CollageImagePreview images={[image]} alt={`Featured ${index + 1}`} fallbackImages={[]} />
                        </div>
                        <div className="flex items-center justify-between px-3 py-2 text-xs">
                          <span>Anh {index + 1}</span>
                          <button type="button" className="text-red-600" onClick={() => setFeaturedImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}>Xoa</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed bg-white px-4 py-8 text-center text-sm text-muted-foreground">Chua co anh nao.</div>
                )}
              </div>

              <Button type="submit" disabled={savingKey === "featured-create"}>
                <Plus className="h-4 w-4" /> {savingKey === "featured-create" ? "Dang tao..." : "Tao bai noi bat"}
              </Button>
            </form>

            <div className="space-y-4">
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Danh sach bai noi bat</h2>
                <p className="mt-1 text-sm text-muted-foreground">Bai do admin hoac CTV tao deu hien ai la nguoi dang.</p>
              </div>

              {dashboard.featuredPosts.length === 0 ? (
                <div className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground shadow-sm">Chua co bai noi bat nao.</div>
              ) : dashboard.featuredPosts.map((post) => (
                <div key={post.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                  <div className="grid gap-0 md:grid-cols-[220px_1fr]">
                    <div className="relative min-h-[180px] bg-slate-100">
                      <CollageImagePreview images={postImages(post)} alt={post.title} fallbackImages={[]} />
                    </div>
                    <div className="space-y-4 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <Badge>{post.createdByType === "ctv" ? "CTV" : "Admin"}</Badge>
                            <Badge variant="outline">{postRoom(post)}</Badge>
                          </div>
                          <h3 className="text-lg font-semibold">{postAddress(post)}</h3>
                          <p className="text-sm text-red-600">{postPrice(post)}</p>
                        </div>
                        <Button variant="outline" onClick={() => void handleDeleteFeatured(post.id)} disabled={savingKey === `featured-delete-${post.id}`}>
                          <Trash2 className="h-4 w-4" /> Xoa
                        </Button>
                      </div>

                      <p className="text-sm text-muted-foreground">{post.summary || post.content.slice(0, 180)}</p>

                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>Nguoi tao: <strong>{postAuthor(post)}</strong></span>
                        <span>Keyword: <strong>{post.routingKeywords.join(", ") || "--"}</strong></span>
                        <span>Cap nhat: <strong>{fmtDate(post.updatedAt)}</strong></span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="ctv" className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <form onSubmit={handleCreateCtv} className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold">Them CTV</h2>
                <p className="text-sm text-muted-foreground">CTV chi co quyen post bai noi bat tai /ctv/bichha.</p>
              </div>
              <Input value={ctvForm.username} onChange={(event) => setCtvForm((current) => ({ ...current, username: event.target.value }))} placeholder="Username" />
              <Input value={ctvForm.nickname} onChange={(event) => setCtvForm((current) => ({ ...current, nickname: event.target.value }))} placeholder="Biet danh" />
              <Input type="password" value={ctvForm.password} onChange={(event) => setCtvForm((current) => ({ ...current, password: event.target.value }))} placeholder="Mat khau" />
              <div className="flex items-center justify-between rounded-xl border p-4">
                <div>
                  <p className="font-medium">Cho phep dang nhap</p>
                  <p className="text-sm text-muted-foreground">Tat di neu muon khoa tam thoi.</p>
                </div>
                <Switch checked={ctvForm.isEnabled} onCheckedChange={(checked) => setCtvForm((current) => ({ ...current, isEnabled: checked }))} />
              </div>
              <Button type="submit" disabled={savingKey === "ctv-create"}>
                <Plus className="h-4 w-4" /> {savingKey === "ctv-create" ? "Dang tao..." : "Tao tai khoan"}
              </Button>
            </form>

            <div className="space-y-4">
              {dashboard.ctvAccounts.length === 0 ? (
                <div className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground shadow-sm">Chua co tai khoan CTV nao.</div>
              ) : dashboard.ctvAccounts.map((account) => {
                const edit = ctvEdits[account.id] || { username: account.username, nickname: account.nickname, password: "", isEnabled: account.isEnabled };
                return (
                  <div key={account.id} className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{edit.isEnabled ? "Dang bat" : "Dang khoa"}</Badge>
                        <Badge variant="outline">ID {account.id}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">Cap nhat {fmtDate(account.updatedAt)}</div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <Input value={edit.username} onChange={(event) => setCtvEdits((current) => ({ ...current, [account.id]: { ...edit, username: event.target.value } }))} placeholder="Username" />
                      <Input value={edit.nickname} onChange={(event) => setCtvEdits((current) => ({ ...current, [account.id]: { ...edit, nickname: event.target.value } }))} placeholder="Biet danh" />
                      <Input type="password" value={edit.password} onChange={(event) => setCtvEdits((current) => ({ ...current, [account.id]: { ...edit, password: event.target.value } }))} placeholder="Nhap mat khau moi neu can doi" className="md:col-span-2" />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Switch checked={edit.isEnabled} onCheckedChange={(checked) => setCtvEdits((current) => ({ ...current, [account.id]: { ...edit, isEnabled: checked } }))} />
                        <span className="text-sm text-muted-foreground">Cho phep dang nhap</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => void handleUpdateCtv(account.id)} disabled={savingKey === `ctv-save-${account.id}`}>Luu</Button>
                        <Button variant="outline" onClick={() => void handleDeleteCtv(account.id)} disabled={savingKey === `ctv-delete-${account.id}`}>Xoa</Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="traffic" className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {[1, 7, 30].map((range) => (
                <Button key={range} variant={trafficRange === range ? "default" : "outline"} onClick={() => setTrafficRange(range as 1 | 7 | 30)}>
                  {range} ngay
                </Button>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs uppercase text-muted-foreground">Tong hit</p><p className="mt-2 text-3xl font-bold">{trafficData.summary.totalHits}</p></div>
              <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs uppercase text-muted-foreground">Luot vao</p><p className="mt-2 text-3xl font-bold">{trafficData.summary.totalVisitors}</p></div>
              <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs uppercase text-muted-foreground">IP</p><p className="mt-2 text-3xl font-bold">{trafficData.summary.uniqueIps}</p></div>
              <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs uppercase text-muted-foreground">Tai khoan</p><p className="mt-2 text-3xl font-bold">{trafficData.summary.knownAccountsVisited}</p></div>
            </div>

            {trafficData.days.map((day) => {
              const expanded = Boolean(expandedDays[day.date]);
              const visibleIps = expanded ? day.ipVisits : day.ipVisits.slice(0, 10);
              return (
                <div key={day.date} className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">{fmtDay(day.date)}</h3>
                      <p className="text-sm text-muted-foreground">{day.totalHits} luot vao | {day.uniqueIps} IP | {day.knownAccountsVisited} tai khoan</p>
                    </div>
                    {day.ipVisits.length > 10 ? (
                      <Button variant="outline" onClick={() => setExpandedDays((current) => ({ ...current, [day.date]: !expanded }))}>
                        {expanded ? "Xem it" : "Xem them"}
                      </Button>
                    ) : null}
                  </div>

                  <div className="overflow-hidden rounded-xl border">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
                      <span>Dia chi IP</span>
                      <span>So lan vao</span>
                      <span />
                    </div>
                    {visibleIps.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-muted-foreground">Khong co du lieu IP.</div>
                    ) : visibleIps.map((visit) => (
                      <div key={`${day.date}-${visit.ipAddress}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0">
                        <span className="break-all">{compactIp(visit.ipAddress)}</span>
                        <span className="font-semibold">{visit.hits}</span>
                        <Button variant="ghost" size="icon" onClick={() => void handleCopy(visit.ipAddress, "IP")}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="accounts" className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Tai khoan website</h2>
                <p className="text-sm text-muted-foreground">Tong cong {dashboard.accounts.total} tai khoan dang co trong he thong.</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Ten</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Ngay tao</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.accounts.users.map((user) => (
                    <tr key={user.id} className="border-t">
                      <td className="px-4 py-3">{user.id}</td>
                      <td className="px-4 py-3 font-medium">{user.name || "--"}</td>
                      <td className="px-4 py-3">{user.phone || "--"}</td>
                      <td className="px-4 py-3">{user.role}</td>
                      <td className="px-4 py-3">{fmtDate(user.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
