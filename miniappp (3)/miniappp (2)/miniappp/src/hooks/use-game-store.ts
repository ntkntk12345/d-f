import { useCallback, useEffect, useMemo, useState } from "react";
import confetti from "canvas-confetti";

export type PageId = "home" | "giftcode" | "shop" | "tasks" | "friends" | "lucky" | "withdraw" | "admin" | "flappy";

export type TaskType = "daily" | "one_time" | "community" | "ad" | "newbie";
export type TaskActionType = "click" | "join" | "react_heart";
export type ReferralStatus = "pending" | "rewarded";

export interface Task {
  id: string;
  title: string;
  icon: string;
  reward: number;
  rewardType: "gold" | "usdt";
  type: TaskType;
  actionType: TaskActionType;
  url: string | null;
  done: boolean;
  lastClaimedAt: string | null;
}

export interface LevelInfo {
  level: number;
  name: string;
  rate: number;
  dailyGoldCap: number;
  cost: number;
}

export interface ReferralRecord {
  invitedId: number;
  invitedName: string;
  goldReward: number;
  usdtReward: number;
  status: ReferralStatus;
  createdAt: string;
  rewardedAt: string | null;
}

export interface NewbieLockState {
  required: boolean;
  inviterId: number;
  totalNewbieTasks: number;
  completedNewbieTasks: number;
  remainingNewbieTasks: number;
  referralStatus: string;
  message: string;
}

export interface LuckyDrawConfig {
  totalPrize: number;
  top1Percent: number;
  top2Percent: number;
  top3Percent: number;
  top4Percent: number;
  top5Percent: number;
  entryFee: number;
  drawHour: number;
  drawMinute: number;
}

export interface LuckyWinner {
  top1User?: string;
  top2User?: string;
  top3User?: string;
  drawDate?: string;
}

export interface LuckyDrawInfo {
  config: LuckyDrawConfig;
  participantCount: number;
  isJoined: boolean;
  lastWinners: LuckyWinner | null;
}

export interface FlappyConfig {
  rewardGold: number;
  bestScore: number;
}

export interface EconomyConfig {
  newUserGold: number;
  referralRewardGold: number;
  referralRewardUsdt: number;
  withdrawMinGold: number;
  withdrawVndPerGold: number;
  usdToVndRateK: number;
  taskMilestoneCount: number;
  taskMilestoneRewardGold: number;
}

export interface LixiConfig {
  minGold: number;
  maxGold: number;
  maxClaimsPerRound: number;
  cooldownMinutes: number;
  requiredAdViews: number;
}

export interface LixiState {
  roundNumber: number;
  remainingClaims: number;
  claimedCount: number;
  cooldownEndsAt: number | null;
  maxClaimsPerRound: number;
  cooldownMinutes: number;
  isCoolingDown: boolean;
  isAvailable: boolean;
}

export interface LixiInfo {
  config: LixiConfig;
  state: LixiState;
  user: {
    hasClaimed: boolean;
    rewardGold: number;
    claimedAt: string | null;
    watchedAdViews: number;
    remainingAdViews: number;
    canClaim: boolean;
  };
}

export interface WithdrawHistoryItem {
  id: number;
  amount: number;
  sourceWallet: "gold" | "usdt" | string;
  sourceCurrency: "GOLD" | "USDT" | "$" | string;
  sourceAmount: number;
  vnd: number;
  method: "bank" | "wallet" | "usdt" | string;
  network?: string;
  feePercent: number;
  feeAmount: number;
  payoutAmount: number;
  payoutCurrency: string;
  bankName: string;
  accountNumber: string;
  status: string;
  date: string;
  qrUrl?: string | null;
  message?: string;
}

export interface AdminUser {
  teleId: number;
  username: string;
  gold: number;
  usdtBalance: number;
  level: number;
  dailyGoldCap?: number;
}

export interface AdminWithdrawItem {
  id: number;
  teleId: number;
  username: string;
  sourceWallet: "gold" | "usdt" | string;
  sourceCurrency: "GOLD" | "USDT" | "$" | string;
  sourceAmount: number;
  accountName: string;
  bankName: string;
  accountNumber: string;
  vnd: number;
  method: "bank" | "wallet" | "usdt" | string;
  network?: string;
  feePercent: number;
  feeAmount: number;
  payoutAmount: number;
  payoutCurrency: string;
  qrUrl?: string | null;
  status: string;
}

export interface AdminData {
  users: AdminUser[];
  totalGold: number;
  totalUsdt: number;
  pendingWithdraws: AdminWithdrawItem[];
  flappyConfig: FlappyConfig;
  lixiConfig: LixiConfig;
  lixiState: LixiState;
}

export interface WithdrawPayload {
  amount: number;
  amountUnit?: "gold" | "usdt";
  bankBin: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  method?: "bank" | "wallet" | "usdt";
  network?: string;
}

interface ApiLevelSetting {
  level: number;
  miningRate: number | string;
  dailyGoldCap?: number | string;
  upgradeCost: number | string;
}

interface ApiTask {
  id: string;
  title: string;
  icon: string;
  rewardType: "gold" | "usdt" | "usd";
  rewardAmount: number | string;
  url: string | null;
  type: TaskType | string;
  actionType?: TaskActionType;
  isClaimed?: number;
  lastClaimedAt?: string | null;
}

interface ApiUser {
  teleId: number;
  username: string;
  gold: number | string;
  usdtBalance?: number | string;
  level: number | string;
  dailyGoldCap?: number | string;
  miningRate: number | string;
  miningShiftProgress?: number | string;
  isMining: number | boolean;
  miningStartTime: number | null;
  miningShiftStart: number | null;
  referrals?: number | string;
  flappyBestScore?: number | string;
  withdrawHistory?: Array<{
    id: number;
    amount: number | string;
    sourceWallet?: "gold" | "usdt" | string;
    sourceCurrency?: "GOLD" | "USDT" | "$" | string;
    sourceAmount?: number | string;
    vnd: number | string;
    method?: "bank" | "wallet" | "usdt" | string;
    network?: string;
    feePercent?: number | string;
    feeAmount?: number | string;
    payoutAmount?: number | string;
    payoutCurrency?: string;
    bankName: string;
    accountNumber: string;
    status: string;
    date: string;
    qrUrl?: string | null;
    message?: string;
  }>;
  serverTime?: number;
  newbieLock?: {
    required?: boolean;
    inviterId?: number | string;
    totalNewbieTasks?: number | string;
    completedNewbieTasks?: number | string;
    remainingNewbieTasks?: number | string;
    referralStatus?: string;
    message?: string;
  };
}

