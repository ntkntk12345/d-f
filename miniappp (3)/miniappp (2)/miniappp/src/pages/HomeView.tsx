import { useEffect, useMemo, useState } from "react";
import { Coins, Gamepad2, Gift } from "lucide-react";

import type { GameStore } from "@/hooks/use-game-store";
import { SHIFT_DURATION_MS } from "@/hooks/use-game-store";
import { showLixiRewardedAdStep, showMiningRewardedAd } from "@/lib/ad-service";
import { formatNumber } from "@/lib/utils";

import miningBackground from "../../dao (1).gif";
import idleBackground from "../../nghingoi (1).gif";

export function HomeView({ store }: { store: GameStore }) {
  const [elapsed, setElapsed] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClaimingLixi, setIsClaimingLixi] = useState(false);
  const [isLixiRulesOpen, setIsLixiRulesOpen] = useState(false);
  const [lixiNow, setLixiNow] = useState(() => Date.now() + store.serverOffset);
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

  useEffect(() => {
    setLixiNow(Date.now() + store.serverOffset);

    if (!store.lixi.state.isCoolingDown) return;

    const interval = window.setInterval(() => {
      setLixiNow(Date.now() + store.serverOffset);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [store.lixi.state.isCoolingDown, store.serverOffset]);

  useEffect(() => {
    if (!store.isTelegramApp || !store.teleId) return;

    const interval = window.setInterval(() => {
      void store.fetchLixiInfo();
    }, 15000);

    return () => window.clearInterval(interval);
  }, [store.fetchLixiInfo, store.isTelegramApp, store.teleId]);

  useEffect(() => {
    if (!store.isTelegramApp || !store.teleId || !store.lixi.state.isCoolingDown || !store.lixi.state.cooldownEndsAt) return;

    const timeLeft = store.lixi.state.cooldownEndsAt - (Date.now() + store.serverOffset);
    const timeout = window.setTimeout(
      () => {
        void store.fetchLixiInfo();
      },
      Math.max(0, timeLeft) + 800,
    );

    return () => window.clearTimeout(timeout);
  }, [store.fetchLixiInfo, store.isTelegramApp, store.lixi.state.cooldownEndsAt, store.lixi.state.isCoolingDown, store.serverOffset, store.teleId]);

  const isFinished = store.isMining && elapsed >= SHIFT_DURATION_MS;
  const progressPercent = Math.min((elapsed / SHIFT_DURATION_MS) * 100, 100);
  const backgroundGif = store.isMining ? miningBackground : idleBackground;

  const remaining = Math.max(0, SHIFT_DURATION_MS - elapsed);
  const h = Math.floor(remaining / 3600000).toString().padStart(2, "0");
  const m = Math.floor((remaining % 3600000) / 60000).toString().padStart(2, "0");
  const s = Math.floor((remaining % 60000) / 1000).toString().padStart(2, "0");
  const lixiTimeLeft = Math.max(0, (store.lixi.state.cooldownEndsAt ?? 0) - lixiNow);
  const lixiMinutes = Math.floor(lixiTimeLeft / 60000)
    .toString()
    .padStart(2, "0");
  const lixiSeconds = Math.floor((lixiTimeLeft % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  const lixiAdsRequired = store.lixi.config.requiredAdViews;
  const lixiAdsWatched = store.lixi.user.watchedAdViews;
  const lixiAdsRemaining = store.lixi.user.remainingAdViews;
  const canClaimLixi = store.lixi.user.canClaim;
  const safeLixiAdsRequired = Math.max(1, lixiAdsRequired);
  const lixiProgressPercent = Math.min(
    100,
    Math.max(0, (Math.min(lixiAdsWatched, safeLixiAdsRequired) / safeLixiAdsRequired) * 100),
  );
  const lixiRewardRangeText = `${formatNumber(store.lixi.config.minGold)} - ${formatNumber(store.lixi.config.maxGold)} vàng`;
  const lixiRemainingClaimsText = `${formatNumber(store.lixi.state.remainingClaims)}/${formatNumber(store.lixi.state.maxClaimsPerRound)} suất`;

  let lixiStatusText = `Xem trọn gói ${formatNumber(safeLixiAdsRequired)} video để mở lì xì`;
  let lixiGuideText = `Tiến độ ${formatNumber(lixiAdsWatched)}/${formatNumber(safeLixiAdsRequired)} video`;
  let lixiActionText = `${formatNumber(safeLixiAdsRequired)} video / lần`;

  if (isClaimingLixi) {
    lixiStatusText = "Đang chạy gói video lì xì...";
    lixiGuideText = "Vui lòng đợi đến khi hoàn tất";
    lixiActionText = "Đang chạy";
  } else if (store.lixi.state.isCoolingDown) {
    lixiStatusText = `Mở lại sau ${lixiMinutes}:${lixiSeconds}`;
    lixiGuideText = "Đợt hiện tại đã hết suất";
    lixiActionText = "Thể lệ";
  } else if (store.lixi.user.hasClaimed) {
    lixiStatusText = `Bạn đã nhận ${formatNumber(store.lixi.user.rewardGold)} vàng`;
    lixiGuideText = "Chờ đợt tiếp theo để nhận lại";
    lixiActionText = "Đã nhận";
  } else if (canClaimLixi) {
    lixiStatusText = "Đã đủ video, bấm để nhận ngay";
    lixiGuideText = "Sẵn sàng quay thưởng";
    lixiActionText = "Nhận ngay";
  }

  const lixiModalStatusText = store.lixi.state.isCoolingDown
    ? `Đang reset, mở lại sau ${lixiMinutes}:${lixiSeconds}.`
    : store.lixi.user.hasClaimed
      ? `Bạn đã nhận ${formatNumber(store.lixi.user.rewardGold)} vàng ở đợt này.`
      : canClaimLixi
        ? "Bạn đã đủ video, có thể nhận ngay."
        : `Bấm 1 lần để chạy liên tiếp ${formatNumber(safeLixiAdsRequired)} video. Còn ${formatNumber(lixiAdsRemaining)} video.`;

  const handleLixiClick = async () => {
    if (isClaimingLixi) return;

    if (store.lixi.state.isCoolingDown || store.lixi.user.hasClaimed || !store.lixi.state.isAvailable) {
      setIsLixiRulesOpen(true);
      return;
    }

    setIsClaimingLixi(true);
    try {
      if (!canClaimLixi) {
        let watchedCount = lixiAdsWatched;

        while (watchedCount < safeLixiAdsRequired) {
          const adResult = await showLixiRewardedAdStep(watchedCount);
          if (!adResult.success) {
            alert("Bạn cần xem hết gói video để đủ điều kiện nhận lì xì.");
            return;
          }

          const watchResult = await store.recordLixiAdView();
          if (!watchResult.success) {
            alert(watchResult.error || "Không thể ghi nhận video lì xì.");
            return;
          }

          const nextWatchedCount = Math.min(safeLixiAdsRequired, watchResult.watchedAdViews ?? watchedCount + 1);
          if (nextWatchedCount <= watchedCount) {
            alert("Không cập nhật được tiến độ video lì xì. Thử lại sau.");
            return;
          }

          watchedCount = nextWatchedCount;
        }
      }

      const result = await store.claimLixi();
      if (!result.success) {
        alert(result.error || "Không thể nhận lì xì lúc này.");
        setIsLixiRulesOpen(true);
        return;
      }

      alert(`Chúc mừng! Bạn nhận được ${formatNumber(result.rewardGold || 0)} vàng từ lì xì.`);
    } finally {
      setIsClaimingLixi(false);
    }
  };

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
          alert("Cần xem quảng cáo trước khi bắt đầu đào vàng.");
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

          <button
            onClick={() => void handleLixiClick()}
            disabled={isClaimingLixi}
            className="relative mb-3 flex w-full flex-col gap-2 overflow-hidden rounded-[1.2rem] border border-rose-200/24 bg-[linear-gradient(160deg,rgba(136,19,55,0.9)_0%,rgba(111,13,43,0.94)_52%,rgba(56,8,25,0.98)_100%)] px-3 py-3 text-left shadow-[0_16px_34px_rgba(0,0,0,0.34),0_0_20px_rgba(251,113,133,0.16)] transition-all duration-300 active:scale-[0.99] disabled:opacity-75"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent_34%)]" />
            <div className="absolute -right-8 -top-10 h-24 w-24 rounded-full bg-rose-200/10 blur-2xl" />

            <div className="relative flex items-center gap-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[0.9rem] border border-white/15 bg-white/8">
                <img src="/lixi.gif" alt="Li xi" className="h-full w-full object-cover" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-rose-100/20 bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.13em] text-rose-50">
                      Li Xi
                    </span>
                    <Gift className="h-4 w-4 text-rose-100" />
                  </div>
                  <span className="rounded-full border border-white/14 bg-black/24 px-2.5 py-1 text-[10px] font-bold text-rose-100/85">
                    Đợt #{formatNumber(store.lixi.state.roundNumber)}
                  </span>
                </div>

                <p className="mt-1 text-sm font-bold leading-5 text-rose-50">{lixiStatusText}</p>
              </div>
            </div>

            <div className="relative">
              <div className="h-1.5 overflow-hidden rounded-full bg-black/30">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#ffd7df_0%,#fb7185_55%,#f43f5e_100%)] transition-all duration-500"
                  style={{ width: `${lixiProgressPercent}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-rose-100/76">
                <span>
                  Video {formatNumber(lixiAdsWatched)}/{formatNumber(safeLixiAdsRequired)}
                </span>
                <span>{lixiGuideText}</span>
              </div>
            </div>

            <div className="relative flex items-center justify-between gap-2">
              <p className="text-[11px] text-rose-50/80">Thưởng {lixiRewardRangeText}</p>
              <span className="shrink-0 rounded-full border border-white/16 bg-black/24 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.13em] text-rose-100">
                {lixiActionText}
              </span>
            </div>
          </button>

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

      {isLixiRulesOpen && (
        <div className="absolute inset-0 z-30 flex items-end bg-black/55 px-3 pb-24 pt-20 backdrop-blur-[3px]">
          <div className="w-full rounded-[1.75rem] border border-rose-200/18 bg-[linear-gradient(180deg,rgba(50,11,24,0.96)_0%,rgba(21,8,14,0.98)_100%)] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.42)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.16em] text-rose-100">Thể Lệ Lì Xì</p>
                <p className="mt-2 text-sm leading-6 text-rose-50/78">
                  Nhận ngẫu nhiên {lixiRewardRangeText} sau khi xem đủ {formatNumber(safeLixiAdsRequired)} video.
                </p>
              </div>

              <button
                onClick={() => setIsLixiRulesOpen(false)}
                className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-bold text-white"
              >
                Đóng
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-[11px] text-rose-100/80">
              <div className="rounded-[0.95rem] border border-white/10 bg-white/6 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.12em] text-rose-100/55">Đợt</p>
                <p className="mt-1 text-sm font-bold text-rose-50">#{formatNumber(store.lixi.state.roundNumber)}</p>
              </div>
              <div className="rounded-[0.95rem] border border-white/10 bg-white/6 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.12em] text-rose-100/55">Còn suất</p>
                <p className="mt-1 text-sm font-bold text-rose-50">{lixiRemainingClaimsText}</p>
              </div>
              <div className="rounded-[0.95rem] border border-white/10 bg-white/6 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.12em] text-rose-100/55">Yêu cầu</p>
                <p className="mt-1 text-sm font-bold text-rose-50">{formatNumber(safeLixiAdsRequired)} video</p>
              </div>
            </div>

            <div className="mt-3 rounded-[1.2rem] border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between gap-2 text-[11px] text-rose-100/80">
                <span className="font-bold uppercase tracking-[0.1em]">Tiến độ video</span>
                <span>
                  {formatNumber(lixiAdsWatched)}/{formatNumber(safeLixiAdsRequired)}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/28">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#ffd7df_0%,#fb7185_55%,#f43f5e_100%)] transition-all duration-500"
                  style={{ width: `${lixiProgressPercent}%` }}
                />
              </div>
              <p className="mt-2 text-xs leading-5 text-rose-50/78">{lixiModalStatusText}</p>
            </div>

            <div className="mt-3 space-y-1.5 rounded-[1.2rem] border border-white/8 bg-white/4 px-3 py-3 text-xs leading-5 text-rose-50/78">
              <p>Mỗi tài khoản chỉ nhận 1 lần trong 1 đợt.</p>
              <p>Thứ tự video: Adsgram {"->"} Monetag {"->"} Adsgram.</p>
              <p>Mỗi phiên sẽ tự reset sau {formatNumber(store.lixi.state.cooldownMinutes)} phút hoặc khi hết suất.</p>
              <p>Trạng thái hiện tại: Đợt #{formatNumber(store.lixi.state.roundNumber)} còn {lixiRemainingClaimsText}.</p>
            </div>

            <button
              onClick={() => setIsLixiRulesOpen(false)}
              className="mt-4 w-full rounded-2xl border border-rose-200/22 bg-rose-500/14 px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-rose-50"
            >
              Đã Hiểu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
