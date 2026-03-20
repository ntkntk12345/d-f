import {
  ArrowRightLeft,
  CheckSquare,
  Coins,
  Pickaxe,
  Shield,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PageId } from "@/hooks/use-game-store";

interface BottomNavProps {
  currentPage: PageId;
  onChange: (page: PageId) => void;
  isAdmin?: boolean;
}

const LEFT_TABS = [
  { id: "shop", icon: Pickaxe, label: "Nâng Cấp" },
  { id: "tasks", icon: CheckSquare, label: "Nhiệm Vụ" },
  { id: "friends", icon: Users, label: "Bạn Bè" },
] as const;

const RIGHT_TABS = [
  { id: "lucky", icon: Sparkles, label: "Vận May" },
  { id: "exchange", icon: ArrowRightLeft, label: "Đổi KC" },
  { id: "withdraw", icon: Wallet, label: "Rút Tiền" },
] as const;

export function BottomNav({ currentPage, onChange, isAdmin = false }: BottomNavProps) {
  const renderTab = (
    tab: (typeof LEFT_TABS)[number] | (typeof RIGHT_TABS)[number],
    extraClassName?: string,
  ) => {
    const isActive =
      currentPage === tab.id || (tab.id === "exchange" && currentPage === "giftcode");
    const Icon = tab.icon;

    return (
      <button
        key={tab.id}
        onClick={() => onChange(tab.id)}
        className={cn(
          "flex h-16 flex-col items-center justify-end gap-1 rounded-2xl pb-1 text-center transition-all duration-300",
          isActive ? "text-yellow-300" : "text-yellow-700/70 hover:text-yellow-400",
          extraClassName,
        )}
      >
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-[14px] border transition-all duration-300",
            isActive
              ? "border-yellow-400/35 bg-yellow-400/12 shadow-[0_0_16px_rgba(234,179,8,0.28)]"
              : "border-transparent bg-transparent",
          )}
        >
          <Icon className="h-4.5 w-4.5" strokeWidth={isActive ? 2.4 : 2} />
        </div>

        <span
          className={cn(
            "font-display whitespace-nowrap text-[8px] font-bold leading-none tracking-tight",
            isActive ? "text-yellow-300" : "text-yellow-700/80",
          )}
        >
          {tab.label}
        </span>
      </button>
    );
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-2 pb-5">
      <div className="mx-auto w-full max-w-md">
        {isAdmin && (
          <div className="mb-2 flex justify-end">
            <button
              onClick={() => onChange("admin")}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] shadow-[0_8px_20px_rgba(0,0,0,0.28)] transition-all duration-300",
                currentPage === "admin"
                  ? "border-cyan-300/30 bg-[linear-gradient(180deg,rgba(39,108,126,0.95)_0%,rgba(8,43,54,0.98)_100%)] text-cyan-100"
                  : "border-white/12 bg-[linear-gradient(180deg,rgba(57,36,16,0.95)_0%,rgba(27,17,8,0.98)_100%)] text-white/75 hover:text-cyan-100",
              )}
            >
              <Shield className="h-3.5 w-3.5" />
              Admin
            </button>
          </div>
        )}

        <div className="relative rounded-t-[2rem] border border-yellow-500/28 bg-[linear-gradient(180deg,rgba(59,37,16,0.96)_0%,rgba(27,17,8,0.98)_100%)] px-2 pb-4 pt-5 shadow-[0_-12px_40px_rgba(0,0,0,0.48)] backdrop-blur-md">
          <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-yellow-100/40 to-transparent" />

          <div className="flex items-end justify-between gap-1">
            <div className="grid flex-1 grid-cols-3 gap-1 pr-2">
              {LEFT_TABS.map((tab) => renderTab(tab))}
            </div>

            <div className="w-[6.1rem] shrink-0" />

            <div className="grid flex-1 grid-cols-3 gap-1 pl-2">
              {RIGHT_TABS.map((tab) => renderTab(tab))}
            </div>
          </div>

          <button
            onClick={() => onChange("home")}
            className={cn(
              "absolute left-1/2 top-2 flex h-[5.35rem] w-[5.35rem] -translate-x-1/2 flex-col items-center justify-center rounded-full border-[4px] text-center transition-all duration-300 active:scale-[0.97]",
              currentPage === "home"
                ? "border-[#fff1b7]/90 bg-[radial-gradient(circle_at_30%_25%,rgba(255,250,219,1),rgba(255,218,102,0.95)_24%,rgba(219,135,10,0.98)_62%,rgba(115,62,7,1)_100%)] text-[#5b2a00] shadow-[0_18px_40px_rgba(234,179,8,0.42),inset_0_2px_8px_rgba(255,255,255,0.72),inset_0_-18px_24px_rgba(87,42,0,0.32)]"
                : "border-[#ffe9a6]/75 bg-[radial-gradient(circle_at_30%_25%,rgba(255,248,209,0.98),rgba(255,210,86,0.92)_24%,rgba(204,118,9,0.96)_62%,rgba(104,55,6,1)_100%)] text-[#5b2a00] shadow-[0_16px_34px_rgba(234,179,8,0.34),inset_0_2px_8px_rgba(255,255,255,0.64),inset_0_-16px_22px_rgba(87,42,0,0.28)] hover:scale-[1.02]",
            )}
          >
            <div className="pointer-events-none absolute inset-[0.28rem] rounded-full border border-white/18" />
            <Coins className="h-6 w-6 drop-shadow-[0_3px_10px_rgba(0,0,0,0.24)]" />
            <span className="mt-1 text-[10px] font-black uppercase tracking-[0.16em]">Đào</span>
            <span className="text-[10px] font-black uppercase tracking-[0.16em]">Vàng</span>
          </button>
        </div>
      </div>
    </div>
  );
}
