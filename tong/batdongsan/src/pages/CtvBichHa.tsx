import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { LogOut, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { BichHaCommissionSearchPanel } from "@/components/bichha/BichHaCommissionSearchPanel";
import { CollageImagePreview } from "@/components/media/CollageImagePreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiJsonFetch } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { fileToOptimizedImageDataUrl, getDataUrlByteSize } from "@/lib/image-data-url";

const STORAGE_KEY = "bichha_ctv_dashboard_token";
const MAX_FEATURED_IMAGE_COUNT = 10;
const MAX_TOTAL_FEATURED_IMAGE_BYTES = 6 * 1024 * 1024;

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
  createdAt: string;
  updatedAt: string;
};
type Profile = { id: number; username: string; nickname: string; isEnabled: boolean; createdAt: string; updatedAt: string };
type Dashboard = { generatedAt: string; profile: Profile; featuredPosts: FeaturedPost[] };
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

const EMPTY_DASHBOARD: Dashboard = {
  generatedAt: "",
  profile: { id: 0, username: "", nickname: "", isEnabled: true, createdAt: "", updatedAt: "" },
  featuredPosts: [],
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

function parseKeywords(value: string) {
  return Array.from(new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)));
}

function getMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "message" in data && typeof data.message === "string") {
    return data.message;
  }
  return fallback;
}

function postImages(post: FeaturedPost) {
  return post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : [];
}

