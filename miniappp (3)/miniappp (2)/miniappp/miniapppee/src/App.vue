<script setup>
import { 
  state, adminState, 
  startMining, upgradeMiner, claimTaskReward, addWithdrawRequest, claimMiningReward,
  fetchAdminData, adjustUserResources, updateWithdrawStatus,
  updateAdminLevel, updateAdminTask, deleteAdminTask,
  getInviteLink, copyInviteLink, forceSaveState, syncFromBackend,
  getAuthHeaders, exchangeGoldForDiamonds, resetAllDatabase,
  fetchLuckyDrawInfo, joinLuckyDraw, fetchAdminLuckyDraw, 
  updateAdminLuckyDrawConfig, updateLuckyDrawOverride, triggerLuckyDraw,
  fetchReferralHistory, fetchConfigs
} from './store.js';
import { computed, ref, onMounted } from 'vue';

const ADMIN_ID = "7711226652";
const canAccessAdmin = computed(() => state.teleId == ADMIN_ID);

const formatNumber = (num) => {
  return Math.floor(num || 0).toLocaleString('vi-VN');
};

const navigateTo = (page) => {
  if (page === 'admin' && !canAccessAdmin.value) {
    showToast('Bạn không có quyền!');
    return;
  }
  state.currentPage = page;
  if (page === 'admin') {
      fetchAdminData();
      fetchAdminServerTime();
  }
  if (page === 'lucky') fetchLuckyDrawInfo();
  if (page === 'friends') fetchReferralHistory();
};

const toast = ref({ show: false, message: '' });
const showToast = (msg) => {
  toast.value.message = msg;
  toast.value.show = true;
  setTimeout(() => { toast.value.show = false; }, 3000);
};

// --- Exchange ---
const exchangeAmount = ref(0);
const confirmExchange = async () => {
  const amount = Math.floor(exchangeAmount.value || 0);
  if (amount <= 0) { showToast('Số lượng không hợp lệ!'); return; }
  
  const result = await exchangeGoldForDiamonds(amount);
  if (result.success) {
    showToast('Đổi quà thành công!');
    exchangeAmount.value = 0;
  } else {
    showToast(result.error || 'Lỗi đổi quà!');
  }
};

// --- Music & Effects ---
const audioRef = ref(null);



// --- Gift Code & Red Envelope ---
const giftCode = ref('');
const showEnvelope = ref(false);
const showReward = ref(null);
const rewardData = ref({ gold: 0, diamonds: 0 });

const redeemGiftCode = async () => {
    if (!giftCode.value) return;
    try {
        const res = await fetch('/api/user/redeem', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ teleId: state.teleId, code: giftCode.value.toUpperCase() })
        });
        const data = await res.json();
        if (data.success) {
            rewardData.value = { 
                gold: data.rewardGold || 0, 
                diamonds: data.rewardDiamonds || 0,
                user: data.user // Store user data for update on open
            };
            showEnvelope.value = true; // Show Lì Xì
            giftCode.value = '';
        } else {
            showToast(data.message || data.error || 'Mã không hợp lệ!');
        }
    } catch (err) {
        showToast('Lỗi kết nối: ' + err.message);
    }
};

const openEnvelope = () => {
    // Firework effect
    const duration = 1500;
    const end = Date.now() + duration;

    (function frame() {
        const timeLeft = end - Date.now();
        if (timeLeft <= 0) return;

        const particleCount = 10;
        confetti({
            particleCount,
            startVelocity: 30,
            spread: 360,
            origin: {
                x: Math.random(),
                y: Math.random() - 0.2
            },
            colors: ['#FFD700', '#FF0000', '#FFFFFF'],
            zIndex: 1000
        });
        requestAnimationFrame(frame);
    }());
    

    // Sync from backend to get the actual rewards added by server
    if (rewardData.value.user) {
        // Direct update from response
        const u = rewardData.value.user;
        const newGold = Math.floor(Number(u.gold) || 0);
        state.gold = newGold;
        state.goldBeforeShift = newGold; // Critical for mining loop
        state.diamonds = Math.floor(Number(u.diamonds) || 0);
    } else {
        // Fallback sync
        syncFromBackend();
    }
    
    showEnvelope.value = false;
    showReward.value = true;
};

// --- Game Actions ---
const handleUpgrade = async () => {
    const success = await upgradeMiner();
    if (success) showToast('Nâng cấp thành công! 🎉');
    else showToast('Thiếu kim cương rồi thím! 😅');
};

const isMiningFinished = computed(() => {
    if (!state.isMining || !state.miningShiftStart) return false;
    return (Date.now() - state.miningShiftStart) >= 6 * 60 * 60 * 1000;
});

const miningButtonDisabled = computed(() => {
    return state.isMining && !isMiningFinished.value;
});

const miningButtonClass = computed(() => {
    if (isMiningFinished.value) return 'bg-yellow-400 text-red-900 animate-bounce active:scale-95 border-b-8 border-red-800';
    if (state.isMining) return 'bg-orange-600 opacity-90 border-b-4 border-orange-800 cursor-default';
    return 'bg-green-600 active:scale-95 border-b-8 border-green-800';
});

const handleMiningAction = async () => {
    const runMining = async () => {
        if (isMiningFinished.value) {
            // Claim & Restart
            try {
                const result = await claimMiningReward();
                if (result.success) {
                    showToast(`Đã thu hoạch lộc! 🎉 Bắt đầu vụ mới nào!`);
                    miningTimer.value = '06:00:00';
                    // Automatically restart
                    await startMining();
                } else {
                    showToast(result.error || 'Có lỗi xảy ra');
                }
            } catch (err) {
                showToast('Lỗi kết nối: ' + err.message);
            }
        } else if (!state.isMining) {
            // Start
            try {
                await startMining();
                showToast('Chúc mừng năm mới! Khai xuân thành công! 🧨');
            } catch (err) {
                showToast('Lỗi khi bắt đầu: ' + err.message);
            }
        }
    };

    // Use 3 ads sequence for mining as well
    await showAdsSequence(3, runMining);
};

// --- Admin Level Management ---
const editingLevel = ref(null);
const levelForm = ref({ level: 1, miningRate: 7, upgradeCost: 5000 });
const startEditLevel = (l) => {
    editingLevel.value = l.level;
    levelForm.value = { ...l };
};
const saveLevelConfig = async () => {
    await updateAdminLevel(levelForm.value.level, levelForm.value.miningRate, levelForm.value.upgradeCost);
    editingLevel.value = null;
    showToast('Đã lưu cấu hình cấp!');
};

// --- Admin Lucky Draw Management ---
const luckyDrawForm = ref({ totalPrize: 0, top1Percent: 40, top2Percent: 25, top3Percent: 15, top4Percent: 10, top5Percent: 10, entryFee: 1000, drawHour: 23, drawMinute: 59 });
const serverTime = ref('');
const fetchAdminServerTime = async () => {
    const time = await fetchServerTime();
    if (time) {
        serverTime.value = new Date(time).toLocaleString('vi-VN');
    }
};
const luckyDrawOverrides = ref([ { rankPos: 1, teleId: '', fakeName: '' }, { rankPos: 2, teleId: '', fakeName: '' }, { rankPos: 3, teleId: '', fakeName: '' }, { rankPos: 4, teleId: '', fakeName: '' }, { rankPos: 5, teleId: '', fakeName: '' } ]);

const startEditLuckyDraw = () => {
    luckyDrawForm.value = { ...adminState.luckyDraw.config };
    luckyDrawOverrides.value = adminState.luckyDraw.overrides.map(o => ({ ...o, teleId: o.teleId || '', fakeName: o.fakeName || '' }));
};

const saveLuckyDrawConfig = async () => {
    await updateAdminLuckyDrawConfig(luckyDrawForm.value);
    showToast('Đã lưu cấu hình Vận May!');
};

const saveLuckyDrawOverride = async (rank) => {
    const override = luckyDrawOverrides.value.find(o => o.rankPos === rank);
    await updateLuckyDrawOverride(override);
    showToast(`Đã lưu chỉ định Top ${rank}!`);
};

const handleTriggerLuckyDraw = async () => {
    if (confirm('Bắt đầu quay thưởng ngay bây giờ?')) {
        await triggerLuckyDraw();
        showToast('Đã quay thưởng thành công!');
    }
};

const handleJoinLuckyDraw = async () => {
    const result = await joinLuckyDraw();
    if (result.success) {
        showToast('Tham gia thành công! Chúc bạn may mắn 🍀');
        syncFromBackend(); 
    } else {
        showToast(result.error);
    }
};

// --- Admin Task Management ---
const editingTask = ref(null);
const taskForm = ref({ id: '', title: '', icon: '📢', rewardType: 'gold', rewardAmount: 10000, url: '', type: 'community', actionType: 'click', telegramChatId: '' });
const startEditTask = (t) => {
    editingTask.value = t.id;
    taskForm.value = { ...t, actionType: t.actionType || 'click', telegramChatId: t.telegramChatId || '' };
};
const resetTaskForm = () => {
    editingTask.value = null;
    taskForm.value = { id: '', title: '', icon: '📢', rewardType: 'gold', rewardAmount: 10000, url: '', type: 'community', actionType: 'click', telegramChatId: '' };
};
const saveTaskConfig = async () => {
    if (!taskForm.value.id) return showToast('Nhập ID nhiệm vụ!');
    await updateAdminTask(taskForm.value);
    resetTaskForm();
    showToast('Đã lưu nhiệm vụ!');
};
const removeTask = async (id) => {
    if (confirm('Xóa nhiệm vụ này?')) {
        await deleteAdminTask(id);
        showToast('Đã xóa!');
    }
};

