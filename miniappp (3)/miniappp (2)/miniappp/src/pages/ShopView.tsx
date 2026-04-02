import { useState } from "react";
import type { GameStore, LevelInfo } from "@/hooks/use-game-store";
import { cn, formatNumber } from "@/lib/utils";
import {
  CheckCircle2,
  Crown,
  Lock,
  Pickaxe,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";

type LevelTone = {
  frameClassName: string;
  iconClassName: string;
  chipClassName: string;
};

const LEVEL_TONES: Record<number, LevelTone> = {
  1: {
    frameClassName:
      "border-stone-200/20 bg-[linear-gradient(180deg,rgba(97,84,73,0.82)_0%,rgba(51,39,31,0.96)_100%)]",
    iconClassName: "text-stone-100",
    chipClassName: "bg-stone-100/10 text-stone-200 border-stone-100/10",
  },
  2: {
    frameClassName:
      "border-orange-200/20 bg-[linear-gradient(180deg,rgba(145,84,36,0.84)_0%,rgba(76,39,13,0.96)_100%)]",
    iconClassName: "text-orange-100",
    chipClassName: "bg-orange-100/10 text-orange-100 border-orange-100/10",
  },
  3: {
    frameClassName:
      "border-slate-200/20 bg-[linear-gradient(180deg,rgba(108,119,135,0.84)_0%,rgba(58,64,74,0.96)_100%)]",
    iconClassName: "text-slate-100",
    chipClassName: "bg-slate-100/10 text-slate-100 border-slate-100/10",
  },
  4: {
    frameClassName:
      "border-yellow-200/25 bg-[linear-gradient(180deg,rgba(165,118,17,0.86)_0%,rgba(91,53,7,0.97)_100%)]",
    iconClassName: "text-yellow-100",
    chipClassName: "bg-yellow-100/10 text-yellow-100 border-yellow-100/10",
  },
  5: {
    frameClassName:
      "border-fuchsia-200/20 bg-[linear-gradient(180deg,rgba(126,84,166,0.84)_0%,rgba(64,30,89,0.96)_100%)]",
    iconClassName: "text-fuchsia-100",
    chipClassName: "bg-fuchsia-100/10 text-fuchsia-100 border-fuchsia-100/10",
  },
  6: {
    frameClassName:
      "border-cyan-200/20 bg-[linear-gradient(180deg,rgba(44,127,153,0.84)_0%,rgba(11,63,81,0.96)_100%)]",
    iconClassName: "text-cyan-100",
    chipClassName: "bg-cyan-100/10 text-cyan-100 border-cyan-100/10",
  },
};

function getLevelTone(level: number) {
  return LEVEL_TONES[level] ?? LEVEL_TONES[1];
}

function getLevelState(store: GameStore, level: LevelInfo) {
  if (store.level === level.level) return "current";
  if (store.level + 1 === level.level) return "next";
  if (store.level > level.level) return "unlocked";
  return "locked";
}

export function ShopView({ store }: { store: GameStore }) {
  const [upgradingLevel, setUpgradingLevel] = useState<number | null>(null);

  const currentLevel =
    store.levels.find((level) => level.level === store.level) ?? store.currentLevelInfo;
  const nextLevel = store.levels.find((level) => level.level === store.level + 1);

  const handleUpgrade = async (targetLevel: number, cost: number) => {
    setUpgradingLevel(targetLevel);
    const success = await store.upgradeLevel(targetLevel, cost);
    setUpgradingLevel(null);

    if (!success) {
      if (store.newbieLock.required) return;
      alert("Khong the nang cap. Hay kiem tra lai so du $.");
    }
  };

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-32 pt-24">
      <div className="pointer-events-none absolute inset-x-0 top-14 bottom-10 overflow-hidden">
        <div className="absolute left-[-6rem] top-8 h-56 w-56 rounded-full bg-yellow-500/10 blur-[90px]" />
        <div className="absolute right-[-7rem] top-36 h-72 w-72 rounded-full bg-orange-400/10 blur-[104px]" />
        <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-yellow-300/30 to-transparent" />
      </div>

      <div className="relative z-10 mb-8 px-1">
        <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/20 bg-[#2e1b08]/55 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.32em] text-yellow-100/75 shadow-[inset_0_1px_0_rgba(255,231,173,0.1)]">
          <Pickaxe className="h-3.5 w-3.5 text-yellow-400" />
          XÆ°á»Ÿng nÃ¢ng cáº¥p
        </div>

        <h1 className="mt-4 bg-[linear-gradient(180deg,#fff7d0_0%,#ffd970_42%,#ae6309_100%)] bg-clip-text text-[2.1rem] font-black uppercase leading-none text-transparent">
          NÃ¢ng cáº¥p má»
        </h1>

        <p className="mt-3 max-w-[18rem] text-sm leading-6 text-yellow-100/80">
          Dung $ de nang cap cap mo. Moi level co gioi han vang/ngay (daily cap) rieng.
        </p>
      </div>

      <div className="relative z-10 mb-7 grid grid-cols-2 gap-3">
        <div className="rounded-[26px] border border-yellow-500/25 bg-[radial-gradient(circle_at_top,rgba(255,216,118,0.16),transparent_45%),linear-gradient(180deg,rgba(73,43,10,0.9)_0%,rgba(37,21,7,0.96)_100%)] px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.26)]">
          <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-yellow-100/55">
            Má» hiá»‡n táº¡i
          </span>
          <div className="mt-2 text-lg font-black text-[#fff3d4]">{currentLevel.name}</div>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-yellow-300/15 bg-yellow-100/8 px-3 py-1 text-sm font-bold text-yellow-200">
            <TrendingUp className="h-3.5 w-3.5" />
            {formatNumber(currentLevel.dailyGoldCap)} vang/ngay
          </div>
        </div>

        <div className="rounded-[26px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top,rgba(102,220,255,0.12),transparent_46%),linear-gradient(180deg,rgba(18,56,64,0.88)_0%,rgba(8,28,34,0.96)_100%)] px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.26)]">
          <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-100/55">
            Má»‘c káº¿ tiáº¿p
          </span>
          <div className="mt-2 text-lg font-black text-cyan-50">
            {nextLevel ? nextLevel.name : "ÄÃ£ tá»‘i Ä‘a"}
          </div>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-100/8 px-3 py-1 text-sm font-bold text-cyan-100">
            <Wallet className="h-3.5 w-3.5" />
            {nextLevel ? `$${nextLevel.cost.toFixed(6)}` : "Khong can them"}
          </div>
        </div>
      </div>

      <div className="relative z-10 space-y-4">
        {store.levels.map((level) => {
          const tone = getLevelTone(level.level);
          const state = getLevelState(store, level);
          const canAfford = store.usdtBalance >= level.cost;
          const isUpgrading = upgradingLevel === level.level;

          return (
            <div
              key={level.level}
              className={cn(
                "relative overflow-hidden rounded-[30px] border border-yellow-500/30 bg-[linear-gradient(180deg,rgba(255,223,136,0.14)_0%,rgba(98,58,8,0.2)_100%)] p-[1px] shadow-[0_18px_34px_rgba(0,0,0,0.34)]",
                state === "current" && "shadow-[0_20px_40px_rgba(242,185,41,0.18)]",
              )}
            >
              <div className="relative overflow-hidden rounded-[29px] bg-[radial-gradient(circle_at_top,rgba(255,214,120,0.18),transparent_42%),linear-gradient(180deg,rgba(88,50,11,0.88)_0%,rgba(40,22,7,0.96)_100%)] px-4 py-4">
                <div className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-[linear-gradient(180deg,#fff0ae_0%,#ffc629_46%,#8e4d03_100%)] shadow-[0_0_18px_rgba(255,199,84,0.45)]" />
                <div className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-yellow-100/45 to-transparent" />
                <div className="absolute -right-10 -top-12 h-28 w-28 rounded-full bg-yellow-300/10 blur-3xl" />

                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_24px_rgba(0,0,0,0.18)]",
                      tone.frameClassName,
                    )}
                  >
                    <Pickaxe className={cn("h-7 w-7", tone.iconClassName)} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-extrabold text-[#fff3d4]">{level.name}</div>
                        <div className="mt-1 text-xs font-bold uppercase tracking-[0.22em] text-yellow-100/45">
                          Báº­c {level.level}
                        </div>
                      </div>

                      {state === "current" && (
                        <div className="inline-flex items-center gap-1 rounded-full border border-yellow-200/20 bg-yellow-100/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-yellow-100">
                          <Crown className="h-3.5 w-3.5" />
                          Hiá»‡n táº¡i
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <div
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold",
                          tone.chipClassName,
                        )}
                      >
                        <TrendingUp className="h-3.5 w-3.5" />
                        {formatNumber(level.dailyGoldCap)} vang/ngay
                      </div>

                      <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/15 bg-cyan-100/8 px-3 py-1 text-sm font-bold text-cyan-100">
                        <Wallet className="h-3.5 w-3.5" />
                        {level.cost === 0 ? "Mac dinh" : `$${level.cost.toFixed(6)}`}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 rounded-[22px] border border-yellow-400/10 bg-black/16 px-4 py-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-yellow-100/45">
                      Tráº¡ng thÃ¡i
                    </div>
                    <div className="mt-1 text-sm font-bold text-yellow-50/90">
                      {state === "current" && "Äang khai thÃ¡c"}
                      {state === "next" && "CÃ³ thá»ƒ má»Ÿ khÃ³a ngay"}
                      {state === "unlocked" && "ÄÃ£ má»Ÿ trÆ°á»›c Ä‘Ã³"}
                      {state === "locked" && "ChÆ°a tá»›i cáº¥p nÃ y"}
                    </div>
                  </div>

                  {state === "current" && (
                    <div className="inline-flex items-center gap-2 rounded-full border border-yellow-300/20 bg-yellow-100/8 px-4 py-2 text-sm font-bold text-yellow-100">
                      <CheckCircle2 className="h-4 w-4" />
                      Äang dÃ¹ng
                    </div>
                  )}

                  {state === "unlocked" && (
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-100/8 px-4 py-2 text-sm font-bold text-emerald-100">
                      <CheckCircle2 className="h-4 w-4" />
                      ÄÃ£ má»Ÿ
                    </div>
                  )}

                  {state === "locked" && (
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/55">
                      <Lock className="h-4 w-4" />
                      KhÃ³a
                    </div>
                  )}

                  {state === "next" && (
                    <button
                      onClick={() => void handleUpgrade(level.level, level.cost)}
                      disabled={!canAfford || isUpgrading}
                      className={cn(
                        "min-w-[124px] rounded-full px-4 py-3 text-sm font-black uppercase tracking-[0.16em] transition-transform duration-200 active:translate-y-[1px]",
                        canAfford
                          ? "btn-gold border border-[#ffe193]/70"
                          : "cursor-not-allowed rounded-full border border-white/10 bg-white/6 text-white/35",
                      )}
                    >
                      {isUpgrading ? "Dang nang" : canAfford ? "Nang cap" : "Thieu $"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative z-10 mt-7 rounded-[28px] border border-yellow-500/20 bg-[linear-gradient(180deg,rgba(70,41,10,0.78)_0%,rgba(35,20,7,0.94)_100%)] px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.26)]">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-yellow-100/55">
          <Sparkles className="h-4 w-4 text-yellow-400" />
          Máº¹o nÃ¢ng cáº¥p
        </div>
        <p className="mt-3 text-sm leading-6 text-yellow-100/76">
          Admin co the set daily cap theo tung level. Nang cap bang $ se mo cap cao hon va tang tong vang toi da moi ngay.
        </p>
      </div>
    </div>
  );
}

