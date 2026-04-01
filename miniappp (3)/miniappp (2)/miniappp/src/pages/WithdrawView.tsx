import { useEffect, useMemo, useState } from "react";
import type { GameStore } from "@/hooks/use-game-store";
import { cn, formatNumber } from "@/lib/utils";
import {
  Building,
  CreditCard,
  Landmark,
  QrCode,
  Sparkles,
  UserCircle,
  Wallet,
} from "lucide-react";

type WithdrawTarget = {
  id: string;
  bin: string;
  name: string;
  shortName: string;
  type: "bank" | "wallet" | "usdt";
  qrSupported: boolean;
};

const FALLBACK_TARGETS: WithdrawTarget[] = [
  { id: "VCB", bin: "970436", name: "Vietcombank", shortName: "Vietcombank", type: "bank", qrSupported: true },
  { id: "MB", bin: "970422", name: "MBBank", shortName: "MBBank", type: "bank", qrSupported: true },
  { id: "TCB", bin: "970407", name: "Techcombank", shortName: "Techcombank", type: "bank", qrSupported: true },
  { id: "ICB", bin: "970415", name: "VietinBank", shortName: "VietinBank", type: "bank", qrSupported: true },
  { id: "BIDV", bin: "970418", name: "BIDV", shortName: "BIDV", type: "bank", qrSupported: true },
  { id: "VBA", bin: "970405", name: "Agribank", shortName: "Agribank", type: "bank", qrSupported: true },
  { id: "VPB", bin: "970432", name: "VPBank", shortName: "VPBank", type: "bank", qrSupported: true },
  { id: "TPB", bin: "970423", name: "TPBank", shortName: "TPBank", type: "bank", qrSupported: true },
  { id: "STB", bin: "970403", name: "Sacombank", shortName: "Sacombank", type: "bank", qrSupported: true },
  { id: "VIB", bin: "970441", name: "VIB", shortName: "VIB", type: "bank", qrSupported: true },
  { id: "momo", bin: "971025", name: "MoMo", shortName: "MoMo", type: "wallet", qrSupported: true },
  { id: "zalopay", bin: "", name: "ZaloPay", shortName: "ZaloPay", type: "wallet", qrSupported: false },
  {
    id: "viettelmoney",
    bin: "971005",
    name: "Viettel Money",
    shortName: "Viettel Money",
    type: "wallet",
    qrSupported: false,
  },
  {
    id: "usdt_trc20",
    bin: "",
    name: "USDT (TRC20)",
    shortName: "USDT TRC20",
    type: "usdt",
    qrSupported: false,
  },
];

const WITHDRAW_FEE_PERCENT = 10;
const DEFAULT_USDT_VND_RATE = 26000;

function formatUsdt(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

function normalizeWithdrawTargets(rows: Array<Record<string, unknown>>) {
  const mapped = rows
    .map((row) => {
      const shortName = String(row.shortName ?? row.short_name ?? row.name ?? "").trim();
      const name = String(row.name ?? shortName).trim();
      const code = String(row.code ?? shortName).trim();
      const bin = String(row.bin ?? "").trim();
      const lower = `${name} ${shortName} ${code}`.toLowerCase();
      const isWallet =
        lower.includes("momo") ||
        lower.includes("viettelmoney") ||
        lower.includes("viettel money") ||
        lower.includes("vnptmoney") ||
        lower.includes("vnpt money");
      const qrSupported = Number(row.transferSupported ?? row.isTransfer ?? 0) === 1 && bin.length > 0;

      return {
        id: code || bin || shortName || name,
        bin,
        name,
        shortName: shortName || name,
        type: isWallet ? ("wallet" as const) : ("bank" as const),
        qrSupported,
      };
    })
    .filter((item) => item.type === "wallet" || item.qrSupported);

  const withSyntheticTargets = [...mapped];

  if (!withSyntheticTargets.some((item) => item.shortName.toLowerCase() === "zalopay")) {
    withSyntheticTargets.push({
      id: "zalopay",
      bin: "",
      name: "ZaloPay",
      shortName: "ZaloPay",
      type: "wallet",
      qrSupported: false,
    });
  }

  if (!withSyntheticTargets.some((item) => item.type === "usdt")) {
    withSyntheticTargets.push({
      id: "usdt_trc20",
      bin: "",
      name: "USDT (TRC20)",
      shortName: "USDT TRC20",
      type: "usdt",
      qrSupported: false,
    });
  }

  return withSyntheticTargets.sort((a, b) => {
    const typeOrder: Record<WithdrawTarget["type"], number> = { bank: 0, wallet: 1, usdt: 2 };
    if (a.type !== b.type) return typeOrder[a.type] - typeOrder[b.type];
    return a.shortName.localeCompare(b.shortName, "vi");
  });
}

function getStatusTone(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes("duyệt") || normalized.includes("approved")) {
    return "border-emerald-300/20 bg-emerald-950/30 text-emerald-200";
  }

  if (normalized.includes("từ chối") || normalized.includes("reject")) {
    return "border-red-300/20 bg-red-950/30 text-red-200";
  }

  return "border-yellow-300/20 bg-yellow-950/30 text-yellow-100";
}

