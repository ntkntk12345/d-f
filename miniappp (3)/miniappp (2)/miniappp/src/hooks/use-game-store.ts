import { useCallback, useEffect, useMemo, useState } from "react";
import confetti from "canvas-confetti";

export type PageId = "home" | "giftcode" | "shop" | "tasks" | "friends" | "lucky" | "exchange" | "withdraw" | "admin" | "flappy";

export type TaskType = "daily" | "one_time" | "community" | "ad";
export type TaskActionType = "click" | "join" | "react_heart";

export interface Task {
  id: string;
  title: string;
  icon: string;
  reward: number;
  rewardType: "gold" | "diamond";
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
  cost: number;
}

export interface ReferralRecord {
  invitedId: number;
  invitedName: string;
  goldReward: number;
  createdAt: string;
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
  rewardDiamonds: number;
  bestScore: number;
}

export interface WithdrawHistoryItem {
  id: number;
  amount: number;
  vnd: number;
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
  diamonds: number;
  level: number;
}

export interface AdminWithdrawItem {
  id: number;
  teleId: number;
  username: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  vnd: number;
  qrUrl?: string | null;
  status: string;
}

export interface AdminData {
  users: AdminUser[];
  totalGold: number;
  totalDiamonds: number;
  pendingWithdraws: AdminWithdrawItem[];
  flappyConfig: FlappyConfig;
}

export interface WithdrawPayload {
  amount: number;
  bankBin: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}

interface ApiLevelSetting {
  level: number;
  miningRate: number | string;
  upgradeCost: number | string;
}

interface ApiTask {
  id: string;
  title: string;
  icon: string;
  rewardType: "gold" | "diamond" | "diamonds";
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
  diamonds: number | string;
  level: number | string;
  miningRate: number | string;
  isMining: number | boolean;
  miningStartTime: number | null;
  miningShiftStart: number | null;
  referrals?: number | string;
  flappyBestScore?: number | string;
  withdrawHistory?: Array<{
    id: number;
    amount: number | string;
    vnd: number | string;
    bankName: string;
    accountNumber: string;
    status: string;
    date: string;
    qrUrl?: string | null;
    message?: string;
  }>;
  serverTime?: number;
}

interface ApiResult {
  success?: boolean;
  error?: string;
  message?: string;
}

