import { useState } from "react";
import type { GameStore } from "@/hooks/use-game-store";
import { cn, formatNumber } from "@/lib/utils";
import { ArrowRightLeft, ChevronRight, Coins, Gem, Gift, Info, Sparkles, TrendingUp } from "lucide-react";

type Notice = {
  type: "success" | "error";
  text: string;
};

export function ExchangeView({ store }: { store: GameStore }) {
  const [goldAmount, setGoldAmount] = useState("");
  const [exchangeNotice, setExchangeNotice] = useState<Notice | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const rate = Math.max(1, store.economyConfig.exchangeGoldPerDiamond || 125);
  const presets = [rate * 10, rate * 50, rate * 100, rate * 500];

  const amount = parseInt(goldAmount.replace(/\D/g, ""), 10) || 0;
  const willGet = Math.floor(amount / rate);
  const canExchange = amount >= rate && amount <= store.gold;

  const handleExchange = async () => {
    if (amount < rate) {
      setExchangeNotice({
        type: "error",
        text: `Tối thiểu ${formatNumber(rate)} vàng để đổi kim cương.`,
      });
      return;
    }

    setIsSubmitting(true);
    const result = await store.exchangeGoldForDiamonds(amount);
    setIsSubmitting(false);

    if (!result.success) {
      setExchangeNotice({
        type: "error",
        text: result.error || "Số vàng hiện tại không đủ để thực hiện giao dịch.",
      });
      return;
    }

    setExchangeNotice({
      type: "success",
      text: `Đổi thành công. Bạn nhận được ${formatNumber(willGet)} kim cương.`,
    });
    setGoldAmount("");
  };

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-32 pt-24">
      <div className="pointer-events-none absolute inset-x-0 top-14 bottom-14 overflow-hidden">
        <div className="absolute left-[-6rem] top-8 h-60 w-60 rounded-full bg-yellow-500/10 blur-[92px]" />
        <div className="absolute right-[-7rem] top-28 h-72 w-72 rounded-full bg-cyan-400/10 blur-[108px]" />
        <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-yellow-300/30 to-transparent" />
      </div>

      <div className="relative z-10 mb-8 px-1">
        <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/20 bg-[#2e1b08]/55 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.32em] text-yellow-100/75 shadow-[inset_0_1px_0_rgba(255,231,173,0.1)]">
          <ArrowRightLeft className="h-3.5 w-3.5 text-yellow-400" />
          Trung tâm quy đổi
        </div>

        <h1 className="mt-4 bg-[linear-gradient(180deg,#fff7d0_0%,#ffd970_42%,#ae6309_100%)] bg-clip-text text-[2.1rem] font-black uppercase leading-none text-transparent">
          Đổi KC
        </h1>

        <p className="mt-3 max-w-[18rem] text-sm leading-6 text-yellow-100/80">
          Quy đổi vàng sang kim cương thật nhanh, còn giftcode đã được tách sang một trang riêng.
        </p>
      </div>

      <div className="relative z-10 rounded-[28px] border border-cyan-300/20 bg-[radial-gradient(circle_at_top,rgba(102,220,255,0.1),transparent_44%),linear-gradient(180deg,rgba(24,56,63,0.88)_0%,rgba(11,27,31,0.96)_100%)] px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.26)]">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-100/60">
          <Info className="h-4 w-4 text-cyan-300" />
          Tỷ giá hiện tại
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-[22px] border border-cyan-200/12 bg-black/16 px-4 py-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-yellow-300/15 bg-yellow-100/8 px-3 py-1 text-sm font-black text-yellow-100">
            <Coins className="h-3.5 w-3.5" />
            {formatNumber(rate)} vàng
          </div>
          <ArrowRightLeft className="h-5 w-5 text-white/40" />
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-100/8 px-3 py-1 text-sm font-black text-cyan-100">
            <Gem className="h-3.5 w-3.5" />
            1 KC
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-6 rounded-[30px] border border-yellow-500/28 bg-[linear-gradient(180deg,rgba(255,223,136,0.14)_0%,rgba(98,58,8,0.18)_100%)] p-[1px] shadow-[0_20px_40px_rgba(0,0,0,0.36)]">
        <div className="relative overflow-hidden rounded-[29px] bg-[radial-gradient(circle_at_top,rgba(255,214,120,0.18),transparent_42%),linear-gradient(180deg,rgba(88,50,11,0.88)_0%,rgba(40,22,7,0.96)_100%)] px-4 py-5">
          <div className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-[linear-gradient(180deg,#fff0ae_0%,#ffc629_46%,#8e4d03_100%)] shadow-[0_0_18px_rgba(255,199,84,0.45)]" />
          <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-yellow-300/10 blur-3xl" />

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[22px] border border-yellow-300/14 bg-black/18 px-4 py-4 text-center">
              <Coins className="mx-auto h-5 w-5 text-yellow-300" />
              <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.26em] text-yellow-100/50">
                Số dư vàng
              </div>
              <div className="mt-1 text-xl font-black text-[#fff3d4]">
                {formatNumber(store.gold)}
              </div>
            </div>

            <div className="rounded-[22px] border border-cyan-300/14 bg-black/18 px-4 py-4 text-center">
              <Gem className="mx-auto h-5 w-5 text-cyan-300" />
              <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.26em] text-yellow-100/50">
                Kim cương
              </div>
              <div className="mt-1 text-xl font-black text-cyan-100">
                {formatNumber(store.diamonds)}
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-yellow-100/50">
              Chọn nhanh
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {presets.map((preset) => (
                <button
                  key={preset}
                  onClick={() => {
                    setGoldAmount(String(preset));
                    setExchangeNotice(null);
                  }}
                  className={cn(
                    "rounded-[16px] border px-2 py-3 text-xs font-black uppercase transition-colors",
                    amount === preset
                      ? "border-yellow-300/22 bg-yellow-100/10 text-yellow-100"
                      : "border-white/10 bg-white/5 text-white/58 hover:border-yellow-300/18 hover:text-yellow-50",
                  )}
                >
                  {preset >= 1000 ? `${preset / 1000}K` : preset}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-yellow-100/50">
              Số vàng muốn đổi
            </div>

            <div className="relative mt-3">
              <Coins className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-yellow-300" />
              <input
                type="number"
                placeholder="Nhập số vàng..."
                value={goldAmount}
                onChange={(event) => {
                  setGoldAmount(event.target.value);
                  setExchangeNotice(null);
                }}
                className="w-full rounded-[22px] border border-yellow-300/15 bg-[#170d05]/75 py-4 pl-12 pr-4 text-lg font-black text-yellow-100 outline-none transition-colors placeholder:text-yellow-100/25 focus:border-yellow-300/28"
              />
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 rounded-[24px] border border-cyan-200/12 bg-black/18 px-4 py-4">
            <div className="text-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-yellow-100/45">
                Bạn trả
              </div>
              <div className="mt-1 text-base font-black text-[#fff3d4]">
                {formatNumber(amount)}
              </div>
            </div>

            <ArrowRightLeft className="h-5 w-5 text-white/38" />

            <div className="text-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-yellow-100/45">
                Bạn nhận
              </div>
              <div className="mt-1 text-base font-black text-cyan-100">
                {formatNumber(willGet)} KC
              </div>
            </div>
          </div>

          <button
            onClick={() => void handleExchange()}
            disabled={!canExchange || isSubmitting}
            className={cn(
              "mt-5 w-full rounded-full px-4 py-4 text-sm font-black uppercase tracking-[0.18em] transition-transform duration-200 active:translate-y-[1px]",
              canExchange
                ? "btn-gold border border-[#ffe193]/70"
                : "cursor-not-allowed border border-white/10 bg-white/6 text-white/35",
            )}
          >
            <span className="flex items-center justify-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              {isSubmitting ? "Đang xử lý" : "Xác nhận đổi"}
            </span>
          </button>

          {exchangeNotice && (
            <div
              className={cn(
                "mt-4 rounded-[18px] border px-4 py-3 text-sm font-bold",
                exchangeNotice.type === "success"
                  ? "border-emerald-300/20 bg-emerald-950/30 text-emerald-200"
                  : "border-red-300/20 bg-red-950/30 text-red-200",
              )}
            >
              {exchangeNotice.text}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => store.setCurrentPage("giftcode")}
        className="relative z-10 mt-7 w-full rounded-[28px] border border-fuchsia-300/18 bg-[radial-gradient(circle_at_top,rgba(214,124,255,0.12),transparent_40%),linear-gradient(180deg,rgba(87,42,105,0.82)_0%,rgba(39,18,48,0.94)_100%)] px-4 py-4 text-left shadow-[0_16px_34px_rgba(0,0,0,0.26)] transition-transform duration-200 hover:-translate-y-0.5"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-fuchsia-200/20 bg-[linear-gradient(180deg,rgba(123,61,146,0.84)_0%,rgba(61,27,76,0.96)_100%)] shadow-[0_12px_24px_rgba(0,0,0,0.2)]">
            <Gift className="h-7 w-7 text-fuchsia-100" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-base font-extrabold text-[#fff3d4]">Trang giftcode riêng</div>
            <div className="mt-1 text-sm text-yellow-100/72">
              Đi sang màn riêng để nhập mã quà và nhận thưởng từ backend.
            </div>
          </div>

          <ChevronRight className="h-5 w-5 shrink-0 text-yellow-100/70" />
        </div>
      </button>

      <div className="relative z-10 mt-7 rounded-[28px] border border-yellow-500/20 bg-[linear-gradient(180deg,rgba(70,41,10,0.78)_0%,rgba(35,20,7,0.94)_100%)] px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.26)]">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-yellow-100/55">
          <TrendingUp className="h-4 w-4 text-yellow-400" />
          Dùng KC để làm gì
        </div>
        <div className="mt-4 space-y-3">
          {[
            "Mở các mốc nâng cấp mỏ để tăng tốc độ đào.",
            "Tham gia các sự kiện và vòng quay thưởng lớn.",
            "Tích trữ cho các gói quà hoặc vật phẩm hiếm sau này.",
          ].map((tip) => (
            <div
              key={tip}
              className="rounded-[20px] border border-yellow-200/10 bg-black/16 px-4 py-3 text-sm leading-6 text-yellow-100/76"
            >
              <div className="flex items-start gap-2">
                <Sparkles className="mt-1 h-4 w-4 shrink-0 text-yellow-400" />
                <span>{tip}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