// --- Withdraw ---
const withdrawTab = ref('bank');
const withdrawForm = ref({ bankBin: '', bankName: '', accountNumber: '', accountName: '', amount: 0 });
const submitWithdraw = () => {
  if (withdrawForm.value.amount < 6000000) { showToast('Tối thiểu 6.000.000!'); return; }
  if (state.gold < withdrawForm.value.amount) { showToast('Số dư không đủ!'); return; }
  
  if (withdrawTab.value === 'bank' && !withdrawForm.value.bankBin) {
    showToast('Vui lòng chọn ngân hàng!');
    return;
  }

  const selectedBank = state.banks.find(b => b.bin === withdrawForm.value.bankBin);
  const methodName = withdrawTab.value === 'bank' ? selectedBank?.shortName : withdrawForm.value.bankName;

  // We move the deduction into the store action to ensure atomic update of gold and goldBeforeShift
  addWithdrawRequest({ 
    ...withdrawForm.value, 
    bankName: methodName || withdrawForm.value.bankName,
    gold: withdrawForm.value.amount, 
    vnd: withdrawForm.value.amount * 0.0005 
  });
  showToast('Đã gửi yêu cầu! 🚀');
  withdrawForm.value.amount = 0;
};



// --- Ads Helper ---
const showAdsSequence = async (count, onComplete) => {
    if (!window.Adsgram) {
        showToast('Đang tải hệ thống quảng cáo Adsgram...');
        return;
    }

    // Sequence of block IDs (Reward, Interstitial, Reward)
    const blockIds = ["int-23213", "int-23325", "int-23213"];
    
    for (let i = 0; i < count; i++) {
        const blockId = blockIds[i] || "int-23213";
        showToast(`Quảng cáo ${i + 1}/${count} đang tải... 🎬`);
        
        try {
            const AdController = window.Adsgram.init({ blockId });
            const result = await AdController.show();
            
            if (!result.done) {
                showToast('Bạn cần xem hết chuỗi quảng cáo để nhận thưởng!');
                return; // Stop sequence
            }
            
            // Short delay between ads for "story" like transition
            if (i < count - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (error) {
            console.error(`Adsgram error (Block: ${blockId}):`, error);
            showToast('Hệ thống quảng cáo đang bận, vui lòng thử lại sau!');
            return; // Stop sequence
        }
    }
    
    // If all ads completed
    await onComplete();
};

const joinedTasks = ref(new Set());

const isTaskDone = (t) => {
    try {
        if (!t || !t.isClaimed) return false;
        const type = t.type || 'community';
        if (type === 'one_time' || type === 'community') return true;
        
        if (type === 'daily') {
            if (!t.lastClaimedAt) return false;
            const now = new Date();
            const vnNow = new Date(now.getTime() + (7 * 60 * 60 * 1000));
            const lastClaim = new Date(t.lastClaimedAt);
            if (isNaN(lastClaim.getTime())) return false; // Invalid date
            const vnLast = new Date(lastClaim.getTime() + (7 * 60 * 60 * 1000));
            
            return vnNow.getUTCDate() === vnLast.getUTCDate() && 
                   vnNow.getUTCMonth() === vnLast.getUTCMonth() && 
                   vnNow.getUTCFullYear() === vnLast.getUTCFullYear();
        }
    } catch (e) { console.warn('isTaskDone error', e); }
    return false;
};

const visibleTasks = computed(() => {
    try {
        if (!state.backendTasks || !Array.isArray(state.backendTasks)) return [];
        return state.backendTasks.filter(t => {
            if (!t || typeof t !== 'object') return false;
            if (t.type === 'one_time' && isTaskDone(t)) return false;
            return true;
        });
    } catch (e) {
        console.error('visibleTasks error:', e);
        return [];
    }
});

// --- Tasks (Server-Authoritative) ---
const handleTask = async (taskId, type, amount, url, actionType) => {
    const task = state.backendTasks.find(t => t.id === taskId);
    
    // If it's a join task and hasn't been "joined" (clicked link) yet
    if (actionType === 'join' && !joinedTasks.value.has(taskId)) {
        if (url) {
            if (window.Telegram?.WebApp) {
                window.Telegram.WebApp.openLink(url);
            } else {
                window.open(url, '_blank');
            }
        }
        joinedTasks.value.add(taskId);
        showToast('Vui lòng tham gia và quay lại nhấn XÁC MINH! ⌛');
        return;
    }

    // If it's an ad task with a direct URL, it's a "Smart Link"
    if (type === 'ad' && url) {
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.openLink(url);
        } else {
            window.location.href = url;
        }
        
        const result = await claimTaskReward(taskId);
        if (result.success) {
            showToast(`Chúc mừng! +${formatNumber(result.reward?.amount || amount)} ${result.reward?.type === 'gold' ? 'vàng' : 'KC'} 🎉`);
            fetchConfigs(); // Refresh to update isClaimed
        } else {
            showToast(result.error || 'Nhiệm vụ chưa sẵn sàng!');
        }
        return;
    }

    // Standard URL handling
    if (url && actionType !== 'join') {
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.openLink(url);
        } else {
            window.open(url, '_blank');
        }
    }
    
    // If it's a standard ad task (no URL), show Adsgram (Triple Ad)
    if (type === 'ad') {
        showAdsSequence(3, async () => {
            const claimResult = await claimTaskReward(taskId);
            if (claimResult.success) {
                showToast(`Chúc mừng! +${formatNumber(claimResult.reward?.amount || amount)} ${claimResult.reward?.type === 'gold' ? 'vàng' : 'KC'} 🎉`);
                fetchConfigs();
            } else {
                showToast(claimResult.error || 'Nhiệm vụ chưa sẵn sàng!');
            }
        });
        return;
    }

    // Claim Logic
    const result = await claimTaskReward(taskId);
    if (result.success) {
        showToast(`Chúc mừng! +${formatNumber(result.reward?.amount || amount)} ${result.reward?.type === 'gold' ? 'vàng' : 'KC'} 🎉`);
        fetchConfigs();
    } else {
        showToast(result.error || 'Nhiệm vụ chưa sẵn sàng!');
    }
};

// --- Timer ---
const miningTimer = ref('06:00:00');
const taskCooldownStr = ref('');
const updateTimers = () => {
  if (state.isMining && state.miningShiftStart) {
    const now = Date.now() + (state.serverOffset || 0);
    const elapsed = now - state.miningShiftStart;
    const remaining = Math.max(0, (6 * 60 * 60 * 1000) - elapsed);
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    miningTimer.value = `${h}:${m}:${s}`.split(':').map(v => v.padStart(2, '0')).join(':');
  } else {
    miningTimer.value = '06:00:00';
  }

  // Auto-claim check (visual only, real claim on button click or refresh)
  if (state.isMining && state.miningShiftStart && (Date.now() - state.miningShiftStart >= 6 * 60 * 60 * 1000)) {
     // Claim automatically or change UI to "NHẬN THƯỞNG"
     // For now, let's keep it simple: The timer shows 00:00:00, user clicks to claim
     miningTimer.value = '00:00:00';
  }

  if (state.lastTaskClaim) {
      const remaining = Math.max(0, (15 * 60 * 1000) - (Date.now() - state.lastTaskClaim));
      if (remaining > 0) {
          const m = Math.floor(remaining / 60000);
          const s = Math.floor((remaining % 60000) / 1000);
          taskCooldownStr.value = `${m}:${s}`.split(':').map(v => v.padStart(2, '0')).join(':');
      } else {
          taskCooldownStr.value = '';
      }
  }
};

// --- Animation Logic ---
const fallingItems = ref([]);
const generateFallingItems = () => {
  const items = ['🧧', '💰', '💎', '🏮', '✨'];
  fallingItems.value = [];
  for (let i = 0; i < 20; i++) {
    fallingItems.value.push({ 
        id: i, 
        char: items[Math.floor(Math.random() * items.length)], 
        left: Math.random() * 100, 
        duration: 5 + Math.random() * 10, 
        delay: Math.random() * 10, 
        size: 15 + Math.random() * 20 
    });
  }
};


// --- Admin Utils ---
const showUserList = ref(false);
const toggleUserList = () => { showUserList.value = !showUserList.value; };

const adminSearchQuery = ref('');
const adminActionAmount = ref(0);
const selectedUser = ref(null);

const searchUser = () => {
    if (!adminSearchQuery.value) return;
    const query = adminSearchQuery.value.toString().toLowerCase();
    if (!adminState.allUsers) return showToast('Đang tải dữ liệu...');
    const found = adminState.allUsers.find(u => 
        u.teleId.toString().includes(query) || 
        (u.username && u.username.toLowerCase().includes(query))
    );
    if (found) {
        selectedUser.value = found;
        showToast(`Đã tìm thấy: ${found.username}`);
    } else {
        selectedUser.value = null;
        showToast('Không tìm thấy user này!');
    }
};

const triggerResourceUpdate = async (type, mode) => {
    if (!selectedUser.value) return;
    const amount = parseInt(adminActionAmount.value);
    if (!amount || amount <= 0) {
        showToast('Nhập số lượng hợp lệ!');
        return;
    }
    
    // If mode is 'subtract', make amount negative
    const finalAmount = mode === 'add' ? amount : -amount;
    
    const success = await adjustUserResources(selectedUser.value.teleId, type, finalAmount);
    if (success) {
        showToast(`Đã ${mode === 'add' ? 'cộng' : 'trừ'} ${formatNumber(amount)} ${type === 'gold' ? 'Vàng' : 'KC'}!`);
        // Refresh data to update UI
        await fetchAdminData();
        // Update selected user reference from new data
        if (adminState.allUsers) {
            selectedUser.value = adminState.allUsers.find(u => u.teleId == selectedUser.value.teleId);
        }
    } else {
        showToast('Lỗi cập nhật!');
    }
};


// --- Admin Gift Code Management ---
const newGift = ref({ code: '', rewardDiamonds: 0, rewardGold: 0, maxUses: 100 });
const adminAddGiftCode = async () => {
    if (!newGift.value.code) {
        showToast('Vui lòng nhập mã code!');
        return;
    }
    if (newGift.value.rewardGold <= 0 && newGift.value.rewardDiamonds <= 0) {
        showToast('Nhập ít nhất 1 loại quà!');
        return;
    }
    try {
        const res = await fetch('/api/admin/giftcode/add', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(newGift.value)
        });
        const data = await res.json();
        if (res.ok) {
            showToast('Đã thêm mã quà tặng! 🎁');
            newGift.value = { code: '', rewardDiamonds: 0, rewardGold: 0, maxUses: 100 };
            fetchAdminData();
        } else {
            showToast(data.error || 'Lỗi server!');
        }
    } catch (err) { showToast('Lỗi khi thêm mã!'); }
};

