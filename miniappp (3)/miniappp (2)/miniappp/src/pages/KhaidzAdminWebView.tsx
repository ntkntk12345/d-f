import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coins,
  Copy,
  Crown,
  Gift,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  QrCode,
  RefreshCcw,
  Save,
  Search,
  Shield,
  Sparkles,
  Swords,
  Trash2,
  TriangleAlert,
  Trophy,
  Users,
  Wallet,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

type AdminTab = "dashboard" | "economy" | "users" | "tasks" | "giftcodes" | "withdrawals" | "lucky_draw";
type NoticeTone = "success" | "error";
type TaskActionType = "click" | "join" | "react_heart";
type TaskType = "community" | "daily" | "one_time" | "ad";
type RewardType = "gold" | "diamond" | "diamonds";

interface AdminUser {
  teleId: number;
  username: string;
  tgHandle: string;
  gold: number;
  diamonds: number;
  level: number;
  ipAddress: string;
  referrals: number;
  flappyBestScore: number;
  isMining: boolean;
  miningRate: number;
  miningStartTime: number | null;
  miningShiftStart: number | null;
}

interface GiftCodeItem {
  code: string;
  rewardGold: number;
  rewardDiamonds: number;
  maxUses: number;
  currentUses: number;
  createdAt: string;
}

interface TaskItem {
  id: string;
  title: string;
  icon: string;
  rewardType: RewardType;
  rewardAmount: number;
  url: string;
  type: TaskType;
  actionType: TaskActionType;
  telegramChatId: string;
  telegramMessageId: string;
}

interface AdminWithdrawItem {
  id: number;
  userTeleId: number;
  teleId: number;
  username: string;
  tgHandle: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  vnd: number;
  qrUrl: string;
  status: string;
  createdAt: string;
  message: string;
}

interface FlappyConfig {
  rewardGold: number;
  rewardDiamonds: number;
}

interface EconomyConfig {
  newUserGold: number;
  newUserDiamonds: number;
  referralRewardGold: number;
  referralRewardDiamonds: number;
  exchangeGoldPerDiamond: number;
  withdrawMinGold: number;
  withdrawVndPerGold: number;
  taskMilestoneCount: number;
  taskMilestoneRewardGold: number;
  taskMilestoneRewardDiamonds: number;
}

interface LevelSetting {
  level: number;
  miningRate: number;
  upgradeCost: number;
}

interface LuckyScheduleItem {
  id: number;
  drawDate: string;
  rankPos: number;
  teleId: string;
  fakeName: string;
}

interface ReferralItem {
  username: string;
  teleId: number;
  ipAddress: string;
  createdAt: string;
}

interface AdminSnapshot {
  users: AdminUser[];
  totalGold: number;
  totalDiamonds: number;
  pendingWithdraws: AdminWithdrawItem[];
  giftCodes: GiftCodeItem[];
  levels: LevelSetting[];
  tasks: TaskItem[];
  flappyConfig: FlappyConfig;
  economyConfig: EconomyConfig;
  serverTime: number;
}

interface NoticeState {
  tone: NoticeTone;
  message: string;
}

interface UserEditState {
  teleId: number;
  username: string;
  gold: string;
  diamonds: string;
}

interface ReferralState {
  user: AdminUser;
  items: ReferralItem[];
  isLoading: boolean;
  error: string;
}

interface TaskFormState {
  id: string;
  title: string;
  icon: string;
  rewardType: "gold" | "diamonds";
  rewardAmount: string;
  url: string;
  type: TaskType;
  actionType: TaskActionType;
  telegramChatId: string;
  telegramMessageId: string;
}

interface GiftCodeFormState {
  code: string;
  rewardGold: string;
  rewardDiamonds: string;
  maxUses: string;
}

interface FlappyFormState {
  rewardGold: string;
  rewardDiamonds: string;
}

interface EconomyFormState {
  newUserGold: string;
  newUserDiamonds: string;
  referralRewardGold: string;
  referralRewardDiamonds: string;
  exchangeGoldPerDiamond: string;
  withdrawMinGold: string;
  withdrawVndPerGold: string;
  taskMilestoneCount: string;
  taskMilestoneRewardGold: string;
  taskMilestoneRewardDiamonds: string;
}

interface LevelRowState {
  level: number;
  miningRate: string;
  upgradeCost: string;
}

interface ScheduleFormState {
  date: string;
  rank: string;
  winnerType: "fake" | "real";
  value: string;
}

const TOKEN_KEY = "admin_token";
const USERS_PER_PAGE = 12;
const REALTIME_RECONNECT_MS = 3_000;
const LIVE_GOLD_TICK_MS = 1_000;
const SHIFT_DURATION_MS = 6 * 60 * 60 * 1000;
const ADMIN_ROUTE_PREFIX = "/khaidz";
const PANEL_CLASS =
  "rounded-[28px] border border-cyan-200/10 bg-[linear-gradient(180deg,rgba(10,23,34,0.92)_0%,rgba(7,14,22,0.98)_100%)] shadow-[0_30px_80px_rgba(0,0,0,0.35)]";
const INPUT_CLASS =
  "w-full rounded-2xl border border-cyan-100/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/12";
const TEXTAREA_CLASS = `${INPUT_CLASS} min-h-28 resize-y`;
const PRIMARY_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-500/15 px-4 py-3 text-sm font-bold text-cyan-100 transition hover:border-cyan-200/40 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60";
const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-200 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60";
const DANGER_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100 transition hover:border-red-200/35 hover:bg-red-500/18 disabled:cursor-not-allowed disabled:opacity-60";

const TABS: Array<{ id: AdminTab; label: string; icon: LucideIcon; accent: string }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, accent: "from-cyan-300 to-sky-400" },
  { id: "economy", label: "Kinh tế", icon: Coins, accent: "from-amber-200 to-yellow-400" },
  { id: "users", label: "Người dùng", icon: Users, accent: "from-yellow-200 to-amber-400" },
  { id: "tasks", label: "Nhiệm vụ", icon: Swords, accent: "from-fuchsia-200 to-rose-400" },
  { id: "giftcodes", label: "Gift code", icon: Gift, accent: "from-emerald-200 to-teal-400" },
  { id: "withdrawals", label: "Rút tiền", icon: Wallet, accent: "from-orange-200 to-amber-400" },
  { id: "lucky_draw", label: "Vận may", icon: Trophy, accent: "from-violet-200 to-indigo-400" },
];

function isAdminTab(value: string): value is AdminTab {
  return TABS.some((tab) => tab.id === value);
}

function getAdminTabPath(tab: AdminTab) {
  return tab === "dashboard" ? ADMIN_ROUTE_PREFIX : `${ADMIN_ROUTE_PREFIX}/${tab}`;
}

function getAdminTabFromPath(pathname: string) {
  const normalizedPath = pathname.replace(/\/+$/, "") || ADMIN_ROUTE_PREFIX;
  if (normalizedPath === ADMIN_ROUTE_PREFIX) {
    return "dashboard" as const;
  }

  if (!normalizedPath.startsWith(`${ADMIN_ROUTE_PREFIX}/`)) {
    return "dashboard" as const;
  }

  const maybeTab = normalizedPath.slice(ADMIN_ROUTE_PREFIX.length + 1);
  return isAdminTab(maybeTab) ? maybeTab : ("dashboard" as const);
}

const DEFAULT_TASK_FORM: TaskFormState = {
  id: "",
  title: "",
  icon: "📢",
  rewardType: "gold",
  rewardAmount: "1000",
  url: "",
  type: "community",
  actionType: "react_heart",
  telegramChatId: "",
  telegramMessageId: "",
};

const DEFAULT_GIFTCODE_FORM: GiftCodeFormState = {
  code: "",
  rewardGold: "0",
  rewardDiamonds: "0",
  maxUses: "100",
};

const EMPTY_ECONOMY_CONFIG: EconomyConfig = {
  newUserGold: 1000,
  newUserDiamonds: 1000,
  referralRewardGold: 50000,
  referralRewardDiamonds: 0,
  exchangeGoldPerDiamond: 125,
  withdrawMinGold: 6000000,
  withdrawVndPerGold: 0.0005,
  taskMilestoneCount: 0,
  taskMilestoneRewardGold: 0,
  taskMilestoneRewardDiamonds: 0,
};

const DEFAULT_ECONOMY_FORM: EconomyFormState = {
  newUserGold: String(EMPTY_ECONOMY_CONFIG.newUserGold),
  newUserDiamonds: String(EMPTY_ECONOMY_CONFIG.newUserDiamonds),
  referralRewardGold: String(EMPTY_ECONOMY_CONFIG.referralRewardGold),
  referralRewardDiamonds: String(EMPTY_ECONOMY_CONFIG.referralRewardDiamonds),
  exchangeGoldPerDiamond: String(EMPTY_ECONOMY_CONFIG.exchangeGoldPerDiamond),
  withdrawMinGold: String(EMPTY_ECONOMY_CONFIG.withdrawMinGold),
  withdrawVndPerGold: String(EMPTY_ECONOMY_CONFIG.withdrawVndPerGold),
  taskMilestoneCount: String(EMPTY_ECONOMY_CONFIG.taskMilestoneCount),
  taskMilestoneRewardGold: String(EMPTY_ECONOMY_CONFIG.taskMilestoneRewardGold),
  taskMilestoneRewardDiamonds: String(EMPTY_ECONOMY_CONFIG.taskMilestoneRewardDiamonds),
};

function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT_SCHEDULE_FORM: ScheduleFormState = {
  date: getTodayInputValue(),
  rank: "1",
  winnerType: "fake",
  value: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecordArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Record<string, unknown>[];
  }

  return value.filter((item): item is Record<string, unknown> => isRecord(item));
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toText(value: unknown, fallback = "") {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return fallback;
}

