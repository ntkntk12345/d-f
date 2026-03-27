import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Camera,
  FileText,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Settings,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { apiFetch, useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { fileToOptimizedImageDataUrl } from "@/lib/image-data-url";

type MenuItem = {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
};

function MenuRow({ icon: Icon, label, onClick, href }: MenuItem) {
  const content = (
    <div className="flex min-h-[62px] items-center gap-4 px-5 py-4">
      <Icon className="h-5 w-5 shrink-0 text-foreground" />
      <span className="text-[17px] font-medium text-foreground">{label}</span>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block transition-colors hover:bg-muted/20">
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left transition-colors hover:bg-muted/20"
    >
      {content}
    </button>
  );
}

function MenuSection({ title, items }: { title?: string; items: MenuItem[] }) {
  return (
    <section className="space-y-2">
      {title ? (
        <h2 className="px-1 text-[15px] font-semibold text-muted-foreground">{title}</h2>
      ) : null}

      <div className="overflow-hidden rounded-[28px] bg-white shadow-[0_1px_0_rgba(15,23,42,0.06)] ring-1 ring-black/5">
        {items.map((item, index) => (
          <div key={item.label} className={index > 0 ? "border-t border-border/80" : ""}>
            <MenuRow {...item} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function Profile() {
  const { user, token, login, isLoggedIn, logout } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState("");
  const [processingImage, setProcessingImage] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setDisplayName(user?.name ?? "");
    setAvatarPreview(user?.avatar ?? "");
    setAvatarDataUrl("");
  }, [user?.avatar, user?.name]);

  const showComingSoon = (label: string) => {
    toast({
      title: label,
      description: "Mục này sẽ được cập nhật sớm.",
    });
  };

  const handleChooseAvatar = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Ảnh không hợp lệ",
        description: "Vui lòng chọn một file ảnh.",
      });
      return;
    }

    setProcessingImage(true);
    try {
      const nextAvatar = await fileToOptimizedImageDataUrl(file, {
        maxSize: 240,
        quality: 0.82,
      });
      setAvatarPreview(nextAvatar);
      setAvatarDataUrl(nextAvatar);
      toast({
        title: "Đã chọn ảnh mới",
        description: "Bấm Lưu hồ sơ để cập nhật.",
      });
    } catch {
      toast({
        title: "Không thể xử lý ảnh",
        description: "Vui lòng thử một ảnh khác.",
      });
    } finally {
      setProcessingImage(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!token) {
      toast({
        title: "Bạn chưa đăng nhập",
        description: "Vui lòng đăng nhập để lưu hồ sơ.",
      });
      return;
    }

    const cleanName = displayName.trim();
    if (!cleanName) {
      toast({
        title: "Thiếu tên",
        description: "Vui lòng nhập tên hiển thị.",
      });
      return;
    }

    setSavingProfile(true);
    try {
      const res = await apiFetch(
        "/auth/profile",
        {
          method: "PUT",
          body: JSON.stringify({
            name: cleanName,
            avatarDataUrl: avatarDataUrl || undefined,
          }),
        },
        token,
      );

      const data = await res.json().catch(() => ({ message: "Không thể lưu hồ sơ" })) as {
        token?: string;
        user?: typeof user;
        message?: string;
      };

      if (!res.ok || !data.token || !data.user) {
        toast({
          title: "Lưu hồ sơ thất bại",
          description: data.message ?? "Vui lòng thử lại.",
        });
        return;
      }

      login(data.token, data.user);
      setAvatarDataUrl("");
      toast({
        title: "Đã lưu hồ sơ",
        description: "Tên và ảnh đại diện đã được cập nhật.",
      });
    } catch {
      toast({
        title: "Không thể kết nối",
        description: "Vui lòng thử lại sau.",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const hasProfileChanges = isLoggedIn && (
    displayName.trim() !== (user?.name ?? "").trim() ||
    avatarDataUrl.length > 0
  );

  const regulationItems: MenuItem[] = [
    {
      icon: FileText,
      label: "Điều khoản thỏa thuận",
      onClick: () => showComingSoon("Điều khoản thỏa thuận"),
    },
    {
      icon: ShieldCheck,
      label: "Chính sách bảo mật",
      onClick: () => showComingSoon("Chính sách bảo mật"),
    },
  ];

  const accountItems: MenuItem[] = isLoggedIn
    ? [
        {
          icon: Settings,
          label: "Cài đặt tài khoản",
          href: "/cai-dat-tai-khoan",
        },
        {
          icon: KeyRound,
          label: "Đổi mật khẩu",
          href: "/doi-mat-khau",
        },
        {
          icon: Bell,
          label: "Cài đặt thông báo",
          onClick: () => showComingSoon("Cài đặt thông báo"),
        },
      ]
    : [
        {
          icon: UserPlus,
          label: "Tạo tài khoản",
          href: "/dang-ky",
        },
        {
          icon: LogIn,
          label: "Đăng nhập",
          href: "/dang-nhap",
        },
      ];

  const accessItems: MenuItem[] = isLoggedIn
    ? [
        {
          icon: LogOut,
          label: "Đăng xuất",
          onClick: logout,
        },
      ]
    : [];

  const avatarInitial = (displayName.trim() || user?.name || "U").charAt(0).toUpperCase();

  return (
    <div className="bg-[#f5f5f3] pt-16 pb-10">
      <div className="mx-auto max-w-lg px-4 py-5">
        <div className="space-y-6">
          {isLoggedIn ? (
            <section className="space-y-2">
              <h2 className="px-1 text-[15px] font-semibold text-muted-foreground">
                Hồ sơ cá nhân
              </h2>

              <div className="rounded-[28px] bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.06)] ring-1 ring-black/5">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handleChooseAvatar}
                    className="relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    {avatarPreview ? (
                      <img
                        src={avatarPreview}
                        alt="Ảnh đại diện"
                        className="h-20 w-20 rounded-full object-cover ring-1 ring-border"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-2xl font-black text-primary ring-1 ring-border">
                        {avatarInitial}
                      </div>
                    )}
                    <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-black text-white ring-4 ring-white">
                      {processingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    </span>
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-muted-foreground">
                      Ảnh đại diện
                    </p>
                    <button
                      type="button"
                      onClick={handleChooseAvatar}
                      className="mt-1 text-sm font-semibold text-primary"
                    >
                      Tải ảnh lên
                    </button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Chọn ảnh vuông rõ mặt để hiển thị đẹp hơn.
                    </p>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />

                <div className="mt-5 space-y-3">
                  <label className="block text-sm font-medium text-muted-foreground" htmlFor="profile-name">
                    Tên hiển thị
                  </label>
                  <input
                    id="profile-name"
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Nhập tên của bạn"
                    className="h-12 w-full rounded-2xl border border-border bg-white px-4 text-[16px] text-foreground outline-none transition-colors focus:border-primary"
                  />

                  <Button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={!hasProfileChanges || savingProfile || processingImage}
                    className="mt-2 h-12 w-full rounded-2xl text-sm font-semibold"
                  >
                    {savingProfile ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Đang lưu hồ sơ...
                      </>
                    ) : (
                      "Lưu hồ sơ"
                    )}
                  </Button>
                </div>
              </div>
            </section>
          ) : null}

          <MenuSection title="Quy định" items={regulationItems} />

          <MenuSection
            title={isLoggedIn ? "Tài khoản & thông báo" : "Truy cập"}
            items={accountItems}
          />

          {accessItems.length > 0 ? <MenuSection items={accessItems} /> : null}
        </div>
      </div>
    </div>
  );
}