const adminDeleteGiftCode = async (code) => {
    if (!confirm(`Xóa mã ${code}?`)) return;
    try {
        const res = await fetch('/api/admin/giftcode/delete', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ code })
        });
        if (res.ok) {
            showToast('Đã xóa mã! 🗑️');
            fetchAdminData();
        }
    } catch (err) { showToast('Lỗi khi xóa mã!'); }
};

// --- Admin QR View ---
const showAdminQR = ref(null);

const handleResetDB = async () => {
    if (confirm('⚠️ CẢNH BÁO: Hành động này sẽ XÓA SẠCH toàn bộ dữ liệu người dùng, vàng, kim cương và lịch sử rút tiền. Bạn có chắc chắn muốn tiếp tục?')) {
        const password = prompt('Nhập mã xác nhận (ADMIN) để thực hiện:');
        if (password === 'ADMIN') {
            const success = await resetAllDatabase();
            if (success) {
                showToast('HỦY DIỆT TOÀN BỘ DỮ LIỆU THÀNH CÔNG! 🔥');
                selectedUser.value = null;
            } else {
                showToast('Lỗi khi xóa dữ liệu!');
            }
        } else {
            showToast('Mã xác nhận sai!');
        }
    }
};

let adminRefreshInterval = null;
onMounted(async () => {
  // --- Music & Effects Init ---
  if (audioRef.value) {
      audioRef.value.volume = 0.5;
      audioRef.value.play().catch(() => {
          const playOnInteract = () => {
              audioRef.value.play().catch(() => {});
              document.removeEventListener('click', playOnInteract);
          };
          document.addEventListener('click', playOnInteract);
      });
  }
  
  // Background Fireworks Loop
  setInterval(() => {
      if (state.currentPage === 'home' || state.currentPage === 'exchange') {
          confetti({
              particleCount: 50,
              startVelocity: 30,
              spread: 360,
              origin: {
                  x: Math.random(),
                  y: Math.random() - 0.2
              },
              colors: ['#FFD700', '#FF0000', '#FFFFFF'],
              disableForReducedMotion: true,
              zIndex: 0
          });
      }
  }, 3000);

  if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
  }
  generateFallingItems();
  
  // Initial config fetch inside mount to ensure everything is ready
  fetchConfigs();
  
  // Fetch Banks
  try {
    const res = await fetch('https://api.vietqr.io/v2/banks');
    const data = await res.json();
    if (data.code === '00') {
      state.banks = data.data;
    }
  } catch (err) {
    console.error('Lỗi tải danh sách ngân hàng:', err);
  }

  setInterval(updateTimers, 1000);

  // Real-time user sync (withdrawal status, resources)
  setInterval(() => {
    if (state.teleId) {
      syncFromBackend();
    }
  }, 5000);

  // Real-time admin refresh
  adminRefreshInterval = setInterval(() => {
    if (state.currentPage === 'admin' && canAccessAdmin.value) {
      fetchAdminData();
      fetchAdminLuckyDraw();
    }
    if (state.currentPage === 'lucky') {
      fetchLuckyDrawInfo();
    }
  }, 5000);
});
</script>

