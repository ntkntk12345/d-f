import { useEffect, useMemo, useState } from "react";
import { Coins, Gamepad2, Gift } from "lucide-react";

import type { GameStore } from "@/hooks/use-game-store";
import { SHIFT_DURATION_MS } from "@/hooks/use-game-store";
import { showMiningRewardedAd } from "@/lib/ad-service";

import miningBackground from "../../dao (1).gif";
import idleBackground from "../../nghingoi (1).gif";

export function HomeView({ store }: { store: GameStore }) {
  const [elapsed, setElapsed] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const floatingCoins = useMemo(
    () =>
      Array.from({ length: 6 }, () => ({
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        duration: `${3 + Math.random() * 2}s`,
        delay: `${Math.random() * 2}s`,
        scale: 0.5 + Math.random() * 0.8,
      })),
    [],
  );

  useEffect(() => {
    if (!store.isMining || !store.miningShiftStart) {
      setElapsed(0);
      return;
    }

    const interval = window.setInterval(() => {
      const now = Date.now() + store.serverOffset;
      const diff = now - store.miningShiftStart;
      setElapsed(Math.min(diff, SHIFT_DURATION_MS));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [store.isMining, store.miningShiftStart, store.serverOffset]);

  useEffect(() => {
    if (!store.isMining) return;

    const interval = window.setInterval(() => {
      void store.syncFromBackend();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [store.isMining, store.syncFromBackend]);

  const isFinished = store.isMining && elapsed >= SHIFT_DURATION_MS;
  const progressPercent = Math.min((elapsed / SHIFT_DURATION_MS) * 100, 100);
  const backgroundGif = store.isMining ? miningBackground : idleBackground;

  const remaining = Math.max(0, SHIFT_DURATION_MS - elapsed);
  const h = Math.floor(remaining / 3600000).toString().padStart(2, "0");
  const m = Math.floor((remaining % 3600000) / 60000).toString().padStart(2, "0");
  const s = Math.floor((remaining % 60000) / 1000).toString().padStart(2, "0");

  const handleMineClick = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (isFinished) {
        const result = await store.claimMining();
        if (!result.success) {
          alert(result.error || "Không thể thu hoạch lúc này.");
        }
        return;
      }

      if (!store.isMining) {
        const adReady = await showMiningRewardedAd();
        if (!adReady) {
          alert("Can xem quang cao truoc khi bat dau dao vang.");
          return;
        }

        const result = await store.startMining();
        if (!result.success) {
          alert(result.error || "Không thể bắt đầu đào.");
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative h-[100svh] overflow-hidden px-3 pb-24 pt-20">
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,250,214,0.98),_rgba(253,224,71,0.66)_28%,_rgba(180,83,9,0.34)_68%,_rgba(18,13,10,0.9)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#fff7cc]/55 via-[#ffe083]/16 to-[#120d0a]/88" />
        <img
          src={backgroundGif}
          alt={store.isMining ? "Nền đào vàng" : "Nền nghỉ ngơi"}
          className="absolute left-1/2 top-1/2 h-[108svh] min-w-[100vw] max-w-none -translate-x-1/2 -translate-y-1/2 object-cover opacity-95"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_34%,_rgba(18,13,10,0.1)_70%,_rgba(18,13,10,0.52)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-[34vh] bg-gradient-to-t from-[#120d0a] via-[#120d0a]/80 to-transparent" />
      </div>

      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {floatingCoins.map((coin, index) => (
          <div
            key={index}
            className="absolute opacity-20"
            style={{
              left: coin.left,
              top: coin.top,
              animation: `float ${coin.duration} ease-in-out infinite`,
              animationDelay: coin.delay,
              transform: `scale(${coin.scale})`,
            }}
          >
            <Coins className="h-7 w-7 text-yellow-300" />
          </div>
        ))}
      </div>

      <div className="relative z-10 mx-auto flex h-full w-full max-w-sm items-end">
        <div className="w-full pb-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              onClick={() => store.setCurrentPage("flappy")}
              className="giftcode-bubble relative flex h-10 flex-1 items-center gap-1.5 rounded-[0.95rem] pl-1.5 pr-2.25 text-left shadow-[0_12px_24px_rgba(0,0,0,0.24),0_0_18px_rgba(59,130,246,0.14)] transition-all duration-300 hover:shadow-[0_16px_28px_rgba(0,0,0,0.28),0_0_24px_rgba(59,130,246,0.2)]"
            >
              <div className="relative flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-[0.65rem] border border-cyan-200/22 bg-[linear-gradient(180deg,rgba(48,110,198,0.94)_0%,rgba(16,53,116,1)_100%)] shadow-[0_6px_14px_rgba(0,0,0,0.16)]">
                <Gamepad2 className="h-3.25 w-3.25 text-cyan-50" />
              </div>

              <div className="relative min-w-0 leading-none">
                <div className="text-[8.5px] font-black uppercase tracking-[0.13em] text-[#fff3d4]">
                  Chơi
                </div>
                <div className="mt-0.5 text-[8.5px] font-black uppercase tracking-[0.09em] text-[#fff3d4]">
                  Game
                </div>
              </div>
            </button>

            <button
              onClick={() => store.setCurrentPage("giftcode")}
              className="giftcode-bubble relative flex h-10 flex-1 items-center gap-1.25 rounded-[0.95rem] pl-1.5 pr-2.25 text-left shadow-[0_12px_24px_rgba(0,0,0,0.24),0_0_18px_rgba(234,179,8,0.12)] transition-all duration-300 hover:shadow-[0_16px_28px_rgba(0,0,0,0.28),0_0_24px_rgba(234,179,8,0.18)]"
            >
              <div className="relative flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-[0.65rem] border border-fuchsia-200/18 bg-[linear-gradient(180deg,rgba(126,67,152,0.92)_0%,rgba(61,27,76,1)_100%)] shadow-[0_6px_14px_rgba(0,0,0,0.16)]">
                <Gift className="h-3.25 w-3.25 text-fuchsia-100" />
              </div>

              <div className="relative min-w-0 leading-none">
                <div className="text-[8.5px] font-black uppercase tracking-[0.13em] text-[#fff3d4]">
                  Nhập
                </div>
                <div className="mt-0.5 text-[8.5px] font-black uppercase tracking-[0.09em] text-[#fff3d4]">
                  Giftcode
                </div>
              </div>
            </button>
          </div>

          <div className="mb-2 flex justify-center">
            <span className="rounded-full border border-yellow-300/25 bg-black/24 px-3 py-1 font-display text-[11px] text-gradient-gold backdrop-blur-md">
              {store.currentLevelInfo.name}
            </span>
          </div>

          <div className="relative overflow-hidden rounded-[1.5rem] border border-yellow-300/30 bg-[#120d0a]/70 px-4 py-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.34)] backdrop-blur-md">
            {store.isMining && (
              <div
                className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-yellow-600 to-yellow-300 transition-all duration-1000"
                style={{ width: `${progressPercent}%` }}
              />
            )}

            <div className="mb-3 text-center text-[1.65rem] font-sans font-extrabold tracking-[0.08em] text-gradient-gold drop-shadow-lg">
              {isFinished ? "SẴN SÀNG" : store.isMining ? `${h}:${m}:${s}` : "00:00:00"}
            </div>

            <button
              onClick={handleMineClick}
              disabled={isSubmitting || (store.isMining && !isFinished)}
              className={`w-full rounded-2xl py-3.5 text-[15px] font-sans font-bold uppercase tracking-[0.08em] transition-all ${
                isFinished
                  ? "btn-gold border-2 border-yellow-200 animate-pulse-glow shadow-[0_0_20px_rgba(234,179,8,0.8)]"
                  : store.isMining
                    ? "cursor-not-allowed border-2 border-[#5c4033] bg-[#3d2b1f]/95 text-[#e7cfba] shadow-inner"
                    : "btn-gold border-2 border-yellow-200 shadow-[0_0_15px_rgba(234,179,8,0.5)]"
              } disabled:opacity-70`}
            >
              {isSubmitting
                ? "ĐANG XỬ LÝ"
                : isFinished
                  ? "THU HOẠCH!"
                  : store.isMining
                    ? "ĐANG ĐÀO"
                    : "BẮT ĐẦU ĐÀO"}
            </button>

            {!store.isLoaded && (
              <p className="mt-3 text-center text-xs text-yellow-100/70">
                Đang đồng bộ dữ liệu backend...
              </p>
            )}
            {store.error && <p className="mt-2 text-center text-xs text-red-300">{store.error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