function formatDecimalNumber(value: number, maximumFractionDigits = 8) {
  return new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function toEconomyForm(config: EconomyConfig): EconomyFormState {
  return {
    newUserGold: String(config.newUserGold),
    newUserDiamonds: String(config.newUserDiamonds),
    referralRewardGold: String(config.referralRewardGold),
    referralRewardDiamonds: String(config.referralRewardDiamonds),
    exchangeGoldPerDiamond: String(config.exchangeGoldPerDiamond),
    withdrawMinGold: String(config.withdrawMinGold),
    withdrawVndPerGold: String(config.withdrawVndPerGold),
    taskMilestoneCount: String(config.taskMilestoneCount),
    taskMilestoneRewardGold: String(config.taskMilestoneRewardGold),
    taskMilestoneRewardDiamonds: String(config.taskMilestoneRewardDiamonds),
  };
}

function isAdminUserMiningActive(user: Pick<AdminUser, "isMining" | "miningStartTime" | "miningShiftStart">) {
  return Boolean(user.isMining && user.miningStartTime && (user.miningShiftStart ?? user.miningStartTime));
}

function getProjectedAdminUserGold(
  user: Pick<AdminUser, "gold" | "isMining" | "miningRate" | "miningStartTime" | "miningShiftStart">,
  nowMs: number,
) {
  const baseGold = toNumber(user.gold);

  if (!isAdminUserMiningActive(user)) {
    return baseGold;
  }

  const shiftStart = toNumber(user.miningShiftStart ?? user.miningStartTime);
  const miningStart = toNumber(user.miningStartTime ?? shiftStart);
  const cappedShiftElapsed = Math.min(Math.max(0, nowMs - shiftStart), SHIFT_DURATION_MS);
  const elapsedBeforeCheckpoint = Math.max(0, miningStart - shiftStart);
  const localElapsed = Math.max(0, cappedShiftElapsed - elapsedBeforeCheckpoint);
  const miningRate = user.miningRate == null ? 7 : Math.max(0, toNumber(user.miningRate));
  const projectedEarned = Math.floor((localElapsed / 1000) * miningRate);

  return baseGold + projectedEarned;
}

function normalizeAdminSnapshot(payload: unknown): AdminSnapshot {
  const root = isRecord(payload) ? payload : {};
  const economyRoot = isRecord(root.economyConfig) ? root.economyConfig : {};

  return {
    users: asRecordArray(root.users).map((item) => ({
      teleId: toNumber(item.teleId),
      username: toText(item.username, "Chưa đặt tên"),
      tgHandle: toText(item.tgHandle, ""),
      gold: toNumber(item.gold),
      diamonds: toNumber(item.diamonds),
      level: toNumber(item.level),
      ipAddress: toText(item.ip_address, ""),
      referrals: toNumber(item.referrals),
      flappyBestScore: toNumber(item.flappyBestScore),
      isMining: item.isMining === true || toNumber(item.isMining) === 1,
      miningRate: item.miningRate == null ? 7 : toNumber(item.miningRate),
      miningStartTime: item.miningStartTime ? toNumber(item.miningStartTime) : null,
      miningShiftStart: item.miningShiftStart ? toNumber(item.miningShiftStart) : null,
    })),
    totalGold: toNumber(root.totalGold),
    totalDiamonds: toNumber(root.totalDiamonds),
    pendingWithdraws: asRecordArray(root.pendingWithdraws).map((item) => ({
      id: toNumber(item.id),
      userTeleId: toNumber(item.userTeleId || item.teleId),
      teleId: toNumber(item.teleId || item.userTeleId),
      username: toText(item.username, "Unknown"),
      tgHandle: toText(item.tgHandle, ""),
      accountName: toText(item.accountName),
      bankName: toText(item.bankName),
      accountNumber: toText(item.accountNumber),
      vnd: toNumber(item.vnd),
      qrUrl: toText(item.qrUrl),
      status: toText(item.status),
      createdAt: toText(item.createdAt),
      message: toText(item.message),
    })),
    giftCodes: asRecordArray(root.giftCodes).map((item) => ({
      code: toText(item.code),
      rewardGold: toNumber(item.rewardGold),
      rewardDiamonds: toNumber(item.rewardDiamonds),
      maxUses: toNumber(item.maxUses),
      currentUses: toNumber(item.currentUses ?? item.usedCount),
      createdAt: toText(item.createdAt),
    })),
    levels: asRecordArray(root.levels).map((item) => ({
      level: toNumber(item.level),
      miningRate: toNumber(item.miningRate),
      upgradeCost: toNumber(item.upgradeCost),
    })),
    tasks: asRecordArray(root.tasks).map((item) => ({
      id: toText(item.id),
      title: toText(item.title),
      icon: toText(item.icon, "🎯"),
      rewardType: toText(item.rewardType, "gold") as RewardType,
      rewardAmount: toNumber(item.rewardAmount),
      url: toText(item.url),
      type: toText(item.type, "community") as TaskType,
      actionType: toText(item.actionType, "click") as TaskActionType,
      telegramChatId: toText(item.telegramChatId),
      telegramMessageId: toText(item.telegramMessageId),
    })),
    flappyConfig: {
      rewardGold: toNumber(isRecord(root.flappyConfig) ? root.flappyConfig.rewardGold : 0),
      rewardDiamonds: toNumber(isRecord(root.flappyConfig) ? root.flappyConfig.rewardDiamonds : 0),
    },
    economyConfig: {
      newUserGold: toNumber(economyRoot.newUserGold ?? EMPTY_ECONOMY_CONFIG.newUserGold),
      newUserDiamonds: toNumber(economyRoot.newUserDiamonds ?? EMPTY_ECONOMY_CONFIG.newUserDiamonds),
      referralRewardGold: toNumber(economyRoot.referralRewardGold ?? EMPTY_ECONOMY_CONFIG.referralRewardGold),
      referralRewardDiamonds: toNumber(
        economyRoot.referralRewardDiamonds ?? EMPTY_ECONOMY_CONFIG.referralRewardDiamonds,
      ),
      exchangeGoldPerDiamond: Math.max(
        1,
        toNumber(economyRoot.exchangeGoldPerDiamond ?? EMPTY_ECONOMY_CONFIG.exchangeGoldPerDiamond),
      ),
      withdrawMinGold: Math.max(0, toNumber(economyRoot.withdrawMinGold ?? EMPTY_ECONOMY_CONFIG.withdrawMinGold)),
      withdrawVndPerGold: Math.max(
        0,
        toNumber(economyRoot.withdrawVndPerGold ?? EMPTY_ECONOMY_CONFIG.withdrawVndPerGold),
      ),
      taskMilestoneCount: Math.max(
        0,
        toNumber(economyRoot.taskMilestoneCount ?? EMPTY_ECONOMY_CONFIG.taskMilestoneCount),
      ),
      taskMilestoneRewardGold: Math.max(
        0,
        toNumber(economyRoot.taskMilestoneRewardGold ?? EMPTY_ECONOMY_CONFIG.taskMilestoneRewardGold),
      ),
      taskMilestoneRewardDiamonds: Math.max(
        0,
        toNumber(economyRoot.taskMilestoneRewardDiamonds ?? EMPTY_ECONOMY_CONFIG.taskMilestoneRewardDiamonds),
      ),
    },
    serverTime: toNumber(root.serverTime || Date.now()),
  };
}

function normalizeScheduleItems(payload: unknown) {
  return asRecordArray(payload)
    .map((item) => ({
      id: toNumber(item.id),
      drawDate: toText(item.drawDate),
      rankPos: toNumber(item.rankPos),
      teleId: toText(item.teleId),
      fakeName: toText(item.fakeName),
    }))
    .sort((a, b) => {
      if (a.drawDate === b.drawDate) {
        return a.rankPos - b.rankPos;
      }

      return b.drawDate.localeCompare(a.drawDate);
    });
}

function normalizeReferrals(payload: unknown) {
  return asRecordArray(payload).map((item) => ({
    username: toText(item.username, "Ẩn danh"),
    teleId: toNumber(item.teleId),
    ipAddress: toText(item.ip_address),
    createdAt: toText(item.createdAt),
  }));
}

function parseApiError(payload: unknown, fallback: string) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (isRecord(payload)) {
    const message = toText(payload.message);
    const error = toText(payload.error);
    return message || error || fallback;
  }

  return fallback;
}

function formatDateTime(value: string) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatDateOnly(value: string) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
  }).format(date);
}

function buildQrPreviewUrl(withdraw: AdminWithdrawItem) {
  if (withdraw.qrUrl) {
    return withdraw.qrUrl;
  }

  const bankCodeMap: Record<string, string> = {
    mbbank: "MB",
    mb: "MB",
    vietcombank: "VCB",
    techcombank: "TCB",
    bidv: "BIDV",
    vietinbank: "ICB",
    agribank: "VBA",
    acb: "ACB",
    vpbank: "VPB",
    tpbank: "TPB",
    sacombank: "STB",
    hdbank: "HDB",
    vib: "VIB",
    eximbank: "EIB",
    shb: "SHB",
    seabank: "SEAB",
    msb: "MSB",
    ocb: "OCB",
    lienvietpostbank: "LPB",
    bacabank: "BAB",
    namabank: "NAB",
  };

  const normalized = withdraw.bankName.toLowerCase().replace(/\s+/g, "");
  const bankCode =
    Object.entries(bankCodeMap).find(([keyword]) => normalized.includes(keyword))?.[1] ??
    withdraw.bankName;

  const encodedInfo = encodeURIComponent(`Rut tien ${withdraw.username}`);
  return `https://img.vietqr.io/image/${bankCode}-${withdraw.accountNumber}-compact2.png?amount=${withdraw.vnd}&addInfo=${encodedInfo}`;
}

function getNoticeClassName(tone: NoticeTone) {
  return tone === "success"
    ? "border-emerald-200/20 bg-emerald-500/10 text-emerald-100"
    : "border-red-200/20 bg-red-500/10 text-red-100";
}

function getRewardLabel(rewardType: RewardType) {
  return rewardType === "diamond" || rewardType === "diamonds" ? "KC" : "Vàng";
}

function getTaskActionLabel(task: TaskItem) {
  if (task.actionType === "join") {
    return `Join check · ${task.telegramChatId || "Chưa có group"}`;
  }

  if (task.actionType === "react_heart") {
    return `Thả tim · ${task.telegramChatId || "Chưa có group"} · Bất kỳ tin nhắn`;
  }

  return "Click link";
}

function getStatusChipClassName(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes("thành công") || normalized.includes("đã duyệt")) {
    return "border-emerald-200/20 bg-emerald-500/10 text-emerald-100";
  }

  if (normalized.includes("từ chối")) {
    return "border-red-200/20 bg-red-500/10 text-red-100";
  }

  return "border-yellow-200/20 bg-yellow-500/10 text-yellow-100";
}

function LoadingSpinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn("h-4 w-4 animate-spin", className)} />;
}

function ShellCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn(PANEL_CLASS, className)}>{children}</section>;
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-white/6 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/10 p-3 text-cyan-100">
          <Icon className="h-5 w-5" />
        </div>

        <div>
          <h2 className="text-lg font-black uppercase tracking-[0.22em] text-slate-50">{title}</h2>
          {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300/75">{description}</p> : null}
        </div>
      </div>

      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  accentClassName,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  accentClassName: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-white/4 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.18)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{label}</p>
          <p className={cn("mt-3 text-3xl font-black", accentClassName)}>{value}</p>
          <p className="mt-2 text-sm text-slate-300/65">{detail}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-slate-100">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function Modal({
  open,
  title,
  description,
  children,
  onClose,
  widthClassName = "max-w-2xl",
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  widthClassName?: string;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/82 p-4 backdrop-blur-md">
      <div className={cn(PANEL_CLASS, "w-full overflow-hidden", widthClassName)}>
        <div className="flex items-start justify-between gap-4 border-b border-white/6 px-5 py-5 sm:px-6">
          <div>
            <h3 className="text-xl font-black uppercase tracking-[0.18em] text-slate-50">{title}</h3>
            {description ? <p className="mt-2 text-sm leading-6 text-slate-300/70">{description}</p> : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}