export function CtvBichHa() {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(() => (typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY)));
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [featuredForm, setFeaturedForm] = useState<FeaturedForm>(EMPTY_FEATURED_FORM);
  const [featuredImages, setFeaturedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(Boolean(token));
  const [loggingIn, setLoggingIn] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("featured");

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

    const { res, data } = await apiJsonFetch<Dashboard>("/ctv/bichha/dashboard", EMPTY_DASHBOARD, {}, nextToken);
    if (!res.ok) {
      if (res.status === 401) clearSession();
      toast({ title: getMessage(data, "Khong the tai dashboard CTV"), variant: "destructive" });
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

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoggingIn(true);
    const { res, data } = await apiJsonFetch<{ token?: string; message?: string }>(
      "/ctv/bichha/login",
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

  async function handleImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    try {
      let nextImages = [...featuredImages];
      for (const file of files) {
        if (nextImages.length >= MAX_FEATURED_IMAGE_COUNT) break;
        nextImages.push(await fileToOptimizedImageDataUrl(file, { maxSize: 1600, outputType: "image/jpeg", quality: 0.82 }));
      }
      if (nextImages.reduce((sum, item) => sum + getDataUrlByteSize(item), 0) > MAX_TOTAL_FEATURED_IMAGE_BYTES) {
        toast({ title: "Tong dung luong anh qua lon", variant: "destructive" });
        return;
      }
      setFeaturedImages(nextImages.slice(0, MAX_FEATURED_IMAGE_COUNT));
    } catch {
      toast({ title: "Khong the xu ly anh", variant: "destructive" });
    }
  }

  async function handleCreateFeatured(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    setSaving(true);
    const { res, data } = await apiJsonFetch<Record<string, unknown>>(
      "/ctv/bichha/featured-posts",
      {},
      {
        method: "POST",
        body: JSON.stringify({
          title: featuredForm.title,
          summary: featuredForm.summary,
          content: featuredForm.content,
          address: featuredForm.address,
          roomType: featuredForm.roomType.trim() || undefined,
          priceLabel: featuredForm.priceLabel,
          routingKeywords: parseKeywords(featuredForm.routingKeywordsText),
          actionLabel: featuredForm.actionLabel.trim() || undefined,
          actionUrl: featuredForm.actionUrl.trim() || undefined,
          imageDataUrls: featuredImages,
        }),
      },
      token,
    );
    setSaving(false);

    if (!res.ok) {
      if (res.status === 401) clearSession();
      toast({ title: getMessage(data, "Khong the tao bai noi bat"), variant: "destructive" });
      return;
    }

    toast({ title: "Da tao bai noi bat" });
    setFeaturedForm(EMPTY_FEATURED_FORM);
    setFeaturedImages([]);
    await loadDashboard(token, true);
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(145deg,#f8fafc,#ecfeff_40%,#fff7ed)] px-4 py-10">
        <form onSubmit={handleLogin} className="w-full max-w-md space-y-5 rounded-3xl border bg-white p-8 shadow-2xl">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <ShieldCheck className="h-4 w-4" /> CTV BichHa
            </div>
            <h1 className="text-3xl font-bold text-foreground">Dang nhap CTV</h1>
            <p className="text-sm text-muted-foreground">Trang nay chi dung de tao bai noi bat. Khong co quyen traffic hay bot control.</p>
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
          <RefreshCw className="h-4 w-4 animate-spin" /> Dang tai dashboard CTV...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <ShieldCheck className="h-4 w-4" /> CTV BichHa
            </div>
            <h1 className="text-2xl font-bold text-foreground">{dashboard.profile.nickname || dashboard.profile.username}</h1>
            <p className="text-sm text-muted-foreground">Cap nhat luc {fmtDate(dashboard.generatedAt)}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void loadDashboard(token, true)} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Lam moi
            </Button>
            <Button variant="outline" onClick={clearSession}>
              <LogOut className="h-4 w-4" /> Dang xuat
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-none bg-transparent p-0">
            <TabsTrigger value="featured" className="border bg-white data-[state=active]:border-primary">Dang bai noi bat</TabsTrigger>
            <TabsTrigger value="hh" className="border bg-white data-[state=active]:border-primary">Tra hoa hong</TabsTrigger>
          </TabsList>

          <TabsContent value="featured" className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <form onSubmit={handleCreateFeatured} className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold">Dang bai noi bat</h2>
                <p className="text-sm text-muted-foreground">Chi co quyen post. Room type khong bat buoc.</p>
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
                <Input value={featuredForm.actionUrl} onChange={(event) => setFeaturedForm((current) => ({ ...current, actionUrl: event.target.value }))} placeholder="Action URL (khong bat buoc)" />
              </div>

              <div className="space-y-3 rounded-2xl border bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Anh bai viet</p>
                    <p className="text-sm text-muted-foreground">Sender se gui anh theo group album.</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium">
                    <Plus className="h-4 w-4" /> Them anh
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleImages} />
                  </label>
                </div>

                {featuredImages.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {featuredImages.map((image, index) => (
                      <div key={`${image.slice(0, 32)}-${index}`} className="overflow-hidden rounded-2xl border bg-white">
                        <div className="relative aspect-[4/3]">
                          <CollageImagePreview images={[image]} alt={`CTV ${index + 1}`} fallbackImages={[]} />
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

              <Button type="submit" disabled={saving}>
                <Plus className="h-4 w-4" /> {saving ? "Dang tao..." : "Dang bai noi bat"}
              </Button>
            </form>

            <div className="space-y-4">
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Bai da tao</h2>
                <p className="mt-1 text-sm text-muted-foreground">Chi hien bai do chinh ban tao. Danh sach nay chi de xem, khong co quyen xoa.</p>
              </div>

              {dashboard.featuredPosts.length === 0 ? (
                <div className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground shadow-sm">Ban chua tao bai noi bat nao.</div>
              ) : dashboard.featuredPosts.map((post) => (
                <div key={post.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                  <div className="grid gap-0 md:grid-cols-[220px_1fr]">
                    <div className="relative min-h-[180px] bg-slate-100">
                      <CollageImagePreview images={postImages(post)} alt={post.title} fallbackImages={[]} />
                    </div>
                    <div className="space-y-4 p-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge>CTV</Badge>
                        <Badge variant="outline">{post.roomType?.trim() || "Phong cho thue"}</Badge>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">{post.address || post.title}</h3>
                        <p className="text-sm text-red-600">{post.priceLabel || post.summary || "Lien he"}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">{post.summary || post.content.slice(0, 180)}</p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>Keyword: <strong>{post.routingKeywords.join(", ") || "--"}</strong></span>
                        <span>Tao luc: <strong>{fmtDate(post.createdAt)}</strong></span>
                        <span>Cap nhat: <strong>{fmtDate(post.updatedAt)}</strong></span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="hh">
            <BichHaCommissionSearchPanel
              token={token}
              endpoint="/ctv/bichha/commissions/search"
              title="Tra hoa hong de chot can"
              description="CTV co the loc theo dia chi, dang phong va muc HH de uu tien gioi thieu can co hoa hong tot nhat."
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
