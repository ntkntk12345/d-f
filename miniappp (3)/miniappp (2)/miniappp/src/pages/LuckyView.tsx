import { useMemo, useState } from "react";
import type { GameStore } from "@/hooks/use-game-store";
import { cn, formatNumber } from "@/lib/utils";
import { Gift, Sparkles, Star, Trophy, Users } from "lucide-react";

type Notice = {
  type: "success" | "error";
  text: string;
};

export function LuckyView({ store }: { store: GameStore }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const pool = store.luckyDraw.config.totalPrize;
  const cost = store.luckyDraw.config.entryFee;
  const drawTime = `${String(store.luckyDraw.config.drawHour).padStart(2, "0")}:${String(
    store.luckyDraw.config.drawMinute,
  ).padStart(2, "0")}`;

  const prizeTiers = useMemo(
    () => [
      { title: "Top 1", reward: `${store.luckyDraw.config.top1Percent}%`, accent: "yellow" },
      { title: "Top 2", reward: `${store.luckyDraw.config.top2Percent}%`, accent: "slate" },
      { title: "Top 3", reward: `${store.luckyDraw.config.top3Percent}%`, accent: "orange" },
      { title: "Top 4", reward: `${store.luckyDraw.config.top4Percent}%`, accent: "emerald" },
      { title: "Top 5", reward: `${store.luckyDraw.config.top5Percent}%`, accent: "cyan" },
    ],
    [store.luckyDraw.config],
  );

  const handleJoin = async () => {
    if (store.luckyDraw.isJoined) {
      setNotice({ type: "success", text: "Bạn đã tham gia vòng quay hôm nay." });
      return;
    }

    setIsJoining(true);
    const result = await store.joinLuckyDraw();
    setIsJoining(false);

    if (!result.success) {
      setNotice({ type: "error", text: result.error || "Không thể tham gia vòng quay." });
      return;
    }

    setNotice({ type: "success", text: "Tham gia thành công. Chúc bạn may mắn!" });
  };

  const lastWinners = store.luckyDraw.lastWinners;

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-32 pt-24">
      <div className="pointer-events-none absolute inset-x-0 top-12 bottom-10 overflow-hidden">
        <div className="absolute left-[-5rem] top-6 h-60 w-60 rounded-full bg-yellow-500/10 blur-[92px]" />
        <div className="absolute right-[-7rem] top-20 h-72 w-72 rounded-full bg-orange-400/12 blur-[108px]" />
        <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-yellow-300/30 to-transparent" />
      </div>

      <div className="relative z-10 mb-8 px-1">
        <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/20 bg-[#2e1b08]/55 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.32em] text-yellow-100/75 shadow-[inset_0_1px_0_rgba(255,231,173,0.1)]">
          <Sparkles className="h-3.5 w-3.5 text-yellow-400" />
          Khu vận may
        </div>

        <h1 className="mt-4 bg-[linear-gradient(180deg,#fff7d0_0%,#ffd970_42%,#ae6309_100%)] bg-clip-text text-[2.1rem] font-black uppercase leading-none text-transparent">
          Vận may
        </h1>

        <p className="mt-3 max-w-[18rem] text-sm leading-6 text-yellow-100/80">
          Tham gia vòng quay để săn jackpot lớn và theo dõi kết quả gần nhất từ backend.
        </p>
      </div>

      <div className="relative z-10 rounded-[32px] border border-yellow-500/30 bg-[linear-gradient(180deg,rgba(255,223,136,0.14)_0%,rgba(98,58,8,0.18)_100%)] p-[1px] shadow-[0_20px_40px_rgba(0,0,0,0.38)]">
        <div className="relative overflow-hidden rounded-[31px] bg-[radial-gradient(circle_at_top,rgba(255,219,129,0.24),transparent_38%),linear-gradient(180deg,rgba(88,50,11,0.82)_0%,rgba(40,22,7,0.94)_100%)] px-5 py-6 text-center">
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-yellow-100/45 to-transparent" />
          <div className="absolute -left-10 top-16 h-28 w-28 rounded-full bg-yellow-300/12 blur-3xl" />
          <div className="absolute -right-10 bottom-8 h-28 w-28 rounded-full bg-orange-400/12 blur-3xl" />

          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-yellow-200/20 bg-[radial-gradient(circle_at_30%_30%,rgba(255,248,214,0.65),rgba(255,197,61,0.3)_40%,rgba(114,61,8,0.92)_100%)] shadow-[0_16px_34px_rgba(0,0,0,0.3)]">
            <Trophy className="h-9 w-9 text-[#fff2c4]" />
          </div>

          <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.34em] text-yellow-100/55">
            Jackpot hiện tại
          </div>

          <div className="mt-3 rounded-[28px] border border-yellow-300/18 bg-black/16 px-4 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <div className="bg-[linear-gradient(180deg,#fff5c9_0%,#ffd55b_48%,#c07008_100%)] bg-clip-text text-[2rem] font-black leading-none text-transparent">
              {formatNumber(pool)}
            </div>
            <div className="mt-2 text-xs font-bold uppercase tracking-[0.26em] text-yellow-100/45">
              Vàng trong quỹ thưởng
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-left">
            <div className="rounded-[20px] border border-yellow-200/10 bg-black/16 px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-yellow-100/45">
                Giá vé
              </div>
              <div className="mt-1 text-sm font-black text-[#fff3d4]">{formatNumber(cost)}</div>
            </div>
            <div className="rounded-[20px] border border-yellow-200/10 bg-black/16 px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-yellow-100/45">
                Mở thưởng
              </div>
              <div className="mt-1 text-sm font-black text-[#fff3d4]">{drawTime}</div>
            </div>
            <div className="rounded-[20px] border border-yellow-200/10 bg-black/16 px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-yellow-100/45">
                Người chơi
              </div>
              <div className="mt-1 text-sm font-black text-[#fff3d4]">
                {formatNumber(store.luckyDraw.participantCount)}
              </div>
            </div>
          </div>

          <button
            onClick={() => void handleJoin()}
            disabled={isJoining || store.luckyDraw.isJoined}
            className="btn-gold mt-5 w-full rounded-full px-4 py-4 text-sm font-black uppercase tracking-[0.18em] disabled:opacity-60"
          >
            <span className="flex items-center justify-center gap-2">
              <Gift className="h-5 w-5" />
              {isJoining
                ? "Đang xử lý"
                : store.luckyDraw.isJoined
                  ? "Đã tham gia"
                  : "Tham gia ngay"}
            </span>
          </button>

          <p className="mt-3 flex items-center justify-center gap-2 text-xs font-bold text-yellow-100/65">
            <Users className="h-3.5 w-3.5" />
            Tốn {formatNumber(cost)} vàng cho mỗi lượt tham gia
          </p>

          {notice && (
            <div
              className={cn(
                "mt-4 rounded-[18px] border px-4 py-3 text-sm font-bold",
                notice.type === "error"
                  ? "border-red-300/20 bg-red-950/30 text-red-200"
                  : "border-emerald-300/20 bg-emerald-950/30 text-emerald-200",
              )}
            >
              {notice.text}
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 mt-8 space-y-4">
        <div className="flex items-center gap-2 px-1">
          <Star className="h-4 w-4 text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.45)]" />
          <h2 className="bg-[linear-gradient(180deg,#fff4c7_0%,#f7c23e_46%,#a25908_100%)] bg-clip-text text-[1.15rem] font-black uppercase tracking-[0.16em] text-transparent">
            Cơ cấu giải thưởng
          </h2>
          <div className="h-px flex-1 bg-gradient-to-r from-yellow-400/45 via-yellow-500/15 to-transparent" />
        </div>

        <div className="space-y-3">
          {prizeTiers.map((tier) => (
            <div
              key={tier.title}
              className={cn(
                "rounded-[28px] border px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.28)]",
                tier.accent === "yellow" &&
                  "border-yellow-400/24 bg-[radial-gradient(circle_at_top,rgba(255,220,125,0.16),transparent_44%),linear-gradient(180deg,rgba(82,52,10,0.9)_0%,rgba(38,22,7,0.96)_100%)]",
                tier.accent === "slate" &&
                  "border-slate-300/18 bg-[linear-gradient(180deg,rgba(84,93,111,0.46)_0%,rgba(35,39,47,0.94)_100%)]",
                tier.accent === "orange" &&
                  "border-orange-300/20 bg-[linear-gradient(180deg,rgba(124,74,28,0.56)_0%,rgba(55,29,8,0.94)_100%)]",
                tier.accent === "emerald" &&
                  "border-emerald-300/18 bg-[linear-gradient(180deg,rgba(37,86,66,0.52)_0%,rgba(14,42,31,0.94)_100%)]",
                tier.accent === "cyan" &&
                  "border-cyan-300/18 bg-[linear-gradient(180deg,rgba(29,81,102,0.52)_0%,rgba(8,33,45,0.94)_100%)]",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/10 bg-black/16 text-sm font-black text-[#fff3d4]">
                    {tier.title.replace("Top ", "")}
                  </div>
                  <div>
                    <div className="text-base font-extrabold text-[#fff3d4]">{tier.title}</div>
                    <div className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-yellow-100/45">
                      Phần chia theo xếp hạng
                    </div>
                  </div>
                </div>

                <div className="rounded-full border border-yellow-200/10 bg-black/12 px-3 py-1 text-sm font-black text-yellow-100">
                  {tier.reward}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {lastWinners && (
        <div className="relative z-10 mt-7 rounded-[28px] border border-yellow-500/20 bg-[linear-gradient(180deg,rgba(70,41,10,0.78)_0%,rgba(35,20,7,0.94)_100%)] px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.26)]">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-yellow-100/55">
            <Sparkles className="h-4 w-4 text-yellow-400" />
            Kết quả gần nhất
          </div>
          <div className="mt-4 space-y-2 text-sm text-yellow-100/80">
            <p>Top 1: {lastWinners.top1User || "-"}</p>
            <p>Top 2: {lastWinners.top2User || "-"}</p>
            <p>Top 3: {lastWinners.top3User || "-"}</p>
            {lastWinners.drawDate && <p>Ngày quay: {lastWinners.drawDate}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