interface ApiResult {
  success?: boolean;
  error?: string;
  message?: string;
}

interface TaskClaimResult extends ApiResult {
  reward?: {
    type: "gold" | "usdt";
    amount: number;
  };
  milestoneReward?: {
    count?: number;
    completedCount?: number;
    gold?: number;
  };
  user?: ApiUser;
}

interface ResourceResult extends ApiResult {
  user?: ApiUser;
}

type GiftCodeRedeemResult =
  | {
      success: true;
      rewardGold: number;
      rewardUsd: number;
    }
  | {
      success: false;
      error: string;
    };

interface AdminDataResult {
  users: Array<{
    teleId: number | string;
    username: string;
    gold: number | string;
    usdtBalance?: number | string;
    dailyGoldCap?: number | string;
    level: number | string;
  }>;
  totalGold: number | string;
  totalUsdt?: number | string;
  pendingWithdraws: Array<{
    id: number | string;
    teleId: number | string;
    username: string;
    amount?: number | string;
    sourceWallet?: "gold" | "usdt" | string;
    sourceCurrency?: "GOLD" | "USDT" | "$" | string;
    sourceAmount?: number | string;
    accountName: string;
    bankName: string;
    accountNumber: string;
    vnd: number | string;
    method?: "bank" | "wallet" | "usdt" | string;
    network?: string;
    feePercent?: number | string;
    feeAmount?: number | string;
    payoutAmount?: number | string;
    payoutCurrency?: string;
    qrUrl?: string | null;
    status: string;
  }>;
  flappyConfig?: {
    rewardGold?: number | string;
  };
  lixiConfig?: {
    minGold?: number | string;
    maxGold?: number | string;
    maxClaimsPerRound?: number | string;
    cooldownMinutes?: number | string;
    requiredAdViews?: number | string;
  };
  lixiState?: {
    roundNumber?: number | string;
    remainingClaims?: number | string;
    claimedCount?: number | string;
    cooldownEndsAt?: number | string | null;
    maxClaimsPerRound?: number | string;
    cooldownMinutes?: number | string;
    isCoolingDown?: boolean;
    isAvailable?: boolean;
  };
}

interface ApiLixiInfoResult {
  config?: {
    minGold?: number | string;
    maxGold?: number | string;
    maxClaimsPerRound?: number | string;
    cooldownMinutes?: number | string;
    requiredAdViews?: number | string;
  };
  state?: {
    roundNumber?: number | string;
    remainingClaims?: number | string;
    claimedCount?: number | string;
    cooldownEndsAt?: number | string | null;
    maxClaimsPerRound?: number | string;
    cooldownMinutes?: number | string;
    isCoolingDown?: boolean;
    isAvailable?: boolean;
  };
  user?: {
    hasClaimed?: boolean;
    rewardGold?: number | string;
    claimedAt?: string | null;
    watchedAdViews?: number | string;
    remainingAdViews?: number | string;
    canClaim?: boolean;
  };
  serverTime?: number | string;
}

interface LixiClaimResult extends ApiResult {
  rewardGold?: number | string;
  user?: ApiUser;
  lixi?: ApiLixiInfoResult;
}

interface LixiWatchAdResult extends ApiResult {
  watchedAdViews?: number | string;
  remainingAdViews?: number | string;
  lixi?: ApiLixiInfoResult;
}

interface AdsgramShowResult {
  done: boolean;
  description: string;
  state: "load" | "render" | "playing" | "destroy";
  error: boolean;
}

interface AdsgramController {
  show: () => Promise<AdsgramShowResult>;
}

declare global {
  interface Window {
    Adsgram?: {
      init: (config: {
        blockId: string;
        debug?: boolean;
        debugBannerType?: "FullscreenMedia" | "RewardedVideo";
      }) => AdsgramController;
    };
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          user?: {
            id?: number;
            first_name?: string;
            last_name?: string;
            username?: string;
          };
        };
        ready?: () => void;
        expand?: () => void;
        openLink?: (url: string) => void;
      };
    };
  }
}

const API_BASE_URL = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").replace(/\/$/, "");
const ADMIN_ID = "7711226652";
const NEWBIE_LOCK_FALLBACK_MESSAGE =
  "Ban duoc moi vao he thong. Hay hoan thanh nhiem vu tan thu trong tab Nhiem vu de mo khoa cac chuc nang khac.";

const LEVEL_NAME_MAP: Record<number, string> = {
  1: "Mỏ Đá",
  2: "Mỏ Đồng",
  3: "Mỏ Bạc",
  4: "Mỏ Vàng",
  5: "Mỏ Bạch Kim",
  6: "Mỏ Huyền Kim",
};

export const LEVELS: LevelInfo[] = [
  { level: 1, name: "Mo Da", rate: 1000 / 86400, dailyGoldCap: 1000, cost: 0.02 },
  { level: 2, name: "Mo Dong", rate: 1000 / 86400, dailyGoldCap: 1000, cost: 0.027 },
  { level: 3, name: "Mo Bac", rate: 1000 / 86400, dailyGoldCap: 1000, cost: 0.03645 },
  { level: 4, name: "Mo Vang", rate: 1000 / 86400, dailyGoldCap: 1000, cost: 0.049208 },
  { level: 5, name: "Mo Bach Kim", rate: 1000 / 86400, dailyGoldCap: 1000, cost: 0.066431 },
  { level: 6, name: "Mo Huyen Kim", rate: 1000 / 86400, dailyGoldCap: 1000, cost: 0.089682 },
];

const EMPTY_LUCKY_DRAW: LuckyDrawInfo = {
  config: {
    totalPrize: 0,
    top1Percent: 40,
    top2Percent: 25,
    top3Percent: 15,
    top4Percent: 10,
    top5Percent: 10,
    entryFee: 1000,
    drawHour: 23,
    drawMinute: 59,
  },
  participantCount: 0,
  isJoined: false,
  lastWinners: null,
};

const EMPTY_FLAPPY_CONFIG: FlappyConfig = {
  rewardGold: 0,
  bestScore: 0,
};

const EMPTY_ECONOMY_CONFIG: EconomyConfig = {
  newUserGold: 1000,
  referralRewardGold: 0,
  referralRewardUsdt: 0.02,
  withdrawMinGold: 6000000,
  withdrawVndPerGold: 1,
  usdToVndRateK: 28,
  taskMilestoneCount: 0,
  taskMilestoneRewardGold: 0,
};

