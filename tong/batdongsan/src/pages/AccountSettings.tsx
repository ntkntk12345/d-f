import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, Loader2, Save } from "lucide-react";
import { apiFetch, useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

export function AccountSettings() {
  const { user, token, login, isLoggedIn } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(user?.name ?? "");
    setPhone(user?.phone ?? "");
  }, [user?.name, user?.phone]);

  const hasChanges = isLoggedIn && (
    name.trim() !== (user?.name ?? "").trim() ||
    phone.trim() !== (user?.phone ?? "").trim()
  );

  const handleSave = async () => {
    if (!token) {
      toast({
        title: "Bạn chưa đăng nhập",
        description: "Vui lòng đăng nhập để cập nhật tài khoản.",
      });
      return;
    }

    const cleanName = name.trim();
    const cleanPhone = phone.trim();

    if (!cleanName || !cleanPhone) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập đủ tên và số điện thoại.",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch(
        "/auth/profile",
        {
          method: "PUT",
          body: JSON.stringify({
            name: cleanName,
            phone: cleanPhone,
          }),
        },
        token,
      );

      const data = await res.json().catch(() => ({ message: "Không thể cập nhật tài khoản" })) as {
        token?: string;
        user?: typeof user;
        message?: string;
      };

      if (!res.ok || !data.token || !data.user) {
        toast({
          title: "Cập nhật thất bại",
          description: data.message ?? "Vui lòng thử lại.",
        });
        return;
      }

      login(data.token, data.user);
      toast({
        title: "Đã cập nhật tài khoản",
        description: "Thông tin tên và số điện thoại đã được lưu.",
      });
    } catch {
      toast({
        title: "Không thể kết nối",
        description: "Vui lòng thử lại sau.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[#f5f5f3] pt-16 pb-10">
      <div className="mx-auto max-w-lg px-4 py-5">
        <div className="mb-4 flex items-center gap-3">
          <Link href="/ho-so" className="flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-black/5">
            <ChevronLeft className="h-5 w-5 text-foreground" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-foreground">Cập nhật tài khoản</h1>
            <p className="text-sm text-muted-foreground">Chỉnh sửa tên và số điện thoại.</p>
          </div>
        </div>

        <div className="rounded-[28px] bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.06)] ring-1 ring-black/5">
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="account-name" className="block text-sm font-medium text-muted-foreground">
                Tên
              </label>
              <input
                id="account-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nhập tên của bạn"
                className="h-12 w-full rounded-2xl border border-border bg-white px-4 text-[16px] text-foreground outline-none transition-colors focus:border-primary"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="account-phone" className="block text-sm font-medium text-muted-foreground">
                Số điện thoại
              </label>
              <input
                id="account-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Nhập số điện thoại"
                className="h-12 w-full rounded-2xl border border-border bg-white px-4 text-[16px] text-foreground outline-none transition-colors focus:border-primary"
              />
            </div>

            <Button
              type="button"
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="mt-2 h-12 w-full rounded-2xl text-sm font-semibold"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Lưu thay đổi
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
