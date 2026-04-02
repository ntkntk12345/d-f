import { Coins, Wallet, User } from "lucide-react";

import type { GameStore } from "@/hooks/use-game-store";
import { formatNumber } from "@/lib/utils";

export function TopBar({ store }: { store: GameStore }) {
  return (
    <div className="fixed left-0 right-0 top-0 z-50 px-3 pt-4">
      <div className="mx-auto flex w-full max-w-md items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-700 p-[1.5px] shadow-[0_0_10px_rgba(234,179,8,0.28)]">
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#1a130f]/90">
                <User className="relative z-10 h-4 w-4 text-yellow-500" />
              </div>
            </div>
            <div className="absolute -bottom-1 -right-2 rounded-full bg-[#ff6b00] px-1.5 py-0.5 text-[9px] font-black text-white shadow-[0_2px_8px_rgba(0,0,0,0.28)]">
              Lv.{store.level}
            </div>
          </div>

          <div className="flex flex-col py-0.5 leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
            <span className="font-display text-[13px] font-bold tracking-wide text-white">
              {store.username}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-yellow-300/90">
              {store.currentLevelInfo.name}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
          <div className="flex items-center gap-1 text-yellow-300">
            <Coins className="h-3.5 w-3.5 animate-coin-pop" />
            <span className="font-display text-[15px] font-black tracking-wide text-gradient-gold">
              {formatNumber(store.gold)}
            </span>
          </div>

          <div className="flex items-center gap-1 text-cyan-300">
            <Wallet className="h-3.5 w-3.5 text-cyan-300" />
            <span className="font-display text-[13px] font-bold text-cyan-300">
              ${store.usdtBalance.toFixed(6)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