const EMPTY_LIXI_CONFIG: LixiConfig = {
  minGold: 5000,
  maxGold: 25000,
  maxClaimsPerRound: 10,
  cooldownMinutes: 60,
  requiredAdViews: 3,
};

const EMPTY_LIXI_INFO: LixiInfo = {
  config: EMPTY_LIXI_CONFIG,
  state: {
    roundNumber: 1,
    remainingClaims: EMPTY_LIXI_CONFIG.maxClaimsPerRound,
    claimedCount: 0,
    cooldownEndsAt: null,
    maxClaimsPerRound: EMPTY_LIXI_CONFIG.maxClaimsPerRound,
    cooldownMinutes: EMPTY_LIXI_CONFIG.cooldownMinutes,
    isCoolingDown: false,
    isAvailable: true,
  },
  user: {
    hasClaimed: false,
    rewardGold: 0,
    claimedAt: null,
    watchedAdViews: 0,
    remainingAdViews: EMPTY_LIXI_CONFIG.requiredAdViews,
    canClaim: false,
  },
};

const EMPTY_NEWBIE_LOCK: NewbieLockState = {
  required: false,
  inviterId: 0,
  totalNewbieTasks: 0,
  completedNewbieTasks: 0,
  remainingNewbieTasks: 0,
  referralStatus: "none",
  message: "",
};

export const SHIFT_DURATION_MS = 6 * 60 * 60 * 1000;

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getLevelName(level: number): string {
  return LEVEL_NAME_MAP[level] ?? `Mỏ Cấp ${level}`;
}

function toVNDateKey(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const vn = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return `${vn.getUTCFullYear()}-${vn.getUTCMonth() + 1}-${vn.getUTCDate()}`;
}

function mapTask(task: ApiTask): Task {
  const type: TaskType = ["daily", "one_time", "community", "ad", "newbie"].includes(task.type)
    ? (task.type as TaskType)
    : "one_time";

  const rewardType: "gold" | "usdt" = task.rewardType === "usdt" || task.rewardType === "usd" ? "usdt" : "gold";
  const actionType: TaskActionType =
    task.actionType === "join" || task.actionType === "react_heart" ? task.actionType : "click";

  let done = false;
  if (type === "daily" && task.lastClaimedAt) {
    done = toVNDateKey(task.lastClaimedAt) === toVNDateKey(new Date());
  } else if (type === "one_time" || type === "community" || type === "newbie") {
    done = Boolean(task.isClaimed);
  }

  return {
    id: task.id,
    title: task.title,
    icon: task.icon || "🎯",
    reward: toNumber(task.rewardAmount),
    rewardType,
    type,
    actionType,
    url: task.url || null,
    done,
    lastClaimedAt: task.lastClaimedAt || null,
  };
}

function normalizeLixiInfo(data: ApiLixiInfoResult | null | undefined): LixiInfo {
  const minGold = Math.max(0, toNumber(data?.config?.minGold, EMPTY_LIXI_CONFIG.minGold));
  const maxGold = Math.max(minGold, toNumber(data?.config?.maxGold, EMPTY_LIXI_CONFIG.maxGold));
  const maxClaimsPerRound = Math.max(
    1,
    toNumber(data?.state?.maxClaimsPerRound ?? data?.config?.maxClaimsPerRound, EMPTY_LIXI_CONFIG.maxClaimsPerRound),
  );
  const cooldownMinutes = Math.max(
    1,
    toNumber(data?.state?.cooldownMinutes ?? data?.config?.cooldownMinutes, EMPTY_LIXI_CONFIG.cooldownMinutes),
  );
  const requiredAdViews = Math.max(1, toNumber(data?.config?.requiredAdViews, EMPTY_LIXI_CONFIG.requiredAdViews));
  const remainingClaims = Math.max(0, Math.min(maxClaimsPerRound, toNumber(data?.state?.remainingClaims, maxClaimsPerRound)));
  const claimedCount = Math.max(0, toNumber(data?.state?.claimedCount, maxClaimsPerRound - remainingClaims));
  const cooldownEndsAtValue = data?.state?.cooldownEndsAt;
  const cooldownEndsAt =
    cooldownEndsAtValue === null || cooldownEndsAtValue === undefined || cooldownEndsAtValue === ""
      ? null
      : toNumber(cooldownEndsAtValue);
  const hasClaimed = Boolean(data?.user?.hasClaimed);
  const watchedAdViews = Math.max(0, Math.min(requiredAdViews, toNumber(data?.user?.watchedAdViews)));
  const remainingAdViews = Math.max(
    0,
    Math.min(requiredAdViews, toNumber(data?.user?.remainingAdViews, requiredAdViews - watchedAdViews)),
  );
  const isCoolingDown = typeof data?.state?.isCoolingDown === "boolean" ? data.state.isCoolingDown : Boolean(cooldownEndsAt);
  const isAvailable =
    typeof data?.state?.isAvailable === "boolean" ? data.state.isAvailable : !isCoolingDown && remainingClaims > 0;
  const canClaim =
    typeof data?.user?.canClaim === "boolean"
      ? data.user.canClaim
      : !hasClaimed && isAvailable && !isCoolingDown && remainingAdViews === 0;

  return {
    config: {
      minGold,
      maxGold,
      maxClaimsPerRound,
      cooldownMinutes,
      requiredAdViews,
    },
    state: {
      roundNumber: Math.max(1, toNumber(data?.state?.roundNumber, 1)),
      remainingClaims,
      claimedCount,
      cooldownEndsAt,
      maxClaimsPerRound,
      cooldownMinutes,
      isCoolingDown,
      isAvailable,
    },
    user: {
      hasClaimed,
      rewardGold: toNumber(data?.user?.rewardGold),
      claimedAt: data?.user?.claimedAt || null,
      watchedAdViews,
      remainingAdViews,
      canClaim,
    },
  };
}

function normalizeNewbieLockState(raw: ApiUser["newbieLock"] | null | undefined): NewbieLockState {
  if (!raw) {
    return EMPTY_NEWBIE_LOCK;
  }

  const totalNewbieTasks = Math.max(0, toNumber(raw.totalNewbieTasks));
  const completedNewbieTasks = Math.max(0, Math.min(totalNewbieTasks, toNumber(raw.completedNewbieTasks)));
  const fallbackRemaining = Math.max(0, totalNewbieTasks - completedNewbieTasks);
  const remainingNewbieTasks = Math.max(0, toNumber(raw.remainingNewbieTasks, fallbackRemaining));

  return {
    required: Boolean(raw.required) && totalNewbieTasks > 0,
    inviterId: Math.max(0, toNumber(raw.inviterId)),
    totalNewbieTasks,
    completedNewbieTasks,
    remainingNewbieTasks,
    referralStatus: String(raw.referralStatus || "none"),
    message: typeof raw.message === "string" ? raw.message : "",
  };
}

