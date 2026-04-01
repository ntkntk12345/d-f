import { useEffect, useState } from "react";
import type { GameStore } from "@/hooks/use-game-store";
import { cn, formatNumber } from "@/lib/utils";
import {
  CheckCircle2,
  Coins,
  Gift,
  Gamepad2,
  RefreshCcw,
  Shield,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";

export function AdminView({ store }: { store: GameStore }) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [flappyGoldReward, setFlappyGoldReward] = useState(0);
  const [flappyDiamondReward, setFlappyDiamondReward] = useState(0);
  const [lixiMinReward, setLixiMinReward] = useState(0);
  const [lixiMaxReward, setLixiMaxReward] = useState(0);
  const [isSavingFlappy, setIsSavingFlappy] = useState(false);
  const [isSavingLixi, setIsSavingLixi] = useState(false);

  useEffect(() => {
    setFlappyGoldReward(store.adminData.flappyConfig.rewardGold);
    setFlappyDiamondReward(store.adminData.flappyConfig.rewardDiamonds);
  }, [store.adminData.flappyConfig.rewardDiamonds, store.adminData.flappyConfig.rewardGold]);

  useEffect(() => {
    setLixiMinReward(store.adminData.lixiConfig.minGold);
    setLixiMaxReward(store.adminData.lixiConfig.maxGold);
  }, [store.adminData.lixiConfig.maxGold, store.adminData.lixiConfig.minGold]);

  const handleWithdrawAction = async (withdrawId: number, newStatus: string) => {
    setBusyId(withdrawId);
    const result = await store.updateWithdrawStatus(withdrawId, newStatus);
    setBusyId(null);

    if (!result.success) {
      alert(result.error || "Không thể cập nhật trạng thái lệnh rút.");
    }
  };

  const handleSaveFlappyConfig = async () => {
    setIsSavingFlappy(true);
    const result = await store.updateFlappyConfig(flappyGoldReward, flappyDiamondReward);
    setIsSavingFlappy(false);

    if (!result.success) {
      alert(result.error || "Khong the cap nhat thuong flappy.");
      return;
    }

    alert("Da cap nhat thuong best score cho flappy.");
  };

  const handleSaveLixiConfig = async () => {
    setIsSavingLixi(true);
    const result = await store.updateLixiConfig(lixiMinReward, lixiMaxReward);
    setIsSavingLixi(false);

    if (!result.success) {
      alert(result.error || "Khong the cap nhat cau hinh li xi.");
      return;
    }

    alert("Da cap nhat min max li xi.");
  };

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-32 pt-24">
      <div className="pointer-events-none absolute inset-x-0 top-14 bottom-14 overflow-hidden">
        <div className="absolute left-[-5rem] top-8 h-56 w-56 rounded-full bg-cyan-400/10 blur-[88px]" />
        <div className="absolute right-[-6rem] top-28 h-64 w-64 rounded-full bg-yellow-500/10 blur-[94px]" />
        <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/30 to-transparent" />
      </div>

      <div className="relative z-10 mb-8 px-1">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/18 bg-[#13222a]/65 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.32em] text-cyan-100/80 shadow-[inset_0_1px_0_rgba(183,243,255,0.08)]">
          <Shield className="h-3.5 w-3.5 text-cyan-300" />
          Trung tâm admin
        </div>

        <h1 className="mt-4 bg-[linear-gradient(180deg,#e7fbff_0%,#7be9ff_42%,#14748d_100%)] bg-clip-text text-[2.1rem] font-black uppercase leading-none text-transparent">
          Admin
        </h1>

        <p className="mt-3 max-w-[18rem] text-sm leading-6 text-cyan-50/80">
          Quản lý người dùng và phê duyệt lệnh rút với logic backend hiện tại.
        </p>
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-3">
        <div className="rounded-[24px] border border-cyan-300/18 bg-[linear-gradient(180deg,rgba(35,92,116,0.54)_0%,rgba(10,39,50,0.94)_100%)] px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.26)]">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-100/55">
            <Users className="h-4 w-4 text-cyan-300" />
            Tổng user
          </div>
          <div className="mt-2 text-2xl font-black text-cyan-50">
            {formatNumber(store.adminData.users.length)}
          </div>
        </div>

        <div className="rounded-[24px] border border-yellow-300/18 bg-[linear-gradient(180deg,rgba(104,64,14,0.54)_0%,rgba(45,27,8,0.94)_100%)] px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.26)]">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-yellow-100/55">
            <Wallet className="h-4 w-4 text-yellow-300" />
            Chờ rút
          </div>
          <div className="mt-2 text-2xl font-black text-yellow-50">
            {formatNumber(store.adminData.pendingWithdraws.length)}
          </div>
        </div>

        <div className="rounded-[24px] border border-yellow-300/18 bg-[linear-gradient(180deg,rgba(104,64,14,0.54)_0%,rgba(45,27,8,0.94)_100%)] px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.26)]">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-yellow-100/55">
            <Coins className="h-4 w-4 text-yellow-300" />
            Tổng vàng
          </div>
          <div className="mt-2 text-xl font-black text-yellow-100">
            {formatNumber(store.adminData.totalGold)}
          </div>
        </div>

        <div className="rounded-[24px] border border-cyan-300/18 bg-[linear-gradient(180deg,rgba(35,92,116,0.54)_0%,rgba(10,39,50,0.94)_100%)] px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.26)]">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-100/55">
            <Shield className="h-4 w-4 text-cyan-300" />
            Tổng KC
          </div>
          <div className="mt-2 text-xl font-black text-cyan-100">
            {formatNumber(store.adminData.totalDiamonds)}
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-7 space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-cyan-300" />
            <h2 className="bg-[linear-gradient(180deg,#e7fbff_0%,#7be9ff_42%,#14748d_100%)] bg-clip-text text-[1.15rem] font-black uppercase tracking-[0.16em] text-transparent">
              Lệnh rút chờ duyệt
            </h2>
          </div>

          <button
            onClick={() => void store.fetchAdminData()}
            className="inline-flex items-center gap-2 rounded-full border border-cyan-300/18 bg-cyan-950/30 px-3 py-1.5 text-xs font-bold text-cyan-100"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Tải lại
          </button>
        </div>

        {store.adminData.pendingWithdraws.length === 0 ? (
          <div className="rounded-[28px] border border-cyan-400/14 bg-[linear-gradient(180deg,rgba(19,47,58,0.86)_0%,rgba(10,22,29,0.96)_100%)] px-4 py-8 text-center shadow-[0_16px_34px_rgba(0,0,0,0.26)]">
            <Shield className="mx-auto h-10 w-10 text-cyan-100/20" />
            <p className="mt-3 text-sm leading-6 text-cyan-50/55">
              Không có lệnh rút nào đang chờ xử lý.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {store.adminData.pendingWithdraws.map((item) => (
              <div
                key={item.id}
                className="rounded-[28px] border border-cyan-400/14 bg-[linear-gradient(180deg,rgba(19,47,58,0.86)_0%,rgba(10,22,29,0.96)_100%)] px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.28)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-extrabold text-cyan-50">{item.username}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-cyan-100/40">
                      ID {item.teleId}
                    </p>
                    <p className="mt-3 text-sm text-cyan-50/80">
                      {item.bankName} - {item.accountNumber}
                    </p>
                    <p className="text-sm text-cyan-50/80">{item.accountName}</p>
                    <p className="mt-2 text-sm font-black text-yellow-100">
                      {(item.payoutCurrency || "VND").toUpperCase() === "USDT"
                        ? `${Number(item.payoutAmount || 0).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 6,
                          })} USDT`
                        : `${formatNumber(item.payoutAmount || item.vnd)} VNĐ`}
                    </p>
                    {item.feePercent > 0 ? (
                      <p className="mt-1 text-xs text-cyan-100/55">Phí {formatNumber(item.feePercent)}% ({formatNumber(item.feeAmount)} VNĐ)</p>
                    ) : null}
                  </div>

                  <div className="flex min-w-[112px] flex-col gap-2">
                    <button
                      onClick={() => void handleWithdrawAction(item.id, "Đã duyệt")}
                      disabled={busyId === item.id}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-950/30 px-3 py-2 text-xs font-bold text-emerald-200 disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Duyệt
                    </button>
                    <button
                      onClick={() => void handleWithdrawAction(item.id, "Từ chối")}
                      disabled={busyId === item.id}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-red-300/20 bg-red-950/30 px-3 py-2 text-xs font-bold text-red-200 disabled:opacity-60"
                    >
                      <XCircle className="h-4 w-4" />
                      Từ chối
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="relative z-10 mt-7 space-y-4">
        <div className="flex items-center gap-2 px-1">
          <Gamepad2 className="h-4 w-4 text-cyan-300" />
          <h2 className="bg-[linear-gradient(180deg,#e7fbff_0%,#7be9ff_42%,#14748d_100%)] bg-clip-text text-[1.15rem] font-black uppercase tracking-[0.16em] text-transparent">
            Flappy Reward
          </h2>
          <div className="h-px flex-1 bg-gradient-to-r from-cyan-400/45 via-cyan-400/15 to-transparent" />
        </div>

        <div className="rounded-[28px] border border-cyan-400/14 bg-[linear-gradient(180deg,rgba(19,47,58,0.86)_0%,rgba(10,22,29,0.96)_100%)] px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.28)]">
          <p className="text-sm leading-6 text-cyan-50/70">
            Dat muc thuong khi nguoi choi pha ky luc best score trong Flappy Bird.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-100/55">Thuong vang</span>
              <input
                type="number"
                min="0"
                value={flappyGoldReward}
                onChange={(event) => setFlappyGoldReward(Number(event.target.value) || 0)}
                className={cn(
                  "w-full rounded-2xl border border-cyan-300/18 bg-black/25 px-4 py-3 text-sm font-bold text-cyan-50 outline-none",
                  "focus:border-cyan-300/45 focus:ring-2 focus:ring-cyan-300/20",
                )}
              />
            </label>

            <label className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-100/55">Thuong KC</span>
              <input
                type="number"
                min="0"
                value={flappyDiamondReward}
                onChange={(event) => setFlappyDiamondReward(Number(event.target.value) || 0)}
                className={cn(
                  "w-full rounded-2xl border border-cyan-300/18 bg-black/25 px-4 py-3 text-sm font-bold text-cyan-50 outline-none",
                  "focus:border-cyan-300/45 focus:ring-2 focus:ring-cyan-300/20",
                )}
              />
            </label>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-xs text-cyan-50/60">
              Hien tai: {formatNumber(store.adminData.flappyConfig.rewardGold)} vang / {formatNumber(store.adminData.flappyConfig.rewardDiamonds)} KC
            </div>

            <button
              onClick={() => void handleSaveFlappyConfig()}
              disabled={isSavingFlappy}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-950/40 px-4 py-2 text-xs font-bold text-cyan-100 disabled:opacity-60"
            >
              <Gamepad2 className="h-4 w-4" />
              {isSavingFlappy ? "Dang luu" : "Luu thuong"}
            </button>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-7 space-y-4">
        <div className="flex items-center gap-2 px-1">
          <Gift className="h-4 w-4 text-rose-300" />
          <h2 className="bg-[linear-gradient(180deg,#fff1f2_0%,#fda4af_46%,#be123c_100%)] bg-clip-text text-[1.15rem] font-black uppercase tracking-[0.16em] text-transparent">
            Li Xi Trang Chu
          </h2>
          <div className="h-px flex-1 bg-gradient-to-r from-rose-400/45 via-rose-400/15 to-transparent" />
        </div>

        <div className="rounded-[28px] border border-rose-300/14 bg-[linear-gradient(180deg,rgba(88,28,48,0.82)_0%,rgba(41,10,23,0.96)_100%)] px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.28)]">
          <p className="text-sm leading-6 text-rose-50/75">
            User can xem du {formatNumber(store.adminData.lixiConfig.requiredAdViews)} video moi nhan ngau nhien vang trong khoang min max. Moi dot co {formatNumber(store.adminData.lixiConfig.maxClaimsPerRound)} nguoi nhan, het luot thi dem nguoc {formatNumber(store.adminData.lixiConfig.cooldownMinutes)} phut roi mo lai.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-100/60">Min vang</span>
              <input
                type="number"
                min="0"
                value={lixiMinReward}
                onChange={(event) => setLixiMinReward(Number(event.target.value) || 0)}
                className={cn(
                  "w-full rounded-2xl border border-rose-300/18 bg-black/25 px-4 py-3 text-sm font-bold text-rose-50 outline-none",
                  "focus:border-rose-300/45 focus:ring-2 focus:ring-rose-300/20",
                )}
              />
            </label>

            <label className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-100/60">Max vang</span>
              <input
                type="number"
                min="0"
                value={lixiMaxReward}
                onChange={(event) => setLixiMaxReward(Number(event.target.value) || 0)}
                className={cn(
                  "w-full rounded-2xl border border-rose-300/18 bg-black/25 px-4 py-3 text-sm font-bold text-rose-50 outline-none",
                  "focus:border-rose-300/45 focus:ring-2 focus:ring-rose-300/20",
                )}
              />
            </label>
          </div>

          <div className="mt-4 rounded-[22px] border border-rose-200/12 bg-rose-500/8 px-4 py-3 text-xs text-rose-50/75">
            Hien tai: {formatNumber(store.adminData.lixiConfig.minGold)} - {formatNumber(store.adminData.lixiConfig.maxGold)} vang.
            Con lai {formatNumber(store.adminData.lixiState.remainingClaims)}/{formatNumber(store.adminData.lixiState.maxClaimsPerRound)} suat
            {store.adminData.lixiState.isCoolingDown ? " va dang trong thoi gian cho reset." : "."}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-xs text-rose-50/60">
              Dot hien tai #{formatNumber(store.adminData.lixiState.roundNumber)}
            </div>

            <button
              onClick={() => void handleSaveLixiConfig()}
              disabled={isSavingLixi}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-300/20 bg-rose-950/40 px-4 py-2 text-xs font-bold text-rose-100 disabled:opacity-60"
            >
              <Gift className="h-4 w-4" />
              {isSavingLixi ? "Dang luu" : "Luu li xi"}
            </button>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-7 space-y-4">
        <div className="flex items-center gap-2 px-1">
          <Users className="h-4 w-4 text-yellow-300" />
          <h2 className="bg-[linear-gradient(180deg,#fff4c7_0%,#f7c23e_46%,#a25908_100%)] bg-clip-text text-[1.15rem] font-black uppercase tracking-[0.16em] text-transparent">
            User gần đây
          </h2>
          <div className="h-px flex-1 bg-gradient-to-r from-yellow-400/45 via-yellow-500/15 to-transparent" />
        </div>

        <div className="space-y-3">
          {store.adminData.users.slice(0, 12).map((user) => (
            <div
              key={user.teleId}
              className="rounded-[26px] border border-yellow-500/22 bg-[radial-gradient(circle_at_top,rgba(255,214,120,0.14),transparent_44%),linear-gradient(180deg,rgba(78,45,10,0.86)_0%,rgba(37,21,7,0.95)_100%)] px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.28)]"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-base font-extrabold text-[#fff3d4]">{user.username}</p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-yellow-100/45">
                    ID {user.teleId}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm font-black text-yellow-100">
                    {formatNumber(user.gold)} G
                  </p>
                  <p className="mt-1 text-sm font-black text-cyan-100">
                    {formatNumber(user.diamonds)} KC
                  </p>
                  <p className="mt-1 text-xs text-yellow-100/50">Lv.{user.level}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
