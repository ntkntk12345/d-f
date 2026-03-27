import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { BarChart3, CalendarDays, ImagePlus, Link2, LogOut, Plus, Power, RefreshCw, ShieldCheck, Trash2, Users, Wrench } from "lucide-react";
import { CollageImagePreview } from "@/components/media/CollageImagePreview";
import { Button } from "@/components/ui/button";
import { apiJsonFetch } from "@/context/AuthContext";
import { fileToOptimizedImageDataUrl, getDataUrlByteSize } from "@/lib/image-data-url";

const STORAGE_KEY = "bichha_admin_dashboard_token";
const MAX_FEATURED_IMAGE_COUNT = 10;
const MAX_TOTAL_FEATURED_IMAGE_BYTES = 6 * 1024 * 1024;

type DashboardSummary = {
  totalHits: number;
  totalVisitors: number;
  uniqueIps: number;
  knownAccountsVisited: number;
};

type IpVisit = {
  ipAddress: string;
  hits: number;
};

type DailyStat = {
  date: string;
  totalHits: number;
  uniqueIps: number;
  knownAccountsVisited: number;
  ipVisits: IpVisit[];
};

type DashboardUser = {
  id: number;
  name: string;
  phone: string;
  role: number;
  createdAt: string;
};

type DashboardFeaturedPost = {
  id: string;
  title: string;
  summary: string;
  content: string;
  address?: string;
  roomType?: string;
  priceLabel?: string;
  imageUrls?: string[];
  imageUrl?: string;
  actionLabel?: string;
  actionUrl?: string;
  routingKeywords: string[];
  createdAt: string;
  updatedAt: string;
};

