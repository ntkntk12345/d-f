import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { CheckCircle2, XCircle, Clock, Users, Home, Eye, Percent, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, apiFetch, apiJsonFetch } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";

type Listing = {
  id: number;
  title: string;
  category: string;
  province: string;
  district: string;
  price: number;
  priceUnit: string;
  contactName: string;
  contactPhone: string;
  status: string;
  commission: number | null;
  postedAt: string;
  images: string[];
  description: string;
};

type TabKey = "pending" | "approved" | "rejected";

export function Admin() {
  const { user, token, logout, isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("pending");
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setLocation("/dang-nhap");
    }
  }, [isAdmin]);

  const fetchListings = async (status: TabKey) => {
    setLoading(true);
    try {
      const { res, data } = await apiJsonFetch<Listing[]>(
        `/admin/properties?status=${status}`,
        [],
        {},
        token,
      );
      setListings(res.ok && Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Lỗi tải dữ liệu", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchListings(tab);
  }, [tab, isAdmin]);

  const handleApprove = async (id: number) => {
    setActionId(id);
    try {
      await apiFetch(`/admin/properties/${id}/approve`, { method: "POST" }, token);
      toast({ title: "Đã duyệt tin!" });
      fetchListings(tab);
    } catch {
      toast({ title: "Lỗi", variant: "destructive" });
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (id: number) => {
    setActionId(id);
    try {
      await apiFetch(`/admin/properties/${id}/reject`, { method: "POST" }, token);
      toast({ title: "Đã từ chối tin" });
      fetchListings(tab);
    } catch {
      toast({ title: "Lỗi", variant: "destructive" });
    } finally {
      setActionId(null);
    }
  };

  const CATEGORY_LABELS: Record<string, string> = {
    "phong-tro": "Phòng trọ",
    "studio": "Studio",
    "nha-nguyen-can": "Nhà nguyên căn",
    "o-ghep": "Ở ghép",
    "mat-bang": "Mặt bằng",
    "van-phong": "Văn phòng",
  };

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-50 pt-[72px]">
      <div className="bg-primary text-white py-4 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <Home className="w-4 h-4" />
          </div>
          <div>
            <p className="font-bold text-lg">Quản trị viên</p>
            <p className="text-white/70 text-xs">{user?.name} — {user?.phone}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={() => setLocation("/")}>
            <Eye className="w-4 h-4 mr-1" /> Xem trang
          </Button>
          <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={() => { logout(); setLocation("/"); }}>
            <LogOut className="w-4 h-4 mr-1" /> Đăng xuất
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex gap-1 bg-white rounded-xl border border-border p-1 mb-6 w-fit">
          {([
            { key: "pending", label: "Chờ duyệt", icon: Clock, color: "text-amber-600" },
            { key: "approved", label: "Đã duyệt", icon: CheckCircle2, color: "text-green-600" },
            { key: "rejected", label: "Từ chối", icon: XCircle, color: "text-red-500" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.key ? "bg-primary text-white" : `${t.color} hover:bg-gray-50`}`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
          <button onClick={() => fetchListings(tab)} className="ml-2 px-3 py-2 text-muted-foreground hover:text-primary rounded-lg hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-muted-foreground">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
            Đang tải...
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p>Không có tin đăng nào</p>
          </div>
        ) : (
          <div className="space-y-4">
            {listings.map((l) => (
              <div key={l.id} className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
                <div className="flex flex-col md:flex-row">
                  {l.images?.[0] && (
                    <div className="md:w-48 h-36 md:h-auto shrink-0">
                      <img src={l.images[0]} alt={l.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">
                            {CATEGORY_LABELS[l.category] || l.category}
                          </span>
                          <span className="text-xs text-muted-foreground">#{l.id}</span>
                        </div>
                        <h3 className="font-bold text-foreground text-base leading-tight mb-2 line-clamp-2">{l.title}</h3>
                        <p className="text-sm text-muted-foreground mb-1">📍 {l.district}, {l.province}</p>
                        <p className="text-primary font-bold">{l.price} {l.priceUnit}</p>
                        <p className="text-sm text-foreground mt-1">👤 {l.contactName} — {l.contactPhone}</p>

                        {l.commission != null && (
                          <div className="mt-2 inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1 rounded-lg text-sm font-semibold">
                            <Percent className="w-3.5 h-3.5" />
                            Hoa hồng: {l.commission}%
                          </div>
                        )}
                      </div>

                      {tab === "pending" && (
                        <div className="flex flex-col gap-2 shrink-0">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white gap-1"
                            onClick={() => handleApprove(l.id)}
                            disabled={actionId === l.id}
                          >
                            <CheckCircle2 className="w-4 h-4" /> Duyệt
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50 gap-1"
                            onClick={() => handleReject(l.id)}
                            disabled={actionId === l.id}
                          >
                            <XCircle className="w-4 h-4" /> Từ chối
                          </Button>
                          <Link href={`/property/${l.id}`}>
                            <Button size="sm" variant="ghost" className="gap-1 w-full">
                              <Eye className="w-4 h-4" /> Xem
                            </Button>
                          </Link>
                        </div>
                      )}

                      {tab === "approved" && (
                        <div className="flex flex-col gap-2 shrink-0">
                          <span className="inline-flex items-center gap-1 text-green-600 text-sm font-semibold">
                            <CheckCircle2 className="w-4 h-4" /> Đã duyệt
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50 gap-1"
                            onClick={() => handleReject(l.id)}
                            disabled={actionId === l.id}
                          >
                            <XCircle className="w-4 h-4" /> Từ chối
                          </Button>
                        </div>
                      )}

                      {tab === "rejected" && (
                        <div className="flex flex-col gap-2 shrink-0">
                          <span className="inline-flex items-center gap-1 text-red-500 text-sm font-semibold">
                            <XCircle className="w-4 h-4" /> Đã từ chối
                          </span>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white gap-1"
                            onClick={() => handleApprove(l.id)}
                            disabled={actionId === l.id}
                          >
                            <CheckCircle2 className="w-4 h-4" /> Duyệt lại
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
