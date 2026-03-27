import { useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, KeyRound, Loader2 } from "lucide-react";
import { apiFetch, useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

export function ChangePassword() {
  const { token, isLoggedIn } = useAuth();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!isLoggedIn || !token) {
      toast({
        title: "Bạn chưa đăng nhập",
        description: "Vui lòng đăng nhập để đổi mật khẩu.",
      });
      return;
    }

    if (!currentPassword.trim()) {
      toast({
        title: "Thiếu mật khẩu hiện tại",
        description: "Vui lòng nhập mật khẩu hiện tại.",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Mật khẩu mới quá ngắn",
        description: "Mật khẩu mới phải có ít nhất 6 ký tự.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Xác nhận mật khẩu không khớp",
        description: "Vui lòng nhập lại mật khẩu mới.",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch(
        "/auth/change-password",
        {
          method: "PUT",
          body: JSON.stringify({
            currentPassword,
            newPassword,
          }),
        },
        token,
      );

      const data = await res.json().catch(() => ({ message: "Không thể đổi mật khẩu" })) as {
        message?: string;
      };

      if (!res.ok) {
        toast({
          title: "Đổi mật khẩu thất bại",
          description: data.message ?? "Vui lòng thử lại.",
        });
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "Đổi mật khẩu thành công",
        description: "Mật khẩu mới đã được cập nhật.",
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
            <h1 className="text-lg font-bold text-foreground">Đổi mật khẩu</h1>
            <p className="text-sm text-muted-foreground">Cập nhật mật khẩu mới cho tài khoản.</p>
          </div>
        </div>

        <div className="rounded-[28px] bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.06)] ring-1 ring-black/5">
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="current-password" className="block text-sm font-medium text-muted-foreground">
                Mật khẩu hiện tại
              </label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Nhập mật khẩu hiện tại"
                className="h-12 w-full rounded-2xl border border-border bg-white px-4 text-[16px] text-foreground outline-none transition-colors focus:border-primary"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="new-password" className="block text-sm font-medium text-muted-foreground">
                Mật khẩu mới
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Nhập mật khẩu mới"
                className="h-12 w-full rounded-2xl border border-border bg-white px-4 text-[16px] text-foreground outline-none transition-colors focus:border-primary"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirm-password" className="block text-sm font-medium text-muted-foreground">
                Xác nhận mật khẩu mới
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Nhập lại mật khẩu mới"
                className="h-12 w-full rounded-2xl border border-border bg-white px-4 text-[16px] text-foreground outline-none transition-colors focus:border-primary"
              />
            </div>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="mt-2 h-12 w-full rounded-2xl text-sm font-semibold"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang cập nhật...
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Đổi mật khẩu
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
