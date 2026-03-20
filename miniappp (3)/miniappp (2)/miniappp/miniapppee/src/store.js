import { reactive, watch } from 'vue';

const savedState = JSON.parse(localStorage.getItem('mining_game_state') || '{}');
const SHIFT_DURATION_MS = 6 * 60 * 60 * 1000;

// Initialize Telegram SDK correctly
const tg = window.Telegram?.WebApp;
const tgUser = tg?.initDataUnsafe?.user;
const isTelegramApp = !!(tg?.initData && tg.initData.length > 0);

// Initialize Telegram WebApp if available
if (tg) {
  tg.ready();
  tg.expand();
}


// Helper: Auth Headers
export const getAuthHeaders = () => {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${window.Telegram?.WebApp?.initData || ''}`
  };
};

// Helper: Format number
export const formatNumber = (num) => {
  if (num === null || num === undefined) return '0';
  return Math.floor(Number(num)).toLocaleString('de-DE');
};

// Function to generate a random name for guests (fallback only)
const getRandomName = () => {
  const names = ['Lộc Xuân', 'Tài Lộc', 'Phú Quý', 'An Khang', 'Thịnh Vượng'];
  return names[Math.floor(Math.random() * names.length)] + ' ' + (Math.floor(Math.random() * 899) + 100);
};

export const state = reactive({
  isTelegramApp,
  username: tgUser?.first_name
    ? (tgUser.last_name ? `${tgUser.first_name} ${tgUser.last_name}` : tgUser.first_name)
    : (tgUser?.username || savedState.username || getRandomName()),
  gold: savedState.gold || 0,
  goldBeforeShift: savedState.goldBeforeShift || savedState.gold || 0,
  diamonds: savedState.diamonds || 1000,
  level: savedState.level || 1,
  miningRate: savedState.miningRate || 7,
  upgradeCost: savedState.upgradeCost || 5000,
  isMining: savedState.isMining || false,
  miningStartTime: savedState.miningStartTime || null,
  miningShiftStart: savedState.miningShiftStart || null,
  goldHistory: savedState.goldHistory || [],
  // Only use Telegram ID if in Telegram context, otherwise use saved ID or null
  teleId: tgUser?.id || (isTelegramApp ? null : savedState.teleId) || null,
  referrals: savedState.referrals || 0,
  referralHistory: [],
  currentPage: 'home',
  lastTaskClaim: savedState.lastTaskClaim || null,
  withdrawHistory: savedState.withdrawHistory || [],
  levelSettings: [],
  backendTasks: [],
  banks: [],
  luckyDraw: {
    config: { totalPrize: 0, top1Percent: 40, top2Percent: 25, top3Percent: 15, top4Percent: 10, top5Percent: 10, entryFee: 1000, drawHour: 23, drawMinute: 59 },
    participantCount: 0,
    isJoined: false,
    lastWinners: null
  },
  serverOffset: 0,
  isLoaded: false
});

export const adminState = reactive({
  allUsers: [],
  pendingWithdraws: [],
  giftCodes: [],
  levels: [],
  tasks: [],
  luckyDraw: {
    config: {},
    overrides: []
  },
  totalGold: 0,
  totalDiamonds: 0
});

// --- Backend Config ---
export async function fetchConfigs() {
  try {
    const [levRes, taskRes] = await Promise.all([
      fetch('/api/config/levels', { headers: getAuthHeaders() }),
      fetch('/api/config/tasks', { headers: getAuthHeaders() })
    ]);
    state.levelSettings = await levRes.json();
    state.backendTasks = await taskRes.json();
    updateMiningStatsFromLevel();
  } catch (err) { console.error('Config fetch failed', err); }
}

function updateMiningStatsFromLevel() {
  const setting = state.levelSettings.find(l => l.level === state.level);
  const nextSetting = state.levelSettings.find(l => l.level === state.level + 1);
  if (setting) state.miningRate = setting.miningRate;
  if (nextSetting) state.upgradeCost = nextSetting.upgradeCost;
}

// --- Referral Link Logic ---
export const getInviteLink = () => {
  return `https://t.me/Daoxu100_bot/Daoxu100?startapp=${state.teleId}`;
};

