<?php
declare(strict_types=1);

if (!headers_sent()) {
    header('Content-Type: text/html; charset=UTF-8');
}

if (function_exists('mb_internal_encoding')) {
    mb_internal_encoding('UTF-8');
}
?>
<!DOCTYPE html>
<html lang="vi">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Khai Dz Admin</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: { colors: { slate: { 850: '#1e293b', 900: '#0f172a' } } }
            }
        }
    </script>
    <style>
        body {
            background: #0f172a;
            color: #e2e8f0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }

        .glass {
            background: rgba(30, 41, 59, 0.4);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .nav-active {
            background: linear-gradient(to right, #06b6d4, #3b82f6);
            color: white;
            box-shadow: 0 4px 12px rgba(6, 182, 212, 0.25);
        }

        .loading {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% {
                transform: rotate(0deg);
            }

            100% {
                transform: rotate(360deg);
            }
        }
    </style>
</head>

<body class="h-screen overflow-hidden flex text-sm">

    <!-- Login Modal -->
    <div id="login-modal" class="fixed inset-0 z-50 bg-slate-900 flex items-center justify-center p-4">
        <div class="glass p-8 rounded-2xl w-full max-w-md shadow-2xl">
            <h2 class="text-3xl font-bold text-center mb-6 text-cyan-400">Admin Login</h2>
            <form id="login-form" class="space-y-6">
                <div>
                    <label class="block text-slate-400 mb-2">Username</label>
                    <input type="text" id="username"
                        class="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:border-cyan-500 outline-none"
                        placeholder="Username" required>
                </div>
                <div>
                    <label class="block text-slate-400 mb-2">Password</label>
                    <input type="password" id="password"
                        class="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:border-cyan-500 outline-none"
                        placeholder="Password" required>
                </div>
                <button type="submit"
                    class="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-lg transition">Login
                    Access</button>
            </form>
            <p id="login-error" class="text-red-400 text-center mt-4 hidden"></p>
        </div>
    </div>

    <!-- Sidebar -->
    <aside class="w-64 bg-slate-900 border-r border-slate-800 flex-col pt-6 pb-4 px-4 shadow-xl z-20 flex hidden"
        id="sidebar">
        <div class="mb-8 px-2 flex items-center gap-3">
            <div
                class="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white font-bold text-xl">
                KD</div>
            <div>
                <h1 class="font-bold text-white">Khai Dz Admin</h1>
                <p class="text-xs text-slate-500">System V2</p>
            </div>
        </div>
        <nav class="space-y-1 flex-1">
            <button onclick="router('dashboard')" id="nav-dashboard"
                class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition text-slate-400 hover:bg-slate-800 hover:text-white">
                <span class="text-lg">📊</span> Dashboard
            </button>
            <button onclick="router('tasks')" id="nav-tasks"
                class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition text-slate-400 hover:bg-slate-800 hover:text-white">
                <span class="text-lg">🧧</span> Quản Lý Nhiệm Vụ
            </button>
            <button onclick="router('users')" id="nav-users"
                class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition text-slate-400 hover:bg-slate-800 hover:text-white">
                <span class="text-lg">👥</span> Người Dùng
            </button>
            <button onclick="router('withdrawals')" id="nav-withdrawals"
                class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition text-slate-400 hover:bg-slate-800 hover:text-white">
                <span class="text-lg">💰</span> Rút Tiền
            </button>
            <button onclick="router('giftcodes')" id="nav-giftcodes"
                class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition text-slate-400 hover:bg-slate-800 hover:text-white">
                <span class="text-lg">🎁</span> Gift Codes
            </button>
            <button onclick="router('lucky_draw')" id="nav-lucky_draw"
                class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition text-slate-400 hover:bg-slate-800 hover:text-white">
                <span class="text-lg">🎲</span> Vận May
            </button>
        </nav>
        <button onclick="logout()"
            class="flex items-center gap-3 px-4 py-2 text-red-400 hover:bg-red-500/10 rounded-xl transition mt-auto">
            🚪 Đăng Xuất
        </button>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 overflow-y-auto bg-slate-900 relative hidden" id="main-content">
        <div class="p-8 max-w-7xl mx-auto">

            <!-- Dashboard View -->
            <div id="view-dashboard" class="view-section hidden">
                <h2 class="text-3xl font-bold text-white mb-8">Tổng Quan Hệ Thống</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8" id="stats-grid">
                    <!-- Stats injected here -->
                </div>
            </div>

            <!-- Users View -->
            <div id="view-users" class="view-section hidden">
                <div class="flex justify-between items-center mb-8">
                    <h2 class="text-3xl font-bold text-white">Quản Lý Người Dùng</h2>
                    <input type="text" id="user-search" placeholder="Search TeleID or Name..."
                        class="bg-slate-800 border border-slate-700 rounded-lg p-2 text-white w-64 focus:border-cyan-500 outline-none">
                </div>
                <div class="glass rounded-xl overflow-hidden">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left">
                            <thead class="bg-slate-800 text-slate-400 uppercase text-xs">
                                <tr>
                                    <th class="p-4">TeleID</th>
                                    <th class="p-4">Name</th>
                                    <th class="p-4">Gold</th>
                                    <th class="p-4">$</th>
                                    <th class="p-4">Level</th>
                                    <th class="p-4">IP</th>
                                    <th class="p-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="users-table" class="text-slate-300 divide-y divide-slate-800"></tbody>
                        </table>
                    </div>
                    <div class="p-4 border-t border-slate-700 flex justify-between items-center text-slate-400 text-xs">
                        <span id="user-count">0 users</span>
                        <div class="flex gap-2">
                            <button onclick="prevUserPage()" class="hover:text-white">Previous</button>
                            <span id="user-page">1</span>
                            <button onclick="nextUserPage()" class="hover:text-white">Next</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Gift Codes View -->
            <div id="view-giftcodes" class="view-section hidden">
                <h2 class="text-3xl font-bold text-white mb-8">Quản Lý Gift Codes</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <!-- Create Form -->
                    <div class="glass p-6 rounded-xl md:col-span-1 h-fit">
                        <h3 class="text-xl font-bold text-cyan-400 mb-6">Tạo Code Mới</h3>
                        <form id="giftcode-form" class="space-y-4">
                            <div>
                                <label class="block text-slate-400 mb-1">Code</label>
                                <input type="text" id="gc-code" required
                                    class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white uppercase"
                                    placeholder="EXAMPLE">
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-slate-400 mb-1">Gold</label>
                                    <input type="number" id="gc-gold" value="0"
                                        class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white">
                                </div>
                            </div>
                            <div>
                                <label class="block text-slate-400 mb-1">Max Uses</label>
                                <input type="number" id="gc-max" value="100"
                                    class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white">
                            </div>
                            <button type="submit"
                                class="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded transition">Tạo
                                Code</button>
                        </form>
                    </div>

                    <!-- Code List -->
                    <div class="glass rounded-xl overflow-hidden md:col-span-2">
                        <table class="w-full text-left">
                            <thead class="bg-slate-800 text-slate-400 uppercase text-xs">
                                <tr>
                                    <th class="p-4">Code</th>
                                    <th class="p-4">Rewards</th>
                                    <th class="p-4">Uses</th>
                                    <th class="p-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="giftcodes-table" class="text-slate-300 divide-y divide-slate-800"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Withdrawals View -->
            <div id="view-withdrawals" class="view-section hidden">
                <div class="flex justify-between items-center mb-8">
                    <h2 class="text-3xl font-bold text-white">Quản Lý Rút Tiền</h2>
                    <select id="withdraw-filter-date" onchange="filterWithdrawals()" class="bg-slate-800 border border-slate-700 rounded p-2 text-white">
                        <option value="all">Tất cả</option>
                    </select>
                </div>
                <div class="glass rounded-xl overflow-hidden">
                    <table class="w-full text-left">
                        <thead class="bg-slate-800 text-slate-400 uppercase text-xs">
                            <tr>
                                <th class="p-4">ID</th>
                                <th class="p-4">User</th>
                                <th class="p-4">Amount</th>
                                <th class="p-4">Bank</th>
                                <th class="p-4">QR</th>
                                <th class="p-4">Refs</th>
                                <th class="p-4">Status</th>
                                <th class="p-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="withdrawals-table" class="text-slate-300 divide-y divide-slate-800"></tbody>
                    </table>
                </div>
            </div>

            <!-- Lucky Draw View -->
            <div id="view-lucky_draw" class="view-section hidden">
                <h2 class="text-3xl font-bold text-white mb-8">Cấu Hình Vận May (Schedule)</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <!-- Form -->
                    <div class="glass p-6 rounded-xl">
                        <h3 class="text-xl font-bold text-cyan-400 mb-6">Lên Lịch Thắng</h3>
                        <form id="schedule-form" class="space-y-4">
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-slate-400 mb-1">Ngày (YYYY-MM-DD)</label>
                                    <input type="date" id="sch-date" required
                                        class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white">
                                </div>
                                <div>
                                    <label class="block text-slate-400 mb-1">Hạng</label>
                                    <select id="sch-rank"
                                        class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white">
                                        <option value="1">Top 1</option>
                                        <option value="2">Top 2</option>
                                        <option value="3">Top 3</option>
                                        <option value="4">Top 4</option>
                                        <option value="5">Top 5</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label class="block text-slate-400 mb-1">Loại thắng</label>
                                <div class="flex gap-4">
                                    <label class="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" name="sch-type" value="fake" checked
                                            onclick="toggleInputPlaceholder('fake')" class="accent-cyan-500">
                                        <span class="text-slate-300">Tên Giả (Fake Name)</span>
                                    </label>
                                    <label class="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" name="sch-type" value="real"
                                            onclick="toggleInputPlaceholder('real')" class="accent-cyan-500">
                                        <span class="text-slate-300">Người Thật (TeleID)</span>
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label class="block text-slate-400 mb-1">Giá trị</label>
                                <input type="text" id="sch-value" placeholder="Nhập tên giả..." required
                                    class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white">
                            </div>
                            <button type="submit"
                                class="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded transition">Lưu
                                Lịch</button>
                        </form>
                    </div>

                    <!-- List -->
                    <div class="glass p-6 rounded-xl">
                        <h3 class="text-xl font-bold text-white mb-6">Danh Sách Lịch</h3>
                        <div id="schedule-list" class="space-y-3 max-h-[500px] overflow-y-auto"></div>
                    </div>
                    </div>
                 </div>
            </div>
            <!-- Tasks View -->
            <div id="view-tasks" class="view-section hidden">
                <h2 class="text-3xl font-bold text-white mb-8">Quan Ly Nhiem Vu</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <!-- Create Task Form -->
                    <div class="glass p-6 rounded-xl md:col-span-1 h-fit">
                        <h3 id="task-form-title" class="text-xl font-bold text-cyan-400 mb-3">Them Nhiem Vu Moi</h3>
                        <p class="text-xs text-slate-400 mb-6">Referral chi duoc tinh khi nguoi duoc moi hoan thanh tat ca nhiem vu <span class="font-bold text-cyan-300">newbie</span>.</p>
                        <form id="task-form" class="space-y-4">
                            <div>
                                <label class="block text-slate-400 mb-1">ID Nhiem Vu (Duy nhat, khong dau)</label>
                                <input type="text" id="task-id" required placeholder="Vi du: newbie_join_channel"
                                    class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white">
                            </div>
                            <div>
                                <label class="block text-slate-400 mb-1">Tieu de</label>
                                <input type="text" id="task-title" required placeholder="Vi du: Tham gia Group"
                                    class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white">
                            </div>
                            <div>
                                <label class="block text-slate-400 mb-1">Icon (URL/Emoji)</label>
                                <input type="text" id="task-icon" required placeholder="https://... hoac emoji"
                                    class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white">
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-slate-400 mb-1">Loai Thuong</label>
                                    <select id="task-reward-type" class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white">
                                        <option value="gold">Gold (Vang)</option>
                                        <option value="usdt">$</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-slate-400 mb-1">So Luong</label>
                                    <input type="number" id="task-reward-amount" value="1000"
                                        class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white">
                                </div>
                            </div>
                            <div>
                                <label class="block text-slate-400 mb-1">Link (Mo khi nhan)</label>
                                <input type="text" id="task-link" placeholder="https://t.me/..."
                                    class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white">
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-slate-400 mb-1">Cach Check (Hanh Dong)</label>
                                    <select id="task-action-type" class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white" onchange="toggleGroupInput()">
                                        <option value="react_heart">React tym (Check tha tym)</option>
                                        <option value="click">Click (Chi can nhan link)</option>
                                        <option value="join">Join check (Xac minh tham gia)</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-slate-400 mb-1">Loai NV</label>
                                    <select id="task-type" class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white">
                                        <option value="community">Thuong/Cong dong</option>
                                        <option value="newbie">Tan thu (bat buoc cho referral)</option>
                                        <option value="daily">Hang ngay (Reset 24h)</option>
                                        <option value="one_time">Lam 1 lan (Bien mat)</option>
                                        <option value="ad">Xem Quang Cao</option>
                                    </select>
                                </div>
                            </div>

                            <div id="group-id-container" class="hidden">
                                <label class="block text-slate-400 mb-1">ID Group/Channel (Bat dau bang -100...)</label>
                                <input type="text" id="task-group-id" placeholder="-100123456789"
                                    class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white">
                                <p class="text-[9px] text-yellow-500 mt-1">* Bot phai la Admin cua Group nay moi check duoc.</p>
                            </div>

                            <div class="flex gap-2">
                                <button id="task-submit-btn" type="submit"
                                    class="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded transition">
                                    Luu Nhiem Vu
                                </button>
                                <button id="task-cancel-edit-btn" type="button" onclick="cancelTaskEdit()"
                                    class="hidden bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded transition">
                                    Huy Sua
                                </button>
                            </div>
                        </form>
                    </div>

                    <!-- Task Lists -->
                    <div class="md:col-span-2 space-y-6">
                        <div class="glass rounded-xl overflow-hidden">
                            <div class="px-4 py-3 border-b border-slate-800 bg-cyan-500/10">
                                <h3 class="font-bold text-cyan-300">Nhiem Vu Tan Thu (CRUD)</h3>
                                <p class="text-xs text-slate-400 mt-1">Chi khi user moi hoan thanh het cac task o day thi moi ban be moi duoc tinh.</p>
                            </div>
                            <table class="w-full text-left">
                                <thead class="bg-slate-800 text-slate-400 uppercase text-xs">
                                    <tr>
                                        <th class="p-4">Icon</th>
                                        <th class="p-4">Task Info</th>
                                        <th class="p-4">Reward</th>
                                        <th class="p-4">Logic</th>
                                        <th class="p-4">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="newbie-tasks-table" class="text-slate-300 divide-y divide-slate-800"></tbody>
                            </table>
                        </div>

                        <div class="glass rounded-xl overflow-hidden">
                            <div class="px-4 py-3 border-b border-slate-800">
                                <h3 class="font-bold text-white">Nhiem Vu Khac</h3>
                            </div>
                            <table class="w-full text-left">
                                <thead class="bg-slate-800 text-slate-400 uppercase text-xs">
                                    <tr>
                                        <th class="p-4">Icon</th>
                                        <th class="p-4">Task Info</th>
                                        <th class="p-4">Reward</th>
                                        <th class="p-4">Type</th>
                                        <th class="p-4">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="tasks-table" class="text-slate-300 divide-y divide-slate-800"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>


    <!-- Generic Modal -->
    <div id="modal" class="fixed inset-0 z-50 bg-black/80 hidden flex items-center justify-center p-4 backdrop-blur-sm">
        <div
            class="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl border border-slate-700 relative">
            <div class="p-4 border-b border-slate-700 flex justify-between items-center">
                <h3 id="modal-title" class="text-lg font-bold text-white">Title</h3>
                <button onclick="closeModal()" class="text-slate-400 hover:text-white px-2">✕</button>
            </div>
            <div id="modal-body" class="p-4 overflow-y-auto flex-1 text-slate-300"></div>
        </div>
    </div>

    <!-- Edit User Modal -->
    <div id="edit-user-modal"
        class="fixed inset-0 z-50 bg-black/80 hidden flex items-center justify-center p-4 backdrop-blur-sm">
        <div class="bg-slate-800 rounded-xl w-full max-w-md shadow-2xl border border-slate-700">
            <div class="p-4 border-b border-slate-700 flex justify-between items-center">
                <h3 class="text-lg font-bold text-white">Edit User</h3>
                <button onclick="document.getElementById('edit-user-modal').classList.add('hidden')"
                    class="text-slate-400 hover:text-white">✕</button>
            </div>
            <div class="p-6">
                <form id="edit-user-form" class="space-y-4">
                    <input type="hidden" id="edit-teleId">
                    <div>
                        <label class="block text-slate-400 text-xs mb-1">Gold</label>
                        <input type="number" id="edit-gold"
                            class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white">
                    </div>
                    <div>
                        <label class="block text-slate-400 text-xs mb-1">$</label>
                        <input type="number" id="edit-usdt" step="0.000001"
                            class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white">
                    </div>
                    <button type="submit"
                        class="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded">Save
                        Changes</button>
                </form>
            </div>
        </div>
    </div>

    <script>
        const API_BASE = '/api';
        const SHIFT_DURATION_MS = 6 * 60 * 60 * 1000;
        let TOKEN = localStorage.getItem('admin_token');
        let currentView = 'dashboard';
        let latestAdminData = null;
        let adminServerOffset = 0;
        let liveGoldInterval = null;
        let adminEventSource = null;
        let adminReconnectTimer = null;
        let usersCache = [];
        let giftCodesCache = [];
        let tasksCache = [];
        let editingTaskId = null;

        function toFiniteNumber(value, fallback = 0) {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : fallback;
        }

        function setAdminServerClock(serverTime) {
            adminServerOffset = toFiniteNumber(serverTime, Date.now()) - Date.now();
        }

        function getAdminNow() {
            return Date.now() + adminServerOffset;
        }

        function isMiningUserActive(user) {
            return Boolean(user && (user.isMining === true || toFiniteNumber(user.isMining) === 1) && user.miningStartTime && (user.miningShiftStart || user.miningStartTime));
        }

        function getProjectedGold(user) {
            const baseGold = toFiniteNumber(user && user.gold);
            if (!isMiningUserActive(user)) return baseGold;

            const shiftStart = toFiniteNumber(user.miningShiftStart || user.miningStartTime);
            const miningStart = toFiniteNumber(user.miningStartTime || shiftStart);
            const cappedShiftElapsed = Math.min(Math.max(0, getAdminNow() - shiftStart), SHIFT_DURATION_MS);
            const elapsedBeforeCheckpoint = Math.max(0, miningStart - shiftStart);
            const localElapsed = Math.max(0, cappedShiftElapsed - elapsedBeforeCheckpoint);
            const projectedEarned = Math.floor((localElapsed / 1000) * Math.max(0, toFiniteNumber(user.miningRate, 7)));

            return baseGold + projectedEarned;
        }

        function getProjectedTotalGold(users) {
            return (users || []).reduce((sum, user) => sum + getProjectedGold(user), 0);
        }

        function stopLiveGoldTicker() {
            if (liveGoldInterval) {
                clearInterval(liveGoldInterval);
                liveGoldInterval = null;
            }
        }

        function syncLiveGoldTicker() {
            stopLiveGoldTicker();
            if (!usersCache.some(isMiningUserActive)) return;

            liveGoldInterval = setInterval(() => {
                if (currentView === 'dashboard') renderDashboard();
                if (currentView === 'users') renderUsers();
            }, 1000);
        }

        function applyAdminSnapshot(data) {
            latestAdminData = data || null;
            usersCache = Array.isArray(data?.users) ? data.users : [];
            giftCodesCache = Array.isArray(data?.giftCodes) ? data.giftCodes : [];
            setAdminServerClock(data?.serverTime);
            syncLiveGoldTicker();
        }

        function disconnectAdminRealtime() {
            if (adminReconnectTimer) {
                clearTimeout(adminReconnectTimer);
                adminReconnectTimer = null;
            }

            if (adminEventSource) {
                adminEventSource.close();
                adminEventSource = null;
            }
        }

        function refreshCurrentView() {
            if (!TOKEN) return;

            if (currentView === 'dashboard') return loadDashboard();
            if (currentView === 'users') return loadUsers();
            if (currentView === 'giftcodes') return loadGiftCodes();
            if (currentView === 'withdrawals') return loadWithdrawals();
            if (currentView === 'lucky_draw') return loadLuckyDraw();
            if (currentView === 'tasks') return loadTasks();
        }

        function connectAdminRealtime() {
            if (!TOKEN || adminEventSource) return;

            const source = new EventSource(`${API_BASE}/admin/events?token=${encodeURIComponent(TOKEN)}`);
            adminEventSource = source;

            source.addEventListener('connected', () => {
                refreshCurrentView();
            });

            source.addEventListener('admin-refresh', () => {
                refreshCurrentView();
            });

            source.onerror = () => {
                if (adminEventSource === source) {
                    adminEventSource = null;
                }

                source.close();

                if (!TOKEN || adminReconnectTimer) return;

                adminReconnectTimer = setTimeout(() => {
                    adminReconnectTimer = null;
                    connectAdminRealtime();
                }, 3000);
            };
        }

        function toggleGroupInput() {
            const actionType = document.getElementById('task-action-type').value;
            const groupContainer = document.getElementById('group-id-container');

            if (actionType === 'join' || actionType === 'react_heart') {
                groupContainer.classList.remove('hidden');
            } else {
                groupContainer.classList.add('hidden');
            }
        }
        // --- Auth ---
        function checkAuth() {
            if (TOKEN) {
                document.getElementById('login-modal').classList.add('hidden');
                document.getElementById('sidebar').classList.remove('hidden');
                document.getElementById('main-content').classList.remove('hidden');
                connectAdminRealtime();
                router('dashboard'); // Default
            } else {
                disconnectAdminRealtime();
                stopLiveGoldTicker();
                document.getElementById('login-modal').classList.remove('hidden');
            }
        }

        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const u = document.getElementById('username').value;
            const p = document.getElementById('password').value;
            try {
                const res = await fetch(`${API_BASE}/admin/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: u, password: p })
                });
                const data = await res.json();
                if (data.success) {
                    TOKEN = data.token;
                    localStorage.setItem('admin_token', TOKEN);
                    checkAuth();
                } else {
                    document.getElementById('login-error').innerText = data.message;
                    document.getElementById('login-error').classList.remove('hidden');
                }
            } catch (err) { console.error(err); }
        });

        function logout() {
            disconnectAdminRealtime();
            stopLiveGoldTicker();
            localStorage.removeItem('admin_token');
            location.reload();
        }

        // --- Router ---
        function router(page) {
            currentView = page;
            document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('aside nav button').forEach(el => el.classList.remove('nav-active'));

            document.getElementById(`view-${page}`).classList.remove('hidden');
            document.getElementById(`nav-${page}`)?.classList.add('nav-active');

            if (page === 'dashboard') loadDashboard();
            if (page === 'users') loadUsers();
            if (page === 'giftcodes') loadGiftCodes();
            if (page === 'withdrawals') loadWithdrawals();
            if (page === 'lucky_draw') loadLuckyDraw();
            if (page === 'tasks') loadTasks();
        }
        // --- TASKS MANAGEMENT ---
        function renderTaskRow(t) {
            const safeId = String(t.id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const iconHtml = (t.icon && String(t.icon).startsWith('http'))
                ? `<img src="${t.icon}" class="w-8 h-8 rounded mx-auto">`
                : (t.icon || '?');
            const actionLabel = t.actionType === 'join'
                ? `JOIN: ${t.telegramChatId || 'No ID'}`
                : t.actionType === 'react_heart'
                    ? `HEART: ${t.telegramChatId || 'No chat'} / Any message`
                    : 'CLICK';

            return `
                <tr class="hover:bg-slate-800/50 transition border-b border-slate-800">
                    <td class="p-4">
                        <div class="text-xs text-slate-500 mb-1">ID: #${t.id}</div>
                        <div class="text-2xl">${iconHtml}</div>
                    </td>
                    <td class="p-4">
                        <div class="font-bold text-white">${t.title}</div>
                        <div class="text-[10px] text-slate-500 truncate w-48">${t.url || 'No Link'}</div>
                    </td>
                    <td class="p-4">
                        <span class="${t.rewardType === 'gold' ? 'text-yellow-400' : 'text-cyan-400'} font-bold">
                            ${Number(t.rewardAmount).toLocaleString()} ${t.rewardType === 'gold' ? 'Gold' : '$'}
                        </span>
                    </td>
                    <td class="p-4">
                        <span class="bg-slate-700 text-slate-300 px-2 py-1 rounded text-[10px] uppercase font-bold">${t.type}</span>
                        <div class="mt-1 text-[10px] ${t.actionType === 'join' ? 'text-purple-400' : t.actionType === 'react_heart' ? 'text-rose-400' : 'text-slate-500'}">
                            ${actionLabel}
                        </div>
                    </td>
                    <td class="p-4 text-center">
                        <div class="flex items-center justify-center gap-2">
                            <button onclick="editTask('${safeId}')" class="text-cyan-300 hover:text-cyan-200 transition text-xs font-bold bg-cyan-400/10 px-2 py-1 rounded border border-cyan-400/20">? Sua</button>
                            <button onclick="deleteTask('${safeId}')" class="text-red-400 hover:text-red-300 transition text-xs font-bold bg-red-400/10 px-2 py-1 rounded border border-red-400/20">?? Xoa</button>
                        </div>
                    </td>
                </tr>
            `;
        }

        function resetTaskForm() {
            editingTaskId = null;
            const form = document.getElementById('task-form');
            form.reset();

            const idInput = document.getElementById('task-id');
            idInput.readOnly = false;
            idInput.classList.remove('opacity-60', 'cursor-not-allowed');

            document.getElementById('task-action-type').value = 'click';
            document.getElementById('task-type').value = 'community';
            document.getElementById('task-reward-type').value = 'gold';
            document.getElementById('task-reward-amount').value = '1000';

            document.getElementById('task-form-title').textContent = 'Them Nhiem Vu Moi';
            document.getElementById('task-submit-btn').textContent = 'Luu Nhiem Vu';
            document.getElementById('task-cancel-edit-btn').classList.add('hidden');
            toggleGroupInput();
        }

        function setTaskFormEdit(task) {
            editingTaskId = String(task.id);

            const idInput = document.getElementById('task-id');
            idInput.value = String(task.id || '');
            idInput.readOnly = true;
            idInput.classList.add('opacity-60', 'cursor-not-allowed');

            document.getElementById('task-title').value = task.title || '';
            document.getElementById('task-icon').value = task.icon || '';
            document.getElementById('task-reward-type').value = task.rewardType === 'usdt' ? 'usdt' : 'gold';
            document.getElementById('task-reward-amount').value = Number(task.rewardAmount || 0);
            document.getElementById('task-link').value = task.url || '';
            document.getElementById('task-type').value = task.type || 'community';
            document.getElementById('task-action-type').value = task.actionType || 'click';
            document.getElementById('task-group-id').value = task.telegramChatId || '';

            document.getElementById('task-form-title').textContent = `Sua Nhiem Vu #${task.id}`;
            document.getElementById('task-submit-btn').textContent = 'Cap Nhat Nhiem Vu';
            document.getElementById('task-cancel-edit-btn').classList.remove('hidden');
            toggleGroupInput();

            document.getElementById('task-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        async function loadTasks() {
            const data = await fetchAdmin('/admin/data');
            applyAdminSnapshot(data);
            tasksCache = data.tasks || [];

            const newbieTasks = tasksCache.filter((t) => String(t.type) === 'newbie');
            const otherTasks = tasksCache.filter((t) => String(t.type) !== 'newbie');

            const newbieHtml = newbieTasks.map(renderTaskRow).join('');
            const otherHtml = otherTasks.map(renderTaskRow).join('');

            document.getElementById('newbie-tasks-table').innerHTML = newbieHtml || '<tr><td colspan="5" class="p-4 text-center text-slate-500">Chua co nhiem vu tan thu nao.</td></tr>';
            document.getElementById('tasks-table').innerHTML = otherHtml || '<tr><td colspan="5" class="p-4 text-center text-slate-500">Chua co nhiem vu nao.</td></tr>';

            if (editingTaskId && !tasksCache.some((t) => String(t.id) === String(editingTaskId))) {
                resetTaskForm();
            }
        }

        document.getElementById('task-form').addEventListener('submit', async (e) => {
            e.preventDefault();

            const id = (editingTaskId || document.getElementById('task-id').value.trim());
            if (!id) {
                alert('Thieu ID nhiem vu');
                return;
            }

            const body = {
                id,
                title: document.getElementById('task-title').value,
                icon: document.getElementById('task-icon').value,
                rewardType: document.getElementById('task-reward-type').value,
                rewardAmount: document.getElementById('task-reward-amount').value,
                url: document.getElementById('task-link').value,
                type: document.getElementById('task-type').value,
                actionType: document.getElementById('task-action-type').value,
                telegramChatId: document.getElementById('task-group-id').value.trim(),
                telegramMessageId: ''
            };

            const res = await fetchAdmin('/admin/config/task', 'POST', body);
            if (res.success) {
                alert(editingTaskId ? 'Da cap nhat nhiem vu!' : 'Da them nhiem vu!');
                resetTaskForm();
                loadTasks();
            } else {
                alert('Loi: ' + (res.message || res.error));
            }
        });

        function editTask(id) {
            const task = tasksCache.find((t) => String(t.id) === String(id));
            if (!task) {
                alert('Khong tim thay nhiem vu de sua.');
                return;
            }
            setTaskFormEdit(task);
        }

        function cancelTaskEdit() {
            resetTaskForm();
        }

        async function deleteTask(id) {
            if (!confirm('Ban co chac muon xoa nhiem vu nay?')) return;
            const res = await fetchAdmin(`/admin/config/task/${id}`, 'DELETE');
            if (res.success) {
                if (String(editingTaskId) === String(id)) {
                    resetTaskForm();
                }
                loadTasks();
            } else {
                alert('Loi: ' + (res.message || res.error));
            }
        }


        async function fetchAdmin(endpoint, method = 'GET', body = null) {
            const opts = {
                method,
                headers: {
                    'Authorization': `AdminPass ${TOKEN}`,
                    'Content-Type': 'application/json'
                }
            };
            if (body) opts.body = JSON.stringify(body);
            const res = await fetch(`${API_BASE}${endpoint}`, opts);
            if (res.status === 401 || res.status === 403) logout();
            return res.json();
        }

        // --- Pages ---

        function renderDashboard() {
            const totalPending = latestAdminData?.pendingWithdraws?.length || 0;
            const totalUsers = usersCache.length;
            const totalGold = getProjectedTotalGold(usersCache);
            document.getElementById('stats-grid').innerHTML = `
                <div class="glass p-6 rounded-xl border-l-4 border-cyan-500">
                    <h3 class="text-slate-400 text-xs uppercase font-bold">Total Users</h3>
                    <p class="text-3xl font-bold text-white">${totalUsers.toLocaleString()}</p>
                </div>
                <div class="glass p-6 rounded-xl border-l-4 border-yellow-500">
                    <h3 class="text-slate-400 text-xs uppercase font-bold">Pending Withdrawals</h3>
                    <p class="text-3xl font-bold text-white">${totalPending}</p>
                </div>
                <div class="glass p-6 rounded-xl border-l-4 border-green-500">
                    <h3 class="text-slate-400 text-xs uppercase font-bold">Total Gold Circulating</h3>
                    <p class="text-3xl font-bold text-white">${totalGold.toLocaleString()}</p>
                </div>
            `;
        }

        async function loadDashboard() {
            const data = await fetchAdmin('/admin/data');
            applyAdminSnapshot(data);
            renderDashboard();
        }

        // --- USERS MANAGEMENT ---
        async function loadUsers() {
            const data = await fetchAdmin('/admin/data');
            applyAdminSnapshot(data);
            renderUsers();
        }

        let currentPage = 1;
        const usersPerPage = 10;

        function renderUsers() {
            const searchInfo = document.getElementById('user-search').value.toLowerCase();
            const filtered = usersCache.filter(u =>
                String(u.teleId).includes(searchInfo) ||
                (u.username && u.username.toLowerCase().includes(searchInfo))
            );

            const start = (currentPage - 1) * usersPerPage;
            const paged = filtered.slice(start, start + usersPerPage);

            const html = paged.map(u => `
                <tr class="hover:bg-slate-800/50 transition border-b border-slate-800 last:border-0">
                    <td class="p-4 font-mono text-xs text-slate-500">${u.teleId}</td>
                    <td class="p-4">
                        <div class="font-bold text-white">${u.username || 'N/A'}</div>
                        <div class="text-[10px] text-cyan-400">@${u.tgHandle || 'none'}</div>
                    </td>
                    <td class="p-4">
                        <div class="text-yellow-400 font-mono">${getProjectedGold(u).toLocaleString()}</div>
                        ${isMiningUserActive(u) ? `<div class="mt-1 text-[10px] text-emerald-300">Dang dao realtime +${Math.max(0, getProjectedGold(u) - toFiniteNumber(u.gold)).toLocaleString()}</div>` : ''}
                    </td>
                    <td class="p-4 text-cyan-400 font-mono">${Number(u.usdtBalance || 0).toLocaleString()}</td>
                    <td class="p-4 text-white font-bold">Lvl ${u.level}</td>
                    <td class="p-4 text-xs text-slate-500">${u.ip_address || 'N/A'}</td>
                    <td class="p-4">
                        <button onclick="editUser('${u.teleId}')" class="bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white px-3 py-1 rounded text-xs">Edit</button>
                    </td>
                </tr>
             `).join('');

            document.getElementById('users-table').innerHTML = html;
            document.getElementById('user-count').innerText = `${filtered.length} users found`;
            document.getElementById('user-page').innerText = currentPage;
        }

        document.getElementById('user-search').addEventListener('input', () => { currentPage = 1; renderUsers(); });
        function prevUserPage() { if (currentPage > 1) { currentPage--; renderUsers(); } }
        function nextUserPage() { currentPage++; renderUsers(); } // Simple next, could be improved

        function editUser(teleId) {
            const user = usersCache.find(u => String(u.teleId) === String(teleId));
            if (!user) return;
            document.getElementById('edit-teleId').value = user.teleId;
            document.getElementById('edit-gold').value = user.gold;
            document.getElementById('edit-usdt').value = user.usdtBalance || 0;
            document.getElementById('edit-user-modal').classList.remove('hidden');
        }

        document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const teleId = document.getElementById('edit-teleId').value;
            const gold = document.getElementById('edit-gold').value;
            const usdtBalance = document.getElementById('edit-usdt').value;

            const res = await fetchAdmin('/admin/user/update', 'POST', { teleId, gold, usdtBalance });
            if (res.success) {
                alert('User updated!');
                document.getElementById('edit-user-modal').classList.add('hidden');
                loadUsers();
            } else {
                alert('Failed: ' + res.error);
            }
        });


        // --- GIFT CODES MANAGEMENT ---
        async function loadGiftCodes() {
            const data = await fetchAdmin('/admin/data');
            applyAdminSnapshot(data);

            const html = giftCodesCache.map(g => `
                <tr class="hover:bg-slate-800/50 transition border-b border-slate-800">
                    <td class="p-4 font-mono font-bold text-yellow-400">${g.code}</td>
                    <td class="p-4 text-xs">
                        ${g.rewardGold ? `<span class="text-yellow-500">${g.rewardGold.toLocaleString()} Gold</span>` : ''}
                    </td>
                    <td class="p-4 text-xs text-slate-400">Max: ${g.maxUses}</td>
                    <td class="p-4">
                        <button onclick="deleteCode('${g.code}')" class="text-red-400 hover:text-red-300">🗑</button>
                    </td>
                </tr>
            `).join('');
            document.getElementById('giftcodes-table').innerHTML = html || '<tr><td colspan="4" class="p-4 text-center text-slate-500">No codes active.</td></tr>';
        }

        document.getElementById('giftcode-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const body = {
                code: document.getElementById('gc-code').value,
                rewardGold: document.getElementById('gc-gold').value,
                maxUses: document.getElementById('gc-max').value
            };
            const res = await fetchAdmin('/admin/giftcode/add', 'POST', body);
            if (res.success) {
                alert('Code Created!');
                document.getElementById('giftcode-form').reset();
                loadGiftCodes();
            } else {
                alert(res.error);
            }
        });

        async function deleteCode(code) {
            if (!confirm('Delete this code?')) return;
            await fetchAdmin('/admin/giftcode/delete', 'POST', { code });
            loadGiftCodes();
        }


        // --- Withdrawals ---

        let currentWithdrawFilter = 'all';

        async function loadWithdrawals() {
            const data = await fetchAdmin('/admin/data');
            applyAdminSnapshot(data);
            let list = data.pendingWithdraws || [];
            
            // Collect unique dates from the list for the filter dropdown
            const dates = [...new Set(list.map(w => w.createdAt ? w.createdAt.split('T')[0] : 'Unknown'))];
            dates.sort().reverse();
            
            const filterContainer = document.getElementById('withdraw-filter-date');
            if (filterContainer) {
                 filterContainer.innerHTML = `
                    <option value="all">Tất cả ngày</option>
                    ${dates.map(d => `<option value="${d}">${d}</option>`).join('')}
                 `;
                 filterContainer.value = currentWithdrawFilter;
            }

            // Filter logic
            if (currentWithdrawFilter !== 'all') {
                list = list.filter(w => w.createdAt && w.createdAt.startsWith(currentWithdrawFilter));
            }

            const html = list.map(w => `
                <tr class="hover:bg-slate-800/50 transition border-b border-slate-800 last:border-0">
                    <td class="p-4 text-slate-500 text-xs">
                        <div>#${w.id}</div>
                        <div class="mt-1 text-slate-400 font-mono">${w.createdAt ? new Date(w.createdAt).toLocaleString('vi-VN') : ''}</div>
                    </td>
                    <td class="p-4">
                        <div class="font-bold text-white">${w.username || 'Unknown'}</div>
                        <div class="text-[10px] text-cyan-400">@${w.tgHandle || 'none'}</div>
                        <div class="text-[9px] text-slate-500">${w.userTeleId}</div>
                    </td>
                    <td class="p-4 font-mono text-green-400">${Number(w.vnd).toLocaleString()} đ</td>
                    <td class="p-4 text-xs">
                        <div class="font-bold text-slate-300">${w.bankName}</div>
                        <div class="text-slate-500">${w.accountNumber}</div>
                        <div class="text-slate-500 font-bold">${w.accountName}</div>
                    </td>
                    <td class="p-4">
                        <button onclick="showQR('${w.bankName}', '${w.accountNumber}', ${w.vnd}, '${w.username}')" class="bg-purple-600/20 text-purple-400 hover:bg-purple-600 hover:text-white px-3 py-1 rounded text-xs font-bold font-mono">SCAN</button>
                    </td>
                    <td class="p-4">
                        <button onclick="showRefs('${w.userTeleId}', '${w.username}')" class="bg-slate-700 hover:bg-slate-600 text-cyan-400 px-3 py-1 rounded text-xs">Details</button>
                    </td>
                    <td class="p-4"><span class="bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded text-xs font-bold">${w.status}</span></td>
                    <td class="p-4 flex gap-2">
                        <button onclick="updateStatus(${w.id}, 'Thành công')" class="bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white px-2 py-1 rounded">✔</button>
                        <button onclick="rejectWithdraw(${w.id})" class="bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white px-2 py-1 rounded">✖</button>
                    </td>
                </tr>
            `).join('');
            document.getElementById('withdrawals-table').innerHTML = html || '<tr><td colspan="8" class="p-4 text-center text-slate-500">Không có đơn rút tiền nào.</td></tr>';
        }

        function filterWithdrawals() {
            currentWithdrawFilter = document.getElementById('withdraw-filter-date').value;
            loadWithdrawals();
        }

        async function updateStatus(id, status, reason = '') {
            if (!confirm(`Xác nhận đơn #${id} là ${status}?`)) return;
            // Send status and reason to backend. Backend should handle saving the reason.
            await fetchAdmin('/admin/withdraw/status', 'POST', { withdrawId: id, newStatus: status, reason });
            loadWithdrawals();
        }
        
        function rejectWithdraw(id) {
            const reason = prompt("Nhập lý do từ chối (User sẽ thấy lý do này):");
            if (reason === null) return; // Cancelled
            updateStatus(id, 'Bị từ chối', reason || 'Vi phạm chính sách');
        }

        function showQR(bank, accNum, amount, username) {
            // Mapping common bank names to VietQR Bin/ID if needed. 
            // For now assuming bank name or bin is provided correctly or using a lookup.
            // A simple lookup for common VN banks:
            const bankMap = {
                'MBBank': 'MB', 'Vietcombank': 'VCB', 'Techcombank': 'TCB', 'BIDV': 'BIDV', 
                'VietinBank': 'ICB', 'Agribank': 'VBA', 'ACB': 'ACB', 'VPBank': 'VPB', 
                'TPBank': 'TPB', 'Sacombank': 'STB', 'HDBank': 'HDB', 'VIB': 'VIB', 
                'Eximbank': 'EIB', 'SHB': 'SHB', 'SeABank': 'SEAB', 'MSB': 'MSB', 
                'OCB': 'OCB', 'LienVietPostBank': 'LPB', 'BacABank': 'BAB', 'NamABank': 'NAB'
            };
            
            // Normalize bank name for lookup (very basic)
            let bankCode = bank;
            for (const [key, val] of Object.entries(bankMap)) {
                if (bank.toLowerCase().includes(key.toLowerCase())) {
                    bankCode = val;
                    break;
                }
            }

            const qrUrl = `https://img.vietqr.io/image/${bankCode}-${accNum}-compact2.png?amount=${amount}&addInfo=Rut tien ${username}`;
            
            openModal(`QR Thanh Toán - ${username}`, `
                <div class="text-center">
                    <img src="${qrUrl}" class="mx-auto rounded-lg shadow-lg mb-4 max-w-[300px]" alt="QR Code">
                    <p class="text-slate-400 text-xs text-center">Scan with Banking App</p>
                    <div class="bg-slate-700/50 p-3 rounded mt-4 text-sm">
                        <p><span class="text-slate-400">Bank:</span> <span class="text-white font-bold">${bank}</span></p>
                        <p><span class="text-slate-400">Account:</span> <span class="text-white font-bold font-mono">${accNum}</span></p>
                        <p><span class="text-slate-400">Amount:</span> <span class="text-yellow-400 font-bold font-mono">${Number(amount).toLocaleString()} VND</span></p>
                    </div>
                </div>
            `);
        }

        // --- Invitation Details Logic ---
        async function showRefs(teleId, username) {
            openModal(`Invite Details - ${username}`, '<div class="text-center py-4"><div class="loading mx-auto"></div></div>');

            const refs = await fetchAdmin(`/admin/referrals/${teleId}`);

            // Analyze IPs
            const ipCounts = {};
            refs.forEach(r => ipCounts[r.ip_address] = (ipCounts[r.ip_address] || 0) + 1);

            let sharedIpHTML = '';
            let dupCount = 0;
            let groupCount = 0;

            for (const [ip, count] of Object.entries(ipCounts)) {
                if (count > 1 && ip && ip !== 'null') {
                    dupCount += (count - 1); // Extra accounts
                    groupCount++;
                }
            }

            if (groupCount > 0) {
                sharedIpHTML = `
                    <div class="bg-red-500/10 border border-red-500/30 p-3 rounded-lg text-red-300 mb-4 flex items-center gap-3">
                        <span class="text-2xl">⚠️</span>
                        <div>
                            Found <strong>${groupCount}</strong> shared IP groups.<br>
                            Approximately <strong>${dupCount}</strong> potential clone accounts.
                        </div>
                    </div>
                `;
            }

            const rows = refs.map(r => {
                const isDup = (r.ip_address && ipCounts[r.ip_address] > 1);
                return `
                    <div class="flex justify-between items-center bg-slate-700/30 p-3 rounded mb-2 border ${isDup ? 'border-red-500/30' : 'border-slate-700'}">
                        <div>
                            <div class="font-bold text-white">${r.username}</div>
                            <div class="text-xs text-slate-500">${r.teleId}</div>
                        </div>
                        <div class="text-right">
                             <div class="font-mono text-xs ${isDup ? 'text-red-400 font-bold' : 'text-slate-400'}">${r.ip_address || 'N/A'} ${isDup ? '(Trùng)' : ''}</div>
                             <div class="text-xs text-slate-600">${new Date(r.createdAt).toLocaleDateString()}</div>
                        </div>
                    </div>
                `;
            }).join('');

            updateModalContent(`
                ${sharedIpHTML}
                <div class="space-y-1">
                    ${rows || '<p class="text-center text-slate-500">No referrals found.</p>'}
                </div>
            `);
        }

        // --- Lucky Draw Logic ---
        async function loadLuckyDraw() {
            const listData = await fetchAdmin('/admin/lucky-draw/schedule');

            const renderList = (schedules) => {
                // Group by date
                let lastDate = '';
                return schedules.map(s => {
                    const d = s.drawDate.split('T')[0];
                    let header = '';
                    if (d !== lastDate) {
                        header = `<h4 class="text-cyan-400 font-bold mt-6 mb-2 border-b border-cyan-500/30 pb-1">${d}</h4>`;
                        lastDate = d;
                    }
                    return `
                        ${header}
                        <div class="bg-slate-800/50 p-3 rounded flex justify-between items-center group border border-slate-700 hover:border-slate-500">
                            <div>
                                <span class="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded mr-2">Top ${s.rankPos}</span>
                                <span class="font-bold text-white">${s.fakeName || s.teleId}</span>
                                <span class="text-xs text-slate-500 ml-2">(${s.fakeName ? 'Fake' : 'Real'})</span>
                            </div>
                            <button onclick="deleteSchedule(${s.id})" class="text-slate-600 hover:text-red-400">🗑</button>
                        </div>
                    `;
                }).join('');
            };

            document.getElementById('schedule-list').innerHTML = renderList(listData);
        }

        async function deleteSchedule(id) {
            if (!confirm('Delete this schedule?')) return;
            await fetchAdmin(`/admin/lucky-draw/schedule/${id}`, 'DELETE');
            loadLuckyDraw();
        }

        document.getElementById('schedule-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const body = {
                date: document.getElementById('sch-date').value,
                rank: document.getElementById('sch-rank').value,
                [document.querySelector('input[name="sch-type"]:checked').value === 'fake' ? 'fakeName' : 'teleId']: document.getElementById('sch-value').value
            };

            const res = await fetchAdmin('/admin/lucky-draw/schedule', 'POST', body);
            if (res.success) {
                alert('Saved!');
                loadLuckyDraw();
            } else {
                alert('Error');
            }
        });

        function toggleInputPlaceholder(type) {
            document.getElementById('sch-value').placeholder = type === 'fake' ? 'Enter Fake Name...' : 'Enter Real TeleID...';
        }

        // --- Modal ---
        function openModal(title, html) {
            document.getElementById('modal-title').innerText = title;
            document.getElementById('modal-body').innerHTML = html;
            document.getElementById('modal').classList.remove('hidden');
        }
        function updateModalContent(html) {
            document.getElementById('modal-body').innerHTML = html;
        }
        function closeModal() {
            document.getElementById('modal').classList.add('hidden');
        }

        // Init
        resetTaskForm();
        checkAuth();

    </script>
</body>

</html>


