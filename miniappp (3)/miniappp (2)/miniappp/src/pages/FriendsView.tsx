import { useState } from "react";
import type { GameStore } from "@/hooks/use-game-store";
import { formatNumber } from "@/lib/utils";
import { Award, Copy, Share2, Sparkles, UserPlus, Users } from "lucide-react";

export function FriendsView({ store }: { store: GameStore }) {
  const [copied, setCopied] = useState(false);
  const invitedCount = Math.max(store.referrals.length, store.referralCount);
  const totalGoldBonus = store.referrals.reduce((sum, item) => sum + item.goldReward, 0);
  const totalDiamondBonus = store.referrals.reduce((sum, item) => sum + item.diamondReward, 0);
  const perInviteGold = store.economyConfig.referralRewardGold;
  const perInviteDiamonds = store.economyConfig.referralRewardDiamonds;

  const handleCopy = async () => {
    const success = await store.copyInviteLink();
    setCopied(success);
    if (success) {
      window.setTimeout(() => setCopied(false), 1800);
      return;
    }
    window.alert("Không thể sao chép liên kết lúc này.");
  };

  const handleShare = () => {
    if (!store.inviteLink) {
      window.alert("Chưa có link mời. Hãy mở app trong Telegram.");
      return;
    }

    store.shareInviteLink();
  };

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-32 pt-24">
      <div className="pointer-events-none absolute inset-x-0 top-16 bottom-14 overflow-hidden">
        <div className="absolute left-[-5rem] top-4 h-60 w-60 rounded-full bg-yellow-500/10 blur-[92px]" />
        <div className="absolute right-[-7rem] top-28 h-72 w-72 rounded-full bg-fuchsia-400/10 blur-[108px]" />
        <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-yellow-400/30 to-transparent" />
      </div>

      <div className="relative z-10 mb-8 px-1">
        <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/20 bg-[#2e1b08]/55 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.32em] text-yellow-100/75 shadow-[inset_0_1px_0_rgba(255,231,173,0.1)]">
          <Users className="h-3.5 w-3.5 text-yellow-400" />
          Khu mời bạn
        </div>

        <h1 className="mt-4 bg-[linear-gradient(180deg,#fff7d0_0%,#ffd970_42%,#ae6309_100%)] bg-clip-text text-[2.1rem] font-black uppercase leading-none text-transparent">
          Bạn bè
        </h1>

        <p className="mt-3 max-w-[18rem] text-sm leading-6 text-yellow-100/80">
          Mời người chơi mới tham gia để nhận thưởng theo cấu hình referral hiện tại của hệ thống.
        </p>
      </div>

      <div className="relative z-10 rounded-[30px] border border-yellow-500/30 bg-[linear-gradient(180deg,rgba(255,223,136,0.14)_0%,rgba(98,58,8,0.18)_100%)] p-[1px] shadow-[0_18px_34px_rgba(0,0,0,0.34)]">
        <div className="relative overflow-hidden rounded-[29px] bg-[radial-gradient(circle_at_top,rgba(255,214,120,0.18),transparent_42%),linear-gradient(180deg,rgba(88,50,11,0.88)_0%,rgba(40,22,7,0.96)_100%)] px-4 py-5">
          <div className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-[linear-gradient(180deg,#fff0ae_0%,#ffc629_46%,#8e4d03_100%)] shadow-[0_0_18px_rgba(255,199,84,0.45)]" />
          <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-yellow-300/10 blur-3xl" />

          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-fuchsia-200/20 bg-[linear-gradient(180deg,rgba(109,54,137,0.78)_0%,rgba(56,22,72,0.96)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_12px_24px_rgba(0,0,0,0.18)]">
              <Users className="h-7 w-7 text-fuchsia-100" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-base font-extrabold text-[#fff3d4]">Mỗi lượt mời thành công</div>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-yellow-300/15 bg-yellow-100/8 px-3 py-1 text-sm font-black text-yellow-100">
                <Sparkles className="h-3.5 w-3.5 text-yellow-400" />
                +{formatNumber(perInviteGold)} vàng{perInviteDiamonds > 0 ? ` · +${formatNumber(perInviteDiamonds)} KC` : ""}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-[22px] border border-yellow-400/12 bg-black/18 px-4 py-4 text-center">
              <UserPlus className="mx-auto h-5 w-5 text-yellow-300" />
              <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.26em] text-yellow-100/50">
                Đã mời
              </div>
              <div className="mt-1 text-2xl font-black text-[#fff3d4]">{invitedCount}</div>
            </div>

            <div className="rounded-[22px] border border-emerald-300/12 bg-black/18 px-4 py-4 text-center">
              <Award className="mx-auto h-5 w-5 text-emerald-300" />
              <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.26em] text-yellow-100/50">
                Tổng thưởng
              </div>
              <div className="mt-1 text-xl font-black text-emerald-200">
                +{formatNumber(totalGoldBonus)} vàng
              </div>
              {totalDiamondBonus > 0 ? (
                <div className="mt-1 text-sm font-black text-cyan-100">+{formatNumber(totalDiamondBonus)} KC</div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-yellow-300/12 bg-black/20 p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-yellow-100/50">
              Liên kết giới thiệu
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-[18px] border border-yellow-200/10 bg-[#170d05]/70 px-3 py-3">
              <span className="min-w-0 flex-1 truncate font-mono text-sm text-yellow-100/80">
                {store.inviteLink || "Chưa có liên kết, hãy mở app trong Telegram"}
              </span>
              <button
                onClick={() => void handleCopy()}
                className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-yellow-200/10 bg-white/6 text-yellow-100 transition-colors hover:bg-white/12"
                aria-label="Sao chép liên kết"
              >
                <Copy className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-emerald-200/90">
                {copied ? "Đã sao chép liên kết" : "Chia sẻ để nhận thêm lượt mời"}
              </span>
              <button
                onClick={handleShare}
                className="btn-gold min-w-[132px] rounded-full px-4 py-3 text-sm font-black uppercase tracking-[0.14em] disabled:opacity-40"
                disabled={!store.inviteLink}
              >
                <span className="flex items-center justify-center gap-2">
                  <Share2 className="h-4.5 w-4.5" />
                  Mời ngay
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-8 space-y-4">
        <div className="flex items-center gap-2 px-1">
          <Sparkles className="h-4 w-4 text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.45)]" />
          <h2 className="bg-[linear-gradient(180deg,#fff4c7_0%,#f7c23e_46%,#a25908_100%)] bg-clip-text text-[1.15rem] font-black uppercase tracking-[0.16em] text-transparent">
            Danh sách bạn bè
          </h2>
          <div className="h-px flex-1 bg-gradient-to-r from-yellow-400/45 via-yellow-500/15 to-transparent" />
        </div>

        {store.referrals.length > 0 ? (
          <div className="space-y-3">
            {store.referrals.map((friend, index) => {
              const joined = new Date(friend.createdAt);
              const joinedText = Number.isNaN(joined.getTime())
                ? "Không rõ thời gian"
                : joined.toLocaleString("vi-VN");

              return (
                <div
                  key={`${friend.invitedId}-${friend.createdAt}`}
                  className="rounded-[28px] border border-yellow-500/25 bg-[radial-gradient(circle_at_top,rgba(255,214,120,0.14),transparent_44%),linear-gradient(180deg,rgba(78,45,10,0.86)_0%,rgba(37,21,7,0.95)_100%)] px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.28)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-fuchsia-200/18 bg-[linear-gradient(180deg,rgba(109,54,137,0.78)_0%,rgba(56,22,72,0.96)_100%)] text-lg font-black text-fuchsia-50 shadow-[0_10px_22px_rgba(0,0,0,0.18)]">
                      {friend.invitedName.slice(0, 1).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-base font-extrabold text-[#fff3d4]">
                            {friend.invitedName}
                          </div>
                          <div className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-yellow-100/45">
                            Tham gia {joinedText}
                          </div>
                        </div>

                        <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-yellow-300/15 bg-yellow-100/8 px-3 py-1 text-sm font-black text-yellow-100">
                          +{formatNumber(friend.goldReward)} vàng
                          {friend.diamondReward > 0 ? ` · +${formatNumber(friend.diamondReward)} KC` : ""}
                        </div>
                      </div>

                      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white/65">
                        Bạn mời #{index + 1}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[28px] border border-yellow-500/20 bg-[linear-gradient(180deg,rgba(70,41,10,0.78)_0%,rgba(35,20,7,0.94)_100%)] px-4 py-8 text-center shadow-[0_16px_34px_rgba(0,0,0,0.26)]">
            <Users className="mx-auto h-10 w-10 text-yellow-100/25" />
            <p className="mt-3 text-sm leading-6 text-yellow-100/55">
              Chưa có bạn bè nào tham gia. Hãy gửi link mời để bắt đầu nhận thưởng.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