type DashboardResponse = {
  generatedAt: string;
  timezone: string;
  summary1Day: DashboardSummary;
  summary7Days: DashboardSummary;
  summary30Days: DashboardSummary;
  dailyStats1: DailyStat[];
  dailyStats7: DailyStat[];
  dailyStats30: DailyStat[];
  postingControl: {
    isEnabled: boolean;
    message: string;
    updatedAt?: string;
  };
  maintenanceControl: {
    isEnabled: boolean;
    message: string;
    updatedAt?: string;
  };
  contactControl: {
    contactLink: string;
    message: string;
    updatedAt?: string;
  };
  featuredPosts: DashboardFeaturedPost[];
  accounts: {
    total: number;
    users: DashboardUser[];
  };
};

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function AdminBichHa() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [range, setRange] = useState<1 | 7 | 30>(7);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTogglingPosting, setIsTogglingPosting] = useState(false);
  const [isTogglingMaintenance, setIsTogglingMaintenance] = useState(false);
  const [contactLinkInput, setContactLinkInput] = useState("");
  const [isSavingContactLink, setIsSavingContactLink] = useState(false);
  const [featuredContent, setFeaturedContent] = useState("");
  const [featuredPriceLabel, setFeaturedPriceLabel] = useState("");
  const [featuredAddress, setFeaturedAddress] = useState("");
  const [featuredRoomType, setFeaturedRoomType] = useState("");
  const [featuredKeywords, setFeaturedKeywords] = useState("");
  const [featuredImageDataUrls, setFeaturedImageDataUrls] = useState<string[]>([]);
  const [isProcessingFeaturedImage, setIsProcessingFeaturedImage] = useState(false);
  const [isCreatingFeaturedPost, setIsCreatingFeaturedPost] = useState(false);
  const [deletingFeaturedPostId, setDeletingFeaturedPostId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async (authToken: string) => {
    setIsLoading(true);
    setError(null);

    const { res, data } = await apiJsonFetch<DashboardResponse | { message?: string }>(
      "/admin/bichha/dashboard",
      { message: "Khong the tai dashboard" },
      {},
      authToken,
    );

    if (!res.ok || !("accounts" in data)) {
      const message = "message" in data && typeof data.message === "string"
        ? data.message
        : "Khong the tai dashboard";

      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem(STORAGE_KEY);
        setToken(null);
      }

      setDashboard(null);
      setError(message);
      setIsLoading(false);
      return;
    }

    setDashboard(data);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!token) {
      setDashboard(null);
      return;
    }

    void loadDashboard(token);
  }, [token]);

  useEffect(() => {
    if (!dashboard) return;
    setContactLinkInput(dashboard.contactControl.contactLink || "");
  }, [dashboard?.contactControl.contactLink]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const { res, data } = await apiJsonFetch<{ token?: string; message?: string }>(
      "/admin/bichha/login",
      {},
      {
        method: "POST",
        body: JSON.stringify({ username, password }),
      },
    );

    if (!res.ok || !data.token) {
      setError(data.message || "Dang nhap that bai");
      setIsSubmitting(false);
      return;
    }

    localStorage.setItem(STORAGE_KEY, data.token);
    setToken(data.token);
    setPassword("");
    setIsSubmitting(false);
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setDashboard(null);
    setPassword("");
    setError(null);
  };

  const handleTogglePosting = async () => {
    if (!token || !dashboard) {
      return;
    }

    setIsTogglingPosting(true);
    setError(null);

    const { res, data } = await apiJsonFetch<
      DashboardResponse["postingControl"] | { message?: string }
    >(
      "/admin/bichha/posting-status",
      { message: "Khong the cap nhat trang thai dang bai" },
      {
        method: "POST",
        body: JSON.stringify({
          isEnabled: !dashboard.postingControl.isEnabled,
        }),
      },
      token,
    );

    if (!res.ok || !("isEnabled" in data)) {
      const message = "message" in data && typeof data.message === "string"
        ? data.message
        : "Khong the cap nhat trang thai dang bai";

      if (res.status === 401 || res.status === 403) {
        handleLogout();
      }

      setError(message);
      setIsTogglingPosting(false);
      return;
    }

    setDashboard((current) => current ? {
      ...current,
      postingControl: data,
    } : current);
    setIsTogglingPosting(false);
  };

  const handleToggleMaintenance = async () => {
    if (!token || !dashboard) {
      return;
    }

    setIsTogglingMaintenance(true);
    setError(null);

    const { res, data } = await apiJsonFetch<
      DashboardResponse["maintenanceControl"] | { message?: string }
    >(
      "/admin/bichha/maintenance-status",
      { message: "Khong the cap nhat trang thai bao tri" },
      {
        method: "POST",
        body: JSON.stringify({
          isEnabled: !dashboard.maintenanceControl.isEnabled,
        }),
      },
      token,
    );

    if (!res.ok || !("isEnabled" in data)) {
      const message = "message" in data && typeof data.message === "string"
        ? data.message
        : "Khong the cap nhat trang thai bao tri";

      if (res.status === 401 || res.status === 403) {
        handleLogout();
      }

      setError(message);
      setIsTogglingMaintenance(false);
      return;
    }

    setDashboard((current) => current ? {
      ...current,
      maintenanceControl: data,
    } : current);
    setIsTogglingMaintenance(false);
  };

  const handleSaveContactLink = async () => {
    if (!token || !dashboard) {
      return;
    }

    const nextContactLink = contactLinkInput.trim();
    if (!nextContactLink) {
      setError("Vui long nhap link lien he");
      return;
    }

    setIsSavingContactLink(true);
    setError(null);

    const { res, data } = await apiJsonFetch<
      DashboardResponse["contactControl"] | { message?: string }
    >(
      "/admin/bichha/contact-settings",
      { message: "Khong the cap nhat link lien he" },
      {
        method: "POST",
        body: JSON.stringify({
          contactLink: nextContactLink,
        }),
      },
      token,
    );

    if (!res.ok || !("contactLink" in data)) {
      const message = "message" in data && typeof data.message === "string"
        ? data.message
        : "Khong the cap nhat link lien he";

      if (res.status === 401 || res.status === 403) {
        handleLogout();
      }

      setError(message);
      setIsSavingContactLink(false);
      return;
    }

    setDashboard((current) => current ? {
      ...current,
      contactControl: data,
    } : current);
    setContactLinkInput(data.contactLink);
    setIsSavingContactLink(false);
  };

  const getFeaturedPostImageUrls = (post: DashboardFeaturedPost) => post.imageUrls?.length
    ? post.imageUrls
    : post.imageUrl
      ? [post.imageUrl]
      : [];

  const getFeaturedPostAddress = (post: DashboardFeaturedPost) => post.address?.trim() || post.title;
  const getFeaturedPostRoomType = (post: DashboardFeaturedPost) => post.roomType?.trim() || "Phong cho thue";
  const getFeaturedPostPriceLabel = (post: DashboardFeaturedPost) => post.priceLabel?.trim() || post.summary || "Lien he";

  const resetFeaturedPostForm = () => {
    setFeaturedContent("");
    setFeaturedPriceLabel("");
    setFeaturedAddress("");
    setFeaturedRoomType("");
    setFeaturedKeywords("");
    setFeaturedImageDataUrls([]);
    setIsProcessingFeaturedImage(false);
  };

  const handleRemoveFeaturedImage = (imageIndex: number) => {
    setFeaturedImageDataUrls((current) => current.filter((_, index) => index !== imageIndex));
  };

  const handleFeaturedImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    if (featuredImageDataUrls.length >= MAX_FEATURED_IMAGE_COUNT) {
      setError(`Moi bai viet chi duoc toi da ${MAX_FEATURED_IMAGE_COUNT} anh.`);
      return;
    }

    if (files.some((file) => !file.type.startsWith("image/"))) {
      setError("Anh bai viet khong hop le");
      return;
    }

    const availableSlots = Math.max(0, MAX_FEATURED_IMAGE_COUNT - featuredImageDataUrls.length);
    const nextFiles = files.slice(0, availableSlots);
    setIsProcessingFeaturedImage(true);

    try {
      const processedImageDataUrls: string[] = [];

      for (const file of nextFiles) {
        const nextImageDataUrl = await fileToOptimizedImageDataUrl(file, {
          maxSize: 1600,
          quality: 0.84,
        });

        if (getDataUrlByteSize(nextImageDataUrl) > 5 * 1024 * 1024) {
          setError("Moi anh bai viet phai nho hon 5MB sau khi nen.");
          return;
        }

        processedImageDataUrls.push(nextImageDataUrl);
      }

      const mergedImageDataUrls = [...featuredImageDataUrls, ...processedImageDataUrls];
      const totalBytes = mergedImageDataUrls.reduce(
        (sum, imageDataUrl) => sum + getDataUrlByteSize(imageDataUrl),
        0,
      );

      if (totalBytes > MAX_TOTAL_FEATURED_IMAGE_BYTES) {
        setError("Tong dung luong anh dang vuot gioi han. Vui long bot anh hoac chon anh nhe hon.");
        return;
      }

      setFeaturedImageDataUrls(mergedImageDataUrls);
      setError(null);

      if (files.length > nextFiles.length) {
        setError(`Chi giu toi da ${MAX_FEATURED_IMAGE_COUNT} anh dau tien cho moi bai viet.`);
      }
    } catch {
      setError("Khong the xu ly anh bai viet. Vui long thu anh khac.");
    } finally {
      setIsProcessingFeaturedImage(false);
    }
  };

  const handleCreateFeaturedPost = async () => {
    if (!token || !dashboard) {
      return;
    }

    if (!featuredContent.trim()) {
      setError("Vui long nhap thong tin gui");
      return;
    }

    if (!featuredPriceLabel.trim()) {
      setError("Vui long nhap gia phong");
      return;
    }

    if (!featuredAddress.trim()) {
      setError("Vui long nhap dia chi");
      return;
    }

    if (!featuredRoomType.trim()) {
      setError("Vui long nhap loai phong");
      return;
    }

    setIsCreatingFeaturedPost(true);
    setError(null);

    const routingKeywords = featuredKeywords
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    const { res, data } = await apiJsonFetch<DashboardFeaturedPost | { message?: string }>(
      "/admin/bichha/featured-posts",
      { message: "Khong the tao bai viet noi bat" },
      {
        method: "POST",
        body: JSON.stringify({
          content: featuredContent,
          priceLabel: featuredPriceLabel,
          address: featuredAddress,
          roomType: featuredRoomType,
          imageDataUrls: featuredImageDataUrls.length > 0 ? featuredImageDataUrls : undefined,
          routingKeywords,
        }),
      },
      token,
    );

    if (!res.ok || !("id" in data)) {
      const message = "message" in data && typeof data.message === "string"
        ? data.message
        : "Khong the tao bai viet noi bat";

      if (res.status === 401 || res.status === 403) {
        handleLogout();
      }

      setError(message);
      setIsCreatingFeaturedPost(false);
      return;
    }

    setDashboard((current) => current ? {
      ...current,
      featuredPosts: [data, ...current.featuredPosts],
    } : current);
    resetFeaturedPostForm();
    setIsCreatingFeaturedPost(false);
  };

  const handleDeleteFeaturedPost = async (postId: string) => {
    if (!token || !dashboard) {
      return;
    }

    const confirmed = window.confirm("Xoa bai viet nay khoi web va bot?");
    if (!confirmed) {
      return;
    }

    setDeletingFeaturedPostId(postId);
    setError(null);

    const { res, data } = await apiJsonFetch<{ success?: boolean; message?: string }>(
      `/admin/bichha/featured-posts/${postId}`,
      { message: "Khong the xoa bai viet noi bat" },
      {
        method: "DELETE",
      },
      token,
    );

    if (!res.ok || !data.success) {
      if (res.status === 401 || res.status === 403) {
        handleLogout();
      }

      setError(data.message || "Khong the xoa bai viet noi bat");
      setDeletingFeaturedPostId(null);
      return;
    }

    setDashboard((current) => current ? {
      ...current,
      featuredPosts: current.featuredPosts.filter((post) => post.id !== postId),
    } : current);
    setDeletingFeaturedPostId(null);
  };

  const activeSummary = range === 1
    ? dashboard?.summary1Day
    : range === 7
      ? dashboard?.summary7Days
      : dashboard?.summary30Days;
  const activeStats = range === 1
    ? dashboard?.dailyStats1
    : range === 7
      ? dashboard?.dailyStats7
      : dashboard?.dailyStats30;
  const isContactLinkDirty =
    contactLinkInput.trim() !== (dashboard?.contactControl.contactLink || "").trim();

  if (!token) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff6e7,_#fff_55%,_#f3f4f6)] px-4 py-10">
        <div className="mx-auto max-w-md overflow-hidden rounded-[28px] border border-[#f2d3a1] bg-white shadow-[0_30px_80px_rgba(180,83,9,0.12)]">
          <div className="bg-gradient-to-r from-[#b45309] via-[#d97706] to-[#f59e0b] px-6 py-7 text-white">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-black tracking-tight">BichHa Dashboard</h1>
            <p className="mt-2 text-sm text-white/80">
              Dang nhap de xem thong ke traffic, IP truy cap va danh sach tai khoan.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4 px-6 py-6">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Tai khoan</label>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-amber-500"
                placeholder="admin"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Mat khau</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-amber-500"
                placeholder="Nhap mat khau"
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                {error}
              </div>
            )}
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-12 w-full rounded-2xl bg-[#c2410c] text-sm font-bold text-white hover:bg-[#9a3412]"
            >
              {isSubmitting ? "Dang dang nhap..." : "Dang nhap dashboard"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f6f3]">
      <div className="border-b border-black/5 bg-[linear-gradient(135deg,#1f2937,#111827_45%,#78350f)] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/75">
              <BarChart3 className="h-3.5 w-3.5" />
              Admin / BichHa
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Tong hop traffic va tai khoan</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              Moi ngay se hien thi tung IP truy cap va so lan vao he thong.
            </p>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap sm:items-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => token && loadDashboard(token)}
              disabled={isLoading}
              className="h-10 rounded-2xl border-white/15 bg-white/10 px-4 text-white hover:bg-white/15 sm:rounded-full"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Lam moi
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleLogout}
              className="h-10 rounded-2xl border-white/15 bg-white/10 px-4 text-white hover:bg-white/15 sm:rounded-full"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Dang xuat
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid w-full grid-cols-3 rounded-[22px] border border-slate-200 bg-white p-1 shadow-sm sm:inline-flex sm:w-auto sm:rounded-full">
            {[1, 7, 30].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRange(value as 1 | 7 | 30)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition sm:rounded-full ${
                  range === value ? "bg-[#b45309] text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {value} ngay
              </button>
            ))}
          </div>

          <p className="text-sm text-slate-500">
            Cap nhat luc {dashboard ? formatDateTime(dashboard.generatedAt) : "--"} ({dashboard?.timezone || "Asia/Ho_Chi_Minh"})
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {error}
          </div>
        )}

        <section className="mb-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] ${
                  dashboard?.postingControl.isEnabled
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                <Power className="h-3.5 w-3.5" />
                {dashboard?.postingControl.isEnabled ? "Dang mo dang bai" : "Dang tam tat dang bai"}
              </div>
              <h2 className="mt-3 text-xl font-black text-slate-900">Dieu khien dang bai</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                {dashboard?.postingControl.message || "Chua co trang thai dang bai."}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Cap nhat gan nhat: {dashboard?.postingControl.updatedAt ? formatDateTime(dashboard.postingControl.updatedAt) : "--"}
              </p>
            </div>

            <Button
              type="button"
              onClick={handleTogglePosting}
              disabled={!dashboard || isTogglingPosting}
              className={`h-12 rounded-2xl px-5 text-sm font-bold text-white ${
                dashboard?.postingControl.isEnabled
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              <Power className="mr-2 h-4 w-4" />
              {isTogglingPosting
                ? "Dang cap nhat..."
                : dashboard?.postingControl.isEnabled
                  ? "Tat dang bai"
                  : "Bat dang bai"}
            </Button>
          </div>
        </section>

        <section className="mb-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] ${
                  dashboard?.maintenanceControl.isEnabled
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                <Wrench className="h-3.5 w-3.5" />
                {dashboard?.maintenanceControl.isEnabled ? "Dang bat bao tri" : "Dang tat bao tri"}
              </div>
              <h2 className="mt-3 text-xl font-black text-slate-900">Che do bao tri website</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                {dashboard?.maintenanceControl.message || "Chua co trang thai bao tri."}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Cap nhat gan nhat: {dashboard?.maintenanceControl.updatedAt ? formatDateTime(dashboard.maintenanceControl.updatedAt) : "--"}
              </p>
            </div>

            <Button
              type="button"
              onClick={handleToggleMaintenance}
              disabled={!dashboard || isTogglingMaintenance}
              className={`h-12 rounded-2xl px-5 text-sm font-bold text-white ${
                dashboard?.maintenanceControl.isEnabled
                  ? "bg-slate-800 hover:bg-slate-900"
                  : "bg-amber-600 hover:bg-amber-700"
              }`}
            >
              <Wrench className="mr-2 h-4 w-4" />
              {isTogglingMaintenance
                ? "Dang cap nhat..."
                : dashboard?.maintenanceControl.isEnabled
                  ? "Tat bao tri"
                  : "Bat bao tri"}
            </Button>
          </div>
        </section>

        <section className="mb-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-sky-700">
                <Link2 className="h-3.5 w-3.5" />
                Link lien he
              </div>
              <h2 className="mt-3 text-xl font-black text-slate-900">Link cho nut Lien he Zalo</h2>
              <p className="mt-2 text-sm text-slate-500">
                Doi tai day thi nut lien he o navbar, PropertyCard va trang chi tiet se dung link moi nay.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {dashboard?.contactControl.message || "Chua co link lien he."}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Cap nhat gan nhat: {dashboard?.contactControl.updatedAt ? formatDateTime(dashboard.contactControl.updatedAt) : "--"}
              </p>
            </div>

            <div className="w-full max-w-xl space-y-3">
              <label className="block text-sm font-semibold text-slate-700">Link lien he</label>
              <input
                type="url"
                value={contactLinkInput}
                onChange={(event) => setContactLinkInput(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-sky-500"
                placeholder="https://zalo.me/0876480130/"
                autoComplete="off"
              />
              <p className="text-xs text-slate-400">
                Co the nhap `https://zalo.me/...`, `zalo://...`, `tel:...` hoac domain day du.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={handleSaveContactLink}
                  disabled={!dashboard || isSavingContactLink || !isContactLinkDirty}
                  className="h-12 rounded-2xl bg-sky-600 px-5 text-sm font-bold text-white hover:bg-sky-700"
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  {isSavingContactLink ? "Dang luu..." : "Luu link lien he"}
                </Button>
                {dashboard?.contactControl.contactLink && (
                  <a
                    href={dashboard.contactControl.contactLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-sky-700 hover:underline"
                  >
                    Mo link hien tai
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-amber-700">
                <ImagePlus className="h-3.5 w-3.5" />
                Bai viet noi bat
              </div>
              <h2 className="mt-3 text-xl font-black text-slate-900">Dang bai len web va bot</h2>
              <p className="mt-2 text-sm text-slate-500">
                Bai viet tao tai day se hien o trang chu va duoc bot gui lai 4 ngay 1 lan cho den khi bi xoa.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Ngoai web se hien nhu mot can phong rut gon: loai phong, xac minh, dia chi va gia. Phan "Thong tin gui" duoc dung lam mo ta khi mo chi tiet va noi dung bot gui.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Keyword la truong bat buoc de bot dinh tuyen nhom dung logic nhu hien tai.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                De bot gui that qua Zalo, can chay them <code>sender.py</code>. Bai moi se vao queue trong khoang 5 phut dau tien neu sender dang chay.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Dang co <span className="font-bold text-slate-900">{dashboard?.featuredPosts.length || 0}</span> bai viet dang hoat dong
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Thong tin gui</label>
                <textarea
                  value={featuredContent}
                  onChange={(event) => setFeaturedContent(event.target.value)}
                  className="min-h-[170px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-amber-500"
                  placeholder="Phan mo ta khi xem phong va noi dung bot se gui..."
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Gia</label>
                <input
                  value={featuredPriceLabel}
                  onChange={(event) => setFeaturedPriceLabel(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-amber-500"
                  placeholder="Vi du: 4tr3/thang"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Dia chi</label>
                <input
                  value={featuredAddress}
                  onChange={(event) => setFeaturedAddress(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-amber-500"
                  placeholder="Vi du: So 30 ngo 165 Cho Kham Thien, Dong Da"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Loai phong</label>
                <input
                  value={featuredRoomType}
                  onChange={(event) => setFeaturedRoomType(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-amber-500"
                  placeholder="Vi du: Studio"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Keyword routing</label>
                <textarea
                  value={featuredKeywords}
                  onChange={(event) => setFeaturedKeywords(event.target.value)}
                  className="min-h-[96px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-amber-500"
                  placeholder="Nhap keyword cach nhau bang dau phay hoac xuong dong. Vi du: My Dinh, Nam Tu Liem"
                />
                <p className="mt-2 text-xs text-slate-400">
                  Bot se dung danh sach keyword nay de gui vao cac nhom dung nhu logic binh thuong.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Anh bai viet</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={handleFeaturedImageChange}
                  className="block w-full rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-amber-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-amber-700"
                />
                <p className="mt-2 text-xs text-slate-400">
                  Anh se duoc nen tu dong truoc khi upload. Moi bai toi da {MAX_FEATURED_IMAGE_COUNT} anh va tong dung luong nen toi da khoang 6MB.
                </p>
                {isProcessingFeaturedImage ? (
                  <p className="mt-2 text-xs font-semibold text-amber-700">Dang xu ly anh...</p>
                ) : null}
                {featuredImageDataUrls.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {featuredImageDataUrls.map((imageDataUrl, index) => (
                        <div key={`${imageDataUrl.slice(0, 32)}-${index}`} className="overflow-hidden rounded-[22px] border border-slate-200 bg-white">
                          <img src={imageDataUrl} alt="" className="h-36 w-full object-cover" />
                          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
                            <span className="text-xs font-semibold text-slate-500">Anh {index + 1}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveFeaturedImage(index)}
                              className="text-xs font-semibold text-red-600 hover:text-red-700"
                            >
                              Xoa
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400">
                      Da chon {featuredImageDataUrls.length} anh / {Math.round(
                        featuredImageDataUrls.reduce((sum, imageDataUrl) => sum + getDataUrlByteSize(imageDataUrl), 0) / 1024,
                      )}KB sau khi nen
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={handleCreateFeaturedPost}
                  disabled={!dashboard || isCreatingFeaturedPost || isProcessingFeaturedImage}
                  className="h-12 rounded-2xl bg-amber-600 px-5 text-sm font-bold text-white hover:bg-amber-700"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {isCreatingFeaturedPost
                    ? "Dang tao bai..."
                    : isProcessingFeaturedImage
                      ? "Dang xu ly anh..."
                      : "Dang bai noi bat"}
                </Button>
                <button
                  type="button"
                  onClick={resetFeaturedPostForm}
                  className="text-sm font-semibold text-slate-500 hover:text-slate-700"
                >
                  Xoa form
                </button>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-4">
                <h3 className="text-lg font-black text-slate-900">Danh sach bai dang hoat dong</h3>
                <p className="mt-1 text-sm text-slate-500">Xoa o day thi web an bai va bot ngung gui o chu ky tiep theo.</p>
              </div>

              <div className="max-h-[820px] overflow-auto p-4">
                {dashboard?.featuredPosts.length ? (
                  <div className="space-y-4">
                    {dashboard.featuredPosts.map((post) => (
                      <article key={post.id} className="overflow-hidden rounded-[22px] border border-slate-200 bg-slate-50">
                        {getFeaturedPostImageUrls(post).length > 0 ? (
                          <div className="group relative h-44 overflow-hidden bg-slate-100">
                            <CollageImagePreview
                              images={getFeaturedPostImageUrls(post)}
                              alt={post.title}
                              fallbackImages={[]}
                              emptyStateClassName="bg-slate-100"
                            />
                            {getFeaturedPostImageUrls(post).length > 1 ? (
                              <div className="absolute right-3 top-3 rounded-full bg-white/90 px-2 py-1 text-[11px] font-bold text-slate-700 shadow">
                                {getFeaturedPostImageUrls(post).length} anh
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="space-y-3 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-base font-black text-slate-900">{getFeaturedPostRoomType(post)}</h4>
                                <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700">
                                  Xac minh
                                </span>
                              </div>
                              <p className="mt-2 text-sm font-semibold text-slate-700">{getFeaturedPostAddress(post)}</p>
                              <p className="mt-1 text-sm font-bold text-red-600">Gia: {getFeaturedPostPriceLabel(post)}</p>
                              <p className="mt-1 text-xs text-slate-400">
                                Tao luc {formatDateTime(post.createdAt)} • Cap nhat {formatDateTime(post.updatedAt)}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleDeleteFeaturedPost(post.id)}
                              disabled={deletingFeaturedPostId === post.id}
                              className="h-10 rounded-2xl border-red-200 bg-white px-4 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {deletingFeaturedPostId === post.id ? "Dang xoa..." : "Xoa"}
                            </Button>
                          </div>
                          <p className="whitespace-pre-line text-sm leading-6 text-slate-600">{post.content}</p>

                          <div className="flex flex-wrap gap-2">
                            {post.routingKeywords.map((keyword) => (
                              <span
                                key={`${post.id}-${keyword}`}
                                className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm"
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                    Chua co bai viet noi bat nao.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Tong truy cap (IP)</p>
            <p className="mt-3 text-3xl font-black text-slate-900">{activeSummary?.totalVisitors ?? 0}</p>
            <p className="mt-2 text-sm text-slate-500">Tinh theo so IP khac nhau trong {range} ngay.</p>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Tong luot vao</p>
            <p className="mt-3 text-3xl font-black text-slate-900">{activeSummary?.totalHits ?? 0}</p>
            <p className="mt-2 text-sm text-slate-500">Dem theo tong so lan truy cap da ghi nhan.</p>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Tai khoan truy cap</p>
            <p className="mt-3 text-3xl font-black text-slate-900">{activeSummary?.knownAccountsVisited ?? 0}</p>
            <p className="mt-2 text-sm text-slate-500">So tai khoan da dang nhap co phat sinh luot truy cap.</p>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Tong so tai khoan</p>
            <p className="mt-3 text-3xl font-black text-slate-900">{dashboard?.accounts.total ?? 0}</p>
            <p className="mt-2 text-sm text-slate-500">Danh sach ben duoi hien thi ten va so dien thoai.</p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">Thong ke theo ngay</h2>
                <p className="text-sm text-slate-500">Moi ngay gom danh sach IP va so lan truy cap.</p>
              </div>
            </div>

            {isLoading ? (
              <div className="rounded-3xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-500">
                Dang tai du lieu thong ke...
              </div>
            ) : (
              <div className="space-y-4">
                {(activeStats || []).map((item) => (
                  <div key={item.date} className="overflow-hidden rounded-[24px] border border-slate-200">
                    <div className="flex flex-col gap-3 bg-slate-50 px-4 py-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{formatDateLabel(item.date)}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.totalHits} luot vao • {item.uniqueIps} IP • {item.knownAccountsVisited} tai khoan</p>
                      </div>
                      <div className="inline-flex rounded-full bg-white p-1 text-xs font-semibold text-slate-500 shadow-sm">
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">Tong hit: {item.totalHits}</span>
                      </div>
                    </div>

                    <div className="px-4 py-4">
                      {item.ipVisits.length === 0 ? (
                        <p className="text-sm text-slate-400">Chua co luot truy cap.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.18em] text-slate-400">
                                <th className="pb-3 pr-4">Dia chi IP</th>
                                <th className="pb-3 text-right">So lan vao</th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.ipVisits.map((ip) => (
                                <tr key={`${item.date}-${ip.ipAddress}`} className="border-b border-slate-100 last:border-b-0">
                                  <td className="py-3 pr-4 font-medium text-slate-700">{ip.ipAddress}</td>
                                  <td className="py-3 text-right font-bold text-slate-900">{ip.hits}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">Tai khoan dang ky</h2>
                <p className="text-sm text-slate-500">Tong hop ten, so dien thoai va ngay tao.</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-slate-200">
              <div className="max-h-[960px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-400">
                      <th className="px-4 py-3">Tai khoan</th>
                      <th className="px-4 py-3">SDT</th>
                      <th className="px-4 py-3">Ngay tao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboard?.accounts.users || []).map((user) => (
                      <tr key={user.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">{user.name}</div>
                          <div className="text-xs text-slate-400">#{user.id} • role {user.role}</div>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">{user.phone}</td>
                        <td className="px-4 py-3 text-slate-500">{formatDateTime(user.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