<template>
  <!-- Telegram Required Gate -->
  <div v-if="!state.isTelegramApp" class="fixed inset-0 bg-gradient-to-b from-red-900 to-red-950 flex flex-col items-center justify-center p-6 text-center z-[9999]">
    <div class="text-8xl mb-6">🧧</div>
    <h1 class="text-3xl font-black text-yellow-400 mb-4 uppercase">Gom Xu Đào Vàng</h1>
    <p class="text-white/70 text-sm mb-8">Vui lòng mở ứng dụng qua Telegram Bot</p>
    <a href="https://t.me/GomXuDaoVang_Bot" target="_blank" class="bg-blue-500 text-white font-black py-4 px-8 rounded-2xl uppercase text-sm shadow-xl hover:bg-blue-400 transition-all">
      📱 Mở Telegram Bot
    </a>
    <p class="text-white/30 text-[10px] mt-8 italic">@GomXuDaoVang_Bot</p>
  </div>

  <!-- Main App (only shown if in Telegram) -->
  <div v-else id="app-root" class="fixed inset-0 bg-[#7f1d1d] overflow-hidden font-sans text-white select-none">
    
    <main class="h-full w-full flex flex-col relative pt-14 pb-20 overflow-y-auto no-scrollbar">
      
      <!-- Festive Background Items -->
      <div class="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-50">
        <div v-for="item in fallingItems" :key="item.id" class="absolute text-yellow-400 falling-item" :style="{ left: item.left + '%', animationDuration: item.duration + 's', animationDelay: -item.delay + 's', fontSize: item.size + 'px' }">{{ item.char }}</div>
      </div>

      <!-- Header (Universal) -->
      <div v-if="state.currentPage !== 'admin'" class="fixed top-0 left-0 w-full h-14 bg-gradient-to-r from-[#b91c1c] to-[#f59e0b] flex items-center px-4 justify-between z-50 border-b border-yellow-400 shadow-2xl">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-yellow-400 border-2 border-red-800 flex items-center justify-center text-xl shadow-lg">🏮</div>
          <div class="flex flex-col">
            <span class="text-[10px] font-black uppercase tracking-tighter leading-none">{{ state.username }}</span>
            <span class="text-[8px] text-yellow-200 font-bold opacity-70">ID: {{ state.teleId }}</span>
          </div>
        </div>
        <div class="flex gap-3">
          <div class="flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-full border border-yellow-500/20 shadow-inner">
            <span class="text-xs">💎</span>
            <span class="text-yellow-400 font-black text-xs">{{ formatNumber(state.diamonds) }}</span>
          </div>
          <div class="flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-full border border-yellow-500/20 shadow-inner">
            <span class="text-xs">🪙</span>
            <span class="font-black text-xs">{{ formatNumber(state.gold) }}</span>
          </div>
        </div>
      </div>

      <audio ref="audioRef" src="/tet.mp3" loop></audio>

      <!-- Toast Layer -->
      <transition name="toast">
        <div v-if="toast.show" class="fixed top-20 left-1/2 -translate-x-1/2 bg-red-600 px-6 py-3 border-2 border-yellow-400 rounded-2xl z-[100] font-black text-sm shadow-[0_0_30px_rgba(255,215,0,0.5)]">{{ toast.message }}</div>
      </transition>

      <!-- PAGE: HOME -->
      <div v-if="state.currentPage === 'home'" class="flex flex-col items-center w-full px-6 pt-6 relative z-10">
        <h1 class="text-3xl font-black text-yellow-400 mb-8 italic uppercase text-center drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">🧧 KHAI XUÂN ĐÀO VÀNG</h1>
        
        <div class="w-48 h-48 mb-4 flex items-center justify-center relative">
          <div class="absolute inset-0 bg-yellow-400/30 blur-[60px] rounded-full"></div>
          <img :src="state.isMining ? 'https://gomxudaovang.online/images/workerminer.gif' : 'https://gomxudaovang.online/images/workerslep.png'" 
               class="w-full h-full object-contain drop-shadow-2xl" 
               style="filter: brightness(1.2) contrast(1.1); will-change: transform;">
        </div>

        <div class="w-full max-w-sm bg-gradient-to-b from-yellow-400 to-orange-500 rounded-[2.5rem] p-4 border-4 border-red-700 shadow-[0_15px_40px_rgba(0,0,0,0.5)] mb-4 text-center text-red-900">
            <p class="font-black uppercase text-[10px] mb-0.5 italic opacity-70">Thợ Đào Cấp Độ</p>
            <p class="text-3xl font-black text-white mb-2 drop-shadow-lg">Lv. {{ state.level }}</p>
            <div class="bg-red-800/10 p-3 rounded-2xl border border-red-900/10 mb-2">
                <p class="text-[8px] font-bold uppercase mb-0.5">Nâng cấp thợ đào</p>
                <p class="text-xl font-black text-white italic">💎 {{ formatNumber(state.upgradeCost) }}</p>
            </div>
            <button @click="handleUpgrade" class="w-full bg-red-700 text-white font-black py-3 rounded-xl border-b-4 border-red-900 active:scale-95 transition-all text-[10px] uppercase italic">NÂNG CẤP THỢ ĐÀO ⚡</button>
        </div>

        <div class="text-yellow-400 font-black mb-4 italic text-[11px] shadow-black drop-shadow-lg">
            ⚡ Tốc độ hiện tại: <span class="text-white text-base">{{ state.miningRate }}</span> vàng/giây
        </div>

        <button @click="handleMiningAction" :disabled="miningButtonDisabled" class="w-full max-w-sm py-4 rounded-[1.5rem] font-black text-white uppercase text-lg transition-all shadow-2xl relative overflow-hidden" :class="miningButtonClass">
            <span v-if="state.isMining && !isMiningFinished" class="flex flex-col items-center">
                <span class="text-[8px] opacity-60 mb-0.5 font-bold">ĐANG KHAI THÁC LỘC</span>
                <span class="text-xl tracking-widest font-mono">{{ miningTimer }}</span>
            </span>
            <span v-else-if="isMiningFinished" class="flex flex-col items-center animate-pulse">
                <span class="text-xs font-bold">ĐÃ XONG!</span>
                <span class="text-lg">💰 NHẬN THƯỞNG NGAY 💰</span>
            </span>
            <span v-else class="flex flex-col items-center">
                <span class="text-xs font-bold">BẤM VÀO ĐÂY</span>
                <span class="text-lg">🧨 KHAI XUÂN 6H 🧨</span>
            </span>
        </button>
      </div>

      <!-- PAGE: TASKS -->
      <div v-else-if="state.currentPage === 'tasks'" class="p-6 flex flex-col items-center pt-4 relative z-10 space-y-6">
        <h1 class="text-2xl font-black text-yellow-400 mb-2 italic uppercase text-center drop-shadow-lg">🧧 NHIỆM VỤ LÌ XÌ</h1>
        
        <!-- Ad Section -->
        <div v-if="visibleTasks.some(t => t.type === 'ad')" class="w-full max-w-md bg-white/5 border-2 border-yellow-500/20 p-6 rounded-[2.5rem] backdrop-blur-md relative overflow-hidden">
            <div class="absolute -top-10 -right-10 text-9xl opacity-10">🎬</div>
            <h3 class="font-black text-yellow-400 mb-1 uppercase italic">Xem Quảng Cáo</h3>
            <p class="text-[9px] text-white/50 uppercase mb-4 font-bold">Làm mới sau mỗi 15 phút (Tối đa 4 lần/ngày)</p>
            <div class="flex gap-3">
                <button v-for="t in visibleTasks.filter(t => t.type === 'ad')" :key="t.id"
                    @click="handleTask(t.id, t.type, t.rewardAmount, t.url, t.actionType)" :disabled="!!taskCooldownStr" 
                    class="flex-1 text-white py-4 rounded-2xl font-black uppercase text-[10px] border-b-4 shadow-xl active:scale-95 transition-all"
                    :class="t.rewardType === 'gold' ? 'bg-gradient-to-b from-yellow-400 to-orange-500 text-red-900 border-red-900' : 'bg-gradient-to-b from-blue-400 to-blue-600 border-blue-900'">
                    <span v-if="taskCooldownStr">{{ taskCooldownStr }}</span>
                    <span v-else>+{{ formatNumber(t.rewardAmount) }} {{ t.rewardType === 'gold' ? 'Vàng' : 'KC' }}</span>
                </button>
            </div>
        </div>

        <div class="w-full max-w-md space-y-3">
            <h2 class="font-black text-white/40 text-[9px] uppercase tracking-[0.2em] pl-4">🎯 NHIỆM VỤ CỘNG ĐỒNG</h2>
            <div v-for="t in visibleTasks.filter(t => t && t.type !== 'ad')" :key="t.id" class="flex items-center justify-between bg-black/40 p-5 rounded-[2rem] border border-white/5 shadow-inner">
                <div class="flex items-center gap-4">
                    <img v-if="t.icon && typeof t.icon === 'string' && t.icon.startsWith('http')" :src="t.icon" class="w-8 h-8 rounded-lg object-cover">
                    <span v-else class="text-2xl">{{ (t.icon && typeof t.icon === 'string') ? t.icon : '❓' }}</span>
                    <div>
                        <p class="font-black text-xs uppercase">{{ t.title || 'Nhiệm vụ' }}</p>
                        <p class="text-[9px] text-yellow-400 font-bold tracking-widest">+{{ formatNumber(t.rewardAmount) }} {{ t.rewardType === 'gold' ? 'Vàng' : 'KC' }}</p>
                    </div>
                </div>
                <button v-if="isTaskDone(t)" disabled class="bg-green-600/20 px-6 py-2 rounded-xl font-black text-[10px] uppercase text-green-400 opacity-50">XONG</button>
                <button v-else @click="handleTask(t.id, t.type, t.rewardAmount, t.url, t.actionType)" 
                        class="bg-white/10 px-6 py-2 rounded-xl font-black text-[10px] uppercase border border-white/10 active:scale-95"
                        :class="{'bg-yellow-400 text-red-900 border-yellow-600': t.actionType === 'join' && joinedTasks.has(t.id)}">
                    {{ t.actionType === 'join' ? (joinedTasks.has(t.id) ? 'XÁC MINH' : 'LÀM') : 'LÀM' }}
                </button>
            </div>
            <div v-if="visibleTasks.filter(t => t.type !== 'ad').length === 0" class="text-center py-10 opacity-20 text-[10px] uppercase font-black italic">Hôm nay chưa có thêm nhiệm vụ</div>
        </div>
      </div>

      <!-- PAGE: FRIENDS -->
      <div v-else-if="state.currentPage === 'friends'" class="p-6 flex flex-col items-center pt-4 relative z-10 space-y-8 pb-32">
        <h1 class="text-2xl font-black text-yellow-400 mb-2 italic uppercase drop-shadow-lg text-center">🤝 MỜI BẠN NHẬN VÀNG</h1>
        
        <div class="w-56 h-56 bg-red-900/40 rounded-full flex flex-col items-center justify-center border-4 border-dashed border-yellow-500/20 relative shadow-[0_0_60px_rgba(0,0,0,0.3)]">
            <span class="text-7xl mb-2">👫</span>
            <div class="absolute -bottom-4 bg-yellow-400 text-red-900 px-6 py-2 rounded-full font-black text-[11px] shadow-2xl border-2 border-red-800">+50,000 VÀNG / NGƯỜI</div>
        </div>

        <div class="w-full max-w-md bg-black/40 p-8 rounded-[3rem] border border-white/10 text-center shadow-2xl">
            <p class="text-white/40 text-[10px] uppercase font-black mb-2">Link giới thiệu của bạn</p>
            <div class="bg-black/60 p-4 rounded-2xl mb-6 border border-white/5 break-all text-[8px] font-mono text-white/50 shadow-inner">
                {{ getInviteLink() }}
            </div>
            <button @click="copyInviteLink(); showToast('Đã copy link mời! 🧧')" class="w-full bg-yellow-400 text-red-900 py-5 rounded-2xl font-black uppercase text-sm border-b-6 border-red-800 active:scale-95 active:border-b-0 shadow-2xl transition-all">SAO CHÉP LINK MỜI 📋</button>
        </div>

        <div class="px-8 text-center text-[10px] text-white/30 uppercase font-bold tracking-widest flex flex-col items-center gap-2">
            <span>Bạn đã mời được: <span class="text-yellow-400 text-xl">{{ formatNumber(state.referrals) }}</span> người</span>
        </div>

        <!-- Referral History -->
        <div class="w-full max-w-sm flex flex-col gap-4 mt-4">
            <h2 class="text-xs font-black text-white/50 uppercase tracking-widest pl-4">📜 BẠN BÈ ĐÃ MỜI</h2>
            <div v-for="ref in state.referralHistory" :key="ref.id" class="bg-black/40 p-5 rounded-[2.5rem] border border-white/5 shadow-lg flex justify-between items-center transition-all hover:bg-black/60">
                <div class="flex flex-col">
                    <span class="text-[7px] text-white/30 uppercase font-bold">{{ new Date(ref.createdAt).toLocaleString('vi-VN') }}</span>
                    <span class="text-[10px] font-black uppercase text-yellow-400">{{ ref.invitedName || ('Người dùng ' + ref.invitedId) }}</span>
                    <span class="text-[7px] text-white/20 font-mono italic">ID: {{ ref.invitedId }}</span>
                </div>
                <div class="text-right flex flex-col items-end">
                    <span class="text-sm font-black text-emerald-400">+{{ formatNumber(ref.goldReward) }}</span>
                    <span class="text-[7px] font-black uppercase text-white/40 italic">VÀNG THƯỞNG</span>
                </div>
            </div>
            <div v-if="state.referralHistory.length === 0" class="text-center py-10 bg-black/20 rounded-[2.5rem] border border-dashed border-white/5 text-[9px] uppercase font-black text-white/20 italic">
                Chưa mời được bạn nào
            </div>
        </div>
      </div>

      <!-- PAGE: WALLET -->
      <div v-else-if="state.currentPage === 'wallet'" class="p-6 flex flex-col items-center pt-4 relative z-10 space-y-6 pb-24">
        <h1 class="text-2xl font-black text-yellow-400 mb-2 italic uppercase drop-shadow-lg">🏺 RÚT VÀNG NHẬN LỘC</h1>
        
        <div class="flex bg-black/40 p-1.5 rounded-full w-full max-w-sm border border-white/10 shadow-inner">
            <button @click="withdrawTab = 'bank'" class="flex-1 py-3 rounded-full font-black text-[10px] uppercase transition-all" :class="withdrawTab === 'bank' ? 'bg-yellow-400 text-red-900 shadow-lg' : 'text-white/40'">NGÂN HÀNG</button>
            <button @click="withdrawTab = 'ewallet'" class="flex-1 py-3 rounded-full font-black text-[10px] uppercase transition-all" :class="withdrawTab === 'ewallet' ? 'bg-yellow-400 text-red-900 shadow-lg' : 'text-white/40'">VÍ ĐIỆN TỬ</button>
        </div>

        <div class="w-full max-w-md bg-red-900/40 p-8 rounded-[3rem] border-2 border-yellow-500/20 space-y-5 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <!-- Bank Selection -->
            <div v-if="withdrawTab === 'bank'" class="relative">
                <select v-model="withdrawForm.bankBin" class="w-full p-4 rounded-2xl font-black bg-white text-black outline-none border-b-4 border-gray-300 appearance-none">
                    <option value="" disabled>-- CHỌN NGÂN HÀNG --</option>
                    <option v-for="bank in state.banks" :key="bank.id" :value="bank.bin">{{ bank.shortName }} - {{ bank.name }}</option>
                </select>
                <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-black">▼</div>
            </div>
            <div v-else class="relative">
                <select v-model="withdrawForm.bankName" class="w-full p-4 rounded-2xl font-black bg-white text-black outline-none border-b-4 border-gray-300 appearance-none">
                    <option value="" disabled>-- CHỌN VÍ --</option>
                    <option value="Momo">Momo</option>
                    <option value="ZaloPay">ZaloPay</option>
                    <option value="ViettelPay">ViettelPay</option>
                </select>
                <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-black">▼</div>
            </div>

            <input type="text" placeholder="Số tài khoản / Số điện thoại" v-model="withdrawForm.accountNumber" class="w-full p-4 rounded-2xl font-black text-black bg-white outline-none border-b-4 border-gray-300">
            <input type="text" placeholder="Họ Tên Chủ Thẻ (KHÔNG DẤU)" v-model="withdrawForm.accountName" class="w-full p-4 rounded-2xl font-black text-black uppercase bg-white outline-none border-b-4 border-gray-300">
            
            <div class="bg-black/50 p-6 rounded-[2rem] border border-white/10 shadow-inner">
                <p class="text-[9px] font-black text-white/30 mb-4 uppercase tracking-widest italic">Số lượng vàng muốn rút</p>
                <input type="number" v-model="withdrawForm.amount" class="bg-transparent text-white text-4xl font-black w-full border-b border-white/20 pb-3 mb-4 outline-none placeholder:opacity-20" placeholder="0">
                <div class="flex justify-between items-center bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20">
                    <span class="text-[10px] font-black uppercase text-white/50">Thực nhận</span>
                    <span class="text-2xl font-black text-emerald-400 italic">{{ formatNumber(withdrawForm.amount * 0.0005) }}đ</span>
                </div>
            </div>
            <button @click="submitWithdraw" class="w-full py-6 rounded-2xl bg-yellow-400 text-red-900 font-black text-lg uppercase border-b-8 border-red-800 active:scale-95 active:border-b-0 shadow-2xl transition-all">GỬI YÊU CẦU DUYỆT 🚀</button>
        </div>

        <!-- Withdrawal History Section -->
        <div class="w-full max-w-sm flex flex-col gap-4">
            <h2 class="text-xs font-black text-white/50 uppercase tracking-widest pl-4">📜 LỊCH SỬ RÚT TIỀN</h2>
            <div v-for="h in state.withdrawHistory" :key="h.id" class="flex flex-col bg-black/40 p-5 rounded-[2.5rem] border border-white/5 shadow-lg transition-all hover:bg-black/60">
                <div class="flex justify-between items-center mb-1">
                    <div class="flex flex-col">
                        <span class="text-[10px] text-white/50 uppercase font-bold mb-1">{{ h.date }}</span>
                        <span class="text-[10px] font-black uppercase text-yellow-400">{{ h.bankName }}</span>
                        <span class="text-[9px] text-white/50 font-mono">{{ h.accountNumber }}</span>
                    </div>
                    <div class="text-right flex flex-col items-end">
                        <span class="text-sm font-black text-emerald-400 mb-1">{{ formatNumber(h.vnd) }}đ</span>
                        <span class="text-[8px] px-2 py-0.5 rounded-full font-black uppercase shadow-inner" 
                              :class="h.status === 'Đang xử lý' ? 'bg-orange-500/20 text-orange-400' : h.status === 'Đã chuyển' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'">
                            {{ h.status }}
                        </span>
                    </div>
                </div>
                <!-- Withdrawal Note / Reason -->
                <div v-if="h.message" class="mt-3 bg-red-500/10 border border-red-500/20 p-3 rounded-2xl">
                    <p class="text-[10px] text-red-400 font-bold uppercase mb-1 flex items-center gap-1">
                        <span>⚠️ Phản hồi từ Admin:</span>
                    </p>
                    <p class="text-xs text-white/80 italic leading-relaxed">{{ h.message }}</p>
                </div>
            </div>
            <div v-if="state.withdrawHistory.length === 0" class="text-center py-10 bg-black/20 rounded-[2.5rem] border border-dashed border-white/5 text-[9px] uppercase font-black text-white/20 italic">
                Chưa có giao dịch nào
            </div>
        </div>
      </div>

      <!-- PAGE: EXCHANGE (Integrated from legacy/doi.html style) -->
      <div v-else-if="state.currentPage === 'exchange'" class="p-6 flex flex-col items-center pt-4 relative z-10 space-y-8 pb-24">
        <h1 class="text-2xl font-black text-yellow-400 mb-2 italic uppercase drop-shadow-lg text-center">💎 QUY ĐỔI & GIFTCODE</h1>
        
        <!-- Gold to Diamond Exchange -->
        <div class="w-full max-w-md bg-gradient-to-b from-yellow-400/10 to-orange-500/20 p-8 rounded-[3rem] border-2 border-yellow-500/20 space-y-4 backdrop-blur-md shadow-2xl">
            <h2 class="text-sm font-black text-yellow-400 uppercase italic text-center">🔄 ĐỔI VÀNG LẤY KIM CƯƠNG</h2>
            <div class="bg-black/40 p-5 rounded-2xl border border-white/5 shadow-inner">
                <div class="flex justify-between text-[10px] uppercase font-black opacity-40 mb-2 italic">
                    <span>Nhập số vàng</span>
                    <span>Tỷ lệ 125 : 1</span>
                </div>
                <input type="number" v-model="exchangeAmount" class="bg-transparent text-white text-3xl font-black w-full border-b border-white/10 pb-2 mb-4 outline-none placeholder:opacity-20" placeholder="0">
                <div class="flex justify-between items-center bg-blue-500/10 p-4 rounded-xl border border-blue-500/20">
                    <span class="text-[9px] font-black uppercase text-blue-400 tracking-widest">Diamonds thực nhận</span>
                    <span class="text-2xl font-black text-white italic drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">💎 {{ formatNumber(exchangeAmount / 125) }}</span>
                </div>
            </div>
            <button @click="confirmExchange" class="w-full py-6 rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 text-white font-black uppercase text-sm border-b-6 border-blue-900 active:scale-95 active:border-b-0 shadow-2xl transition-all">XÁC NHẬN QUY ĐỔI ⚡</button>
        </div>

        <!-- Gift Code Section -->
        <div class="w-full max-w-md bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border-2 border-purple-500/30 p-8 rounded-[3rem] backdrop-blur-md shadow-2xl relative overflow-hidden">
            <div class="absolute -top-10 -right-10 text-9xl opacity-10">🎁</div>
            <h3 class="font-black text-purple-400 mb-1 uppercase italic text-lg">🎟️ Nhập GiftCode</h3>
            <p class="text-[10px] text-white/40 uppercase mb-6 font-bold tracking-widest">Săn mã tại Cộng đồng Đào Vàng</p>
            <div class="flex flex-col gap-3">
                <input type="text" v-model="giftCode" placeholder="GÕ MÃ QUÀ TẶNG..." class="bg-white text-black p-5 rounded-2xl font-black uppercase text-sm outline-none border-b-4 border-gray-300 shadow-inner">
                <button @click="redeemGiftCode" class="bg-purple-600 text-white py-5 rounded-2xl font-black uppercase text-sm active:scale-95 shadow-xl border-b-6 border-purple-900 mt-2">KÍCH HOẠT QUÀ TẶNG 🎉</button>
            </div>
        </div>

        <div class="text-center px-10">
            <p class="text-[9px] text-white/30 uppercase font-black italic tracking-widest leading-loose">Mẹo: Kim cương dùng để nâng cấp thợ đào giúp khai thác vàng nhanh hơn gấp bội!</p>
        </div>
      </div>

      <!-- PAGE: LUCKY DRAW (Vận May) -->
      <div v-else-if="state.currentPage === 'lucky'" class="p-6 flex flex-col items-center pt-4 relative z-10 space-y-6 pb-24">
          <h1 class="text-2xl font-black text-yellow-400 mb-2 italic uppercase drop-shadow-lg text-center">🎲 VẬN MAY ĐÀO VÀNG</h1>
          
          <div class="w-full max-w-md bg-gradient-to-b from-indigo-900/60 to-purple-900/60 p-8 rounded-[3rem] border-2 border-yellow-500/20 text-center backdrop-blur-xl shadow-2xl relative overflow-hidden">
              <div class="absolute -top-10 -left-10 text-9xl opacity-10 rotate-12">🍀</div>
              <div class="absolute -bottom-10 -right-10 text-9xl opacity-10 -rotate-12">💰</div>
              
              <h2 class="text-sm font-black text-yellow-400 uppercase tracking-widest mb-2 italic">TỔNG GIẢI THƯỞNG HÔM NAY</h2>
              <p class="text-5xl font-black text-white mb-6 drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">🪙 {{ formatNumber(state.luckyDraw.config?.totalPrize || 0) }}</p>
              
              <div class="grid grid-cols-2 gap-4 mb-8">
                  <div class="bg-black/30 p-4 rounded-2xl border border-white/5">
                      <p class="text-[9px] text-white/40 uppercase font-bold mb-1">Người tham gia</p>
                      <p class="text-xl font-black text-cyan-400">{{ state.luckyDraw.participantCount || 0 }}</p>
                  </div>
                  <div class="bg-black/30 p-4 rounded-2xl border border-white/5">
                      <p class="text-[9px] text-white/40 uppercase font-bold mb-1">Thời gian quay</p>
                      <p class="text-xl font-black text-yellow-500">{{ (state.luckyDraw.config?.drawHour ?? 23).toString().padStart(2, '0') }}:{{ (state.luckyDraw.config?.drawMinute ?? 59).toString().padStart(2, '0') }}</p>
                  </div>
              </div>

              <button v-if="!state.luckyDraw.isJoined" @click="handleJoinLuckyDraw" class="w-full py-6 rounded-2xl bg-yellow-400 text-red-900 font-black text-xl uppercase border-b-8 border-red-800 active:scale-95 active:border-b-0 shadow-2xl transition-all animate-bounce-slow flex flex-col items-center justify-center">
                  <span>THAM GIA NGAY 🧧</span>
                  <span class="text-[10px] opacity-60 mt-1">Phí tham gia: 🪙 {{ formatNumber(state.luckyDraw.config?.entryFee || 1000) }}</span>
              </button>
              <div v-else class="w-full py-6 rounded-2xl bg-green-600/20 border-2 border-green-500/50 text-green-400 font-black text-lg uppercase italic">BẠN ĐÃ THAM GIA ✅</div>
          </div>

          <!-- Last Winners History -->
          <div v-if="state.luckyDraw.lastWinners" class="w-full max-w-md bg-black/40 p-6 rounded-[2.5rem] border border-white/10 space-y-4 shadow-xl">
              <h3 class="text-xs font-black text-white/50 uppercase tracking-widest text-center">🏆 VINH DANH NGƯỜI THẮNG CUỘC</h3>
              <div class="space-y-2">
                  <div v-for="i in 5" :key="i" class="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                      <div class="flex items-center gap-3">
                          <span class="text-lg font-black" :class="i === 1 ? 'text-yellow-400' : 'text-white/60'">#{{ i }}</span>
                          <span class="text-xs font-bold text-white uppercase">{{ state.luckyDraw.lastWinners[`top${i}_name`] }}</span>
                      </div>
                      <span class="text-xs font-black text-yellow-500">+{{ formatNumber(state.luckyDraw.lastWinners[`top${i}_reward`]) }}</span>
                  </div>
              </div>
          </div>

          <div class="text-center px-10">
              <p class="text-[9px] text-white/30 uppercase font-black italic tracking-widest leading-loose">Giải thưởng sẽ được chia tự động cho 5 người may mắn vào cuối ngày!</p>
          </div>
      </div>

      <!-- PAGE: ADMIN DASHBOARD REDESIGN -->
      <div v-else-if="state.currentPage === 'admin' && canAccessAdmin" class="flex flex-col bg-[#0f172a] min-h-full relative z-[100] text-slate-200">
          
          <!-- Admin Header -->
          <div class="bg-slate-900 border-b border-slate-700 p-4 sticky top-0 z-50 shadow-2xl flex justify-between items-center">
              <div>
                  <h1 class="text-lg font-black text-cyan-400 tracking-widest uppercase">Admin Console</h1>
                  <div class="flex items-center gap-2">
                      <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                      <span class="text-[9px] text-slate-400 font-mono">LIVE SYNC ACTIVE</span>
                  </div>
              </div>
              <button @click="navigateTo('home')" class="bg-red-500/20 text-red-500 px-4 py-2 rounded-lg font-black text-xs hover:bg-red-500 hover:text-white transition-all">EXIT</button>
          </div>

          <div class="p-4 space-y-6 pb-24">
              
              <!-- System Overview Cards -->
              <div class="grid grid-cols-3 gap-3">
                  <div class="bg-slate-800 p-3 rounded-2xl border border-slate-700">
                      <p class="text-[9px] text-slate-500 uppercase font-bold">Tổng User</p>
                      <p class="text-xl font-black text-white">{{ adminState.allUsers?.length || 0 }}</p>
                  </div>
                  <div class="bg-slate-800 p-3 rounded-2xl border border-slate-700">
                      <p class="text-[9px] text-slate-500 uppercase font-bold">Tổng Vàng</p>
                      <p class="text-xs font-black text-yellow-400 truncate">{{ formatNumber(adminState.totalGold) }}</p>
                  </div>
                  <div class="bg-slate-800 p-3 rounded-2xl border border-slate-700">
                      <p class="text-[9px] text-slate-500 uppercase font-bold">Tổng KC</p>
                      <p class="text-xs font-black text-cyan-400 truncate">{{ formatNumber(adminState.totalDiamonds) }}</p>
                  </div>
              </div>

              <!-- User Manager Section -->
              <div class="bg-slate-800/50 border border-slate-700 rounded-3xl p-5 overflow-hidden">
                  <h2 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                       🔍 Quản Lý User
                  </h2>
                  
                  <!-- Search Bar -->
                  <div class="flex gap-2 mb-6">
                      <input type="text" v-model="adminSearchQuery" placeholder="Nhập ID hoặc Tên user..." class="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan-500 transition-all">
                      <button @click="searchUser" class="bg-cyan-600 text-white px-5 rounded-xl font-black text-sm hover:bg-cyan-500 active:scale-95 transition-all">TÌM</button>
                  </div>

                  <!-- Selected User Card -->
                  <div v-if="selectedUser" class="bg-slate-900 border border-cyan-500/30 p-4 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.1)] relative">
                      <button @click="selectedUser = null" class="absolute top-2 right-2 text-slate-600 hover:text-white">✕</button>
                      
                      <div class="flex items-center gap-3 mb-4 border-b border-slate-800 pb-4">
                          <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center font-black text-white text-xs">U</div>
                          <div>
                              <p class="text-sm font-black text-white">{{ selectedUser.username }}</p>
                              <p class="text-[10px] text-cyan-400 font-mono">ID: {{ selectedUser.teleId }}</p>
                          </div>
                      </div>

                      <div class="grid grid-cols-2 gap-4 mb-4">
                           <div class="bg-black/30 p-2 rounded-lg">
                               <p class="text-[8px] text-slate-500 uppercase">Số dư Vàng</p>
                               <p class="text-sm font-black text-yellow-400">{{ formatNumber(selectedUser.gold) }}</p>
                           </div>
                           <div class="bg-black/30 p-2 rounded-lg">
                               <p class="text-[8px] text-slate-500 uppercase">Số dư KC</p>
                               <p class="text-sm font-black text-cyan-400">{{ formatNumber(selectedUser.diamonds) }}</p>
                           </div>
                      </div>

                      <!-- Action Tools -->
                      <div class="bg-slate-800 p-3 rounded-xl">
                          <p class="text-[9px] text-slate-400 uppercase font-bold mb-2">Thao tác tài sản</p>
                          <input type="number" v-model="adminActionAmount" placeholder="Nhập số lượng..." class="w-full bg-black/50 border border-slate-600 rounded-lg px-3 py-2 text-sm font-bold text-white mb-3 outline-none focus:border-cyan-500">
                          
                          <div class="grid grid-cols-2 gap-2">
                              <div class="flex gap-1">
                                  <button @click="triggerResourceUpdate('gold', 'add')" class="flex-1 bg-yellow-600/20 text-yellow-500 border border-yellow-600/50 py-2 rounded-lg text-[9px] font-black hover:bg-yellow-600 hover:text-white transition-all">+ Vàng</button>
                                  <button @click="triggerResourceUpdate('gold', 'subtract')" class="flex-1 bg-slate-700 text-slate-300 border border-slate-600 py-2 rounded-lg text-[9px] font-black hover:bg-slate-600 transition-all">- Vàng</button>
                              </div>
                              <div class="flex gap-1">
                                  <button @click="triggerResourceUpdate('diamonds', 'add')" class="flex-1 bg-cyan-600/20 text-cyan-500 border border-cyan-600/50 py-2 rounded-lg text-[9px] font-black hover:bg-cyan-600 hover:text-white transition-all">+ KC</button>
                                  <button @click="triggerResourceUpdate('diamonds', 'subtract')" class="flex-1 bg-slate-700 text-slate-300 border border-slate-600 py-2 rounded-lg text-[9px] font-black hover:bg-slate-600 transition-all">- KC</button>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>

              <!-- Pending Withdrawals -->
              <div>
                   <h2 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
                       💸 Yêu Cầu Rút Tiền ({{ adminState.pendingWithdraws?.length || 0 }})
                   </h2>
                   
                   <div v-if="adminState.pendingWithdraws?.length > 0" class="space-y-3">
                       <div v-for="w in adminState.pendingWithdraws" :key="w.id" class="bg-slate-800 border-l-4 border-yellow-500 p-4 rounded-r-xl shadow-lg">
                           <div class="flex justify-between items-start mb-2">
                               <div>
                                   <p class="text-sm font-black text-white">{{ w.accountName }}</p>
                                   <p class="text-[10px] text-slate-400">{{ w.bankName }} • <span class="font-mono text-white">{{ w.accountNumber }}</span></p>
                                   <p class="text-[9px] text-cyan-500 mt-1 cursor-pointer hover:underline" @click="adminSearchQuery = w.userTeleId; searchUser()">ID: {{ w.userTeleId }}</p>
                               </div>
                               <p class="text-lg font-black text-yellow-400">{{ formatNumber(w.vnd) }}đ</p>
                           </div>
                           <div class="flex gap-2 mt-3">
                               <button v-if="w.qrUrl" @click="showAdminQR = w.qrUrl" class="px-3 py-1.5 rounded-lg bg-slate-700 text-[9px] font-bold text-white hover:bg-slate-600">XEM QR</button>
                               <button @click="updateWithdrawStatus(w.userTeleId, w.id, 'Đã chuyển')" class="px-3 py-1.5 rounded-lg bg-green-600 text-[9px] font-bold text-white hover:bg-green-500">ĐÃ CHUYỂN</button>
                               <button @click="updateWithdrawStatus(w.userTeleId, w.id, 'Bị từ chối')" class="px-3 py-1.5 rounded-lg bg-red-900/50 text-[9px] font-bold text-red-400 border border-red-900 hover:bg-red-900">TỪ CHỐI</button>
                           </div>
                       </div>
                   </div>
                   <div v-else class="text-center py-8 bg-slate-800/50 rounded-2xl border border-dashed border-slate-700">
                       <p class="text-[10px] text-slate-500 font-bold uppercase">Không có yêu cầu nào</p>
                   </div>
              </div>

              <!-- Level Management -->
              <div class="bg-slate-800 rounded-3xl p-5">
                  <h2 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">📈 Quản Lý Cấp Độ</h2>
                  <div class="space-y-3 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                      <div v-for="l in adminState.levels" :key="l.level" class="bg-slate-900 border border-slate-700 p-3 rounded-xl">
                          <div v-if="editingLevel === l.level" class="space-y-2">
                              <div class="flex gap-2">
                                  <div class="flex-1">
                                      <p class="text-[8px] text-slate-500 uppercase">Vàng/s</p>
                                      <input v-model="levelForm.miningRate" type="number" class="w-full bg-black/50 border border-slate-600 rounded p-1 text-xs text-white">
                                  </div>
                                  <div class="flex-1">
                                      <p class="text-[8px] text-slate-500 uppercase">Phí KC</p>
                                      <input v-model="levelForm.upgradeCost" type="number" class="w-full bg-black/50 border border-slate-600 rounded p-1 text-xs text-white">
                                  </div>
                              </div>
                              <div class="flex gap-2">
                                  <button @click="saveLevelConfig" class="flex-1 bg-cyan-600 py-1 rounded text-[10px] font-black uppercase">Lưu</button>
                                  <button @click="editingLevel = null" class="flex-1 bg-slate-700 py-1 rounded text-[10px] font-black uppercase">Hủy</button>
                              </div>
                          </div>
                          <div v-else class="flex justify-between items-center">
                              <div>
                                  <p class="text-xs font-black text-white">Cấp {{ l.level }}</p>
                                  <p class="text-[9px] text-slate-500">{{ l.miningRate }}v/s • {{ formatNumber(l.upgradeCost) }} KC</p>
                              </div>
                              <button @click="startEditLevel(l)" class="bg-slate-700 text-white px-3 py-1 rounded text-[10px] font-black hover:bg-slate-600">SỬA</button>
                          </div>
                      </div>
                  </div>
              </div>

              <!-- Task Management -->
              <div class="bg-slate-800 rounded-3xl p-5">
                  <h2 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">🎯 Quản Lý Nhiệm Vụ</h2>
                  
                  <!-- Task Form -->
                  <div class="bg-slate-900 border border-slate-700 p-4 rounded-xl mb-4 space-y-3 shadow-inner">
                      <p class="text-[10px] font-black text-cyan-400 uppercase italic">{{ editingTask ? 'Đang sửa: ' + editingTask : 'Thêm nhiệm vụ mới' }}</p>
                      <div class="grid grid-cols-2 gap-2">
                          <input v-model="taskForm.id" placeholder="ID (vd: join_fb)" :disabled="!!editingTask" class="bg-black/50 border border-slate-600 rounded p-2 text-xs text-white outline-none">
                          <input v-model="taskForm.title" placeholder="Tiêu đề" class="bg-black/50 border border-slate-600 rounded p-2 text-xs text-white outline-none">
                      </div>
                      <div class="grid grid-cols-3 gap-2">
                          <input v-model="taskForm.icon" placeholder="Icon" class="bg-black/50 border border-slate-600 rounded p-2 text-xs text-white text-center">
                          <select v-model="taskForm.rewardType" class="bg-black/50 border border-slate-600 rounded p-2 text-xs text-white">
                              <option value="gold">Vàng</option>
                              <option value="diamond">KC</option>
                          </select>
                          <input v-model="taskForm.rewardAmount" type="number" placeholder="Số lượng" class="bg-black/50 border border-slate-600 rounded p-2 text-xs text-white">
                      </div>
                      <input v-model="taskForm.url" placeholder="URL liên kết (nếu có)" class="w-full bg-black/50 border border-slate-600 rounded p-2 text-xs text-white">
                      <div class="grid grid-cols-2 gap-2">
                          <select v-model="taskForm.type" class="bg-black/50 border border-slate-600 rounded p-2 text-xs text-white">
                              <option value="community">Thường/Cộng đồng</option>
                              <option value="daily">Hàng ngày (Reset 24h)</option>
                              <option value="one_time">Làm 1 lần</option>
                              <option value="ad">Quảng cáo</option>
                          </select>
                          <select v-model="taskForm.actionType" class="bg-black/50 border border-slate-600 rounded p-2 text-xs text-white">
                              <option value="click">Click (Nhấn là xong)</option>
                              <option value="join">Join (Check group/channel)</option>
                          </select>
                      </div>
                      <div v-if="taskForm.actionType === 'join'" class="space-y-1">
                          <p class="text-[8px] text-yellow-500 uppercase font-black">ID Group/Channel (Bắt đầu bằng -100...)</p>
                          <input v-model="taskForm.telegramChatId" placeholder="Ví dụ: -10012345678" class="w-full bg-black/50 border border-slate-600 rounded p-2 text-xs text-white">
                      </div>
                      <div class="flex gap-2">
                          <button @click="saveTaskConfig" class="flex-1 bg-green-600 py-2 rounded-xl text-xs font-black uppercase shadow-lg active:scale-95">{{ editingTask ? 'CẬP NHẬT' : 'THÊM NHIỆM VỤ' }}</button>
                          <button v-if="editingTask" @click="resetTaskForm" class="bg-slate-700 px-4 rounded-xl text-xs font-black uppercase">HỦY</button>
                      </div>
                  </div>

                  <div class="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                      <div v-for="t in adminState.tasks" :key="t.id" class="flex justify-between items-center bg-slate-900 p-3 rounded-xl border border-slate-700">
                           <div class="flex items-center gap-3">
                               <span class="text-xl">{{ t.icon }}</span>
                               <div>
                                   <p class="text-xs font-black text-white">{{ t.title }}</p>
                                   <p class="text-[9px] text-slate-500 uppercase">{{ t.rewardAmount }} {{ t.rewardType }} • {{ t.type }}</p>
                               </div>
                           </div>
                           <div class="flex gap-1">
                               <button @click="startEditTask(t)" class="text-cyan-500 p-1 hover:bg-slate-800 rounded">📝</button>
                               <button @click="removeTask(t.id)" class="text-red-500 p-1 hover:bg-slate-800 rounded">🗑️</button>
                           </div>
                      </div>
                  </div>
              </div>

              <!-- Gift Code Manager -->
              <div class="bg-slate-800 rounded-3xl p-5">
                  <h2 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">🎁 Quản Lý Mã Quà</h2>
                  <div class="flex flex-col gap-3 mb-4">
                      <input v-model="newGift.code" placeholder="Mã Code (VD: TET2025)" class="bg-slate-900 border border-slate-600 p-3 rounded-xl text-sm font-bold text-white outline-none focus:border-purple-500">
                      <div class="flex gap-2">
                          <input v-model="newGift.rewardGold" type="number" placeholder="Vàng" class="flex-1 bg-slate-900 border border-slate-600 p-3 rounded-xl text-xs text-white">
                          <input v-model="newGift.rewardDiamonds" type="number" placeholder="Kim cương" class="flex-1 bg-slate-900 border border-slate-600 p-3 rounded-xl text-xs text-white">
                      </div>
                      <input v-model="newGift.maxUses" type="number" placeholder="Số lượng" class="bg-slate-900 border border-slate-600 p-3 rounded-xl text-xs text-white">
                      <button @click="adminAddGiftCode" class="bg-purple-600 text-white py-3 rounded-xl font-black text-xs uppercase hover:bg-purple-500 active:scale-95 transition-all">Tạo Mã Mới</button>
                  </div>
                  
                  <div class="max-h-40 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      <div v-for="g in adminState.giftCodes" :key="g.code" class="flex justify-between items-center bg-slate-900 p-3 rounded-xl border border-slate-700">
                           <div>
                               <p class="text-xs font-black text-white">{{ g.code }}</p>
                               <p class="text-[9px] text-slate-500">{{ g.usedCount }}/{{ g.maxUses }} lượt</p>
                           </div>
                           <button @click="adminDeleteGiftCode(g.code)" class="text-red-500 text-xs hover:text-red-400 px-2 py-1">Xóa</button>
                       </div>
                   </div>
              </div>

               <!-- Lucky Draw Management (ADMIN) -->
                <div class="bg-slate-800 rounded-3xl p-5">
                    <h2 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex justify-between items-center">
                        🎲 Quản Lý Vận May
                        <div class="flex gap-2">
                             <span class="text-[9px] text-slate-500 lowercase mt-1">Hệ thống: {{ serverTime }}</span>
                             <button @click="startEditLuckyDraw" class="bg-cyan-600/20 text-cyan-400 px-3 py-1 rounded-lg text-[10px]">Tải Cấu Hình</button>
                        </div>
                    </h2>
                   
                   <div class="space-y-4">
                       <div class="bg-slate-900 p-4 rounded-xl space-y-3">
                           <p class="text-[9px] font-black text-yellow-500 uppercase italic">Cấu hình giải thưởng</p>
                           <div>
                               <p class="text-[8px] text-slate-500 uppercase">Tổng giải (Vàng)</p>
                               <input v-model="luckyDrawForm.totalPrize" type="number" class="w-full bg-black/50 border border-slate-600 rounded p-2 text-xs text-white">
                           </div>
                           <div class="grid grid-cols-2 gap-2">
                                <div v-for="i in 5" :key="i">
                                    <p class="text-[8px] text-slate-500 uppercase">Top {{ i }} (%)</p>
                                    <input v-model="luckyDrawForm[`top${i}Percent`]" type="number" class="w-full bg-black/50 border border-slate-600 rounded p-2 text-xs text-white">
                                </div>
                            </div>
                            <div class="grid grid-cols-3 gap-2">
                                <div>
                                    <p class="text-[8px] text-slate-500 uppercase">Phí (Vàng)</p>
                                    <input v-model="luckyDrawForm.entryFee" type="number" class="w-full bg-black/50 border border-slate-600 rounded p-2 text-xs text-white">
                                </div>
                                <div>
                                    <p class="text-[8px] text-slate-500 uppercase">Giờ quay (0-23)</p>
                                    <input v-model="luckyDrawForm.drawHour" type="number" min="0" max="23" class="w-full bg-black/50 border border-slate-600 rounded p-2 text-xs text-white">
                                </div>
                                <div>
                                    <p class="text-[8px] text-slate-500 uppercase">Phút (0-59)</p>
                                    <input v-model="luckyDrawForm.drawMinute" type="number" min="0" max="59" class="w-full bg-black/50 border border-slate-600 rounded p-2 text-xs text-white">
                                </div>
                            </div>
                           <button @click="saveLuckyDrawConfig" class="w-full bg-cyan-600 py-2 rounded-xl text-xs font-black uppercase">LƯU CẤU HÌNH</button>
                       </div>

                       <div class="bg-slate-900 p-4 rounded-xl space-y-3">
                           <p class="text-[9px] font-black text-red-400 uppercase italic">Chỉ định người thắng (Override)</p>
                           <div v-for="i in 5" :key="i" class="border-b border-slate-800 pb-3 last:border-0 last:pb-0">
                               <p class="text-[9px] font-bold text-slate-400 uppercase mb-2">Rank {{ i }}</p>
                               <div class="grid grid-cols-2 gap-2 mb-2">
                                   <input v-model="luckyDrawOverrides[i-1].teleId" placeholder="TeleID (Thật)" class="bg-black/50 border border-slate-600 rounded p-2 text-[10px] text-white">
                                   <input v-model="luckyDrawOverrides[i-1].fakeName" placeholder="Tên (Fake)" class="bg-black/50 border border-slate-600 rounded p-2 text-[10px] text-white">
                               </div>
                               <button @click="saveLuckyDrawOverride(i)" class="w-full bg-slate-700 py-1.5 rounded text-[9px] font-black uppercase">Lưu Rank {{ i }}</button>
                           </div>
                       </div>

                       <button @click="handleTriggerLuckyDraw" class="w-full bg-red-600/20 text-red-500 border border-red-600/50 py-3 rounded-xl text-xs font-black uppercase hover:bg-red-600 hover:text-white transition-all">QUAY THƯỞNG NGAY LẬP TỨC 🔥</button>
                   </div>
               </div>

               <!-- Full User List (Collapsible) -->
              <div>
                  <button @click="toggleUserList" class="w-full py-3 bg-slate-800 rounded-xl text-xs font-bold text-slate-400 uppercase hover:bg-slate-700 transition-all">
                      {{ showUserList ? 'Ẩn danh sách' : 'Xem tất cả user' }} ({{ adminState.allUsers?.length || 0 }})
                  </button>
                  
                  <div v-if="showUserList" class="mt-4 space-y-2">
                      <div v-for="u in adminState.allUsers" :key="u.teleId" class="bg-slate-900 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                          <div>
                              <p class="text-xs font-bold text-white">{{ u.username }}</p>
                              <p class="text-[9px] text-slate-500 font-mono">{{ u.teleId }}</p>
                          </div>
                          <div class="text-right">
                              <p class="text-[9px] text-yellow-500 font-bold">{{ formatNumber(u.gold) }} G</p>
                              <p class="text-[9px] text-cyan-500 font-bold">{{ formatNumber(u.diamonds) }} D</p>
                          </div>
                          <button @click="selectedUser = u; adminSearchQuery = u.teleId; window.scrollTo({top:0, behavior:'smooth'})" class="ml-2 text-[10px] bg-slate-700 text-white px-2 py-1 rounded">Sửa</button>
                      </div>
                  </div>
              </div>

              <!-- DANGER ZONE: Reset DB -->
              <div class="bg-red-950/30 border border-red-900/50 rounded-3xl p-5 mt-4">
                  <h2 class="text-xs font-black text-red-500 uppercase tracking-widest mb-4">⚠️ Vùng Nguy Hiểm</h2>
                  <button @click="handleResetDB" class="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-sm uppercase shadow-lg shadow-red-900/20 active:scale-95 transition-all hover:bg-red-500">
                      RESET ALL DATABASE 🔥
                  </button>
                  <p class="text-[9px] text-red-400/50 text-center mt-3 italic font-medium">Hành động này không thể hoàn tác. Xóa sạch mọi user và lịch sử.</p>
              </div>

          </div>
      </div>

    </main>

    <!-- NAVIGATION BAR (Fixed Bottom) -->
    <nav v-if="state.currentPage !== 'admin'" class="fixed bottom-0 left-0 w-full bg-gradient-to-t from-[#7f1d1d] to-[#b91c1c] h-20 flex justify-around items-center px-4 border-t-4 border-yellow-500 shadow-[0_-15px_60px_rgba(0,0,0,0.8)] rounded-t-[50px] z-[90] backdrop-blur-xl">
        <button v-for="p in [
            { id: 'home', icon: '🏠', label: 'Sảnh' },
            { id: 'lucky', icon: '🎲', label: 'Vận May' },
            { id: 'exchange', icon: '💎', label: 'Đổi' },
            { id: 'tasks', icon: '🧧', label: 'Lì Xì' },
            { id: 'friends', icon: '🤝', label: 'Mời' },
            { id: 'wallet', icon: '🏺', label: 'Rút' }
        ]" :key="p.id" @click="navigateTo(p.id)" class="flex flex-col items-center gap-1 transition-all duration-300" 
           :class="state.currentPage === p.id ? 'text-yellow-400 scale-125 translate-y-[-10px] drop-shadow-[0_0_15px_rgba(255,215,0,0.4)]' : 'text-white/40 hover:text-white/60'">
            <span class="text-[2.2rem] drop-shadow-lg leading-none">{{ p.icon }}</span>
            <span class="text-[9px] font-black uppercase italic tracking-tighter">{{ p.label }}</span>
        </button>
        <button v-if="canAccessAdmin" @click="navigateTo('admin')" class="flex flex-col items-center gap-1 transition-all duration-300"
           :class="state.currentPage === 'admin' ? 'text-yellow-400 scale-125 translate-y-[-10px]' : 'text-white/40 hover:text-white/60'">
            <span class="text-[2.2rem] drop-shadow-lg leading-none">⚙️</span>
            <span class="text-[9px] font-black uppercase italic tracking-tighter">Admin</span>
        </button>
    </nav>

    <!-- QR Modal for Admin -->
    <transition name="toast">
        <div v-if="showAdminQR" class="fixed inset-0 bg-black/95 z-[500] flex flex-col items-center justify-center p-6 backdrop-blur-xl">
            <button @click="showAdminQR = null" class="absolute top-10 right-10 text-white font-black text-5xl hover:scale-110 active:scale-90 transition-all">×</button>
            <div class="bg-white p-10 rounded-[3.5rem] shadow-[0_0_100px_rgba(255,215,0,0.3)] max-w-sm w-full border-4 border-yellow-500 scale-110">
                <img :src="showAdminQR" class="w-full h-auto rounded-3xl" alt="QR Link">
                <p class="text-red-900 text-center mt-8 font-black uppercase text-sm italic tracking-[0.2em] animate-pulse">🏮 QUÉT QR ĐỂ CHUYỂN TIỀN 🏮</p>
                <div class="mt-4 bg-red-100 p-3 rounded-2xl text-[8px] text-red-900 font-bold uppercase text-center opacity-60">Vui lòng kiểm tra kỹ nội dung đã được tạo sẵn trong mã QR.</div>
            </div>
        </div>
    </transition>

    <!-- Red Envelope Modal (Lì Xì) -->
    <transition name="toast">
        <div v-if="showEnvelope" class="fixed inset-0 bg-black/90 z-[500] flex flex-col items-center justify-center p-6 backdrop-blur-md" @click.self="showEnvelope = false">
            <div class="animate-bounce-slow relative">
                <img src="/lixi.gif" 
                     class="w-64 h-auto drop-shadow-[0_0_50px_rgba(255,0,0,0.6)] cursor-pointer hover:scale-110 transition-all active:scale-95"
                     @click="openEnvelope">
            </div>
            <button @click="openEnvelope" class="mt-8 bg-yellow-400 text-red-900 font-black uppercase text-xl py-4 px-10 rounded-full shadow-[0_0_30px_rgba(255,215,0,0.6)] animate-pulse hover:scale-110 active:scale-95 transition-all border-4 border-red-600">
                MỞ NGAY 🧧
            </button>
        </div>
    </transition>

    <!-- Reward Result Modal -->
    <transition name="toast">
        <div v-if="showReward" class="fixed inset-0 bg-black/90 z-[500] flex flex-col items-center justify-center p-6 backdrop-blur-md">
            <div class="bg-gradient-to-b from-red-600 to-red-900 p-10 rounded-[3rem] border-4 border-yellow-500 shadow-[0_0_100px_rgba(255,215,0,0.5)] text-center max-w-sm w-full relative overflow-visible scale-animation">
                <div class="absolute -top-16 left-1/2 -translate-x-1/2 text-8xl">🧧</div>
                <h2 class="text-2xl font-black text-yellow-400 uppercase italic mt-8 mb-4">Lộc Về! Lộc Về!</h2>
                
                <div class="space-y-4 mb-8">
                    <div v-if="rewardData.gold > 0" class="bg-black/30 p-4 rounded-2xl border border-white/10">
                        <p class="text-[10px] text-white/50 uppercase font-black">Nhận được</p>
                        <p class="text-3xl font-black text-yellow-400 drop-shadow-lg">+{{ formatNumber(rewardData.gold) }} VÀNG</p>
                    </div>
                    <div v-if="rewardData.diamonds > 0" class="bg-black/30 p-4 rounded-2xl border border-white/10">
                         <p class="text-[10px] text-white/50 uppercase font-black">Nhận được</p>
                         <p class="text-3xl font-black text-blue-400 drop-shadow-lg">+{{ formatNumber(rewardData.diamonds) }} KC</p>
                    </div>
                </div>

                <button @click="showReward = false" class="w-full py-4 rounded-xl bg-yellow-400 text-red-900 font-black uppercase shadow-lg active:scale-95 border-b-4 border-yellow-600">TUYỆT VỜI 😍</button>
            </div>
        </div>
    </transition>
    

  </div>
</template>

<style>
/* Reset & Custom Utilities */
body { background: #7f1d1d; overscroll-behavior-y: contain; }
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

/* Custom Inputs */
input, select { -webkit-appearance: none; -moz-appearance: none; appearance: none; }
input:focus { border-color: rgba(251, 191, 36, 1); ring: 0; }

/* Animations */
.falling-item { top: -10%; animation: fall linear infinite; z-index: 0; }
@keyframes fall {
  0% { transform: translateY(-10vh) rotate(0deg); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(110vh) rotate(1080deg); opacity: 0; }
}

/* Transitions */
.toast-enter-active, .toast-leave-active { transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 50px) scale(0.5); }

@keyframes scale-in {
  0% { transform: scale(0); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
.scale-animation { animation: scale-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }

/* GPU acceleration for images */
img { transform: translateZ(0); backface-visibility: hidden; }

/* Custom scrollbar for admin sections */
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(100,150,200,0.5); border-radius: 4px; }
</style>