export const copyInviteLink = () => {
  const link = getInviteLink();
  navigator.clipboard.writeText(link);
};

// --- Backend Sync ---
export async function syncFromBackend() {
  try {
    const res = await fetch(`/api/user/${state.teleId}`, { headers: getAuthHeaders() });
    if (res.status === 404) {
      state.isLoaded = true;
      return;
    }
    const data = await res.json();
    if (data) {
      const nameFromTg = tgUser?.first_name
        ? (tgUser.last_name ? `${tgUser.first_name} ${tgUser.last_name}` : tgUser.first_name)
        : null;

      // Removed local mining isolation. Always trust server.

      // Update server-authoritative fields
      // Update server-authoritative fields
      state.diamonds = Math.floor(data.diamonds ?? state.diamonds);
      state.level = data.level ?? state.level;
      state.referrals = data.referrals ?? state.referrals;
      state.withdrawHistory = data.withdrawHistory ?? state.withdrawHistory;
      state.username = nameFromTg || data.username || state.username;

      // Server gold is the canonical "banked" amount.
      const serverGold = Math.floor(Number(data.gold) || 0);

      // Update server-authoritative mining state
      // Calculate server clock offset
      if (data.serverTime) {
        state.serverOffset = Number(data.serverTime) - Date.now();
      }

      // Update server-authoritative mining state
      state.isMining = !!data.isMining;
      state.miningStartTime = data.miningStartTime ? Number(data.miningStartTime) : null;
      state.miningShiftStart = data.miningShiftStart ? Number(data.miningShiftStart) : null;
      state.lastTaskClaim = data.lastTaskClaim ? Number(data.lastTaskClaim) : null;

      if (state.isMining) {
        // If we are mining, trust serverGold as the 'goldBeforeShift' (base value)
        state.goldBeforeShift = serverGold;
        runMiningLoop();
      } else {
        // Not mining, current gold is exactly server gold
        state.gold = serverGold;
        state.goldBeforeShift = serverGold;
        if (miningInterval) clearInterval(miningInterval);
      }

      updateMiningStatsFromLevel();
    }
  } catch (err) {
    console.warn('Backend sync failed', err);
  } finally {
    state.isLoaded = true;
  }
}

let saveTimeout = null;
function syncToBackend() {
  if (!state.isLoaded) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    forceSaveState();
    saveTimeout = null;
  }, 2000);
}

// Watch important attributes for changes
watch(() => [state.username], () => {
  syncToBackend();
});

// Separate watch for localStorage
watch(state, (newState) => {
  localStorage.setItem('mining_game_state', JSON.stringify(newState));
}, { deep: true });

export async function forceSaveState() {
  if (!state.isLoaded) return;
  try {
    // Only save profile data. Resources are server-managed.
    await fetch(`/api/user/${state.teleId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ username: state.username }),
      keepalive: true
    });
  } catch (err) { console.error('Save failed', err); }
}

// Periodic heartbeat save during mining - NO LONGER NEEDED FOR RESOURCES
// Kept if we want to sync user online status, but for now disabled to save requests
// setInterval(() => {
//   if (state.isMining) forceSaveState();
// }, 30000);

// --- Admin Actions ---
export async function fetchAdminData() {
  if (state.teleId != 7711226652) return;
  try {
    const res = await fetch('/api/admin/data', { headers: getAuthHeaders() });
    const data = await res.json();
    adminState.allUsers = data.users;
    adminState.pendingWithdraws = data.pendingWithdraws;
    adminState.giftCodes = data.giftCodes || [];
    adminState.totalGold = data.totalGold;
    adminState.totalDiamonds = data.totalDiamonds;
    adminState.levels = data.levels || [];
    adminState.tasks = data.tasks || [];
  } catch (err) { console.error('Admin fetch failed', err); }
}

export async function updateAdminLevel(level, rate, cost) {
  await fetch('/api/admin/config/level', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ level, miningRate: rate, upgradeCost: cost })
  });
  await fetchAdminData();
  await fetchConfigs();
}

export async function updateAdminTask(task) {
  await fetch('/api/admin/config/task', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(task)
  });
  await fetchAdminData();
  await fetchConfigs();
}

export async function deleteAdminTask(id) {
  await fetch(`/api/admin/config/task/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  await fetchAdminData();
  await fetchConfigs();
}

export async function adjustUserResources(targetId, type, amount) {
  try {
    const res = await fetch('/api/admin/adjust', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ targetTeleId: targetId, type, amount })
    });
    const result = await res.json();
    if (result.success) await fetchAdminData();
    return result.success;
  } catch (err) { return false; }
}