interface TaskClaimResult extends ApiResult {
  reward?: {
    type: "gold" | "diamond";
    amount: number;
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
      rewardDiamonds: number;
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
    diamonds: number | string;
    level: number | string;
  }>;
  totalGold: number | string;
  totalDiamonds: number | string;
  pendingWithdraws: Array<{
    id: number | string;
    teleId: number | string;
    username: string;
    accountName: string;
    bankName: string;
    accountNumber: string;
    vnd: number | string;
    qrUrl?: string | null;
    status: string;
  }>;
  flappyConfig?: {
    rewardGold?: number | string;
    rewardDiamonds?: number | string;
  };
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

const LEVEL_NAME_MAP: Record<number, string> = {
  1: "Mỏ Đá",
  2: "Mỏ Đồng",
  3: "Mỏ Bạc",
  4: "Mỏ Vàng",
  5: "Mỏ Bạch Kim",
  6: "Mỏ Kim Cương",
};

export const LEVELS: LevelInfo[] = [
  { level: 1, name: "Mỏ Đá", rate: 7, cost: 5000 },
  { level: 2, name: "Mỏ Đồng", rate: 15, cost: 7500 },
  { level: 3, name: "Mỏ Bạc", rate: 35, cost: 11250 },
  { level: 4, name: "Mỏ Vàng", rate: 80, cost: 16875 },
  { level: 5, name: "Mỏ Bạch Kim", rate: 200, cost: 25312 },
  { level: 6, name: "Mỏ Kim Cương", rate: 500, cost: 37968 },
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
  rewardDiamonds: 0,
  bestScore: 0,
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
  const type: TaskType = ["daily", "one_time", "community", "ad"].includes(task.type)
    ? (task.type as TaskType)
    : "one_time";

  const rewardType: "gold" | "diamond" = task.rewardType === "diamond" || task.rewardType === "diamonds" ? "diamond" : "gold";
  const actionType: TaskActionType =
    task.actionType === "join" || task.actionType === "react_heart" ? task.actionType : "click";

  let done = false;
  if (type === "daily" && task.lastClaimedAt) {
    done = toVNDateKey(task.lastClaimedAt) === toVNDateKey(new Date());
  } else if (type === "one_time" || type === "community") {
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

export function useGameStore() {
  const [currentPage, setCurrentPage] = useState<PageId>("home");
  const [gold, setGold] = useState(0);
  const [diamonds, setDiamonds] = useState(1000);
  const [level, setLevel] = useState(1);
  const [isMining, setIsMining] = useState(false);
  const [miningStartTime, setMiningStartTime] = useState<number | null>(null);
  const [miningShiftStart, setMiningShiftStart] = useState<number | null>(null);
  const [serverGoldBase, setServerGoldBase] = useState(0);
  const [serverOffset, setServerOffset] = useState(0);
  const [miningRate, setMiningRate] = useState(7);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [levels, setLevels] = useState<LevelInfo[]>([]);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [luckyDraw, setLuckyDraw] = useState<LuckyDrawInfo>(EMPTY_LUCKY_DRAW);
  const [flappyConfig, setFlappyConfig] = useState<FlappyConfig>(EMPTY_FLAPPY_CONFIG);
  const [withdrawHistory, setWithdrawHistory] = useState<WithdrawHistoryItem[]>([]);
  const [referralCount, setReferralCount] = useState(0);
  const [adminData, setAdminData] = useState<AdminData>({
    users: [],
    totalGold: 0,
    totalDiamonds: 0,
    pendingWithdraws: [],
    flappyConfig: EMPTY_FLAPPY_CONFIG,
  });

  const [username, setUsername] = useState("Thợ Mỏ");
  const [initData, setInitData] = useState("");
  const [teleId, setTeleId] = useState<number | null>(null);
  const [isTelegramApp, setIsTelegramApp] = useState(false);

  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setDiamonds(toNumber(user.diamonds, 0));
    setLevel(toNumber(user.level, 1));
    setMiningRate(toNumber(user.miningRate, 7));
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

    if (Array.isArray(user.withdrawHistory)) {
      setWithdrawHistory(
        user.withdrawHistory.map((item) => ({
          id: toNumber(item.id),
          amount: toNumber(item.amount),
          vnd: toNumber(item.vnd),
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
        rate: toNumber(row.miningRate, 7),
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
      createdAt: string;
    }>;

    setReferrals(
      rows.map((row) => ({
        invitedId: toNumber(row.invitedId),
        invitedName: row.invitedName || `Người dùng ${row.invitedId}`,
        goldReward: toNumber(row.goldReward),
        createdAt: row.createdAt,
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
      rewardDiamonds?: number | string;
      bestScore?: number | string;
    };

    setFlappyConfig({
      rewardGold: toNumber(data.rewardGold),
      rewardDiamonds: toNumber(data.rewardDiamonds),
      bestScore: toNumber(data.bestScore),
    });
  }, [apiFetch]);

  const fetchAdminData = useCallback(async () => {
    const data = (await apiFetch("/api/admin/data")) as AdminDataResult;
    setAdminData({
      users: data.users.map((user) => ({
        teleId: toNumber(user.teleId),
        username: user.username || `User ${user.teleId}`,
        gold: toNumber(user.gold),
        diamonds: toNumber(user.diamonds),
        level: toNumber(user.level, 1),
      })),
      totalGold: toNumber(data.totalGold),
      totalDiamonds: toNumber(data.totalDiamonds),
      pendingWithdraws: data.pendingWithdraws.map((item) => ({
        id: toNumber(item.id),
        teleId: toNumber(item.teleId),
        username: item.username || `User ${item.teleId}`,
        accountName: item.accountName || "",
        bankName: item.bankName || "",
        accountNumber: item.accountNumber || "",
        vnd: toNumber(item.vnd),
        qrUrl: item.qrUrl || null,
        status: item.status || "",
      })),
      flappyConfig: {
        rewardGold: toNumber(data.flappyConfig?.rewardGold),
        rewardDiamonds: toNumber(data.flappyConfig?.rewardDiamonds),
        bestScore: flappyConfig.bestScore,
      },
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
        await Promise.all([fetchTasks(), fetchReferralHistory(), fetchLuckyDrawInfo(), fetchFlappyConfig()]);
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
  }, [fetchFlappyConfig, fetchLevels, fetchLuckyDrawInfo, fetchReferralHistory, fetchTasks, initData, syncFromBackend, teleId]);

  useEffect(() => {
    if (!isLoaded || !initData) return;

    if (currentPage === "tasks") {
      void fetchTasks();
    }
    if (currentPage === "friends") {
      void fetchReferralHistory();
    }
    if (currentPage === "lucky") {
      void fetchLuckyDrawInfo();
    }
    if (currentPage === "flappy") {
      void fetchFlappyConfig();
    }
    if (currentPage === "withdraw") {
      void syncFromBackend();
    }
    if (currentPage === "admin" && teleId && String(teleId) === ADMIN_ID) {
      void fetchAdminData();
    }
  }, [currentPage, fetchAdminData, fetchFlappyConfig, fetchLuckyDrawInfo, fetchReferralHistory, fetchTasks, initData, isLoaded, syncFromBackend, teleId]);

  useEffect(() => {
    if (!isMining || !miningStartTime) {
      setGold(serverGoldBase);
      return;
    }

    const updateVisualGold = () => {
      const now = Date.now() + serverOffset;
      const shiftStart = miningShiftStart ?? miningStartTime;
      const elapsedSinceShiftStart = Math.max(0, now - shiftStart);
      const cappedShiftElapsed = Math.min(elapsedSinceShiftStart, SHIFT_DURATION_MS);
      const elapsedBeforeCheckpoint = Math.max(0, miningStartTime - shiftStart);
      const localElapsed = Math.max(0, cappedShiftElapsed - elapsedBeforeCheckpoint);

      const visualEarned = Math.floor((localElapsed / 1000) * miningRate);
      setGold(serverGoldBase + visualEarned);
    };

    updateVisualGold();
    const interval = window.setInterval(updateVisualGold, 1000);
    return () => window.clearInterval(interval);
  }, [isMining, miningRate, miningShiftStart, miningStartTime, serverGoldBase, serverOffset]);

  const startMining = useCallback(async () => {
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
  }, [apiFetch]);

  const claimMining = useCallback(async () => {
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
  }, [apiFetch, triggerConfetti]);

  const upgradeLevel = useCallback(
    async (_targetLevel: number, _cost: number) => {
      try {
        const data = (await apiFetch("/api/game/upgrade", { method: "POST" })) as {
          success?: boolean;
          level?: number;
          miningRate?: number;
          diamonds?: number;
        };

        if (!data.success) return false;

        if (typeof data.level === "number") setLevel(data.level);
        if (typeof data.miningRate === "number") setMiningRate(data.miningRate);
        if (typeof data.diamonds === "number") setDiamonds(data.diamonds);

        triggerConfetti();
        void fetchLevels();
        return true;
      } catch {
        return false;
      }
    },
    [apiFetch, fetchLevels, triggerConfetti],
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

        return { success: true, reward: data.reward };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Không thể nhận thưởng." };
      }
    },
    [apiFetch, applyUserSnapshot, fetchTasks, triggerConfetti],
  );

  const submitFlappyScore = useCallback(
    async (score: number) => {
      try {
        const data = (await apiFetch("/api/flappy/submit-score", {
          method: "POST",
          body: JSON.stringify({ score }),
        })) as ApiResult & {
          user?: ApiUser;
          bestScore?: number | string;
          isNewBest?: boolean;
          rewardGold?: number | string;
          rewardDiamonds?: number | string;
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
          rewardDiamonds: toNumber(data.rewardDiamonds),
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Khong the luu diem." };
      }
    },
    [apiFetch, applyUserSnapshot],
  );

  const exchangeGoldForDiamonds = useCallback(
    async (goldAmount: number) => {
      try {
        const data = (await apiFetch("/api/game/exchange", {
          method: "POST",
          body: JSON.stringify({ amount: goldAmount }),
        })) as ResourceResult;

        if (!data.success || !data.user) {
          return { success: false, error: data.error || data.message || "Không thể đổi KC." };
        }

        applyUserSnapshot(data.user);
        triggerConfetti();
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Không thể đổi KC." };
      }
    },
    [apiFetch, applyUserSnapshot, triggerConfetti],
  );

  const withdraw = useCallback(
    async (payload: WithdrawPayload) => {
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
    [apiFetch, applyUserSnapshot],
  );

  const redeemGiftCode = useCallback(
    async (code: string): Promise<GiftCodeRedeemResult> => {
      try {
        const data = (await apiFetch("/api/user/redeem", {
          method: "POST",
          body: JSON.stringify({ code: code.toUpperCase() }),
        })) as ResourceResult & { rewardGold?: number; rewardDiamonds?: number };

        if (!data.success || !data.user) {
          return { success: false, error: data.error || data.message || "Giftcode không hợp lệ." };
        }

        applyUserSnapshot(data.user);
        triggerConfetti();

        return {
          success: true,
          rewardGold: toNumber(data.rewardGold),
          rewardDiamonds: toNumber(data.rewardDiamonds),
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Giftcode không hợp lệ." };
      }
    },
    [apiFetch, applyUserSnapshot, triggerConfetti],
  );

  const joinLuckyDraw = useCallback(async () => {
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
  }, [apiFetch, fetchLuckyDrawInfo, syncFromBackend, triggerConfetti]);

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
        cost: 0,
      }
    );
  }, [level, levels, miningRate]);

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
    async (rewardGold: number, rewardDiamonds: number) => {
      try {
        const data = (await apiFetch("/api/admin/flappy/config", {
          method: "POST",
          body: JSON.stringify({ rewardGold, rewardDiamonds }),
        })) as ApiResult;

        if (!data.success) {
          return { success: false, error: data.error || data.message || "Khong the cap nhat thuong flappy." };
        }

        setFlappyConfig((prev) => ({
          ...prev,
          rewardGold,
          rewardDiamonds,
        }));
        await fetchAdminData();
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Khong the cap nhat thuong flappy." };
      }
    },
    [apiFetch, fetchAdminData],
  );

  return {
    currentPage,
    setCurrentPage,
    gold,
    setGold,
    diamonds,
    setDiamonds,
    level,
    isMining,
    miningShiftStart,
    miningRate,
    username,
    tasks,
    levels: levels.length > 0 ? levels : LEVELS,
    referrals,
    referralCount,
    luckyDraw,
    flappyConfig,
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
    exchangeGoldForDiamonds,
    withdraw,
    redeemGiftCode,
    joinLuckyDraw,
    fetchLuckyDrawInfo,
    fetchFlappyConfig,
    fetchAdminData,
    updateWithdrawStatus,
    updateFlappyConfig,
    copyInviteLink,
    shareInviteLink,
    openTaskLink,
    syncFromBackend,
  };
}

export type GameStore = ReturnType<typeof useGameStore>;
