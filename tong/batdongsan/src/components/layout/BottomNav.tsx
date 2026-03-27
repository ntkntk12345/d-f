import { Link, useLocation } from "wouter";
import { Heart, Home, User, Users } from "lucide-react";

const tabs = [
  { href: "/", icon: Home, label: "Trang chủ" },
  { href: "/o-ghep", icon: Users, label: "Ở ghép" },
  { href: "/saved", icon: Heart, label: "Đã lưu" },
  { href: "/ho-so", icon: User, label: "Cá nhân" },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-white/95 shadow-[0_-8px_30px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden">
      <div className="grid h-[68px] grid-cols-4 px-1 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => {
          const isActive = tab.href === "/" ? location === "/" : location.startsWith(tab.href);
          return (
            <Link key={tab.href} href={tab.href}>
              <div
                className={`relative flex h-full flex-col items-center justify-center gap-1 rounded-2xl transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <div className={`relative transition-transform ${isActive ? "scale-110" : ""}`}>
                  <tab.icon className={`h-5 w-5 ${isActive ? "fill-current" : ""}`} strokeWidth={isActive ? 2.5 : 1.5} />
                </div>
                <span className={`text-[10px] font-semibold leading-none ${isActive ? "text-primary" : ""}`}>{tab.label}</span>
                {isActive && <div className="absolute inset-x-4 top-0 h-0.5 rounded-b-full bg-primary" />}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