export function useGameStore() {
  const [currentPage, setCurrentPageState] = useState<PageId>("home");
  const [gold, setGold] = useState(0);
  const [usdtBalance, setUsdtBalance] = useState(0);
  const [level, setLevel] = useState(1);
  const [dailyGoldCap, setDailyGoldCap] = useState(1000);
  const [isMining, setIsMining] = useState(false);
  const [miningStartTime, setMiningStartTime] = useState<number | null>(null);
  const [miningShiftStart, setMiningShiftStart] = useState<number | null>(null);
  const [miningShiftProgress, setMiningShiftProgress] = useState(0);
  const [serverGoldBase, setServerGoldBase] = useState(0);
  const [serverOffset, setServerOffset] = useState(0);
  const [miningRate, setMiningRate] = useState(1000 / 86400);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [levels, setLevels] = useState<LevelInfo[]>([]);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [luckyDraw, setLuckyDraw] = useState<LuckyDrawInfo>(EMPTY_LUCKY_DRAW);
  const [flappyConfig, setFlappyConfig] = useState<FlappyConfig>(EMPTY_FLAPPY_CONFIG);
  const [economyConfig, setEconomyConfig] = useState<EconomyConfig>(EMPTY_ECONOMY_CONFIG);
  const [lixi, setLixi] = useState<LixiInfo>(EMPTY_LIXI_INFO);
  const [newbieLock, setNewbieLock] = useState<NewbieLockState>(EMPTY_NEWBIE_LOCK);
  const [withdrawHistory, setWithdrawHistory] = useState<WithdrawHistoryItem[]>([]);
  const [referralCount, setReferralCount] = useState(0);
  const [adminData, setAdminData] = useState<AdminData>({
    users: [],
    totalGold: 0,
    totalUsdt: 0,
    pendingWithdraws: [],
    flappyConfig: EMPTY_FLAPPY_CONFIG,
    lixiConfig: EMPTY_LIXI_CONFIG,
    lixiState: EMPTY_LIXI_INFO.state,
  });

  const [username, setUsername] = useState("Thợ Mỏ");
  const [initData, setInitData] = useState("");
  const [teleId, setTeleId] = useState<number | null>(null);
  const [isTelegramApp, setIsTelegramApp] = useState(false);

  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [didShowNewbieLockNotice, setDidShowNewbieLockNotice] = useState(false);

  const triggerConfetti = useCallback(() => {
    const duration = 2000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ["#FFD700", "#00FFFF"],
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ["#FFD700", "#00FFFF"],
      });

      if (Date.now() < end) requestAnimationFrame(frame);
    };

    frame();
  }, []);

  const enforceNewbieTaskLock = useCallback(
    (showAlert = false) => {
      if (!newbieLock.required) {
        return null;
      }

      const message = newbieLock.message || NEWBIE_LOCK_FALLBACK_MESSAGE;
      setCurrentPageState("tasks");

      if (showAlert && typeof window !== "undefined") {
        window.alert(message);
      }

      return message;
    },
    [newbieLock.message, newbieLock.required],
  );

  const setCurrentPage = useCallback(
    (nextPage: PageId) => {
      if (newbieLock.required && nextPage !== "tasks") {
        enforceNewbieTaskLock(true);
        return;
      }

      setCurrentPageState(nextPage);
    },
    [enforceNewbieTaskLock, newbieLock.required],
  );

  const apiFetch = useCallback(
    async (path: string, options: RequestInit = {}) => {
      if (!initData) {
        throw new Error("Thiếu xác thực Telegram. Hãy mở app trong Telegram.");
      }

      const headers = new Headers(options.headers);
      if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${initData}`);
      if (options.method && options.method !== "GET" && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
      });

      const contentType = response.headers.get("content-type") ?? "";
      const payload = contentType.includes("application/json") ? await response.json() : null;

      if (!response.ok) {
        if (payload?.newbieLock) {
          setNewbieLock(normalizeNewbieLockState(payload.newbieLock));
          setCurrentPageState("tasks");
        }

        const message = payload?.error || payload?.message || `Request thất bại (${response.status})`;
        throw new Error(message);
      }

      return payload;
    },
    [initData],
  );

  const applyUserSnapshot = useCallback((user: ApiUser) => {
    const nextGold = toNumber(user.gold);

    setServerGoldBase(nextGold);
    setGold(nextGold);
    setUsdtBalance(toNumber(user.usdtBalance, 0));
    setLevel(toNumber(user.level, 1));
    setDailyGoldCap(toNumber(user.dailyGoldCap, 1000));
    setMiningRate(toNumber(user.miningRate, 1000 / 86400));
    setMiningShiftProgress(toNumber(user.miningShiftProgress, 0));
    setReferralCount(toNumber(user.referrals, 0));

    const activeMining = Boolean(user.isMining);
    setIsMining(activeMining);
    setMiningStartTime(user.miningStartTime ? toNumber(user.miningStartTime) : null);
    setMiningShiftStart(user.miningShiftStart ? toNumber(user.miningShiftStart) : null);

    if (user.serverTime) {
      setServerOffset(toNumber(user.serverTime) - Date.now());
    }

    if (typeof user.username === "string" && user.username.trim().length > 0) {
      setUsername(user.username);
    }

    if (user.flappyBestScore !== undefined) {
      setFlappyConfig((prev) => ({
        ...prev,
        bestScore: toNumber(user.flappyBestScore, 0),
      }));
    }

    if (user.newbieLock !== undefined) {
      setNewbieLock(normalizeNewbieLockState(user.newbieLock));
    }

    if (Array.isArray(user.withdrawHistory)) {
      setWithdrawHistory(
        user.withdrawHistory.map((item) => ({
          id: toNumber(item.id),
          amount: toNumber(item.amount),
          sourceWallet: item.sourceWallet || "gold",
          sourceCurrency: item.sourceCurrency || "GOLD",
          sourceAmount: toNumber(item.sourceAmount, toNumber(item.amount)),
          vnd: toNumber(item.vnd),
          method: item.method || "bank",
          network: item.network || "",
          feePercent: toNumber(item.feePercent),
          feeAmount: toNumber(item.feeAmount),
          payoutAmount: toNumber(item.payoutAmount, toNumber(item.vnd)),
          payoutCurrency: item.payoutCurrency || "VND",
          bankName: item.bankName || "",
          accountNumber: item.accountNumber || "",
          status: item.status || "",
          date: item.date || "",
          qrUrl: item.qrUrl || null,
          message: item.message || "",
        })),
      );
    }
  }, []);

  const fetchLevels = useCallback(async () => {
    const rows = (await apiFetch("/api/config/levels")) as ApiLevelSetting[];

    const mapped = rows
      .map((row) => ({
        level: toNumber(row.level, 1),
        name: getLevelName(toNumber(row.level, 1)),
        dailyGoldCap: toNumber(row.dailyGoldCap, 1000),
        rate: toNumber(row.miningRate, toNumber(row.dailyGoldCap, 1000) / 86400),
        cost: toNumber(row.upgradeCost, 0),
      }))
      .sort((a, b) => a.level - b.level);

    setLevels(mapped);
  }, [apiFetch]);

  const fetchTasks = useCallback(async () => {
    const rows = (await apiFetch("/api/config/tasks")) as ApiTask[];
    setTasks(rows.map(mapTask));
  }, [apiFetch]);

  const fetchReferralHistory = useCallback(async () => {
    const rows = (await apiFetch("/api/user/referrals")) as Array<{
      invitedId: number;
      invitedName: string;
      goldReward: number | string;
      usdtReward?: number | string;
      status?: string;
      createdAt: string;
      rewardedAt?: string | null;
    }>;

    setReferrals(
      rows.map((row) => ({
        invitedId: toNumber(row.invitedId),
        invitedName: row.invitedName || `Người dùng ${row.invitedId}`,
        goldReward: toNumber(row.goldReward),
        usdtReward: toNumber(row.usdtReward),
        status: row.status === "pending" ? "pending" : "rewarded",
        createdAt: row.createdAt,
        rewardedAt: row.rewardedAt || null,
      })),
    );
  }, [apiFetch]);

  const fetchLuckyDrawInfo = useCallback(async () => {
    const data = (await apiFetch("/api/lucky-draw/info")) as {
      config: Partial<LuckyDrawConfig>;
      participantCount: number;
      isJoined: boolean;
      lastWinners: LuckyWinner | null;
    };

    setLuckyDraw({
      config: {
        totalPrize: toNumber(data.config?.totalPrize),
        top1Percent: toNumber(data.config?.top1Percent, 40),
        top2Percent: toNumber(data.config?.top2Percent, 25),
        top3Percent: toNumber(data.config?.top3Percent, 15),
        top4Percent: toNumber(data.config?.top4Percent, 10),
        top5Percent: toNumber(data.config?.top5Percent, 10),
        entryFee: toNumber(data.config?.entryFee, 1000),
        drawHour: toNumber(data.config?.drawHour, 23),
        drawMinute: toNumber(data.config?.drawMinute, 59),
      },
      participantCount: toNumber(data.participantCount, 0),
      isJoined: Boolean(data.isJoined),
      lastWinners: data.lastWinners || null,
    });
  }, [apiFetch]);

  const fetchFlappyConfig = useCallback(async () => {
    const data = (await apiFetch("/api/flappy/config")) as {
      rewardGold?: number | string;
      bestScore?: number | string;
    };

    setFlappyConfig({
      rewardGold: toNumber(data.rewardGold),
      bestScore: toNumber(data.bestScore),
    });
  }, [apiFetch]);

  const fetchEconomyConfig = useCallback(async () => {
    const data = (await apiFetch("/api/config/economy")) as Partial<EconomyConfig>;
    setEconomyConfig({
      newUserGold: toNumber(data.newUserGold, EMPTY_ECONOMY_CONFIG.newUserGold),
      referralRewardGold: toNumber(data.referralRewardGold, EMPTY_ECONOMY_CONFIG.referralRewardGold),
      referralRewardUsdt: toNumber(data.referralRewardUsdt, EMPTY_ECONOMY_CONFIG.referralRewardUsdt),
      withdrawMinGold: toNumber(data.withdrawMinGold, EMPTY_ECONOMY_CONFIG.withdrawMinGold),
      withdrawVndPerGold: toNumber(data.withdrawVndPerGold, EMPTY_ECONOMY_CONFIG.withdrawVndPerGold),
      usdToVndRateK: Math.max(1, toNumber(data.usdToVndRateK, EMPTY_ECONOMY_CONFIG.usdToVndRateK)),
      taskMilestoneCount: toNumber(data.taskMilestoneCount, EMPTY_ECONOMY_CONFIG.taskMilestoneCount),
      taskMilestoneRewardGold: toNumber(data.taskMilestoneRewardGold, EMPTY_ECONOMY_CONFIG.taskMilestoneRewardGold),
    });
  }, [apiFetch]);

  const fetchLixiInfo = useCallback(async () => {
    const data = (await apiFetch("/api/lixi/info")) as ApiLixiInfoResult;
    setLixi(normalizeLixiInfo(data));

    if (data.serverTime !== undefined) {
      setServerOffset(toNumber(data.serverTime) - Date.now());
    }
  }, [apiFetch]);

  const fetchAdminData = useCallback(async () => {
    const data = (await apiFetch("/api/admin/data")) as AdminDataResult;
    const lixiSnapshot = normalizeLixiInfo({
      config: data.lixiConfig,
      state: data.lixiState,
      user: {
        hasClaimed: false,
        rewardGold: 0,
        claimedAt: null,
      },
    });

    setAdminData({
      users: data.users.map((user) => ({
        teleId: toNumber(user.teleId),
        username: user.username || `User ${user.teleId}`,
        gold: toNumber(user.gold),
        usdtBalance: toNumber(user.usdtBalance),
        level: toNumber(user.level, 1),
        dailyGoldCap: toNumber(user.dailyGoldCap, 1000),
      })),
      totalGold: toNumber(data.totalGold),
      totalUsdt: toNumber(data.totalUsdt),
      pendingWithdraws: data.pendingWithdraws.map((item) => ({
        id: toNumber(item.id),
        teleId: toNumber(item.teleId),
        username: item.username || `User ${item.teleId}`,
        sourceWallet: item.sourceWallet || "gold",
        sourceCurrency: item.sourceCurrency || "GOLD",
        sourceAmount: toNumber(item.sourceAmount, toNumber(item.amount)),
        accountName: item.accountName || "",
        bankName: item.bankName || "",
        accountNumber: item.accountNumber || "",
        vnd: toNumber(item.vnd),
        method: item.method || "bank",
        network: item.network || "",
        feePercent: toNumber(item.feePercent),
        feeAmount: toNumber(item.feeAmount),
        payoutAmount: toNumber(item.payoutAmount, toNumber(item.vnd)),
        payoutCurrency: item.payoutCurrency || "VND",
        qrUrl: item.qrUrl || null,
        status: item.status || "",
      })),
      flappyConfig: {
        rewardGold: toNumber(data.flappyConfig?.rewardGold),
        bestScore: flappyConfig.bestScore,
      },
      lixiConfig: lixiSnapshot.config,
      lixiState: lixiSnapshot.state,
    });
  }, [apiFetch, flappyConfig.bestScore]);

  const syncFromBackend = useCallback(async () => {
    if (!teleId) return;
    const user = (await apiFetch(`/api/user/${teleId}`)) as ApiUser;
    applyUserSnapshot(user);
  }, [apiFetch, applyUserSnapshot, teleId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready?.();
      tg.expand?.();
    }

    const readTelegramState = () => {
      const webApp = window.Telegram?.WebApp;
      const rawInitData = webApp?.initData || "";
      const user = webApp?.initDataUnsafe?.user;

      setInitData(rawInitData);
      setTeleId(user?.id ?? null);
      setIsTelegramApp(Boolean(rawInitData));

      const displayName = user?.first_name
        ? `${user.first_name}${user.last_name ? ` ${user.last_name}` : ""}`
        : user?.username;
      if (displayName) setUsername(displayName);
    };

    readTelegramState();

    const timer = window.setInterval(() => {
      readTelegramState();
      if (window.Telegram?.WebApp?.initData && window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
        window.clearInterval(timer);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (!initData || !teleId) {
        setError("Ứng dụng cần mở trong Telegram để xác thực backend.");
        setIsLoaded(true);
        return;
      }

      setError(null);
      setIsLoaded(false);

      try {
        await fetchLevels();
        await syncFromBackend();
        await Promise.all([
          fetchTasks(),
          fetchReferralHistory(),
          fetchLuckyDrawInfo(),
          fetchFlappyConfig(),
          fetchEconomyConfig(),
          fetchLixiInfo(),
        ]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Không thể tải dữ liệu từ backend.");
        }
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [
    fetchEconomyConfig,
    fetchFlappyConfig,
    fetchLevels,
    fetchLixiInfo,
    fetchLuckyDrawInfo,
    fetchReferralHistory,
    fetchTasks,
    initData,
    syncFromBackend,
    teleId,
  ]);

  useEffect(() => {
    if (!newbieLock.required) {
      if (didShowNewbieLockNotice) {
        setDidShowNewbieLockNotice(false);
      }
      return;
    }

    if (currentPage !== "tasks") {
      setCurrentPageState("tasks");
    }

    if (!didShowNewbieLockNotice && typeof window !== "undefined") {
      window.alert(newbieLock.message || NEWBIE_LOCK_FALLBACK_MESSAGE);
      setDidShowNewbieLockNotice(true);
    }
  }, [currentPage, didShowNewbieLockNotice, newbieLock.message, newbieLock.required]);

  useEffect(() => {
    if (!isLoaded || !initData) return;

    if (currentPage === "tasks") {
      void fetchTasks();
    }
    if (currentPage === "home") {
      void fetchLixiInfo();
    }
    if (currentPage === "friends") {
      void Promise.all([fetchReferralHistory(), fetchEconomyConfig()]);
    }
    if (currentPage === "lucky") {
      void fetchLuckyDrawInfo();
    }
    if (currentPage === "flappy") {
      void fetchFlappyConfig();
    }
    if (currentPage === "withdraw") {
      void Promise.all([syncFromBackend(), fetchEconomyConfig()]);
    }
    if (currentPage === "tasks") {
      void fetchEconomyConfig();
    }
    if (currentPage === "admin" && teleId && String(teleId) === ADMIN_ID) {
      void fetchAdminData();
    }
  }, [
    currentPage,
    fetchAdminData,
    fetchEconomyConfig,
    fetchFlappyConfig,
    fetchLixiInfo,
    fetchLuckyDrawInfo,
    fetchReferralHistory,
    fetchTasks,
    initData,
    isLoaded,
    syncFromBackend,
    teleId,
  ]);

  useEffect(() => {
    if (!isMining || !miningStartTime) {
      setGold(serverGoldBase);
      return;
    }

    const updateVisualGold = () => {
      const now = Date.now() + serverOffset;
      const elapsedSinceCheckpoint = Math.max(0, now - miningStartTime);
      const shiftCap = Math.max(0, dailyGoldCap / 4);
      const projectedProgress = Math.min(shiftCap, miningShiftProgress + (elapsedSinceCheckpoint / 1000) * miningRate);
      const visualEarned = Math.max(0, Math.floor(projectedProgress) - Math.floor(miningShiftProgress));
      setGold(serverGoldBase + visualEarned);
    };

    updateVisualGold();
    const interval = window.setInterval(updateVisualGold, 1000);
    return () => window.clearInterval(interval);
  }, [
    dailyGoldCap,
    isMining,
    miningRate,
    miningShiftProgress,
    miningStartTime,
    serverGoldBase,
    serverOffset,
  ]);

  const startMining = useCallback(async () => {
    const lockMessage = enforceNewbieTaskLock();
    if (lockMessage) {
      return { success: false, error: lockMessage };
    }

    try {
      const data = (await apiFetch("/api/game/start-mining", { method: "POST" })) as {
        success?: boolean;
        miningStartTime: number;
        miningShiftStart: number;
        error?: string;
      };

      if (!data.success) {
        return { success: false, error: data.error || "Không thể bắt đầu đào." };
      }

      setIsMining(true);
      setMiningStartTime(toNumber(data.miningStartTime, Date.now()));
      setMiningShiftStart(toNumber(data.miningShiftStart, Date.now()));
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Không thể bắt đầu đào." };
    }
  }, [apiFetch, enforceNewbieTaskLock]);

  const claimMining = useCallback(async () => {
    const lockMessage = enforceNewbieTaskLock();
    if (lockMessage) {
      return { success: false, error: lockMessage };
    }

    try {
      const data = (await apiFetch("/api/game/claim-mining", { method: "POST" })) as {
        success?: boolean;
        gold: number;
        error?: string;
      };

      if (!data.success) {
        return { success: false, error: data.error || "Không thể thu hoạch." };
      }

      const nextGold = toNumber(data.gold);
      setGold(nextGold);
      setServerGoldBase(nextGold);
      setIsMining(false);
      setMiningStartTime(null);
      setMiningShiftStart(null);
      triggerConfetti();

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Không thể thu hoạch." };
    }
  }, [apiFetch, enforceNewbieTaskLock, triggerConfetti]);

  const upgradeLevel = useCallback(
    async (_targetLevel: number, _cost: number) => {
      if (enforceNewbieTaskLock(true)) {
        return false;
      }

      try {
        const data = (await apiFetch("/api/game/upgrade", { method: "POST" })) as {
          success?: boolean;
          level?: number;
          miningRate?: number;
          dailyGoldCap?: number;
          usdtBalance?: number;
        };

        if (!data.success) return false;

        if (typeof data.level === "number") setLevel(data.level);
        if (typeof data.miningRate === "number") setMiningRate(data.miningRate);
        if (typeof data.dailyGoldCap === "number") setDailyGoldCap(data.dailyGoldCap);
        if (typeof data.usdtBalance === "number") setUsdtBalance(data.usdtBalance);

        triggerConfetti();
        void fetchLevels();
        return true;
      } catch {
        return false;
      }
    },
    [apiFetch, enforceNewbieTaskLock, fetchLevels, triggerConfetti],
  );

  const claimTask = useCallback(
    async (taskId: string) => {
      try {
        const data = (await apiFetch("/api/task/claim", {
          method: "POST",
          body: JSON.stringify({ taskId }),
        })) as TaskClaimResult;

        if (!data.success) {
          return { success: false, error: data.error || data.message || "Không thể nhận thưởng." };
        }

        if (data.user) applyUserSnapshot(data.user);
        await fetchTasks();
        triggerConfetti();

        return { success: true, reward: data.reward, milestoneReward: data.milestoneReward };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Không thể nhận thưởng." };
      }
    },
    [apiFetch, applyUserSnapshot, fetchTasks, triggerConfetti],
  );

  const submitFlappyScore = useCallback(
    async (score: number) => {
      const lockMessage = enforceNewbieTaskLock();
      if (lockMessage) {
        return { success: false, error: lockMessage };
      }

      try {
        const data = (await apiFetch("/api/flappy/submit-score", {
          method: "POST",
          body: JSON.stringify({ score }),
        })) as ApiResult & {
          user?: ApiUser;
          bestScore?: number | string;
          isNewBest?: boolean;
          rewardGold?: number | string;
        };

        if (!data.success) {
          return { success: false, error: data.error || data.message || "Khong the luu diem." };
        }

        if (data.user) applyUserSnapshot(data.user);
        if (data.bestScore !== undefined) {
          setFlappyConfig((prev) => ({
            ...prev,
            bestScore: toNumber(data.bestScore, prev.bestScore),
          }));
        }

        return {
          success: true,
          isNewBest: Boolean(data.isNewBest),
          bestScore: toNumber(data.bestScore),
          rewardGold: toNumber(data.rewardGold),
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Khong the luu diem." };
      }
    },
    [apiFetch, applyUserSnapshot, enforceNewbieTaskLock],
  );

  const withdraw = useCallback(
    async (payload: WithdrawPayload) => {
      const lockMessage = enforceNewbieTaskLock();
      if (lockMessage) {
        return { success: false, error: lockMessage };
      }

      try {
        const data = (await apiFetch("/api/withdraw/create", {
          method: "POST",
          body: JSON.stringify(payload),
        })) as ResourceResult;

        if (!data.success || !data.user) {
          return { success: false, error: data.error || data.message || "Không thể gửi lệnh rút." };
        }

        applyUserSnapshot(data.user);
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Không thể gửi lệnh rút." };
      }
    },
    [apiFetch, applyUserSnapshot, enforceNewbieTaskLock],
  );

  const redeemGiftCode = useCallback(
    async (code: string): Promise<GiftCodeRedeemResult> => {
      const lockMessage = enforceNewbieTaskLock();
      if (lockMessage) {
        return { success: false, error: lockMessage };
      }

      try {
        const data = (await apiFetch("/api/user/redeem", {
          method: "POST",
          body: JSON.stringify({ code: code.toUpperCase() }),
        })) as ResourceResult & { rewardGold?: number; rewardUsd?: number };

        if (!data.success || !data.user) {
          return { success: false, error: data.error || data.message || "Giftcode không hợp lệ." };
        }

        applyUserSnapshot(data.user);
        triggerConfetti();

        return {
          success: true,
          rewardGold: toNumber(data.rewardGold),
          rewardUsd: toNumber(data.rewardUsd),
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Giftcode không hợp lệ." };
      }
    },
    [apiFetch, applyUserSnapshot, enforceNewbieTaskLock, triggerConfetti],
  );

  const joinLuckyDraw = useCallback(async () => {
    const lockMessage = enforceNewbieTaskLock();
    if (lockMessage) {
      return { success: false, error: lockMessage };
    }

    try {
      const data = (await apiFetch("/api/lucky-draw/participate", {
        method: "POST",
      })) as ApiResult;

      if (!data.success) {
        return { success: false, error: data.error || data.message || "Không thể tham gia vòng quay." };
      }

      await Promise.all([syncFromBackend(), fetchLuckyDrawInfo()]);
      triggerConfetti();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Không thể tham gia vòng quay." };
    }
  }, [apiFetch, enforceNewbieTaskLock, fetchLuckyDrawInfo, syncFromBackend, triggerConfetti]);

  const inviteLink = useMemo(() => {
    if (!teleId) return "";
    return `https://t.me/Daoxu100_bot/Daoxu100?startapp=${teleId}`;
  }, [teleId]);

  const copyInviteLink = useCallback(async () => {
    if (!inviteLink) return false;
    try {
      await navigator.clipboard.writeText(inviteLink);
      return true;
    } catch {
      return false;
    }
  }, [inviteLink]);

  const shareInviteLink = useCallback(() => {
    if (!inviteLink) return;

    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent("Vào đào vàng cùng mình nhé!")}`;
    const tg = window.Telegram?.WebApp;

    if (tg?.openLink) {
      tg.openLink(shareUrl);
      return;
    }

    window.open(shareUrl, "_blank", "noopener,noreferrer");
  }, [inviteLink]);

  const openTaskLink = useCallback((url: string) => {
    if (!url) return;
    const tg = window.Telegram?.WebApp;

    if (tg?.openLink) {
      tg.openLink(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const currentLevelInfo = useMemo(() => {
    const source = levels.length > 0 ? levels : LEVELS;
    return (
      source.find((item) => item.level === level) ?? {
        level,
        name: getLevelName(level),
        rate: miningRate,
        dailyGoldCap,
        cost: 0,
      }
    );
  }, [dailyGoldCap, level, levels, miningRate]);

  const updateWithdrawStatus = useCallback(
    async (withdrawId: number, newStatus: string, reason = "") => {
      try {
        const data = (await apiFetch("/api/admin/withdraw/status", {
          method: "POST",
          body: JSON.stringify({ withdrawId, newStatus, reason }),
        })) as ApiResult;

        if (!data.success) {
          return { success: false, error: data.error || data.message || "Không thể cập nhật lệnh rút." };
        }

        await fetchAdminData();
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Không thể cập nhật lệnh rút." };
      }
    },
    [apiFetch, fetchAdminData],
  );

  const updateFlappyConfig = useCallback(
    async (rewardGold: number) => {
      try {
        const data = (await apiFetch("/api/admin/flappy/config", {
          method: "POST",
          body: JSON.stringify({ rewardGold }),
        })) as ApiResult;

        if (!data.success) {
          return { success: false, error: data.error || data.message || "Khong the cap nhat thuong flappy." };
        }

        setFlappyConfig((prev) => ({
          ...prev,
          rewardGold,
        }));
        await fetchAdminData();
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Khong the cap nhat thuong flappy." };
      }
    },
    [apiFetch, fetchAdminData],
  );

  const claimLixi = useCallback(async () => {
    const lockMessage = enforceNewbieTaskLock();
    if (lockMessage) {
      return { success: false, error: lockMessage };
    }

    try {
      const data = (await apiFetch("/api/lixi/claim", {
        method: "POST",
      })) as LixiClaimResult;

      if (!data.success) {
        return { success: false, error: data.error || data.message || "Khong the nhan li xi luc nay." };
      }

      if (data.user) {
        applyUserSnapshot(data.user);
      }

      if (data.lixi) {
        setLixi(normalizeLixiInfo(data.lixi));

        if (data.lixi.serverTime !== undefined) {
          setServerOffset(toNumber(data.lixi.serverTime) - Date.now());
        }
      } else {
        await fetchLixiInfo();
      }

      triggerConfetti();
      return { success: true, rewardGold: toNumber(data.rewardGold) };
    } catch (err) {
      try {
        await fetchLixiInfo();
      } catch {
        // ignore secondary refresh errors
      }

      return { success: false, error: err instanceof Error ? err.message : "Khong the nhan li xi luc nay." };
    }
  }, [apiFetch, applyUserSnapshot, enforceNewbieTaskLock, fetchLixiInfo, triggerConfetti]);

  const recordLixiAdView = useCallback(async () => {
    const lockMessage = enforceNewbieTaskLock();
    if (lockMessage) {
      return { success: false, error: lockMessage };
    }

    try {
      const data = (await apiFetch("/api/lixi/watch-ad", {
        method: "POST",
      })) as LixiWatchAdResult;

      if (!data.success) {
        return { success: false, error: data.error || data.message || "Khong the ghi nhan video li xi." };
      }

      if (data.lixi) {
        setLixi(normalizeLixiInfo(data.lixi));

        if (data.lixi.serverTime !== undefined) {
          setServerOffset(toNumber(data.lixi.serverTime) - Date.now());
        }
      } else {
        await fetchLixiInfo();
      }

      return {
        success: true,
        watchedAdViews: toNumber(data.watchedAdViews, lixi.user.watchedAdViews),
        remainingAdViews: toNumber(data.remainingAdViews, lixi.user.remainingAdViews),
      };
    } catch (err) {
      try {
        await fetchLixiInfo();
      } catch {
        // ignore secondary refresh errors
      }

      return { success: false, error: err instanceof Error ? err.message : "Khong the ghi nhan video li xi." };
    }
  }, [apiFetch, enforceNewbieTaskLock, fetchLixiInfo, lixi.user.remainingAdViews, lixi.user.watchedAdViews]);

  const updateLixiConfig = useCallback(
    async (minGold: number, maxGold: number) => {
      const safeMinGold = Math.max(0, Math.floor(minGold));
      const safeMaxGold = Math.max(safeMinGold, Math.floor(maxGold));

      try {
        const data = (await apiFetch("/api/admin/lixi/config", {
          method: "POST",
          body: JSON.stringify({
            minGold: safeMinGold,
            maxGold: safeMaxGold,
            maxClaimsPerRound: adminData.lixiConfig.maxClaimsPerRound,
            cooldownMinutes: adminData.lixiConfig.cooldownMinutes,
            requiredAdViews: adminData.lixiConfig.requiredAdViews,
          }),
        })) as ApiResult;

        if (!data.success) {
          return { success: false, error: data.error || data.message || "Khong the cap nhat cau hinh li xi." };
        }

        setLixi((current) => ({
          ...current,
          config: {
            ...current.config,
            minGold: safeMinGold,
            maxGold: safeMaxGold,
          },
        }));
        await Promise.all([fetchAdminData(), fetchLixiInfo()]);
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Khong the cap nhat cau hinh li xi." };
      }
    },
    [
      adminData.lixiConfig.cooldownMinutes,
      adminData.lixiConfig.maxClaimsPerRound,
      adminData.lixiConfig.requiredAdViews,
      apiFetch,
      fetchAdminData,
      fetchLixiInfo,
    ],
  );

  return {
    currentPage,
    setCurrentPage,
    gold,
    usdtBalance,
    setGold,
    level,
    dailyGoldCap,
    isMining,
    miningShiftStart,
    miningShiftProgress,
    miningRate,
    username,
    tasks,
    levels: levels.length > 0 ? levels : LEVELS,
    referrals,
    referralCount,
    luckyDraw,
    lixi,
    newbieLock,
    flappyConfig,
    economyConfig,
    withdrawHistory,
    adminData,
    inviteLink,
    isTelegramApp,
    teleId,
    isAdmin: teleId !== null && String(teleId) === ADMIN_ID,
    isLoaded,
    error,
    serverOffset,
    currentLevelInfo,
    startMining,
    claimMining,
    upgradeLevel,
    claimTask,
    submitFlappyScore,
    withdraw,
    redeemGiftCode,
    joinLuckyDraw,
    recordLixiAdView,
    claimLixi,
    fetchLuckyDrawInfo,
    fetchLixiInfo,
    fetchFlappyConfig,
    fetchAdminData,
    updateWithdrawStatus,
    updateLixiConfig,
    updateFlappyConfig,
    copyInviteLink,
    shareInviteLink,
    openTaskLink,
    syncFromBackend,
  };
}

export type GameStore = ReturnType<typeof useGameStore>;