function getHistoryMethodLabel(method: string) {
  if (method === "usdt") return "USDT";
  if (method === "wallet") return "Vi dien tu";
  return "Ngan hang";
}

export function WithdrawView({ store }: { store: GameStore }) {
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [customBankName, setCustomBankName] = useState("");
  const [accNum, setAccNum] = useState("");
  const [accName, setAccName] = useState("");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [withdrawTargets, setWithdrawTargets] = useState<WithdrawTarget[]>(FALLBACK_TARGETS);

  const MIN_WITHDRAW = Math.max(0, store.economyConfig.withdrawMinGold);
  const WITHDRAW_RATE = store.economyConfig.withdrawVndPerGold > 0 ? store.economyConfig.withdrawVndPerGold : 0.0005;
  const usdtVndRateRaw = Number(import.meta.env.VITE_USDT_VND_RATE);
  const usdtVndRate = Number.isFinite(usdtVndRateRaw) && usdtVndRateRaw > 0 ? usdtVndRateRaw : DEFAULT_USDT_VND_RATE;
  const withdrawAmount = parseInt(amount.replace(/\D/g, ""), 10) || 0;
  const selectedTarget = useMemo(
    () => withdrawTargets.find((target) => target.id === selectedTargetId),
    [selectedTargetId, withdrawTargets],
  );
  const isUsdtWithdraw = selectedTarget?.type === "usdt";
  const feePercent = isUsdtWithdraw ? 0 : WITHDRAW_FEE_PERCENT;
  const estimatedGrossVnd = Math.floor(withdrawAmount * WITHDRAW_RATE);
  const estimatedFeeVnd = Math.floor((estimatedGrossVnd * feePercent) / 100);
  const estimatedVnd = Math.max(0, estimatedGrossVnd - estimatedFeeVnd);
  const estimatedUsdt = estimatedGrossVnd / usdtVndRate;

  const bankTargets = useMemo(
    () => withdrawTargets.filter((target) => target.type === "bank"),
    [withdrawTargets],
  );
  const walletTargets = useMemo(
    () => withdrawTargets.filter((target) => target.type === "wallet"),
    [withdrawTargets],
  );
  const usdtTargets = useMemo(
    () => withdrawTargets.filter((target) => target.type === "usdt"),
    [withdrawTargets],
  );

  useEffect(() => {
    let cancelled = false;

    const loadTargets = async () => {
      try {
        const response = await fetch("https://api.vietqr.io/v2/banks");
        if (!response.ok) return;

        const payload = (await response.json()) as {
          data?: Array<Record<string, unknown>>;
        };

        if (!cancelled && Array.isArray(payload.data) && payload.data.length > 0) {
          setWithdrawTargets(normalizeWithdrawTargets(payload.data));
        }
      } catch {
        // Keep local fallback when VietQR is unavailable.
      }
    };

    void loadTargets();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (withdrawAmount < MIN_WITHDRAW) {
      alert(`Toi thieu ${formatNumber(MIN_WITHDRAW)} vang!`);
      return;
    }

    if (store.gold < withdrawAmount) {
      alert("So du khong du!");
      return;
    }

    if (!selectedTarget && customBankName.trim().length === 0) {
      alert("Vui long chon kenh nhan tien hoac nhap tay ten don vi nhan.");
      return;
    }

    if (!accNum.trim()) {
      alert("Vui long nhap so tai khoan hoac dia chi nhan.");
      return;
    }

    const normalizedMethod: "bank" | "wallet" | "usdt" =
      selectedTarget?.type === "usdt" ? "usdt" : selectedTarget?.type === "wallet" ? "wallet" : "bank";

    if (normalizedMethod !== "usdt" && !accName.trim()) {
      alert("Vui long nhap ten chu tai khoan/chu vi.");
      return;
    }

    setIsSubmitting(true);
    const result = await store.withdraw({
      amount: withdrawAmount,
      bankBin: selectedTarget?.qrSupported ? selectedTarget.bin : "",
      bankName: selectedTarget?.name || customBankName.trim() || (normalizedMethod === "usdt" ? "USDT (TRC20)" : ""),
      accountNumber: accNum.trim(),
      accountName: normalizedMethod === "usdt" ? accName.trim() : accName.trim().toUpperCase(),
      method: normalizedMethod,
      network: normalizedMethod === "usdt" ? "TRC20" : "",
    });
    setIsSubmitting(false);

    if (!result.success) {
      alert(result.error || "Khong the gui yeu cau rut tien.");
      return;
    }

    alert("Da gui yeu cau rut tien thanh cong! Se duoc xu ly trong 24h.");
    setAmount("");
    setAccNum("");
    setAccName("");
    setSelectedTargetId("");
    setCustomBankName("");
  };

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-32 pt-24">
      <div className="pointer-events-none absolute inset-x-0 top-14 bottom-14 overflow-hidden">
        <div className="absolute left-[-5rem] top-8 h-56 w-56 rounded-full bg-yellow-500/10 blur-[88px]" />
        <div className="absolute right-[-6rem] top-28 h-64 w-64 rounded-full bg-cyan-400/10 blur-[94px]" />
        <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-yellow-300/30 to-transparent" />
      </div>

      <div className="relative z-10 mb-8 px-1">
        <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/20 bg-[#2e1b08]/55 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.32em] text-yellow-100/75 shadow-[inset_0_1px_0_rgba(255,231,173,0.1)]">
          <Wallet className="h-3.5 w-3.5 text-yellow-400" />
          Trung tam rut
        </div>

        <h1 className="mt-4 bg-[linear-gradient(180deg,#fff7d0_0%,#ffd970_42%,#ae6309_100%)] bg-clip-text text-[2.1rem] font-black uppercase leading-none text-transparent">
          Rut tien
        </h1>

        <p className="mt-3 max-w-[18rem] text-sm leading-6 text-yellow-100/80">
          Ho tro rut qua ngan hang, vi dien tu va USDT. Ngan hang/vi dien tu mat phi 10%.
        </p>
      </div>

      <div className="relative z-10 rounded-[30px] border border-yellow-500/30 bg-[linear-gradient(180deg,rgba(255,223,136,0.16)_0%,rgba(98,58,8,0.22)_100%)] p-[1px] shadow-[0_18px_34px_rgba(0,0,0,0.34)]">
        <div className="relative overflow-hidden rounded-[29px] bg-[radial-gradient(circle_at_top,rgba(255,214,120,0.18),transparent_42%),linear-gradient(180deg,rgba(88,50,11,0.88)_0%,rgba(40,22,7,0.96)_100%)] px-4 py-5 text-center">
          <div className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-[linear-gradient(180deg,#fff0ae_0%,#ffc629_46%,#8e4d03_100%)] shadow-[0_0_18px_rgba(255,199,84,0.45)]" />
          <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-yellow-300/10 blur-3xl" />

          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-yellow-300/20 bg-[radial-gradient(circle_at_30%_30%,rgba(255,247,208,0.62),rgba(255,196,59,0.3)_42%,rgba(112,61,8,0.92)_100%)] shadow-[0_12px_28px_rgba(0,0,0,0.26)]">
            <Wallet className="h-7 w-7 text-[#5b2a00]" />
          </div>

          <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.3em] text-yellow-100/55">So du kha dung</div>
          <div className="mt-2 bg-[linear-gradient(180deg,#fff5c9_0%,#ffd55b_48%,#c07008_100%)] bg-clip-text text-5xl font-black text-transparent">
            {formatNumber(store.gold)}
          </div>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-yellow-300/18 bg-black/18 px-4 py-2 text-sm font-bold text-yellow-100">
            Toi thieu rut: {formatNumber(MIN_WITHDRAW)} vang
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="relative z-10 mt-6 rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(42,26,12,0.9)_0%,rgba(23,14,7,0.96)_100%)] px-4 py-5 shadow-[0_18px_34px_rgba(0,0,0,0.34)]"
      >
        <div className="grid gap-4">
          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-bold text-yellow-100/70">
              <Landmark className="h-4 w-4 text-cyan-300" />
              Kenh nhan tien
            </label>
            <select
              value={selectedTargetId}
              onChange={(event) => setSelectedTargetId(event.target.value)}
              className="w-full rounded-[18px] border border-white/10 bg-black/30 px-4 py-4 text-white outline-none transition-colors focus:border-cyan-400/35"
            >
              <option value="">Chon ngan hang, vi dien tu hoac USDT...</option>
              <optgroup label="Ngan hang">
                {bankTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.shortName} {target.bin ? `(${target.bin})` : ""}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Vi dien tu">
                {walletTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.shortName} {target.bin ? `(${target.bin})` : ""}
                    {target.qrSupported ? " - QR auto" : " - thu cong"}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Crypto">
                {usdtTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.shortName}
                  </option>
                ))}
              </optgroup>
            </select>
            {selectedTarget && (
              <p
                className={cn(
                  "mt-2 text-xs font-bold",
                  selectedTarget.type === "usdt"
                    ? "text-cyan-200"
                    : selectedTarget.qrSupported
                      ? "text-emerald-200"
                      : "text-yellow-100/70",
                )}
              >
                {selectedTarget.type === "usdt"
                  ? "USDT se xu ly thu cong theo dia chi vi, khong tao QR VietQR."
                  : selectedTarget.qrSupported
                    ? `${selectedTarget.shortName}${selectedTarget.bin ? ` (${selectedTarget.bin})` : ""} ho tro tao QR VietQR tu dong.`
                    : `${selectedTarget.shortName}${selectedTarget.bin ? ` (${selectedTarget.bin})` : ""} dang xu ly thu cong, khong tao QR.`}
              </p>
            )}
          </div>

          {!isUsdtWithdraw && (
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-bold text-yellow-100/70">
                <Building className="h-4 w-4 text-cyan-300" />
                Don vi khac
              </label>
              <input
                type="text"
                value={customBankName}
                onChange={(event) => setCustomBankName(event.target.value)}
                placeholder="Nhap tay neu khong co trong danh sach"
                className="w-full rounded-[18px] border border-white/10 bg-black/30 px-4 py-4 text-white outline-none transition-colors placeholder:text-white/25 focus:border-cyan-400/35"
              />
            </div>
          )}

          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-bold text-yellow-100/70">
              <CreditCard className="h-4 w-4 text-cyan-300" />
              {isUsdtWithdraw ? "Dia chi vi USDT" : selectedTarget?.type === "wallet" ? "So dien thoai / ID vi" : "So tai khoan"}
            </label>
            <input
              type="text"
              required
              value={accNum}
              onChange={(event) => setAccNum(event.target.value)}
              placeholder={
                isUsdtWithdraw
                  ? "Nhap dia chi vi USDT TRC20..."
                  : selectedTarget?.type === "wallet"
                    ? "Nhap so dien thoai hoac ID vi..."
                    : "Nhap so tai khoan..."
              }
              className="w-full rounded-[18px] border border-white/10 bg-black/30 px-4 py-4 font-mono tracking-wide text-white outline-none transition-colors placeholder:text-white/25 focus:border-cyan-400/35"
            />
          </div>

          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-bold text-yellow-100/70">
              <UserCircle className="h-4 w-4 text-cyan-300" />
              {isUsdtWithdraw ? "Ten chu vi (tuy chon)" : selectedTarget?.type === "wallet" ? "Ten chu vi" : "Ten chu tai khoan"}
            </label>
            <input
              type="text"
              required={!isUsdtWithdraw}
              value={accName}
              onChange={(event) => setAccName(isUsdtWithdraw ? event.target.value : event.target.value.toUpperCase())}
              placeholder={isUsdtWithdraw ? "Co the bo trong" : "NGUYEN VAN A"}
              className={cn(
                "w-full rounded-[18px] border border-white/10 bg-black/30 px-4 py-4 text-white outline-none transition-colors placeholder:text-white/25 focus:border-cyan-400/35",
                isUsdtWithdraw ? "" : "uppercase",
              )}
            />
          </div>

          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-bold text-yellow-100/70">
              <Wallet className="h-4 w-4 text-yellow-400" />
              So vang can rut
            </label>
            <input
              type="number"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={`Vi du: ${MIN_WITHDRAW}`}
              className="w-full rounded-[18px] border border-yellow-400/25 bg-yellow-950/20 px-4 py-4 text-2xl font-black text-yellow-300 outline-none transition-colors placeholder:text-yellow-300/20 focus:border-yellow-300/45"
            />
            {withdrawAmount >= MIN_WITHDRAW && (
              <div className="mt-2 space-y-1 rounded-2xl border border-emerald-300/18 bg-emerald-950/25 px-3 py-2 text-sm text-emerald-100">
                <p className="font-bold">Quy doi goc: {formatNumber(estimatedGrossVnd)} VND</p>
                {!isUsdtWithdraw ? (
                  <>
                    <p>Phi dich vu {feePercent}%: -{formatNumber(estimatedFeeVnd)} VND</p>
                    <p className="font-bold">Uoc tinh thuc nhan: {formatNumber(estimatedVnd)} VND</p>
                  </>
                ) : (
                  <p className="font-bold">
                    Uoc tinh thuc nhan: ~{formatUsdt(estimatedUsdt)} USDT (1 USDT = {formatNumber(usdtVndRate)} VND)
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-gold mt-5 w-full rounded-full px-4 py-4 text-sm font-black uppercase tracking-[0.18em] disabled:opacity-60"
        >
          {isSubmitting ? "Dang gui lenh" : "Tao lenh rut tien"}
        </button>
      </form>

      <div className="relative z-10 mt-7 space-y-4">
        <div className="flex items-center gap-2 px-1">
          <Sparkles className="h-4 w-4 text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.45)]" />
          <h2 className="bg-[linear-gradient(180deg,#fff4c7_0%,#f7c23e_46%,#a25908_100%)] bg-clip-text text-[1.15rem] font-black uppercase tracking-[0.16em] text-transparent">
            Lich su rut
          </h2>
          <div className="h-px flex-1 bg-gradient-to-r from-yellow-400/45 via-yellow-500/15 to-transparent" />
        </div>

        {store.withdrawHistory.length === 0 ? (
          <div className="rounded-[28px] border border-yellow-500/20 bg-[linear-gradient(180deg,rgba(70,41,10,0.78)_0%,rgba(35,20,7,0.94)_100%)] px-4 py-8 text-center shadow-[0_16px_34px_rgba(0,0,0,0.26)]">
            <Wallet className="mx-auto h-10 w-10 text-yellow-100/25" />
            <p className="mt-3 text-sm leading-6 text-yellow-100/55">Chua co lenh rut nao duoc tao.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {store.withdrawHistory.map((item) => {
              const payoutCurrency = (item.payoutCurrency || "VND").toUpperCase();
              const payoutAmount = Number(item.payoutAmount || (payoutCurrency === "VND" ? item.vnd : 0));
              const payoutLabel = payoutCurrency === "USDT" ? `${formatUsdt(payoutAmount)} USDT` : `${formatNumber(payoutAmount)} VND`;

              return (
                <div
                  key={item.id}
                  className="rounded-[28px] border border-yellow-500/22 bg-[radial-gradient(circle_at_top,rgba(255,214,120,0.14),transparent_44%),linear-gradient(180deg,rgba(78,45,10,0.86)_0%,rgba(37,21,7,0.95)_100%)] px-4 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.28)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-extrabold text-[#fff3d4]">{item.bankName}</p>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-yellow-100/45">{item.accountNumber}</p>
                      <p className="mt-2 text-xs text-cyan-100/75">Kenh: {getHistoryMethodLabel(item.method)}</p>
                      <p className="mt-3 text-sm font-black text-yellow-100">{formatNumber(item.amount)} vang</p>
                      {item.feePercent > 0 ? (
                        <p className="mt-1 text-xs text-yellow-100/60">Phi: {item.feePercent}% ({formatNumber(item.feeAmount)} VND)</p>
                      ) : null}
                      <p className="mt-1 text-xs text-yellow-100/55">{item.date}</p>
                    </div>

                    <div className="text-right">
                      <p className="text-base font-black text-emerald-200">{payoutLabel}</p>
                      <div
                        className={cn(
                          "mt-2 rounded-full border px-3 py-1 text-xs font-bold",
                          getStatusTone(item.status),
                        )}
                      >
                        {item.status}
                      </div>
                    </div>
                  </div>

                  {(item.message || item.qrUrl) && (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {item.message && <p className="text-sm text-yellow-100/76">{item.message}</p>}

                      {item.qrUrl && payoutCurrency === "VND" && (
                        <button
                          onClick={() => window.open(item.qrUrl || "", "_blank", "noopener,noreferrer")}
                          className="inline-flex items-center gap-2 rounded-full border border-cyan-300/18 bg-cyan-950/30 px-3 py-1.5 text-xs font-bold text-cyan-100"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          Xem QR
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
