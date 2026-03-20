import { useState } from "react";
import type { GameStore } from "@/hooks/use-game-store";
import { cn, formatNumber } from "@/lib/utils";
import { ArrowLeft, Gift, Sparkles, TicketPercent } from "lucide-react";

type Notice = {
  type: "success" | "error";
  text: string;
};

export function GiftcodeView({ store }: { store: GameStore }) {
  const [giftCode, setGiftCode] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRedeem = async () => {
    if (!giftCode.trim()) return;

    setIsSubmitting(true);
    const result = await store.redeemGiftCode(giftCode.trim());
    setIsSubmitting(false);

    if (result.success === false) {
      setNotice({
        type: "error",
        text: result.error || "Giftcode không hợp lệ hoặc đã hết hạn.",
      });
      return;
    }

    const rewardText = [
      result.rewardGold ? `+${formatNumber(result.rewardGold)} vàng` : "",
      result.rewardDiamonds ? `+${formatNumber(result.rewardDiamonds)} kim cương` : "",
    ]
      .filter(Boolean)
      .join(" | ");

    setNotice({
      type: "success",
      text: rewardText ? `Nhận thưởng thành công: ${rewardText}` : "Đổi giftcode thành công.",
    });
    setGiftCode("");
  };

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-32 pt-24">
      <div className="pointer-events-none absolute inset-x-0 top-14 bottom-14 overflow-hidden">
        <div className="absolute left-[-6rem] top-6 h-60 w-60 rounded-full bg-yellow-500/10 blur-[92px]" />
        <div className="absolute right-[-7rem] top-24 h-72 w-72 rounded-full bg-fuchsia-400/10 blur-[108px]" />
        <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-yellow-300/30 to-transparent" />
      </div>

      <div className="relative z-10 mb-8 flex items-start justify-between gap-3 px-1">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/20 bg-[#2e1b08]/55 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.32em] text-yellow-100/75 shadow-[inset_0_1px_0_rgba(255,231,173,0.1)]">
            <Gift className="h-3.5 w-3.5 text-yellow-400" />
            Kho giftcode
          </div>

          <h1 className="mt-4 bg-[linear-gradient(180deg,#fff7d0_0%,#ffd970_42%,#ae6309_100%)] bg-clip-text text-[2.1rem] font-black uppercase leading-none text-transparent">
            Giftcode
          </h1>

          <p className="mt-3 max-w-[18rem] text-sm leading-6 text-yellow-100/80">
            Nhập mã quà ở trang riêng để nhận vàng và kim cương nhanh gọn hơn.
          </p>
        </div>

        <button
          onClick={() => store.setCurrentPage("exchange")}
          className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-yellow-300/15 bg-black/20 text-yellow-100 shadow-[0_10px_20px_rgba(0,0,0,0.18)] transition-colors hover:bg-black/28"
          aria-label="Quay lại đổi KC"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>

      <div className="relative z-10 rounded-[30px] border border-yellow-500/28 bg-[linear-gradient(180deg,rgba(255,223,136,0.14)_0%,rgba(98,58,8,0.18)_100%)] p-[1px] shadow-[0_20px_40px_rgba(0,0,0,0.36)]">
        <div className="relative overflow-hidden rounded-[29px] bg-[radial-gradient(circle_at_top,rgba(255,214,120,0.18),transparent_42%),linear-gradient(180deg,rgba(88,50,11,0.88)_0%,rgba(40,22,7,0.96)_100%)] px-4 py-5">
          <div className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-[linear-gradient(180deg,#fff0ae_0%,#ffc629_46%,#8e4d03_100%)] shadow-[0_0_18px_rgba(255,199,84,0.45)]" />
          <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-yellow-300/10 blur-3xl" />

          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-fuchsia-200/20 bg-[linear-gradient(180deg,rgba(105,55,130,0.78)_0%,rgba(53,22,68,0.96)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_24px_rgba(0,0,0,0.18)]">
              <TicketPercent className="h-7 w-7 text-fuchsia-100" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-base font-extrabold text-[#fff3d4]">Nhập giftcode</div>
              <div className="mt-1 text-sm text-yellow-100/70">
                Mỗi mã sẽ được backend xác minh và cộng thưởng ngay vào tài khoản.
              </div>
            </div>
          </div>

          <div className="relative mt-5">
            <Gift className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-fuchsia-200" />
            <input
              type="text"
              placeholder="Nhập giftcode..."
              value={giftCode}
              onChange={(event) => {
                setGiftCode(event.target.value.toUpperCase());
                setNotice(null);
              }}
              className="w-full rounded-[22px] border border-yellow-300/15 bg-[#170d05]/75 py-4 pl-12 pr-4 text-base font-black uppercase tracking-[0.14em] text-yellow-100 outline-none transition-colors placeholder:text-yellow-100/25 focus:border-yellow-300/28"
            />
          </div>

          <button
            onClick={() => void handleRedeem()}
            disabled={isSubmitting || !giftCode.trim()}
            className="btn-gold mt-4 w-full rounded-full px-4 py-4 text-sm font-black uppercase tracking-[0.18em] disabled:opacity-60"
          >
            <span className="flex items-center justify-center gap-2">
              <Gift className="h-5 w-5" />
              {isSubmitting ? "Đang kiểm tra" : "Nhận quà ngay"}
            </span>
          </button>

          {notice && (
            <div
              className={cn(
                "mt-4 rounded-[18px] border px-4 py-3 text-sm font-bold",
                notice.type === "success"
                  ? "border-emerald-300/20 bg-emerald-950/30 text-emerald-200"
                  : "border-red-300/20 bg-red-950/30 text-red-200",
              )}
            >
              {notice.text}
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 mt-7 rounded-[28px] border border-yellow-500/20 bg-[linear-gradient(180deg,rgba(70,41,10,0.78)_0%,rgba(35,20,7,0.94)_100%)] px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.26)]">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-yellow-100/55">
          <Sparkles className="h-4 w-4 text-yellow-400" />
          Lưu ý
        </div>
        <div className="mt-4 space-y-3">
          {[
            "Mỗi giftcode chỉ dùng được một lần trên tài khoản hiện tại.",
            "Phần thưởng sẽ cộng trực tiếp theo phản hồi backend.",
            "Nếu mở ngoài Telegram và thiếu xác thực, backend có thể từ chối xử lý.",
          ].map((tip) => (
            <div
              key={tip}
              className="rounded-[20px] border border-yellow-200/10 bg-black/16 px-4 py-3 text-sm leading-6 text-yellow-100/76"
            >
              {tip}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
