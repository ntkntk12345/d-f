import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowUpRight,
  Heart,
  LogOut,
  Menu,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSiteContact } from "@/context/SiteContactContext";
import { useAuth } from "@/context/AuthContext";
import { BRAND_BADGE, BRAND_TAGLINE } from "@/lib/brand";
import { ADMIN_CONTACT_LABEL } from "@/lib/local-properties";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [, location] = useLocation();
  const { user, logout, isAdmin, isLoggedIn } = useAuth();
  const { contactLink } = useSiteContact();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  const navLinks = [
    { label: "Phòng trọ / Chung cư mini", href: "/search?type=cho-thue" },
    { label: "Chung cư", href: "/search?type=cho-thue&category=studio" },
    { label: "Nhà nguyên căn", href: "/search?type=cho-thue&category=nha-nguyen-can" },
    { label: "Tìm người ở ghép", href: "/o-ghep" },
  ];

  return (
    <header
      className={`sticky top-0 z-50 border-b border-border bg-white transition-shadow ${
        isScrolled ? "shadow-md" : ""
      }`}
    >
      <div className="mx-auto hidden max-w-7xl items-center justify-between border-b border-border/40 px-4 py-1.5 text-[13px] text-muted-foreground md:flex">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <span className="text-primary">Nhà</span>
          <span>Kênh tìm phòng uy tín, cập nhật nhanh</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="tel:0876480130"
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            <Phone className="h-3.5 w-3.5" />
            Hotline: 0876480130
          </a>
          <a
            href={contactLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700 transition-colors hover:bg-emerald-600 hover:text-white"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {ADMIN_CONTACT_LABEL}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-14 items-center justify-between sm:h-[60px]">
          <div className="flex min-w-0 items-center gap-3 sm:gap-6">
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-sm font-black text-white sm:h-9 sm:w-9">
                {BRAND_BADGE}
              </div>
              <div className="min-w-0 leading-none">
                <div className="truncate text-[15px] font-black tracking-tight text-primary sm:text-xl">80landtimphong.vn</div>
                <div className="hidden text-[10px] font-medium text-muted-foreground sm:block">{BRAND_TAGLINE}</div>
              </div>
            </Link>

            <nav className="hidden items-center gap-1 lg:flex">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-primary/5 hover:text-primary"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <button className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted hover:text-primary">
              <Search className="h-5 w-5" />
            </button>
            <Link href="/saved">
              <button className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted hover:text-primary">
                <Heart className="h-5 w-5" />
              </button>
            </Link>
            {isLoggedIn ? (
              <>
                {isAdmin && (
                  <Link href="/admin">
                    <Button variant="outline" size="sm" className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50">
                      <ShieldCheck className="h-4 w-4" />
                      Quản trị
                    </Button>
                  </Link>
                )}
                <Link href="/ho-so">
                  <div className="flex cursor-pointer items-center gap-2 rounded-full bg-muted/50 px-3 py-1.5 transition-colors hover:bg-muted">
                    {user?.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                        {user!.name[0].toUpperCase()}
                      </div>
                    )}
                    <span className="max-w-[100px] truncate text-sm font-semibold text-foreground">{user!.name}</span>
                  </div>
                </Link>
                <Button variant="ghost" size="sm" onClick={logout} className="gap-1.5 text-muted-foreground hover:text-red-600">
                  <LogOut className="h-4 w-4" />
                  Đăng xuất
                </Button>
              </>
            ) : (
              <>
                <Link href="/dang-nhap">
                  <Button variant="outline" className="gap-1.5 border-border text-sm font-medium">
                    <User className="h-4 w-4" />
                    Đăng nhập
                  </Button>
                </Link>
                <Link href="/dang-ky">
                  <Button variant="ghost" className="text-sm font-medium">
                    Đăng ký
                  </Button>
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <Link href="/saved">
              <button className="rounded-full border border-border bg-white p-2 text-foreground shadow-sm transition-colors hover:bg-muted hover:text-primary">
                <Heart className="h-4 w-4" />
              </button>
            </Link>
            <button className="p-2 text-foreground" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="absolute left-0 right-0 top-full z-50 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-b border-border bg-white shadow-xl lg:hidden">
          <div className="flex flex-col gap-1 p-4">
            <div className="mb-2 flex items-center gap-2">
              <a
                href="tel:0876480130"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary"
              >
                <Phone className="h-4 w-4" />
                Hotline
              </a>
              <a
                href={contactLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"
              >
                <MessageCircle className="h-4 w-4" />
                {ADMIN_CONTACT_LABEL}
              </a>
            </div>
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-3 text-sm font-semibold text-foreground transition-colors hover:bg-primary/5 hover:text-primary"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              {isLoggedIn ? (
                <>
                  <Link href="/ho-so" onClick={() => setMobileMenuOpen(false)}>
                    <div className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-primary/5">
                      {user?.avatar ? (
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                          {user!.name[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold">{user!.name}</p>
                        <p className="text-xs text-muted-foreground">Xem hồ sơ</p>
                      </div>
                    </div>
                  </Link>
                  {isAdmin && (
                    <Link href="/admin" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="outline" className="w-full gap-1.5 border-amber-300 text-amber-700">
                        <ShieldCheck className="h-4 w-4" />
                        Trang quản trị
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="outline"
                    className="w-full gap-1.5 border-red-200 text-red-600"
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    Đăng xuất
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/dang-nhap" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full">
                      Đăng nhập
                    </Button>
                  </Link>
                  <Link href="/dang-ky" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="ghost" className="w-full">
                      Đăng ký
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