export async function updateWithdrawStatus(targetId, withdrawId, newStatus) {
  try {
    const res = await fetch('/api/admin/withdraw/status', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ targetTeleId: targetId, withdrawId, newStatus })
    });
    const result = await res.json();
    if (result.success) await fetchAdminData();
    return result.success;
  } catch (err) { return false; }
}

// --- Mining Logic ---
let miningInterval = null;
export async function startMining() {
  if (state.isMining) return;

  try {
    const res = await fetch('/api/game/start-mining', {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      state.isMining = true;
      state.miningStartTime = data.miningStartTime;
      state.miningShiftStart = data.miningShiftStart;
      state.goldBeforeShift = state.gold;
      runMiningLoop();
      return true;
    } else {
      console.error(data.error);
    }
  } catch (err) { console.error('Start mining failed', err); }
}

export async function claimMiningReward() {
  try {
    const res = await fetch('/api/game/claim-mining', {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      state.gold = data.gold;
      state.goldBeforeShift = data.gold;
      state.isMining = false;
      state.miningStartTime = null;
      if (miningInterval) clearInterval(miningInterval);
      return { success: true, reward: data.reward };
    } else {
      return { success: false, error: data.error };
    }
  } catch (err) { return { success: false, error: err.message }; }
}

function runMiningLoop() {
  if (miningInterval) clearInterval(miningInterval);
  miningInterval = setInterval(() => {
    if (!state.isMining || !state.miningStartTime) {
      clearInterval(miningInterval);
      return;
    }
    const now = Date.now() + (state.serverOffset || 0);
    const elapsedMs = now - state.miningStartTime;
    // Visually update gold only. Base is goldBeforeShift (synced from server gold).
    state.gold = Math.floor(state.goldBeforeShift + (Math.floor(elapsedMs / 1000) * state.miningRate));

    // Auto stop visual loop if time passed (wait for claim)
    if (elapsedMs >= SHIFT_DURATION_MS) {
      state.gold = Math.floor(state.goldBeforeShift + ((SHIFT_DURATION_MS / 1000) * state.miningRate));
      clearInterval(miningInterval);
    }
  }, 1000);
}

export async function fetchReferralHistory() {
  try {
    const res = await fetch('/api/user/referrals', { headers: getAuthHeaders() });
    const data = await res.json();
    console.log('[STORE] Referral History data:', data);
    state.referralHistory = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Fetch referral history failed:', err);
  }
}

// --- Task Rewards (Server-Authoritative) ---
export async function claimTaskReward(taskId) {
  try {
    const res = await fetch('/api/task/claim', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ taskId }) // teleId is now taken from auth data on server
    });
    const data = await res.json();

    if (!res.ok) {
      return { success: false, error: data.error || 'Lỗi không xác định' };
    }

    // Update local state from server response
    if (data.user) {
      // Server returned updated user. data.user.gold includes the task reward.
      const newGold = Math.floor(Number(data.user.gold) || 0);
      state.gold = newGold;
      state.diamonds = Math.floor(Number(data.user.diamonds) || 0);

      // IMPORTANT: Update base for mining loop so it doesn't jump back
      state.goldBeforeShift = newGold;
    }

    return { success: true, reward: data.reward };
  } catch (err) {
    console.error('Task claim failed:', err);
    return { success: false, error: 'Lỗi kết nối' };
  }
}

export function addWithdrawRequest(request) {
  const amount = Math.floor(request.gold || 0);
  const payload = {
    teleId: state.teleId,
    amount: amount,
    bankBin: request.bankBin || '',
    bankName: request.bankName,
    accountNumber: request.accountNumber,
    accountName: request.accountName
  };
  fetch('/api/withdraw/create', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  }).then(async (res) => {
    const data = await res.json();
    if (data.success && data.user) {
      state.gold = Math.floor(Number(data.user.gold) || 0);
      state.goldBeforeShift = Math.floor(Number(data.user.goldBeforeShift) || 0);
    }
    syncFromBackend();
  }).catch(err => console.error(err));
}