export function KhaidzAdminWebView() {
  const requestSeqRef = useRef(0);
  const realtimeRefreshTimeoutRef = useRef<number | null>(null);
  const [token, setToken] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return window.localStorage.getItem(TOKEN_KEY) ?? "";
  });
  const [selectedTab, setSelectedTab] = useState<AdminTab>(() => {
    if (typeof window === "undefined") {
      return "dashboard";
    }

    return getAdminTabFromPath(window.location.pathname);
  });
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [liveTickMs, setLiveTickMs] = useState(() => Date.now());
  const [scheduleItems, setScheduleItems] = useState<LuckyScheduleItem[]>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(Boolean(token));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [realtimeState, setRealtimeState] = useState<"connecting" | "live" | "retrying">(
    token ? "connecting" : "live",
  );
  const [syncError, setSyncError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [userEdit, setUserEdit] = useState<UserEditState | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [taskForm, setTaskForm] = useState<TaskFormState>(DEFAULT_TASK_FORM);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [giftCodeForm, setGiftCodeForm] = useState<GiftCodeFormState>(DEFAULT_GIFTCODE_FORM);
  const [isSavingGiftCode, setIsSavingGiftCode] = useState(false);
  const [flappyForm, setFlappyForm] = useState<FlappyFormState>({ rewardGold: "0", rewardDiamonds: "0" });
  const [isSavingFlappy, setIsSavingFlappy] = useState(false);
  const [economyForm, setEconomyForm] = useState<EconomyFormState>(DEFAULT_ECONOMY_FORM);
  const [isSavingEconomy, setIsSavingEconomy] = useState(false);
  const [levelRows, setLevelRows] = useState<LevelRowState[]>([]);
  const [savingLevel, setSavingLevel] = useState<number | null>(null);
  const [withdrawDateFilter, setWithdrawDateFilter] = useState("all");
  const [busyWithdrawId, setBusyWithdrawId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminWithdrawItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);
  const [referralState, setReferralState] = useState<ReferralState | null>(null);
  const [qrTarget, setQrTarget] = useState<AdminWithdrawItem | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(DEFAULT_SCHEDULE_FORM);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [deletingScheduleId, setDeletingScheduleId] = useState<number | null>(null);

  const users = snapshot?.users ?? [];
  const tasks = snapshot?.tasks ?? [];
  const giftCodes = snapshot?.giftCodes ?? [];
  const pendingWithdraws = snapshot?.pendingWithdraws ?? [];
  const levels = snapshot?.levels ?? [];
  const flappyConfig = snapshot?.flappyConfig ?? { rewardGold: 0, rewardDiamonds: 0 };
  const economyConfig = snapshot?.economyConfig ?? EMPTY_ECONOMY_CONFIG;
  const liveNowMs = liveTickMs + serverOffsetMs;
  const activeMiningUsersCount = useMemo(() => users.filter((user) => isAdminUserMiningActive(user)).length, [users]);
  const projectedTotalGold = useMemo(
    () => users.reduce((sum, user) => sum + getProjectedAdminUserGold(user, liveNowMs), 0),
    [liveNowMs, users],
  );

  const setSuccessNotice = useCallback((message: string) => {
    setNotice({ tone: "success", message });
  }, []);

  const setErrorNotice = useCallback((message: string) => {
    setNotice({ tone: "error", message });
  }, []);

  const syncTabWithLocation = useCallback((replace = false) => {
    if (typeof window === "undefined") {
      return "dashboard" as const;
    }

    const nextTab = getAdminTabFromPath(window.location.pathname);
    const expectedPath = getAdminTabPath(nextTab);

    if (replace && window.location.pathname !== expectedPath) {
      window.history.replaceState(null, "", expectedPath);
    }

    setSelectedTab(nextTab);
    return nextTab;
  }, []);

  const navigateToTab = useCallback((tab: AdminTab, options?: { replace?: boolean }) => {
    if (typeof window !== "undefined") {
      const targetPath = getAdminTabPath(tab);

      if (window.location.pathname !== targetPath) {
        if (options?.replace) {
          window.history.replaceState(null, "", targetPath);
        } else {
          window.history.pushState(null, "", targetPath);
        }
      }
    }

    setSelectedTab(tab);
  }, []);

  const logout = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_KEY);
    }

    setToken("");
    setSnapshot(null);
    setScheduleItems([]);
    navigateToTab("dashboard", { replace: true });
    setSyncError("");
    setLastUpdatedAt(null);
    setLoginError("");
    setRealtimeState("live");
  }, [navigateToTab]);

  const adminFetch = useCallback(
    async <T,>(endpoint: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `AdminPass ${token}`);

      if (init?.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const response = await fetch(endpoint, {
        ...init,
        headers,
      });

      const rawText = await response.text();
      let payload: unknown = null;

      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        payload = rawText;
      }

      if (response.status === 401 || response.status === 403) {
        logout();
        throw new Error(parseApiError(payload, "Phiên đăng nhập admin đã hết hạn."));
      }

      if (!response.ok) {
        throw new Error(parseApiError(payload, `Request failed with status ${response.status}`));
      }

      return payload as T;
    },
    [logout, token],
  );

  const refreshAll = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token) {
        setIsBootstrapping(false);
        return;
      }

      const sequence = requestSeqRef.current + 1;
      requestSeqRef.current = sequence;

      if (!options?.silent) {
        setIsRefreshing(true);
      }

      try {
        const [adminDataPayload, schedulePayload] = await Promise.all([
          adminFetch<unknown>("/api/admin/data"),
          adminFetch<unknown>("/api/admin/lucky-draw/schedule"),
        ]);

        if (requestSeqRef.current !== sequence) {
          return;
        }

        const normalizedSnapshot = normalizeAdminSnapshot(adminDataPayload);
        const receivedAt = Date.now();
        setSnapshot(normalizedSnapshot);
        setServerOffsetMs(normalizedSnapshot.serverTime - receivedAt);
        setLiveTickMs(receivedAt);
        setScheduleItems(normalizeScheduleItems(schedulePayload));
        setSyncError("");
        setLastUpdatedAt(receivedAt);
      } catch (error) {
        if (requestSeqRef.current !== sequence) {
          return;
        }

        setSyncError(error instanceof Error ? error.message : "Không thể đồng bộ dữ liệu admin.");
      } finally {
        if (requestSeqRef.current === sequence) {
          if (!options?.silent) {
            setIsRefreshing(false);
          }

          setIsBootstrapping(false);
        }
      }
    },
    [adminFetch, token],
  );

  const scheduleSilentRefresh = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (realtimeRefreshTimeoutRef.current !== null) {
      return;
    }

    realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
      realtimeRefreshTimeoutRef.current = null;
      void refreshAll({ silent: true });
    }, 160);
  }, [refreshAll]);

  const openReferrals = useCallback(
    async (user: AdminUser) => {
      setReferralState({
        user,
        items: [],
        isLoading: true,
        error: "",
      });

      try {
        const payload = await adminFetch<unknown>(`/api/admin/referrals/${user.teleId}`);
        setReferralState({
          user,
          items: normalizeReferrals(payload),
          isLoading: false,
          error: "",
        });
      } catch (error) {
        setReferralState({
          user,
          items: [],
          isLoading: false,
          error: error instanceof Error ? error.message : "Không tải được danh sách ref.",
        });
      }
    },
    [adminFetch],
  );

  useEffect(() => {
    return () => {
      if (realtimeRefreshTimeoutRef.current !== null) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    syncTabWithLocation(true);

    const handlePopState = () => {
      syncTabWithLocation();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [syncTabWithLocation]);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setNotice(null);
    }, 3600);

    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    setFlappyForm({
      rewardGold: String(flappyConfig.rewardGold),
      rewardDiamonds: String(flappyConfig.rewardDiamonds),
    });
  }, [flappyConfig.rewardDiamonds, flappyConfig.rewardGold]);

  useEffect(() => {
    setEconomyForm(toEconomyForm(economyConfig));
  }, [
    economyConfig.exchangeGoldPerDiamond,
    economyConfig.newUserDiamonds,
    economyConfig.newUserGold,
    economyConfig.referralRewardDiamonds,
    economyConfig.referralRewardGold,
    economyConfig.taskMilestoneCount,
    economyConfig.taskMilestoneRewardDiamonds,
    economyConfig.taskMilestoneRewardGold,
    economyConfig.withdrawMinGold,
    economyConfig.withdrawVndPerGold,
  ]);

  useEffect(() => {
    setLevelRows(
      [...levels]
        .sort((a, b) => a.level - b.level)
        .map((level) => ({
          level: level.level,
          miningRate: String(level.miningRate),
          upgradeCost: String(level.upgradeCost),
        })),
    );
  }, [levels]);

  useEffect(() => {
    setUserPage(1);
  }, [userSearch]);

  useEffect(() => {
    if (!token) {
      setIsBootstrapping(false);
      setRealtimeState("live");
      setServerOffsetMs(0);
      setLiveTickMs(Date.now());
      return;
    }

    void refreshAll();
  }, [refreshAll, token]);

  useEffect(() => {
    if (typeof window === "undefined" || activeMiningUsersCount === 0) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setLiveTickMs(Date.now());
    }, LIVE_GOLD_TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeMiningUsersCount]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    let isDisposed = false;
    let reconnectTimer: number | null = null;
    let source: EventSource | null = null;

    const connect = () => {
      if (isDisposed) {
        return;
      }

      setRealtimeState("connecting");
      source = new EventSource(`/api/admin/events?token=${encodeURIComponent(token)}`);

      source.addEventListener("connected", () => {
        setRealtimeState("live");
        scheduleSilentRefresh();
      });

      source.addEventListener("admin-refresh", () => {
        setRealtimeState("live");
        scheduleSilentRefresh();
      });

      source.onerror = () => {
        if (isDisposed) {
          return;
        }

        if (reconnectTimer !== null) {
          return;
        }

        setRealtimeState("retrying");
        source?.close();
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, REALTIME_RECONNECT_MS);
      };
    };

    connect();

    return () => {
      isDisposed = true;

      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }

      source?.close();
    };
  }, [scheduleSilentRefresh, token]);

  useEffect(() => {
    const runForegroundSync = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      scheduleSilentRefresh();
    };

    window.addEventListener("focus", runForegroundSync);
    document.addEventListener("visibilitychange", runForegroundSync);

    return () => {
      window.removeEventListener("focus", runForegroundSync);
      document.removeEventListener("visibilitychange", runForegroundSync);
    };
  }, [scheduleSilentRefresh]);

  const filteredUsers = useMemo(() => {
    const keyword = userSearch.trim().toLowerCase();

    if (!keyword) {
      return users;
    }

    return users.filter((user) => {
      return (
        user.username.toLowerCase().includes(keyword) ||
        String(user.teleId).includes(keyword) ||
        user.tgHandle.toLowerCase().includes(keyword) ||
        user.ipAddress.toLowerCase().includes(keyword)
      );
    });
  }, [userSearch, users]);

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const safeUserPage = Math.min(userPage, totalUserPages);
  const pagedUsers = filteredUsers.slice((safeUserPage - 1) * USERS_PER_PAGE, safeUserPage * USERS_PER_PAGE);

  useEffect(() => {
    if (userPage !== safeUserPage) {
      setUserPage(safeUserPage);
    }
  }, [safeUserPage, userPage]);

  const withdrawDateOptions = useMemo(() => {
    return Array.from(
      new Set(
        pendingWithdraws
          .map((item) => item.createdAt.slice(0, 10))
          .filter((value) => value.length > 0),
      ),
    ).sort((a, b) => b.localeCompare(a));
  }, [pendingWithdraws]);

  useEffect(() => {
    if (withdrawDateFilter === "all") {
      return;
    }

    if (!withdrawDateOptions.includes(withdrawDateFilter)) {
      setWithdrawDateFilter("all");
    }
  }, [withdrawDateFilter, withdrawDateOptions]);

  const filteredWithdraws = useMemo(() => {
    if (withdrawDateFilter === "all") {
      return pendingWithdraws;
    }

    return pendingWithdraws.filter((item) => item.createdAt.startsWith(withdrawDateFilter));
  }, [pendingWithdraws, withdrawDateFilter]);

  const topFlappyUsers = useMemo(() => {
    return [...users]
      .filter((user) => user.flappyBestScore > 0)
      .sort((a, b) => b.flappyBestScore - a.flappyBestScore)
      .slice(0, 5);
  }, [users]);

  const levelHighlights = useMemo(() => {
    return [...levels].sort((a, b) => a.level - b.level).slice(0, 5);
  }, [levels]);

  const duplicatedIpCount = useMemo(() => {
    const groups = new Map<string, number>();

    users.forEach((user) => {
      if (!user.ipAddress) {
        return;
      }

      groups.set(user.ipAddress, (groups.get(user.ipAddress) ?? 0) + 1);
    });

    let duplicates = 0;
    groups.forEach((count) => {
      if (count > 1) {
        duplicates += count;
      }
    });

    return duplicates;
  }, [users]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: credentials.username.trim(),
          password: credentials.password,
        }),
      });

      const payload = (await response.json()) as unknown;

      if (!response.ok || !isRecord(payload) || payload.success !== true || !toText(payload.token)) {
        throw new Error(parseApiError(payload, "Đăng nhập admin thất bại."));
      }

      const nextToken = toText(payload.token);
      window.localStorage.setItem(TOKEN_KEY, nextToken);
      setToken(nextToken);
      setIsBootstrapping(true);
      navigateToTab(selectedTab, { replace: true });
      setCredentials({ username: "", password: "" });
      setRealtimeState("connecting");
      setSuccessNotice("Đăng nhập admin thành công.");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Không thể đăng nhập admin.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleUserSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!userEdit) {
      return;
    }

    setIsSavingUser(true);

    try {
      await adminFetch("/api/admin/user/update", {
        method: "POST",
        body: JSON.stringify({
          teleId: userEdit.teleId,
          gold: Math.max(0, Math.floor(Number(userEdit.gold || 0))),
          diamonds: Math.max(0, Math.floor(Number(userEdit.diamonds || 0))),
        }),
      });

      await refreshAll({ silent: true });
      setUserEdit(null);
      setSuccessNotice(`Đã cập nhật user ${userEdit.username || userEdit.teleId}.`);
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : "Không thể lưu thay đổi user.");
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleTaskSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingTask(true);

    try {
      await adminFetch("/api/admin/config/task", {
        method: "POST",
        body: JSON.stringify({
          id: taskForm.id.trim(),
          title: taskForm.title.trim(),
          icon: taskForm.icon.trim(),
          rewardType: taskForm.rewardType,
          rewardAmount: Math.max(0, Math.floor(Number(taskForm.rewardAmount || 0))),
          url: taskForm.url.trim(),
          type: taskForm.type,
          actionType: taskForm.actionType,
          telegramChatId: taskForm.telegramChatId.trim(),
          telegramMessageId: "",
        }),
      });

      await refreshAll({ silent: true });
      setTaskForm(DEFAULT_TASK_FORM);
      setSuccessNotice("Đã lưu nhiệm vụ.");
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : "Không thể lưu nhiệm vụ.");
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleTaskDelete = async (taskId: string) => {
    const shouldDelete = window.confirm(`Xóa nhiệm vụ ${taskId}?`);
    if (!shouldDelete) {
      return;
    }

    try {
      await adminFetch(`/api/admin/config/task/${taskId}`, { method: "DELETE" });
      await refreshAll({ silent: true });
      setSuccessNotice(`Đã xóa nhiệm vụ ${taskId}.`);
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : "Không thể xóa nhiệm vụ.");
    }
  };

  const handleGiftCodeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingGiftCode(true);

    try {
      await adminFetch("/api/admin/giftcode/add", {
        method: "POST",
        body: JSON.stringify({
          code: giftCodeForm.code.trim(),
          rewardGold: Math.max(0, Math.floor(Number(giftCodeForm.rewardGold || 0))),
          rewardDiamonds: Math.max(0, Math.floor(Number(giftCodeForm.rewardDiamonds || 0))),
          maxUses: Math.max(1, Math.floor(Number(giftCodeForm.maxUses || 1))),
        }),
      });

      await refreshAll({ silent: true });
      setGiftCodeForm(DEFAULT_GIFTCODE_FORM);
      setSuccessNotice(`Đã tạo gift code ${giftCodeForm.code.trim().toUpperCase()}.`);
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : "Không thể tạo gift code.");
    } finally {
      setIsSavingGiftCode(false);
    }
  };

  const handleGiftCodeDelete = async (code: string) => {
    const shouldDelete = window.confirm(`Xóa gift code ${code}?`);
    if (!shouldDelete) {
      return;
    }

    try {
      await adminFetch("/api/admin/giftcode/delete", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      await refreshAll({ silent: true });
      setSuccessNotice(`Đã xóa gift code ${code}.`);
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : "Không thể xóa gift code.");
    }
  };

  const handleApproveWithdraw = async (withdraw: AdminWithdrawItem) => {
    setBusyWithdrawId(withdraw.id);

    try {
      await adminFetch("/api/admin/withdraw/status", {
        method: "POST",
        body: JSON.stringify({
          withdrawId: withdraw.id,
          newStatus: "Thành công",
          reason: "",
        }),
      });

      await refreshAll({ silent: true });
      setSuccessNotice(`Đã duyệt lệnh rút #${withdraw.id}.`);
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : "Không thể duyệt lệnh rút.");
    } finally {
      setBusyWithdrawId(null);
    }
  };

  const handleRejectWithdraw = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!rejectTarget) {
      return;
    }

    setIsSubmittingReject(true);

    try {
      await adminFetch("/api/admin/withdraw/status", {
        method: "POST",
        body: JSON.stringify({
          withdrawId: rejectTarget.id,
          newStatus: "Bị từ chối",
          reason: rejectReason.trim() || "Vi phạm chính sách",
        }),
      });

      await refreshAll({ silent: true });
      setSuccessNotice(`Đã từ chối lệnh rút #${rejectTarget.id}.`);
      setRejectTarget(null);
      setRejectReason("");
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : "Không thể từ chối lệnh rút.");
    } finally {
      setIsSubmittingReject(false);
    }
  };

  const handleFlappySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingFlappy(true);

    try {
      await adminFetch("/api/admin/flappy/config", {
        method: "POST",
        body: JSON.stringify({
          rewardGold: Math.max(0, Math.floor(Number(flappyForm.rewardGold || 0))),
          rewardDiamonds: Math.max(0, Math.floor(Number(flappyForm.rewardDiamonds || 0))),
        }),
      });

      await refreshAll({ silent: true });
      setSuccessNotice("Đã cập nhật thưởng Flappy best score.");
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : "Không thể cập nhật Flappy reward.");
    } finally {
      setIsSavingFlappy(false);
    }
  };

  const handleEconomySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingEconomy(true);

    try {
      await adminFetch("/api/admin/economy-config", {
        method: "POST",
        body: JSON.stringify({
          newUserGold: Math.max(0, Math.floor(Number(economyForm.newUserGold || 0))),
          newUserDiamonds: Math.max(0, Math.floor(Number(economyForm.newUserDiamonds || 0))),
          referralRewardGold: Math.max(0, Math.floor(Number(economyForm.referralRewardGold || 0))),
          referralRewardDiamonds: Math.max(0, Math.floor(Number(economyForm.referralRewardDiamonds || 0))),
          exchangeGoldPerDiamond: Math.max(1, Math.floor(Number(economyForm.exchangeGoldPerDiamond || 1))),
          withdrawMinGold: Math.max(0, Math.floor(Number(economyForm.withdrawMinGold || 0))),
          withdrawVndPerGold: Math.max(0, Number(economyForm.withdrawVndPerGold || 0)),
          taskMilestoneCount: Math.max(0, Math.floor(Number(economyForm.taskMilestoneCount || 0))),
          taskMilestoneRewardGold: Math.max(0, Math.floor(Number(economyForm.taskMilestoneRewardGold || 0))),
          taskMilestoneRewardDiamonds: Math.max(
            0,
            Math.floor(Number(economyForm.taskMilestoneRewardDiamonds || 0)),
          ),
        }),
      });

      await refreshAll({ silent: true });
      setSuccessNotice("Đã cập nhật cấu hình kinh tế.");
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : "Không thể lưu cấu hình kinh tế.");
    } finally {
      setIsSavingEconomy(false);
    }
  };

  const handleLevelRowSave = async (row: LevelRowState) => {
    setSavingLevel(row.level);

    try {
      await adminFetch("/api/admin/config/level", {
        method: "POST",
        body: JSON.stringify({
          level: row.level,
          miningRate: Math.max(0, Math.floor(Number(row.miningRate || 0))),
          upgradeCost: Math.max(0, Math.floor(Number(row.upgradeCost || 0))),
        }),
      });

      await refreshAll({ silent: true });
      setSuccessNotice(`Đã cập nhật level ${row.level}.`);
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : `Không thể lưu level ${row.level}.`);
    } finally {
      setSavingLevel(null);
    }
  };

  const handleScheduleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingSchedule(true);

    try {
      await adminFetch("/api/admin/lucky-draw/schedule", {
        method: "POST",
        body: JSON.stringify({
          date: scheduleForm.date,
          rank: Math.max(1, Math.floor(Number(scheduleForm.rank || 1))),
          teleId: scheduleForm.winnerType === "real" ? scheduleForm.value.trim() : "",
          fakeName: scheduleForm.winnerType === "fake" ? scheduleForm.value.trim() : "",
        }),
      });

      await refreshAll({ silent: true });
      setScheduleForm({
        ...DEFAULT_SCHEDULE_FORM,
        date: scheduleForm.date,
      });
      setSuccessNotice("Đã lưu lịch vận may.");
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : "Không thể lưu lịch vận may.");
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleScheduleDelete = async (item: LuckyScheduleItem) => {
    const shouldDelete = window.confirm(`Xóa lịch ngày ${item.drawDate} top ${item.rankPos}?`);
    if (!shouldDelete) {
      return;
    }

    setDeletingScheduleId(item.id);

    try {
      await adminFetch(`/api/admin/lucky-draw/schedule/${item.id}`, { method: "DELETE" });
      await refreshAll({ silent: true });
      setSuccessNotice(`Đã xóa lịch top ${item.rankPos}.`);
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : "Không thể xóa lịch vận may.");
    } finally {
      setDeletingScheduleId(null);
    }
  };

  const copyAdminLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/khaidz`);
      setSuccessNotice("Đã copy link admin /khaidz.");
    } catch {
      setErrorNotice("Không copy được link admin.");
    }
  };

  const realtimeLabel = lastUpdatedAt ? formatDateTime(new Date(lastUpdatedAt).toISOString()) : "--";
  const realtimeStatusLabel =
    realtimeState === "live" ? "Realtime SSE đang chạy" : realtimeState === "connecting" ? "Đang nối realtime" : "Mất kết nối, đang thử lại";
  const realtimeDotClassName =
    realtimeState === "live"
      ? "bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]"
      : realtimeState === "connecting"
        ? "bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.7)]"
        : "bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.7)]";

  if (!token) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(77,184,255,0.18),transparent_34%),linear-gradient(180deg,#08111b_0%,#04080d_100%)] px-4 py-8 text-slate-100 sm:px-6">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-[-12rem] top-[-8rem] h-80 w-80 rounded-full bg-cyan-400/15 blur-[110px]" />
          <div className="absolute right-[-10rem] top-16 h-72 w-72 rounded-full bg-blue-500/18 blur-[100px]" />
          <div className="absolute bottom-0 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-400/8 blur-[120px]" />
        </div>

        <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
          <div className="grid w-full gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-400/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-100/90">
                <Shield className="h-4 w-4" />
                Khaidz Admin Realtime
              </div>

              <div>
                <h1 className="max-w-3xl text-4xl font-black uppercase leading-none text-slate-50 sm:text-5xl">
                  `khaidz` đã lên
                  <span className="block bg-[linear-gradient(180deg,#c9f7ff_0%,#7addff_45%,#1f95d4_100%)] bg-clip-text text-transparent">
                    TSX chuẩn và realtime
                  </span>
                </h1>
                <p className="hidden mt-5 max-w-2xl text-base leading-7 text-slate-300/78 sm:text-lg">
                  Web admin mới chạy bằng React + TypeScript, sync dữ liệu lại theo nhịp 10 giây, tự refresh khi tab
                  quay lại foreground và tránh ghi đè state cũ bằng request đến sau.
                </p>
                <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300/78 sm:text-lg">
                  Web admin React + TypeScript nay vao bang router `/khaidz/*` va nhan push realtime tu backend, khong con
                  phai doi vong poll cu de thay du lieu moi.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Stack"
                  value="TSX"
                  detail="Không còn phụ thuộc panel PHP/JS cũ."
                  icon={Sparkles}
                  accentClassName="text-cyan-200"
                />
                <MetricCard
                  label="Realtime"
                  value="SSE"
                  detail="Push trực tiếp từ backend + focus sync."
                  icon={RefreshCcw}
                  accentClassName="text-emerald-200"
                />
                <MetricCard
                  label="Logic"
                  value="Safe"
                  detail="Có chống race-condition khi refresh."
                  icon={Shield}
                  accentClassName="text-yellow-200"
                />
              </div>
            </div>

            <ShellCard className="p-6 sm:p-8">
              <div className="mx-auto max-w-md">
                <div className="mb-8 flex items-center gap-4">
                  <div className="rounded-[28px] border border-cyan-300/18 bg-cyan-400/12 p-4 text-cyan-100">
                    <Shield className="h-8 w-8" />
                  </div>

                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">Đăng nhập quản trị</p>
                    <h2 className="mt-2 text-3xl font-black uppercase text-slate-50">Admin Login</h2>
                  </div>
                </div>

                <form className="space-y-5" onSubmit={handleLogin}>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
                      Username
                    </label>
                    <input
                      type="text"
                      value={credentials.username}
                      onChange={(event) =>
                        setCredentials((current) => ({
                          ...current,
                          username: event.target.value,
                        }))
                      }
                      className={INPUT_CLASS}
                      placeholder="khaidzs1tg"
                      autoComplete="username"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
                      Password
                    </label>
                    <input
                      type="password"
                      value={credentials.password}
                      onChange={(event) =>
                        setCredentials((current) => ({
                          ...current,
                          password: event.target.value,
                        }))
                      }
                      className={INPUT_CLASS}
                      placeholder="••••••••"
                      autoComplete="current-password"
                    />
                  </div>

                  {loginError ? (
                    <div className="rounded-2xl border border-red-300/15 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                      {loginError}
                    </div>
                  ) : null}

                  <button type="submit" disabled={isLoggingIn} className={cn(PRIMARY_BUTTON_CLASS, "w-full py-4")}>
                    {isLoggingIn ? <LoadingSpinner /> : <Shield className="h-4 w-4" />}
                    {isLoggingIn ? "Đang xác thực..." : "Vào trang admin"}
                  </button>
                </form>
              </div>
            </ShellCard>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(66,153,225,0.18),transparent_25%),radial-gradient(circle_at_bottom_right,rgba(250,204,21,0.08),transparent_25%),linear-gradient(180deg,#08111b_0%,#04080d_100%)] text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10rem] top-[-6rem] h-80 w-80 rounded-full bg-cyan-400/12 blur-[120px]" />
        <div className="absolute right-[-8rem] top-24 h-72 w-72 rounded-full bg-blue-500/10 blur-[110px]" />
        <div className="absolute bottom-[-12rem] left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-amber-400/8 blur-[130px]" />
      </div>

      <div className="relative mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-5 sm:px-6 lg:flex-row lg:items-start lg:px-7">
        <aside className={cn(PANEL_CLASS, "flex shrink-0 flex-col overflow-hidden lg:sticky lg:top-5 lg:w-[290px]")}>
          <div className="border-b border-white/6 px-5 py-6">
            <div className="flex items-center gap-4">
              <div className="rounded-[28px] bg-[linear-gradient(180deg,#8ae8ff_0%,#31aee9_48%,#1256aa_100%)] p-4 text-slate-950 shadow-[0_18px_40px_rgba(52,144,220,0.28)]">
                <Shield className="h-7 w-7" />
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-100/70">Khai Dz System</p>
                <h1 className="mt-2 text-2xl font-black uppercase text-slate-50">Admin Panel</h1>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-cyan-200/10 bg-cyan-400/8 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-100/70">Realtime status</p>
              <div className="mt-3 flex items-center gap-2 text-sm text-transparent">
                <span className={cn("h-2.5 w-2.5 rounded-full", realtimeDotClassName)} />
                <span className="text-slate-200">{realtimeStatusLabel}</span>
                Realtime SSE trực tiếp
              </div>
              <p className="mt-2 text-sm text-slate-300/72">Lần sync gần nhất: {realtimeLabel}</p>
            </div>
          </div>

          <nav className="grid gap-2 px-4 py-4">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = selectedTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => navigateToTab(tab.id)}
                  className={cn(
                    "group flex items-center gap-3 rounded-[24px] border px-4 py-3 text-left transition",
                    isActive
                      ? "border-cyan-200/18 bg-cyan-400/12 text-white shadow-[0_20px_35px_rgba(5,15,24,0.28)]"
                      : "border-transparent bg-transparent text-slate-300/75 hover:border-white/6 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <div
                    className={cn(
                      "rounded-2xl p-2.5 transition",
                      isActive
                        ? `bg-gradient-to-br ${tab.accent} text-slate-950`
                        : "border border-white/6 bg-black/20 text-slate-300 group-hover:border-white/12 group-hover:text-white",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold uppercase tracking-[0.16em]">{tab.label}</div>
                    <div className="mt-1 text-xs text-slate-400/85">
                      {tab.id === "dashboard" ? "Toàn cảnh hệ thống" : null}
                      {tab.id === "economy" ? "Set vàng, KC, giá và mốc thưởng" : null}
                      {tab.id === "users" ? "Tìm user và chỉnh tài nguyên" : null}
                      {tab.id === "tasks" ? "Task click, join, react heart" : null}
                      {tab.id === "giftcodes" ? "Code thưởng đang hoạt động" : null}
                      {tab.id === "withdrawals" ? "Duyệt lệnh rút theo thời gian thực" : null}
                      {tab.id === "lucky_draw" ? "Lịch sắp top vận may" : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-white/6 px-4 py-4">
            <button type="button" onClick={logout} className={cn(DANGER_BUTTON_CLASS, "w-full")}>
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          <ShellCard>
            <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/12 bg-cyan-400/8 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-100/75">
                    <Sparkles className="h-4 w-4" />
                    Admin Web TSX
                  </div>

                  <h2 className="mt-4 text-3xl font-black uppercase leading-none text-slate-50 sm:text-4xl">
                    Quản trị `khaidz`
                  </h2>
                  <p className="hidden mt-3 max-w-3xl text-sm leading-6 text-slate-300/75 sm:text-base">
                    Panel mới đang đọc trực tiếp API admin hiện tại và tự sync lại theo nhịp realtime. Khi tab được focus
                    lại, dữ liệu được kéo mới ngay thay vì chờ vòng poll cũ.
                  </p>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300/75 sm:text-base">
                    Panel nay doc thang API admin hien tai, dong bo bang SSE realtime va van sync lai ngay khi tab duoc
                    focus de tranh tre du lieu.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void refreshAll()}
                    disabled={isRefreshing}
                    className={SECONDARY_BUTTON_CLASS}
                  >
                    {isRefreshing ? <LoadingSpinner /> : <RefreshCcw className="h-4 w-4" />}
                    {isRefreshing ? "Đang sync..." : "Sync ngay"}
                  </button>

                  <button type="button" onClick={() => void copyAdminLink()} className={SECONDARY_BUTTON_CLASS}>
                    <Copy className="h-4 w-4" />
                    Copy link
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 lg:hidden">
                {TABS.map((tab) => {
                  const Icon = tab.icon;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => navigateToTab(tab.id)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] transition",
                        selectedTab === tab.id
                          ? "border-cyan-200/18 bg-cyan-400/12 text-white"
                          : "border-white/8 bg-white/5 text-slate-300/75 hover:text-white",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {notice ? (
                <div className={cn("rounded-2xl border px-4 py-3 text-sm", getNoticeClassName(notice.tone))}>
                  {notice.message}
                </div>
              ) : null}

              {syncError ? (
                <div className="rounded-2xl border border-red-300/15 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {syncError}
                </div>
              ) : null}
            </div>
          </ShellCard>

          {isBootstrapping ? (
            <ShellCard className="px-5 py-14 sm:px-6">
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <div className="rounded-full border border-cyan-200/12 bg-cyan-400/10 p-4">
                  <LoadingSpinner className="h-7 w-7 text-cyan-100" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-100/75">Đang đồng bộ</p>
                  <p className="mt-2 text-base text-slate-300/75">Kéo dữ liệu admin mới nhất từ backend...</p>
                </div>
              </div>
            </ShellCard>
          ) : null}

          {!isBootstrapping && selectedTab === "dashboard" ? (
            <>
              <div className="grid gap-4 xl:grid-cols-4">
                <MetricCard
                  label="Tổng user"
                  value={formatNumber(users.length)}
                  detail={`Có ${formatNumber(duplicatedIpCount)} tài khoản nằm trong cụm IP trùng.`}
                  icon={Users}
                  accentClassName="text-cyan-100"
                />
                <MetricCard
                  label="Chờ rút"
                  value={formatNumber(pendingWithdraws.length)}
                  detail="Danh sách này tự cập nhật theo nhịp polling realtime."
                  icon={Wallet}
                  accentClassName="text-yellow-100"
                />
                <MetricCard
                  label="Tổng vàng"
                  value={formatNumber(projectedTotalGold)}
                  detail={
                    activeMiningUsersCount > 0
                      ? `Đang cộng realtime cho ${formatNumber(activeMiningUsersCount)} user đang đào.`
                      : "Lưu thông toàn hệ thống hiện tại."
                  }
                  icon={Crown}
                  accentClassName="text-amber-100"
                />
                <MetricCard
                  label="Tổng KC"
                  value={formatNumber(snapshot?.totalDiamonds ?? 0)}
                  detail={`${formatNumber(tasks.length)} nhiệm vụ đang hoạt động.`}
                  icon={Sparkles}
                  accentClassName="text-violet-100"
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <ShellCard>
                  <SectionHeading
                    icon={Wallet}
                    title="Lệnh rút đang chờ"
                    description="Khối này nổi lên trước để admin không bỏ sót lệnh cần duyệt."
                  />

                  <div className="space-y-4 px-5 py-5 sm:px-6">
                    {pendingWithdraws.length === 0 ? (
                      <div className="rounded-[24px] border border-white/8 bg-white/4 px-5 py-7 text-sm text-slate-300/72">
                        Không có lệnh rút nào đang chờ xử lý.
                      </div>
                    ) : (
                      pendingWithdraws.slice(0, 4).map((item) => (
                        <div key={item.id} className="rounded-[24px] border border-white/8 bg-white/4 p-4">
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-lg font-black text-slate-50">{item.username}</p>
                                <span className={cn("rounded-full border px-3 py-1 text-[11px] font-bold", getStatusChipClassName(item.status))}>
                                  {item.status}
                                </span>
                              </div>
                              <p className="mt-2 text-sm text-slate-300/75">
                                #{item.id} · ID {item.teleId} · {item.bankName} · {item.accountNumber}
                              </p>
                              <p className="mt-1 text-sm text-slate-400">{formatDateTime(item.createdAt)}</p>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                              <div className="rounded-2xl border border-amber-200/12 bg-amber-500/8 px-4 py-2 text-sm font-bold text-amber-100">
                                {formatNumber(item.vnd)} VND
                              </div>
                              <button type="button" onClick={() => setQrTarget(item)} className={SECONDARY_BUTTON_CLASS}>
                                <QrCode className="h-4 w-4" />
                                QR
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleApproveWithdraw(item)}
                                disabled={busyWithdrawId === item.id}
                                className={PRIMARY_BUTTON_CLASS}
                              >
                                {busyWithdrawId === item.id ? <LoadingSpinner /> : <CheckCircle2 className="h-4 w-4" />}
                                Duyệt
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectTarget(item);
                                  setRejectReason(item.message || "");
                                }}
                                className={DANGER_BUTTON_CLASS}
                              >
                                <XCircle className="h-4 w-4" />
                                Từ chối
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ShellCard>

                <div className="space-y-6">
                  <ShellCard>
                    <SectionHeading
                      icon={Trophy}
                      title="Top Flappy"
                      description="Theo `flappyBestScore` đang lưu trong bảng users."
                    />
                    <div className="space-y-3 px-5 py-5 sm:px-6">
                      {topFlappyUsers.length === 0 ? (
                        <div className="rounded-[24px] border border-white/8 bg-white/4 px-4 py-5 text-sm text-slate-300/72">
                          Chưa có người chơi phá score.
                        </div>
                      ) : (
                        topFlappyUsers.map((user, index) => (
                          <div key={user.teleId} className="flex items-center justify-between rounded-[22px] border border-white/8 bg-white/4 px-4 py-3">
                            <div>
                              <p className="text-sm font-black text-slate-50">
                                {index + 1}. {user.username}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">ID {user.teleId}</p>
                            </div>
                            <div className="rounded-full border border-cyan-200/12 bg-cyan-400/8 px-3 py-1 text-sm font-bold text-cyan-100">
                              {formatNumber(user.flappyBestScore)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ShellCard>

                  <ShellCard>
                    <SectionHeading
                      icon={Sparkles}
                      title="Mốc level"
                      description="Đọc nhanh `level_settings` để đối chiếu backend."
                    />
                    <div className="space-y-3 px-5 py-5 sm:px-6">
                      {levelHighlights.length === 0 ? (
                        <div className="rounded-[24px] border border-white/8 bg-white/4 px-4 py-5 text-sm text-slate-300/72">
                          Chưa có cấu hình level.
                        </div>
                      ) : (
                        levelHighlights.map((level) => (
                          <div key={level.level} className="flex items-center justify-between rounded-[22px] border border-white/8 bg-white/4 px-4 py-3">
                            <div>
                              <p className="text-sm font-black text-slate-50">Level {level.level}</p>
                              <p className="mt-1 text-xs text-slate-400">Mining {formatNumber(level.miningRate)}/ca</p>
                            </div>
                            <div className="text-sm font-bold text-amber-100">{formatNumber(level.upgradeCost)} vàng</div>
                          </div>
                        ))
                      )}
                    </div>
                  </ShellCard>
                </div>
              </div>
            </>
          ) : null}

          {!isBootstrapping && selectedTab === "economy" ? (
            <>
              <div className="grid gap-4 xl:grid-cols-4">
                <MetricCard
                  label="Mời bạn"
                  value={`+${formatNumber(economyConfig.referralRewardGold)}`}
                  detail={
                    economyConfig.referralRewardDiamonds > 0
                      ? `Them ${formatNumber(economyConfig.referralRewardDiamonds)} KC cho moi ref.`
                      : "Thuong vang moi khi tao ref thanh cong."
                  }
                  icon={Users}
                  accentClassName="text-amber-100"
                />
                <MetricCard
                  label="Quy đổi"
                  value={formatNumber(economyConfig.exchangeGoldPerDiamond)}
                  detail="So vang can de doi 1 KC."
                  icon={Coins}
                  accentClassName="text-cyan-100"
                />
                <MetricCard
                  label="Rút tối thiểu"
                  value={formatNumber(economyConfig.withdrawMinGold)}
                  detail={`${formatDecimalNumber(economyConfig.withdrawVndPerGold, 6)} VND / 1 vang`}
                  icon={Wallet}
                  accentClassName="text-emerald-100"
                />
                <MetricCard
                  label="Mốc task"
                  value={
                    economyConfig.taskMilestoneCount > 0
                      ? formatNumber(economyConfig.taskMilestoneCount)
                      : "Tat"
                  }
                  detail={
                    economyConfig.taskMilestoneCount > 0
                      ? `${formatNumber(economyConfig.taskMilestoneRewardGold)} vang · ${formatNumber(
                          economyConfig.taskMilestoneRewardDiamonds,
                        )} KC`
                      : "Khong co thuong them theo moc task."
                  }
                  icon={CheckCircle2}
                  accentClassName="text-violet-100"
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                <ShellCard>
                  <SectionHeading
                    icon={Coins}
                    title="Cấu hình kinh tế"
                    description="Set các chỉ số vàng, KC, tỷ giá, ref và mốc thưởng task từ ngay trong admin."
                  />

                  <form className="space-y-5 px-5 py-5 sm:px-6" onSubmit={handleEconomySubmit}>
                    <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">User mới và mời bạn</p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                            Vàng user mới
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={economyForm.newUserGold}
                            onChange={(event) =>
                              setEconomyForm((current) => ({ ...current, newUserGold: event.target.value }))
                            }
                            className={INPUT_CLASS}
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                            KC user mới
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={economyForm.newUserDiamonds}
                            onChange={(event) =>
                              setEconomyForm((current) => ({ ...current, newUserDiamonds: event.target.value }))
                            }
                            className={INPUT_CLASS}
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                            Thưởng ref vàng
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={economyForm.referralRewardGold}
                            onChange={(event) =>
                              setEconomyForm((current) => ({ ...current, referralRewardGold: event.target.value }))
                            }
                            className={INPUT_CLASS}
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                            Thưởng ref KC
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={economyForm.referralRewardDiamonds}
                            onChange={(event) =>
                              setEconomyForm((current) => ({ ...current, referralRewardDiamonds: event.target.value }))
                            }
                            className={INPUT_CLASS}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Quy đổi và rút tiền</p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                            Vàng / 1 KC
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={economyForm.exchangeGoldPerDiamond}
                            onChange={(event) =>
                              setEconomyForm((current) => ({ ...current, exchangeGoldPerDiamond: event.target.value }))
                            }
                            className={INPUT_CLASS}
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                            Rút tối thiểu
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={economyForm.withdrawMinGold}
                            onChange={(event) =>
                              setEconomyForm((current) => ({ ...current, withdrawMinGold: event.target.value }))
                            }
                            className={INPUT_CLASS}
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                            VND / 1 vàng
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.000001"
                            value={economyForm.withdrawVndPerGold}
                            onChange={(event) =>
                              setEconomyForm((current) => ({ ...current, withdrawVndPerGold: event.target.value }))
                            }
                            className={INPUT_CLASS}
                          />
                          <p className="mt-2 text-sm text-slate-400/80">
                            Muc hien tai: {formatDecimalNumber(economyConfig.withdrawVndPerGold, 6)} VND cho moi 1 vang.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Mốc thưởng task theo ngày</p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-3">
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                            So task can dat
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={economyForm.taskMilestoneCount}
                            onChange={(event) =>
                              setEconomyForm((current) => ({ ...current, taskMilestoneCount: event.target.value }))
                            }
                            className={INPUT_CLASS}
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                            Thưởng vàng
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={economyForm.taskMilestoneRewardGold}
                            onChange={(event) =>
                              setEconomyForm((current) => ({
                                ...current,
                                taskMilestoneRewardGold: event.target.value,
                              }))
                            }
                            className={INPUT_CLASS}
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                            Thưởng KC
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={economyForm.taskMilestoneRewardDiamonds}
                            onChange={(event) =>
                              setEconomyForm((current) => ({
                                ...current,
                                taskMilestoneRewardDiamonds: event.target.value,
                              }))
                            }
                            className={INPUT_CLASS}
                          />
                        </div>
                      </div>

                      <p className="mt-3 text-sm leading-6 text-slate-400/80">
                        Moc nay tinh theo ngay gio Viet Nam. Dat 0 o so task neu muon tat thuong moc.
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm leading-6 text-slate-300/70">
                        Luu xong se ap dung cho user moi, ref, exchange, withdraw va task ngay lap tuc.
                      </p>

                      <button type="submit" disabled={isSavingEconomy} className={PRIMARY_BUTTON_CLASS}>
                        {isSavingEconomy ? <LoadingSpinner /> : <Save className="h-4 w-4" />}
                        {isSavingEconomy ? "Đang lưu..." : "Lưu cấu hình"}
                      </button>
                    </div>
                  </form>
                </ShellCard>

                <div className="space-y-6">
                  <ShellCard>
                    <SectionHeading
                      icon={Crown}
                      title="Level mining"
                      description="Set mining rate va gia nang cap cho tung level ngay trong admin."
                    />

                    <div className="space-y-4 px-5 py-5 sm:px-6">
                      {levelRows.length === 0 ? (
                        <div className="rounded-[24px] border border-white/8 bg-white/4 px-4 py-5 text-sm text-slate-300/72">
                          Chua co cau hinh level nao.
                        </div>
                      ) : (
                        levelRows.map((row) => (
                          <div key={row.level} className="rounded-[24px] border border-white/8 bg-white/4 p-4">
                            <div className="grid gap-4 xl:grid-cols-[120px_1fr_1fr_auto] xl:items-end">
                              <div className="rounded-[20px] border border-cyan-200/12 bg-cyan-400/8 px-4 py-3">
                                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-100/65">Level</p>
                                <p className="mt-2 text-2xl font-black text-slate-50">{row.level}</p>
                              </div>

                              <div>
                                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                                  Mining rate
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={row.miningRate}
                                  onChange={(event) =>
                                    setLevelRows((current) =>
                                      current.map((item) =>
                                        item.level === row.level ? { ...item, miningRate: event.target.value } : item,
                                      ),
                                    )
                                  }
                                  className={INPUT_CLASS}
                                />
                              </div>

                              <div>
                                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                                  Giá nâng cấp
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={row.upgradeCost}
                                  onChange={(event) =>
                                    setLevelRows((current) =>
                                      current.map((item) =>
                                        item.level === row.level ? { ...item, upgradeCost: event.target.value } : item,
                                      ),
                                    )
                                  }
                                  className={INPUT_CLASS}
                                />
                              </div>

                              <button
                                type="button"
                                onClick={() => void handleLevelRowSave(row)}
                                disabled={savingLevel === row.level}
                                className={PRIMARY_BUTTON_CLASS}
                              >
                                {savingLevel === row.level ? <LoadingSpinner /> : <Save className="h-4 w-4" />}
                                {savingLevel === row.level ? "Đang lưu..." : "Lưu level"}
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ShellCard>

                  <ShellCard>
                    <SectionHeading
                      icon={Sparkles}
                      title="Ghi chú nhanh"
                      description="Nhung phan thuong khac van co the set ngay tren panel hien tai."
                    />

                    <div className="space-y-3 px-5 py-5 text-sm text-slate-300/78 sm:px-6">
                      <div className="rounded-[22px] border border-white/8 bg-white/4 px-4 py-3">
                        Thuong tung task van set o tab <span className="font-bold text-slate-50">Nhiem vu</span>.
                      </div>
                      <div className="rounded-[22px] border border-white/8 bg-white/4 px-4 py-3">
                        Gift code set o tab <span className="font-bold text-slate-50">Gift code</span>.
                      </div>
                      <div className="rounded-[22px] border border-white/8 bg-white/4 px-4 py-3">
                        Thuong Flappy dang o tab <span className="font-bold text-slate-50">Van may</span>.
                      </div>
                    </div>
                  </ShellCard>
                </div>
              </div>
            </>
          ) : null}

          {!isBootstrapping && selectedTab === "users" ? (
            <ShellCard>
              <SectionHeading
                icon={Users}
                title="Người dùng"
                description="Tìm theo Tele ID, username, Telegram handle hoặc IP rồi chỉnh tài nguyên ngay."
                actions={
                  <div className="flex min-w-[260px] items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(event) => setUserSearch(event.target.value)}
                      className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      placeholder="Search TeleID, tên, @handle, IP..."
                    />
                  </div>
                }
              />

              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="border-b border-white/6 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    <tr>
                      <th className="px-5 py-4 sm:px-6">Tele ID</th>
                      <th className="px-5 py-4 sm:px-6">Người dùng</th>
                      <th className="px-5 py-4 sm:px-6">Tài nguyên</th>
                      <th className="px-5 py-4 sm:px-6">Level</th>
                      <th className="px-5 py-4 sm:px-6">IP</th>
                      <th className="px-5 py-4 sm:px-6">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/6 text-sm">
                    {pagedUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-10 text-center text-slate-400 sm:px-6">
                          Không có user khớp từ khóa hiện tại.
                        </td>
                      </tr>
                    ) : (
                      pagedUsers.map((user) => {
                        const projectedGold = getProjectedAdminUserGold(user, liveNowMs);
                        const projectedDelta = Math.max(0, projectedGold - user.gold);
                        const isMiningActive = isAdminUserMiningActive(user);

                        return (
                          <tr key={user.teleId} className="bg-white/[0.015]">
                            <td className="px-5 py-4 font-mono text-xs text-slate-400 sm:px-6">{user.teleId}</td>
                            <td className="px-5 py-4 sm:px-6">
                              <p className="font-bold text-slate-50">{user.username}</p>
                              <p className="mt-1 text-xs text-cyan-200/75">{user.tgHandle ? `@${user.tgHandle}` : "@none"}</p>
                            </td>
                            <td className="px-5 py-4 sm:px-6">
                              <div className="flex flex-col gap-1">
                                <span className="text-amber-100">{formatNumber(projectedGold)} vàng</span>
                                {isMiningActive ? (
                                  <span className="text-[11px] text-emerald-200/72">
                                    Đang đào realtime +{formatNumber(projectedDelta)}
                                  </span>
                                ) : null}
                                <span className="text-cyan-100">{formatNumber(user.diamonds)} KC</span>
                              </div>
                            </td>
                            <td className="px-5 py-4 font-bold text-slate-100 sm:px-6">Level {user.level}</td>
                            <td className="px-5 py-4 text-xs text-slate-400 sm:px-6">{user.ipAddress || "Chưa có"}</td>
                            <td className="px-5 py-4 sm:px-6">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setUserEdit({
                                      teleId: user.teleId,
                                      username: user.username,
                                      gold: String(user.gold),
                                      diamonds: String(user.diamonds),
                                    })
                                  }
                                  className={SECONDARY_BUTTON_CLASS}
                                >
                                  <Save className="h-4 w-4" />
                                  Sửa
                                </button>
                                <button type="button" onClick={() => void openReferrals(user)} className={SECONDARY_BUTTON_CLASS}>
                                  <Users className="h-4 w-4" />
                                  Ref
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-4 border-t border-white/6 px-5 py-4 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p>
                  {formatNumber(filteredUsers.length)} user khớp • trang {safeUserPage}/{totalUserPages}
                </p>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setUserPage((current) => Math.max(1, current - 1))}
                    disabled={safeUserPage <= 1}
                    className={SECONDARY_BUTTON_CLASS}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserPage((current) => Math.min(totalUserPages, current + 1))}
                    disabled={safeUserPage >= totalUserPages}
                    className={SECONDARY_BUTTON_CLASS}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </ShellCard>
          ) : null}

          {!isBootstrapping && selectedTab === "tasks" ? (
            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <ShellCard>
                <SectionHeading
                  icon={Swords}
                  title="Thêm Nhiệm Vụ Mới"
                  description="Giữ đúng bộ field của form cũ để thêm task click, join và react_heart nhanh hơn."
                />

                <form className="grid gap-4 px-5 py-5 sm:px-6" onSubmit={handleTaskSubmit}>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                      ID Nhiệm Vụ (Duy nhất, không dấu)
                    </label>
                    <input
                      type="text"
                      value={taskForm.id}
                      onChange={(event) => setTaskForm((current) => ({ ...current, id: event.target.value }))}
                      className={INPUT_CLASS}
                      placeholder="Ví dụ: join_group_v2"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Tiêu đề</label>
                    <input
                      type="text"
                      value={taskForm.title}
                      onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                      className={INPUT_CLASS}
                      placeholder="Ví dụ: Tham gia Group"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Icon (URL/Emoji)</label>
                    <input
                      type="text"
                      value={taskForm.icon}
                      onChange={(event) => setTaskForm((current) => ({ ...current, icon: event.target.value }))}
                      className={INPUT_CLASS}
                      placeholder="https://... hoặc 📢"
                      required
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Loại Thưởng</label>
                      <select
                        value={taskForm.rewardType}
                        onChange={(event) =>
                          setTaskForm((current) => ({
                            ...current,
                            rewardType: event.target.value as "gold" | "diamonds",
                          }))
                        }
                        className={INPUT_CLASS}
                      >
                        <option value="gold">Gold (Vàng)</option>
                        <option value="diamonds">Diamonds (KC)</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Số Lượng</label>
                      <input
                        type="number"
                        min="0"
                        value={taskForm.rewardAmount}
                        onChange={(event) => setTaskForm((current) => ({ ...current, rewardAmount: event.target.value }))}
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                        Cách Check (Hành Động)
                      </label>
                      <select
                        value={taskForm.actionType}
                        onChange={(event) =>
                          setTaskForm((current) => {
                            const nextAction = event.target.value as TaskActionType;
                            return {
                              ...current,
                              actionType: nextAction,
                              telegramChatId: nextAction === "click" ? "" : current.telegramChatId,
                              telegramMessageId: nextAction === "react_heart" ? current.telegramMessageId : "",
                            };
                          })
                        }
                        className={INPUT_CLASS}
                      >
                        <option value="react_heart">React tym (Check tha tym)</option>
                        <option value="click">Click (Chi can nhan link)</option>
                        <option value="join">Join check (Xac minh tham gia)</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Loại NV</label>
                      <select
                        value={taskForm.type}
                        onChange={(event) => setTaskForm((current) => ({ ...current, type: event.target.value as TaskType }))}
                        className={INPUT_CLASS}
                      >
                        <option value="community">Thường/Cộng đồng</option>
                        <option value="daily">Hàng ngày (Reset 24h)</option>
                        <option value="one_time">Làm 1 lần</option>
                        <option value="ad">Xem quảng cáo</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Link (Mở khi nhấn)</label>
                    <input
                      type="text"
                      value={taskForm.url}
                      onChange={(event) => setTaskForm((current) => ({ ...current, url: event.target.value }))}
                      className={INPUT_CLASS}
                      placeholder="https://t.me/..."
                    />
                  </div>

                  {taskForm.actionType === "join" || taskForm.actionType === "react_heart" ? (
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                        ID Group/Channel (Bắt đầu bằng -100...)
                      </label>
                      <input
                        type="text"
                        value={taskForm.telegramChatId}
                        onChange={(event) =>
                          setTaskForm((current) => ({
                            ...current,
                            telegramChatId: event.target.value,
                          }))
                        }
                        className={INPUT_CLASS}
                        placeholder="-100123456789"
                      />
                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        * Bot phải là Admin của Group này mới check được.
                      </p>
                      {taskForm.actionType === "react_heart" ? (
                        <p className="mt-2 text-xs leading-5 text-cyan-200/70">
                          * Nhiệm vụ react_heart sẽ ghi nhận khi user thả tim bất kỳ tin nhắn nào trong group này.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <button type="submit" disabled={isSavingTask} className={PRIMARY_BUTTON_CLASS}>
                    {isSavingTask ? <LoadingSpinner /> : <Save className="h-4 w-4" />}
                    {isSavingTask ? "Đang lưu..." : "Lưu nhiệm vụ"}
                  </button>
                </form>
              </ShellCard>

              <ShellCard>
                <SectionHeading
                  icon={Swords}
                  title="Danh sách nhiệm vụ"
                  description="Danh sách này đọc lại từ backend nên luôn đúng với dữ liệu đang chạy."
                />

                <div className="overflow-x-auto">
                  <table className="min-w-full text-left">
                    <thead className="border-b border-white/6 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                      <tr>
                        <th className="px-5 py-4 sm:px-6">Task</th>
                        <th className="px-5 py-4 sm:px-6">Reward</th>
                        <th className="px-5 py-4 sm:px-6">Type</th>
                        <th className="px-5 py-4 sm:px-6">Logic</th>
                        <th className="px-5 py-4 sm:px-6">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/6 text-sm">
                      {tasks.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-5 py-10 text-center text-slate-400 sm:px-6">
                            Chưa có nhiệm vụ nào.
                          </td>
                        </tr>
                      ) : (
                        tasks.map((task) => (
                          <tr key={task.id} className="bg-white/[0.015]">
                            <td className="px-5 py-4 sm:px-6">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-black/20 text-lg">
                                  {task.icon.startsWith("http") ? (
                                    <img src={task.icon} alt={task.title} className="h-8 w-8 rounded-xl object-cover" />
                                  ) : (
                                    task.icon
                                  )}
                                </div>
                                <div>
                                  <p className="font-black text-slate-50">{task.title}</p>
                                  <p className="mt-1 font-mono text-xs text-slate-400">#{task.id}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4 sm:px-6">
                              <span className="font-bold text-amber-100">
                                {formatNumber(task.rewardAmount)} {getRewardLabel(task.rewardType)}
                              </span>
                            </td>
                            <td className="px-5 py-4 sm:px-6">
                              <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-200">
                                {task.type}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-xs leading-5 text-slate-300/75 sm:px-6">{getTaskActionLabel(task)}</td>
                            <td className="px-5 py-4 sm:px-6">
                              <button type="button" onClick={() => void handleTaskDelete(task.id)} className={DANGER_BUTTON_CLASS}>
                                <Trash2 className="h-4 w-4" />
                                Xóa
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </ShellCard>
            </div>
          ) : null}

          {!isBootstrapping && selectedTab === "giftcodes" ? (
            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <ShellCard>
                <SectionHeading
                  icon={Gift}
                  title="Tạo gift code"
                  description="Giữ đúng API hiện tại của backend, nhưng form đã được typed và dễ sửa hơn."
                />

                <form className="grid gap-4 px-5 py-5 sm:px-6" onSubmit={handleGiftCodeSubmit}>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Code</label>
                    <input
                      type="text"
                      value={giftCodeForm.code}
                      onChange={(event) => setGiftCodeForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                      className={INPUT_CLASS}
                      placeholder="SPRING2026"
                      required
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Gold</label>
                      <input
                        type="number"
                        min="0"
                        value={giftCodeForm.rewardGold}
                        onChange={(event) => setGiftCodeForm((current) => ({ ...current, rewardGold: event.target.value }))}
                        className={INPUT_CLASS}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Diamonds</label>
                      <input
                        type="number"
                        min="0"
                        value={giftCodeForm.rewardDiamonds}
                        onChange={(event) =>
                          setGiftCodeForm((current) => ({
                            ...current,
                            rewardDiamonds: event.target.value,
                          }))
                        }
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Max uses</label>
                    <input
                      type="number"
                      min="1"
                      value={giftCodeForm.maxUses}
                      onChange={(event) => setGiftCodeForm((current) => ({ ...current, maxUses: event.target.value }))}
                      className={INPUT_CLASS}
                    />
                  </div>

                  <button type="submit" disabled={isSavingGiftCode} className={PRIMARY_BUTTON_CLASS}>
                    {isSavingGiftCode ? <LoadingSpinner /> : <Gift className="h-4 w-4" />}
                    {isSavingGiftCode ? "Đang tạo..." : "Tạo gift code"}
                  </button>
                </form>
              </ShellCard>

              <ShellCard>
                <SectionHeading
                  icon={Gift}
                  title="Code đang hoạt động"
                  description="Phần này đang hiển thị số lần dùng để admin đỡ phải suy đoán code còn sống hay không."
                />

                <div className="space-y-4 px-5 py-5 sm:px-6">
                  {giftCodes.length === 0 ? (
                    <div className="rounded-[24px] border border-white/8 bg-white/4 px-4 py-5 text-sm text-slate-300/72">
                      Chưa có gift code nào.
                    </div>
                  ) : (
                    giftCodes.map((giftCode) => (
                      <div key={giftCode.code} className="rounded-[24px] border border-white/8 bg-white/4 p-4">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                          <div>
                            <p className="text-xl font-black uppercase tracking-[0.16em] text-amber-100">{giftCode.code}</p>
                            <p className="mt-2 text-sm text-slate-300/75">
                              {formatNumber(giftCode.rewardGold)} vàng · {formatNumber(giftCode.rewardDiamonds)} KC
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              Dùng {formatNumber(giftCode.currentUses)}/{formatNumber(giftCode.maxUses)} · {formatDateTime(giftCode.createdAt)}
                            </p>
                          </div>

                          <button type="button" onClick={() => void handleGiftCodeDelete(giftCode.code)} className={DANGER_BUTTON_CLASS}>
                            <Trash2 className="h-4 w-4" />
                            Xóa
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ShellCard>
            </div>
          ) : null}

          {!isBootstrapping && selectedTab === "withdrawals" ? (
            <ShellCard>
              <SectionHeading
                icon={Wallet}
                title="Rút tiền"
                description="Luồng duyệt/từ chối giờ không còn bị che bởi panel cũ, và dữ liệu luôn bám sát backend."
                actions={
                  <select
                    value={withdrawDateFilter}
                    onChange={(event) => setWithdrawDateFilter(event.target.value)}
                    className={cn(INPUT_CLASS, "min-w-[220px]")}
                  >
                    <option value="all">Tất cả ngày</option>
                    {withdrawDateOptions.map((dateValue) => (
                      <option key={dateValue} value={dateValue}>
                        {dateValue}
                      </option>
                    ))}
                  </select>
                }
              />

              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="border-b border-white/6 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    <tr>
                      <th className="px-5 py-4 sm:px-6">ID</th>
                      <th className="px-5 py-4 sm:px-6">User</th>
                      <th className="px-5 py-4 sm:px-6">Số tiền</th>
                      <th className="px-5 py-4 sm:px-6">Ngân hàng</th>
                      <th className="px-5 py-4 sm:px-6">Refs</th>
                      <th className="px-5 py-4 sm:px-6">Status</th>
                      <th className="px-5 py-4 sm:px-6">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/6 text-sm">
                    {filteredWithdraws.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-10 text-center text-slate-400 sm:px-6">
                          Không có lệnh rút nào khớp bộ lọc hiện tại.
                        </td>
                      </tr>
                    ) : (
                      filteredWithdraws.map((withdraw) => (
                        <tr key={withdraw.id} className="bg-white/[0.015]">
                          <td className="px-5 py-4 sm:px-6">
                            <p className="font-mono text-xs text-slate-400">#{withdraw.id}</p>
                            <p className="mt-1 text-xs text-slate-500">{formatDateTime(withdraw.createdAt)}</p>
                          </td>
                          <td className="px-5 py-4 sm:px-6">
                            <p className="font-black text-slate-50">{withdraw.username}</p>
                            <p className="mt-1 text-xs text-cyan-200/70">{withdraw.tgHandle ? `@${withdraw.tgHandle}` : "@none"}</p>
                            <p className="mt-1 text-xs text-slate-500">ID {withdraw.teleId}</p>
                          </td>
                          <td className="px-5 py-4 font-bold text-amber-100 sm:px-6">{formatNumber(withdraw.vnd)} VND</td>
                          <td className="px-5 py-4 sm:px-6">
                            <p className="font-bold text-slate-100">{withdraw.bankName}</p>
                            <p className="mt-1 text-xs text-slate-400">{withdraw.accountNumber}</p>
                            <p className="mt-1 text-xs text-slate-400">{withdraw.accountName}</p>
                          </td>
                          <td className="px-5 py-4 sm:px-6">
                            <button
                              type="button"
                              onClick={() =>
                                void openReferrals(
                                  users.find((item) => item.teleId === withdraw.teleId) ?? {
                                    teleId: withdraw.teleId,
                                    username: withdraw.username,
                                    tgHandle: withdraw.tgHandle,
                                  gold: 0,
                                  diamonds: 0,
                                  level: 0,
                                  ipAddress: "",
                                  referrals: 0,
                                  flappyBestScore: 0,
                                  isMining: false,
                                  miningRate: 0,
                                  miningStartTime: null,
                                  miningShiftStart: null,
                                },
                              )
                              }
                              className={SECONDARY_BUTTON_CLASS}
                            >
                              <Users className="h-4 w-4" />
                              Details
                            </button>
                          </td>
                          <td className="px-5 py-4 sm:px-6">
                            <span className={cn("rounded-full border px-3 py-1 text-xs font-bold", getStatusChipClassName(withdraw.status))}>
                              {withdraw.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 sm:px-6">
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => setQrTarget(withdraw)} className={SECONDARY_BUTTON_CLASS}>
                                <QrCode className="h-4 w-4" />
                                QR
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleApproveWithdraw(withdraw)}
                                disabled={busyWithdrawId === withdraw.id}
                                className={PRIMARY_BUTTON_CLASS}
                              >
                                {busyWithdrawId === withdraw.id ? <LoadingSpinner /> : <CheckCircle2 className="h-4 w-4" />}
                                Duyệt
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectTarget(withdraw);
                                  setRejectReason(withdraw.message || "");
                                }}
                                className={DANGER_BUTTON_CLASS}
                              >
                                <XCircle className="h-4 w-4" />
                                Từ chối
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </ShellCard>
          ) : null}

          {!isBootstrapping && selectedTab === "lucky_draw" ? (
            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-6">
                <ShellCard>
                  <SectionHeading
                    icon={Trophy}
                    title="Lên lịch top vận may"
                    description="Có thể set người thật bằng Tele ID hoặc fake name cho từng ngày/rank."
                  />

                  <form className="grid gap-4 px-5 py-5 sm:px-6" onSubmit={handleScheduleSubmit}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Ngày</label>
                        <input
                          type="date"
                          value={scheduleForm.date}
                          onChange={(event) => setScheduleForm((current) => ({ ...current, date: event.target.value }))}
                          className={INPUT_CLASS}
                          required
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Hạng</label>
                        <select
                          value={scheduleForm.rank}
                          onChange={(event) => setScheduleForm((current) => ({ ...current, rank: event.target.value }))}
                          className={INPUT_CLASS}
                        >
                          <option value="1">Top 1</option>
                          <option value="2">Top 2</option>
                          <option value="3">Top 3</option>
                          <option value="4">Top 4</option>
                          <option value="5">Top 5</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Loại người thắng</label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setScheduleForm((current) => ({ ...current, winnerType: "fake", value: "" }))}
                          className={cn(
                            "rounded-2xl border px-4 py-3 text-left text-sm font-bold transition",
                            scheduleForm.winnerType === "fake"
                              ? "border-cyan-200/18 bg-cyan-400/10 text-cyan-50"
                              : "border-white/8 bg-white/4 text-slate-300/75 hover:text-white",
                          )}
                        >
                          Tên giả (fake name)
                        </button>

                        <button
                          type="button"
                          onClick={() => setScheduleForm((current) => ({ ...current, winnerType: "real", value: "" }))}
                          className={cn(
                            "rounded-2xl border px-4 py-3 text-left text-sm font-bold transition",
                            scheduleForm.winnerType === "real"
                              ? "border-cyan-200/18 bg-cyan-400/10 text-cyan-50"
                              : "border-white/8 bg-white/4 text-slate-300/75 hover:text-white",
                          )}
                        >
                          Người thật (Tele ID)
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                        {scheduleForm.winnerType === "fake" ? "Tên hiển thị" : "Tele ID người thắng"}
                      </label>
                      <input
                        type="text"
                        value={scheduleForm.value}
                        onChange={(event) => setScheduleForm((current) => ({ ...current, value: event.target.value }))}
                        className={INPUT_CLASS}
                        placeholder={scheduleForm.winnerType === "fake" ? "Nhập tên giả..." : "Nhập Tele ID..."}
                        required
                      />
                    </div>

                    <button type="submit" disabled={isSavingSchedule} className={PRIMARY_BUTTON_CLASS}>
                      {isSavingSchedule ? <LoadingSpinner /> : <CalendarClock className="h-4 w-4" />}
                      {isSavingSchedule ? "Đang lưu..." : "Lưu lịch"}
                    </button>
                  </form>
                </ShellCard>

                <ShellCard>
                  <SectionHeading
                    icon={Sparkles}
                    title="Thưởng Flappy"
                    description="Di chuyển phần config Flappy về cùng panel quản trị web mới."
                  />

                  <form className="grid gap-4 px-5 py-5 sm:px-6" onSubmit={handleFlappySubmit}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Reward Gold</label>
                        <input
                          type="number"
                          min="0"
                          value={flappyForm.rewardGold}
                          onChange={(event) => setFlappyForm((current) => ({ ...current, rewardGold: event.target.value }))}
                          className={INPUT_CLASS}
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Reward Diamonds</label>
                        <input
                          type="number"
                          min="0"
                          value={flappyForm.rewardDiamonds}
                          onChange={(event) =>
                            setFlappyForm((current) => ({
                              ...current,
                              rewardDiamonds: event.target.value,
                            }))
                          }
                          className={INPUT_CLASS}
                        />
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-white/8 bg-white/4 px-4 py-3 text-sm text-slate-300/75">
                      Hiện tại backend đang dùng: {formatNumber(flappyConfig.rewardGold)} vàng /{" "}
                      {formatNumber(flappyConfig.rewardDiamonds)} KC.
                    </div>

                    <button type="submit" disabled={isSavingFlappy} className={PRIMARY_BUTTON_CLASS}>
                      {isSavingFlappy ? <LoadingSpinner /> : <Save className="h-4 w-4" />}
                      {isSavingFlappy ? "Đang lưu..." : "Lưu Flappy reward"}
                    </button>
                  </form>
                </ShellCard>
              </div>

              <ShellCard>
                <SectionHeading
                  icon={CalendarClock}
                  title="Lịch đã lưu"
                  description="Danh sách render theo ngày giảm dần, rồi đến thứ hạng tăng dần."
                />

                <div className="space-y-4 px-5 py-5 sm:px-6">
                  {scheduleItems.length === 0 ? (
                    <div className="rounded-[24px] border border-white/8 bg-white/4 px-4 py-5 text-sm text-slate-300/72">
                      Chưa có lịch vận may nào.
                    </div>
                  ) : (
                    scheduleItems.map((item) => (
                      <div key={item.id} className="rounded-[24px] border border-white/8 bg-white/4 p-4">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-cyan-200/12 bg-cyan-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-cyan-50">
                                Top {item.rankPos}
                              </span>
                              <span className="text-sm text-slate-400">{formatDateOnly(item.drawDate)}</span>
                            </div>

                            <p className="mt-3 text-base font-black text-slate-50">{item.fakeName || item.teleId}</p>
                            <p className="mt-1 text-sm text-slate-400">{item.fakeName ? "Fake name" : "Tele ID người thật"}</p>
                          </div>

                          <button
                            type="button"
                            onClick={() => void handleScheduleDelete(item)}
                            disabled={deletingScheduleId === item.id}
                            className={DANGER_BUTTON_CLASS}
                          >
                            {deletingScheduleId === item.id ? <LoadingSpinner /> : <Trash2 className="h-4 w-4" />}
                            Xóa lịch
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ShellCard>
            </div>
          ) : null}
        </main>
      </div>

      <Modal
        open={Boolean(userEdit)}
        title="Chỉnh tài nguyên user"
        description="Chỉ sửa tài nguyên chính trên backend hiện tại để tránh lệch schema."
        onClose={() => setUserEdit(null)}
        widthClassName="max-w-lg"
      >
        {userEdit ? (
          <form className="grid gap-4" onSubmit={handleUserSave}>
            <div className="rounded-[22px] border border-white/8 bg-white/4 px-4 py-3">
              <p className="text-sm font-black text-slate-50">{userEdit.username}</p>
              <p className="mt-1 text-xs text-slate-400">Tele ID {userEdit.teleId}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Gold</label>
                <input
                  type="number"
                  min="0"
                  value={userEdit.gold}
                  onChange={(event) => setUserEdit((current) => (current ? { ...current, gold: event.target.value } : current))}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Diamonds</label>
                <input
                  type="number"
                  min="0"
                  value={userEdit.diamonds}
                  onChange={(event) =>
                    setUserEdit((current) => (current ? { ...current, diamonds: event.target.value } : current))
                  }
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => setUserEdit(null)} className={SECONDARY_BUTTON_CLASS}>
                Đóng
              </button>
              <button type="submit" disabled={isSavingUser} className={PRIMARY_BUTTON_CLASS}>
                {isSavingUser ? <LoadingSpinner /> : <Save className="h-4 w-4" />}
                Lưu thay đổi
              </button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(referralState)}
        title={referralState ? `Danh sách ref của ${referralState.user.username}` : "Danh sách ref"}
        description="Hiển thị kèm IP để soi nhanh cụm tài khoản đáng ngờ."
        onClose={() => setReferralState(null)}
      >
        {referralState?.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner className="h-6 w-6 text-cyan-100" />
          </div>
        ) : referralState?.error ? (
          <div className="rounded-2xl border border-red-300/15 bg-red-500/10 px-4 py-4 text-sm text-red-100">
            {referralState.error}
          </div>
        ) : referralState ? (
          <div className="space-y-4">
            {referralState.items.length === 0 ? (
              <div className="rounded-[24px] border border-white/8 bg-white/4 px-4 py-5 text-sm text-slate-300/72">
                User này chưa có ref nào.
              </div>
            ) : (
              referralState.items.map((item) => (
                <div key={`${item.teleId}-${item.createdAt}`} className="rounded-[24px] border border-white/8 bg-white/4 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-base font-black text-slate-50">{item.username}</p>
                      <p className="mt-1 text-xs text-slate-400">Tele ID {item.teleId}</p>
                    </div>
                    <div className="text-sm text-slate-300/75">{formatDateTime(item.createdAt)}</div>
                  </div>

                  <div className="mt-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-xs text-slate-300/75">
                    IP: {item.ipAddress || "Không có"}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(qrTarget)}
        title={qrTarget ? `QR thanh toán cho ${qrTarget.username}` : "QR thanh toán"}
        description="Dùng QR có sẵn từ backend nếu có, còn không thì generate preview VietQR để duyệt nhanh."
        onClose={() => setQrTarget(null)}
        widthClassName="max-w-xl"
      >
        {qrTarget ? (
          <div className="space-y-5">
            <div className="overflow-hidden rounded-[28px] border border-white/8 bg-white/4 p-5">
              <img
                src={buildQrPreviewUrl(qrTarget)}
                alt={`QR ${qrTarget.username}`}
                className="mx-auto aspect-square w-full max-w-[320px] rounded-[22px] bg-white object-contain p-3"
              />
            </div>

            <div className="grid gap-3 text-sm text-slate-300/78">
              <div className="rounded-[22px] border border-white/8 bg-white/4 px-4 py-3">
                <span className="text-slate-400">Ngân hàng:</span> {qrTarget.bankName}
              </div>
              <div className="rounded-[22px] border border-white/8 bg-white/4 px-4 py-3">
                <span className="text-slate-400">Số tài khoản:</span> {qrTarget.accountNumber}
              </div>
              <div className="rounded-[22px] border border-white/8 bg-white/4 px-4 py-3">
                <span className="text-slate-400">Chủ tài khoản:</span> {qrTarget.accountName}
              </div>
              <div className="rounded-[22px] border border-amber-200/12 bg-amber-500/8 px-4 py-3 font-bold text-amber-100">
                Số tiền: {formatNumber(qrTarget.vnd)} VND
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(rejectTarget)}
        title={rejectTarget ? `Từ chối lệnh rút #${rejectTarget.id}` : "Từ chối lệnh rút"}
        description="Lý do này sẽ được gửi xuống backend cùng status để người dùng có thể thấy."
        onClose={() => {
          setRejectTarget(null);
          setRejectReason("");
        }}
        widthClassName="max-w-lg"
      >
        {rejectTarget ? (
          <form className="grid gap-4" onSubmit={handleRejectWithdraw}>
            <div className="rounded-[22px] border border-yellow-200/12 bg-yellow-500/8 px-4 py-3 text-sm text-yellow-100">
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  User: <strong>{rejectTarget.username}</strong> · {formatNumber(rejectTarget.vnd)} VND · {rejectTarget.bankName}
                </p>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Lý do từ chối</label>
              <textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                className={TEXTAREA_CLASS}
                placeholder="Ví dụ: Sai thông tin ngân hàng, nghi vấn gian lận..."
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason("");
                }}
                className={SECONDARY_BUTTON_CLASS}
              >
                Hủy
              </button>
              <button type="submit" disabled={isSubmittingReject} className={DANGER_BUTTON_CLASS}>
                {isSubmittingReject ? <LoadingSpinner /> : <XCircle className="h-4 w-4" />}
                Xác nhận từ chối
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