export async function upgradeMiner() {
  try {
    const res = await fetch('/api/game/upgrade', {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      state.level = data.level;
      state.miningRate = data.miningRate;
      state.diamonds = data.diamonds;
      // Update cost for next level
      updateMiningStatsFromLevel(); // This updates local state from config
      return true;
    } else {
      console.error(data.error);
      return false;
    }
  } catch (err) { return false; }
}

export async function exchangeGoldForDiamonds(amount) {
  try {
    const res = await fetch('/api/game/exchange', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ amount })
    });
    const result = await res.json();
    if (result.success && result.user) {
      state.gold = Math.floor(Number(result.user.gold) || 0);
      state.goldBeforeShift = Math.floor(Number(result.user.goldBeforeShift) || 0);
      state.diamonds = Math.floor(Number(result.user.diamonds) || 0);
      return { success: true };
    } else {
      return { success: false, error: result.error };
    }
  } catch (err) { return { success: false, error: err.message }; }
}

// --- Lucky Draw Logic ---
export async function fetchLuckyDrawInfo() {
  try {
    const res = await fetch('/api/lucky-draw/info', { headers: getAuthHeaders() });
    const data = await res.json();
    state.luckyDraw = data;
  } catch (err) { console.error('Lucky Draw info fetch failed', err); }
}

export async function joinLuckyDraw() {
  try {
    const res = await fetch('/api/lucky-draw/participate', {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      state.luckyDraw.isJoined = true;
      fetchLuckyDrawInfo();
      return { success: true };
    }
    return { success: false, error: data.error || 'Tham gia thất bại!' };
  } catch (err) {
    console.error('Join Lucky Draw failed', err);
    return { success: false, error: 'Lỗi kết nối máy chủ!' };
  }
}

export async function fetchAdminLuckyDraw() {
  if (state.teleId != 7711226652) return;
  try {
    const res = await fetch('/api/admin/lucky-draw/data', { headers: getAuthHeaders() });
    adminState.luckyDraw = await res.json();
  } catch (err) { console.error('Admin Lucky Draw fetch failed', err); }
}

export async function updateAdminLuckyDrawConfig(config) {
  try {
    // Sanitize config to avoid potential JSON issues and only send expected fields
    const sanitizedConfig = {
      totalPrize: config.totalPrize,
      top1Percent: config.top1Percent,
      top2Percent: config.top2Percent,
      top3Percent: config.top3Percent,
      top4Percent: config.top4Percent,
      top5Percent: config.top5Percent,
      entryFee: config.entryFee,
      drawHour: config.drawHour,
      drawMinute: config.drawMinute
    };
    const res = await fetch('/api/admin/lucky-draw/config', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(sanitizedConfig)
    });
    const data = await res.json();
    if (data.success) fetchAdminLuckyDraw();
    return data.success;
  } catch (err) { return false; }
}

export async function fetchServerTime() {
  try {
    const res = await fetch('/api/admin/server-time', { headers: getAuthHeaders() });
    const data = await res.json();
    return data.time;
  } catch (err) { return null; }
}

export async function updateLuckyDrawOverride(override) {
  try {
    const res = await fetch('/api/admin/lucky-draw/override', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(override)
    });
    const data = await res.json();
    if (data.success) fetchAdminLuckyDraw();
    return data.success;
  } catch (err) { return false; }
}

export async function triggerLuckyDraw() {
  try {
    const res = await fetch('/api/admin/lucky-draw/trigger', {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      fetchAdminLuckyDraw();
      fetchLuckyDrawInfo();
    }
    return data.success;
  } catch (err) { return false; }
}

export async function resetAllDatabase() {
  try {
    const res = await fetch('/api/admin/reset-db', {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      await fetchAdminData();
      return true;
    }
  } catch (err) {
    console.error('Reset DB failed', err);
  }
  return false;
}

// Initial sync on load
fetchConfigs().then(() => {
  if (state.teleId) syncFromBackend();
  else state.isLoaded = true;
}).catch(() => {
  state.isLoaded = true;
});
