import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const rawPort = process.env.PORT || '80';
const PORT = Number(rawPort);

if (Number.isNaN(PORT) || PORT <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const ADMIN_ID = "7711226652";
const BOT_TOKEN = process.env.BOT_TOKEN || '8258255510:AAFjHCjP9C1VtGC06bvUx0eATQLJpMEPb6c';
const ADMIN_PASSWORD = "Vjyy1234@"; // Updated per user request
const HEART_REACTIONS = new Set(['❤', '❤️', '♥', '♥️']);


function verifyTelegramInitData(initData) {
    if (!initData) return false;
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    const dataCheckString = Array.from(urlParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData')
        .update(BOT_TOKEN)
        .digest();

    const calculatedHash = crypto.createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    return calculatedHash === hash;
}

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Thiếu thông tin xác thực' });
    }

    const initData = authHeader.split(' ')[1];

    if (!verifyTelegramInitData(initData)) {
        return res.status(403).json({ error: 'Thông tin xác thực không hợp lệ' });
    }

    try {
        const urlParams = new URLSearchParams(initData);
        const userStr = urlParams.get('user');
        if (!userStr) return res.status(400).json({ error: 'Dữ liệu người dùng không hợp lệ' });
        req.user = JSON.parse(userStr);

        // Extract referral from start_param if exists
        req.start_param = urlParams.get('start_param');
        if (req.start_param) console.log(`[AUTH] start_param detected: ${req.start_param} for user ${req.user.id}`);

        next();
    } catch (e) {
        res.status(400).json({ error: 'Lỗi định dạng dữ liệu người dùng' });
    }
};

const adminMiddleware = (req, res, next) => {
    // Check for cookie or header token for web admin
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('AdminPass ')) {
        const pass = authHeader.split(' ')[1];
        if (pass === ADMIN_PASSWORD) {
            req.user = { id: ADMIN_ID, isWebAdmin: true }; // Fake admin user
            return next();
        }
    }

    authMiddleware(req, res, () => {
        if (String(req.user.id) !== ADMIN_ID) {
            return res.status(403).json({ error: 'Truy cập bị từ chối: Không phải admin' });
        }
        next();
    });
};

// --- MYSQL CONFIGURATION ---
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'daovang_db',
    charset: 'utf8mb4'
};

let pool;

async function initDB() {
    console.log("🛠️ Initializing Database...");
    try {
        pool = mysql.createPool(dbConfig);
        console.log("📡 Connection pool created.");

        const connection = await pool.getConnection();
        console.log("🔌 Database connected successfully.");

        // Helper to run ALTER commands silently (ignore errors if already applied)
        const safeAlter = async (sql) => {
            try { await connection.query(sql); } catch (e) { /* Already applied or not needed */ }
        };

        // Set charset for the connection session
        await connection.query("SET NAMES utf8mb4");
        await safeAlter("ALTER DATABASE daovang_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

        // 1. Users Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                teleId BIGINT PRIMARY KEY,
                username VARCHAR(255),
                tgHandle VARCHAR(255),
                gold DECIMAL(65, 0) DEFAULT 0,
                goldBeforeShift DECIMAL(65, 0) DEFAULT 0,
                diamonds DECIMAL(65, 0) DEFAULT 1000,
                level INT DEFAULT 1,
                miningRate FLOAT DEFAULT 7,
                upgradeCost DECIMAL(65, 0) DEFAULT 5000,
                isMining BOOLEAN DEFAULT FALSE,
                miningStartTime BIGINT DEFAULT NULL,
                miningShiftStart BIGINT DEFAULT NULL,
                referrals INT DEFAULT 0,
                lastTaskClaim BIGINT DEFAULT NULL,
                flappyBestScore INT DEFAULT 0,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        // Create referrals table immediately after users
        await connection.query(`
            CREATE TABLE IF NOT EXISTS referrals (
                id INT AUTO_INCREMENT PRIMARY KEY,
                inviterId BIGINT,
                invitedId BIGINT,
                goldReward DECIMAL(65, 0) DEFAULT 50000,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY (invitedId)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
        await safeAlter("ALTER TABLE users CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        await safeAlter("ALTER TABLE users ADD COLUMN tgHandle VARCHAR(255)");
        await safeAlter("ALTER TABLE users MODIFY COLUMN gold DECIMAL(65,0) DEFAULT 0");
        await safeAlter("ALTER TABLE users MODIFY COLUMN goldBeforeShift DECIMAL(65,0) DEFAULT 0");
        await safeAlter("ALTER TABLE users MODIFY COLUMN diamonds DECIMAL(65,0) DEFAULT 1000");
        await safeAlter("ALTER TABLE users MODIFY COLUMN upgradeCost DECIMAL(65,0) DEFAULT 5000");
        await safeAlter("ALTER TABLE users ADD COLUMN miningShiftStart BIGINT DEFAULT NULL AFTER miningStartTime");
        await safeAlter("ALTER TABLE users ADD COLUMN ip_address VARCHAR(45) AFTER username");
        await safeAlter("ALTER TABLE users ADD COLUMN flappyBestScore INT DEFAULT 0 AFTER lastTaskClaim");

        // 2. Gift Codes Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS gift_codes (
                code VARCHAR(50) PRIMARY KEY,
                rewardDiamonds DECIMAL(65, 0) DEFAULT 0,
                rewardGold DECIMAL(65, 0) DEFAULT 0,
                maxUses INT DEFAULT 999,
                usedCount INT DEFAULT 0,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
        await safeAlter("ALTER TABLE gift_codes CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        await safeAlter("ALTER TABLE gift_codes MODIFY COLUMN rewardDiamonds DECIMAL(65,0) DEFAULT 0");
        await safeAlter("ALTER TABLE gift_codes MODIFY COLUMN rewardGold DECIMAL(65,0) DEFAULT 0");

        // 3. Gift Code Usage Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS gift_code_usage (
                code VARCHAR(50),
                teleId BIGINT,
                usedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (code, teleId)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
        await safeAlter("ALTER TABLE gift_code_usage CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

        // 4. Withdrawals Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS withdrawals (
                id INT AUTO_INCREMENT PRIMARY KEY,
                teleId BIGINT,
                amount DECIMAL(65, 0),
                vndAmount DECIMAL(65, 0),
                bankBin VARCHAR(50),
                bankName VARCHAR(255),
                accountNumber VARCHAR(255),
                accountName VARCHAR(255),
                status VARCHAR(50) DEFAULT 'Đang xử lý',
                qrUrl TEXT,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
        await safeAlter("ALTER TABLE withdrawals CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        await safeAlter("ALTER TABLE withdrawals MODIFY COLUMN amount DECIMAL(65,0)");
        await safeAlter("ALTER TABLE withdrawals MODIFY COLUMN vndAmount DECIMAL(65,0)");
        await safeAlter("ALTER TABLE withdrawals ADD COLUMN message TEXT");

        // 5. Level Settings Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS level_settings (
                level INT PRIMARY KEY,
                miningRate FLOAT,
                upgradeCost DECIMAL(65, 0)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
        await safeAlter("ALTER TABLE level_settings CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        await safeAlter("ALTER TABLE level_settings MODIFY COLUMN upgradeCost DECIMAL(65,0)");

        // 6. Tasks Table (NEW)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS tasks (
                id VARCHAR(50) PRIMARY KEY,
                title VARCHAR(255),
                icon VARCHAR(255),
                rewardType VARCHAR(20),
                rewardAmount DECIMAL(65, 0),
                url TEXT,
                type VARCHAR(50) DEFAULT 'community',
                actionType VARCHAR(20) DEFAULT 'click',
                telegramChatId VARCHAR(100),
                telegramMessageId BIGINT DEFAULT NULL
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
        await safeAlter("ALTER TABLE tasks CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        await safeAlter("ALTER TABLE tasks MODIFY COLUMN rewardAmount DECIMAL(65,0)");
        await safeAlter("ALTER TABLE tasks MODIFY COLUMN icon VARCHAR(255)");
        await safeAlter("ALTER TABLE tasks ADD COLUMN actionType VARCHAR(20) DEFAULT 'click'");
        await safeAlter("ALTER TABLE tasks ADD COLUMN telegramChatId VARCHAR(100)");
        await safeAlter("ALTER TABLE tasks ADD COLUMN telegramMessageId BIGINT DEFAULT NULL");

        // 6.1 Task Claims Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS task_claims (
                teleId BIGINT,
                taskId VARCHAR(50),
                claimedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (teleId, taskId),
                FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        // 6.2 Ad Daily Log Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS ad_daily_log (
                teleId BIGINT,
                taskId VARCHAR(50),
                logDate DATE,
                count INT DEFAULT 0,
                PRIMARY KEY (teleId, taskId, logDate),
                FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS telegram_message_reactions (
                teleId BIGINT,
                chatId VARCHAR(100),
                messageId BIGINT,
                reaction VARCHAR(32),
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (teleId, chatId, messageId, reaction)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        // 7. Lucky Draw Config Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS lucky_draw_config (
                id INT PRIMARY KEY DEFAULT 1,
                totalPrize DECIMAL(65, 0) DEFAULT 0,
                top1Percent FLOAT DEFAULT 40,
                top2Percent FLOAT DEFAULT 25,
                top3Percent FLOAT DEFAULT 15,
                top4Percent FLOAT DEFAULT 10,
                top5Percent FLOAT DEFAULT 10,
                entryFee DECIMAL(65, 0) DEFAULT 1000,
                lastDrawAt TIMESTAMP NULL,
                drawHour INT DEFAULT 23,
                drawMinute INT DEFAULT 59
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
        // Seed default config
        await connection.query("INSERT IGNORE INTO lucky_draw_config (id, totalPrize) VALUES (1, 0)");

        // 8. Lucky Draw Participants Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS lucky_draw_participants (
                teleId BIGINT PRIMARY KEY,
                joinedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        // 9. Lucky Draw Winners Table (History)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS lucky_draw_winners (
                id INT AUTO_INCREMENT PRIMARY KEY,
                drawDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                top1_id BIGINT, top1_name VARCHAR(255), top1_reward DECIMAL(65, 0),
                top2_id BIGINT, top2_name VARCHAR(255), top2_reward DECIMAL(65, 0),
                top3_id BIGINT, top3_name VARCHAR(255), top3_reward DECIMAL(65, 0),
                top4_id BIGINT, top4_name VARCHAR(255), top4_reward DECIMAL(65, 0),
                top5_id BIGINT, top5_name VARCHAR(255), top5_reward DECIMAL(65, 0)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        // 10. Lucky Draw Overrides (Admin Designations)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS lucky_draw_overrides (
                rankPos INT PRIMARY KEY,
                teleId BIGINT NULL,
                fakeName VARCHAR(255) NULL
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
        // Seed overrides
        for (let i = 1; i <= 5; i++) {
            await connection.query("INSERT IGNORE INTO lucky_draw_overrides (rankPos) VALUES (?)", [i]);
        }

        // 11. Lucky Draw Schedule (Date-based)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS lucky_draw_schedule (
                id INT AUTO_INCREMENT PRIMARY KEY,
                drawDate DATE,
                rankPos INT,
                teleId BIGINT NULL,
                fakeName VARCHAR(255) NULL,
                UNIQUE KEY unique_schedule (drawDate, rankPos)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS flappy_config (
                id INT PRIMARY KEY DEFAULT 1,
                rewardGold DECIMAL(65, 0) DEFAULT 15000,
                rewardDiamonds DECIMAL(65, 0) DEFAULT 25
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
        await safeAlter("ALTER TABLE flappy_config CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        await safeAlter("ALTER TABLE flappy_config MODIFY COLUMN rewardGold DECIMAL(65,0) DEFAULT 15000");
        await safeAlter("ALTER TABLE flappy_config MODIFY COLUMN rewardDiamonds DECIMAL(65,0) DEFAULT 25");
        await connection.query("INSERT IGNORE INTO flappy_config (id, rewardGold, rewardDiamonds) VALUES (1, 15000, 25)");

        // Populate Default Levels if empty or incomplete
        const [levs] = await connection.query("SELECT COUNT(*) as count FROM level_settings");
        if (levs[0].count < 100) {
            console.log(`📦 Populating default level settings (Current count: ${levs[0].count})...`);
            for (let i = 1; i <= 100; i++) {
                const rate = 7 + (i - 1) * 2;
                // Use BigInt or format to avoid scientific notation
                const cost = Math.floor(5000 * Math.pow(1.5, i - 1));
                const costStr = cost.toLocaleString('fullwide', { useGrouping: false });

                await connection.query(
                    "INSERT INTO level_settings (level, miningRate, upgradeCost) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE miningRate = ?, upgradeCost = ?",
                    [i, rate, costStr, rate, costStr]
                );
            }
            console.log("✅ Level settings updated.");
        }

        // Populate Default Tasks if empty
        const [task_count] = await connection.query("SELECT COUNT(*) as count FROM tasks");
        if (task_count[0].count === 0) {
            console.log("📦 Populating default tasks...");
            // JOIN TASK Example (Uses verification)
            await connection.query("INSERT INTO tasks (id, title, icon, rewardType, rewardAmount, url, type, actionType, telegramChatId) VALUES ('tg_join', 'Tham Gia Channel', '📢', 'gold', 10000, 'https://t.me/GomXuDaoVang', 'community', 'join', '-1002360813959')");

            // CLICK TASK Example (Just click to reward)
            await connection.query("INSERT INTO tasks (id, title, icon, rewardType, rewardAmount, url, type, actionType) VALUES ('tg_group', 'Nhóm Thảo Luận', '💬', 'gold', 10000, 'https://t.me/GomXuDaoVangGroup', 'community', 'click')");

            // AD TASKS
            await connection.query("INSERT INTO tasks (id, title, icon, rewardType, rewardAmount, url, type) VALUES ('daily_ad_gold', 'Xem Quảng Cáo Vàng', '🎬', 'gold', 20000, null, 'ad')");
            await connection.query("INSERT INTO tasks (id, title, icon, rewardType, rewardAmount, url, type) VALUES ('daily_ad_diamond', 'Xem Quảng Cáo KC', '💎', 'diamond', 50, null, 'ad')");
            console.log("✅ Default tasks added.");
        }

        // 11. Referrals Table (Moved earlier)
        // await connection.query(...);

        // --- MIGRATION LOGIC ---
        const [cols] = await connection.query("SHOW COLUMNS FROM users LIKE 'withdrawHistory'");
        if (cols.length > 0) {
            console.log("🔄 Migrating old withdrawal history...");
            const [oldUsers] = await connection.query("SELECT teleId, withdrawHistory FROM users WHERE withdrawHistory IS NOT NULL");
            for (const user of oldUsers) {
                let history = [];
                try {
                    history = typeof user.withdrawHistory === 'string' ? JSON.parse(user.withdrawHistory) : user.withdrawHistory;
                    if (typeof history === 'string') history = JSON.parse(history);
                } catch (e) { history = []; }
                if (Array.isArray(history)) {
                    for (const w of history) {
                        await connection.query(
                            `INSERT IGNORE INTO withdrawals (teleId, amount, vndAmount, bankBin, bankName, accountNumber, accountName, status, qrUrl, createdAt) 
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [user.teleId, w.gold || w.amount || 0, w.vnd || 0, w.bankBin || '', w.bankName || '', w.accountNumber || '', w.accountName || '', w.status || 'Đang xử lý', w.qrUrl || null, new Date(w.date || Date.now())]
                        );
                    }
                }
            }
            await connection.query("ALTER TABLE users DROP COLUMN withdrawHistory");
            console.log("✅ Migration complete.");
        }

        connection.release();
        console.log("✅ Database Setup Complete");
    } catch (err) {
        console.error("❌ MySQL Setup Failed:", err);
    }
}

app.use(cors());
app.use(express.json());

// --- HELPERS ---

async function harvestMiningGold(teleId) {
    const [users] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
    if (users.length === 0) return null;
    const user = users[0];

    if (!user.isMining || !user.miningStartTime || !user.miningShiftStart) return user;

    const now = Date.now();
    const elapsedSinceStart = now - user.miningShiftStart;
    const elapsedSinceLastHarvest = now - user.miningStartTime;
    const SHIFT_DURATION = 6 * 60 * 60 * 1000; // 6 Hours (Phát Lộc Khai Xuân)

    // Check if shift is already over
    if (elapsedSinceStart >= SHIFT_DURATION) {
        // Harvest remaining bit up to the 6h limit
        const remainingToHarvest = Math.max(0, SHIFT_DURATION - (user.miningStartTime - user.miningShiftStart));
        const earned = Math.floor((remainingToHarvest / 1000) * (user.miningRate || 7));

        if (earned > 0) {
            await pool.query(
                'UPDATE users SET gold = gold + ?, goldBeforeShift = goldBeforeShift + ? WHERE teleId = ?',
                [earned, earned, teleId]
            );
        }

        await pool.query('UPDATE users SET isMining = FALSE, miningStartTime = NULL, miningShiftStart = NULL WHERE teleId = ?', [teleId]);
        const [updatedUsers] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        return updatedUsers[0];
    }

    // Normal checkpoint harvest
    const earned = Math.floor((elapsedSinceLastHarvest / 1000) * (user.miningRate || 7));

    if (earned > 0) {
        await pool.query(
            'UPDATE users SET gold = gold + ?, goldBeforeShift = goldBeforeShift + ? WHERE teleId = ?',
            [earned, earned, teleId]
        );

        await pool.query('UPDATE users SET miningStartTime = ? WHERE teleId = ?', [now, teleId]);

        const [updatedUsers] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        return updatedUsers[0];
    }

    return user;
}

function hasHeartReaction(reactions = []) {
    return reactions.some((reaction) => {
        if (!reaction || reaction.type !== 'emoji') return false;
        return HEART_REACTIONS.has(String(reaction.emoji || '').trim());
    });
}

async function syncTelegramReaction(update) {
    const userId = update?.user?.id;
    const chatId = update?.chat?.id;
    const messageId = update?.message_id;

    if (!userId || chatId === undefined || messageId === undefined) {
        return;
    }

    await pool.query(
        'DELETE FROM telegram_message_reactions WHERE teleId = ? AND chatId = ? AND messageId = ?',
        [userId, String(chatId), messageId]
    );

    if (!hasHeartReaction(update?.new_reaction || [])) {
        return;
    }

    await pool.query(
        'INSERT INTO telegram_message_reactions (teleId, chatId, messageId, reaction) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE updatedAt = CURRENT_TIMESTAMP',
        [userId, String(chatId), messageId, 'heart']
    );
}

// --- CONFIG ROUTES ---
app.get('/api/config/levels', authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM level_settings ORDER BY level ASC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/config/tasks', authMiddleware, async (req, res) => {
    const teleId = req.user.id;
    try {
        // We join with task_claims to know which ones the user has already done
        const [rows] = await pool.query(`
            SELECT t.*, 
            c.claimedAt as lastClaimedAt,
            CASE WHEN c.teleId IS NOT NULL THEN 1 ELSE 0 END as isClaimed
            FROM tasks t
            LEFT JOIN task_claims c ON t.id = c.taskId AND c.teleId = ?
        `, [teleId]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/flappy/config', authMiddleware, async (req, res) => {
    try {
        const [configRows] = await pool.query('SELECT rewardGold, rewardDiamonds FROM flappy_config WHERE id = 1');
        const [userRows] = await pool.query('SELECT flappyBestScore FROM users WHERE teleId = ?', [req.user.id]);

        res.json({
            rewardGold: configRows[0]?.rewardGold || 0,
            rewardDiamonds: configRows[0]?.rewardDiamonds || 0,
            bestScore: userRows[0]?.flappyBestScore || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/flappy/submit-score', authMiddleware, async (req, res) => {
    const teleId = req.user.id;
    const rawScore = Number(req.body?.score);
    const score = Math.max(0, Math.floor(Number.isFinite(rawScore) ? rawScore : 0));

    try {
        const [users] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });

        const user = users[0];
        const currentBest = Number(user.flappyBestScore || 0);
        if (score <= currentBest) {
            return res.json({ success: true, isNewBest: false, bestScore: currentBest, rewardGold: 0, rewardDiamonds: 0, user });
        }

        const [configRows] = await pool.query('SELECT rewardGold, rewardDiamonds FROM flappy_config WHERE id = 1');
        const rewardGold = Number(configRows[0]?.rewardGold || 0);
        const rewardDiamonds = Number(configRows[0]?.rewardDiamonds || 0);

        await pool.query(
            'UPDATE users SET flappyBestScore = ?, gold = gold + ?, goldBeforeShift = goldBeforeShift + ?, diamonds = diamonds + ? WHERE teleId = ?',
            [score, rewardGold, rewardGold, rewardDiamonds, teleId]
        );

        const [updatedUsers] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        res.json({
            success: true,
            isNewBest: true,
            bestScore: score,
            rewardGold,
            rewardDiamonds,
            user: updatedUsers[0]
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROUTES ---

// Redeem Gift Code
app.post('/api/user/redeem', authMiddleware, async (req, res) => {
    const { code } = req.body;
    const teleId = req.user.id;
    if (!code) return res.json({ success: false, message: 'Vui lòng nhập mã!' });

    const cleanCode = code.toString().trim().toUpperCase();

    try {
        const user = await harvestMiningGold(teleId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        const [codes] = await pool.query('SELECT * FROM gift_codes WHERE code = ?', [cleanCode]);
        if (codes.length === 0) return res.json({ success: false, message: 'Mã không tồn tại!' });

        const gift = codes[0];
        if (gift.usedCount >= gift.maxUses) return res.json({ success: false, message: 'Mã đã hết lượt!' });

        const [usage] = await pool.query('SELECT * FROM gift_code_usage WHERE code = ? AND teleId = ?', [cleanCode, teleId]);
        if (usage.length > 0) return res.json({ success: false, message: 'Bạn đã dùng mã này rồi!' });

        if (gift.rewardDiamonds > 0) await pool.query('UPDATE users SET diamonds = diamonds + ? WHERE teleId = ?', [gift.rewardDiamonds, teleId]);
        if (gift.rewardGold > 0) await pool.query('UPDATE users SET gold = gold + ?, goldBeforeShift = goldBeforeShift + ? WHERE teleId = ?', [gift.rewardGold, gift.rewardGold, teleId]);

        await pool.query('UPDATE gift_codes SET usedCount = usedCount + 1 WHERE code = ?', [cleanCode]);
        await pool.query('INSERT INTO gift_code_usage (code, teleId) VALUES (?, ?)', [cleanCode, teleId]);

        const [users] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        const updatedUser = users[0];

        res.json({
            success: true,
            rewardDiamonds: gift.rewardDiamonds,
            rewardGold: gift.rewardGold,
            user: updatedUser
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create Withdrawal Request
app.post('/api/withdraw/create', authMiddleware, async (req, res) => {
    const { amount, bankBin, bankName, accountNumber, accountName } = req.body;
    const teleId = req.user.id;

    try {
        const user = await harvestMiningGold(teleId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (Number(amount) < 6000000) return res.json({ success: false, message: 'Rút tối thiểu 6.000.000 Gold!' });
        if (Number(user.gold) < Number(amount)) return res.json({ success: false, message: 'Số dư không đủ!' });

        const vndAmount = Math.floor(parseInt(amount) * 0.0005);
        const qrUrl = bankBin ? `https://img.vietqr.io/image/${bankBin}-${accountNumber}-compact2.png?amount=${vndAmount}&addInfo=Bot%20Kiem%20Tien%20Done%20${teleId}&accountName=${encodeURIComponent(accountName)}` : null;

        await pool.query('UPDATE users SET gold = gold - ?, goldBeforeShift = goldBeforeShift - ? WHERE teleId = ?', [amount, amount, teleId]);

        await pool.query(
            `INSERT INTO withdrawals (teleId, amount, vndAmount, bankBin, bankName, accountNumber, accountName, qrUrl) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [teleId, amount, vndAmount, bankBin, bankName, accountNumber, accountName, qrUrl]
        );

        console.log(`[WITHDRAW] New request from ${teleId}: ${amount} Gold -> ${vndAmount} VND`);

        const [users] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        res.json({ success: true, user: users[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Exchange Gold to Diamonds
app.post('/api/game/exchange', authMiddleware, async (req, res) => {
    const { amount } = req.body; // Amount of gold to exchange
    const teleId = req.user.id;

    if (!amount || amount <= 0) return res.status(400).json({ error: 'Số lượng không hợp lệ' });

    try {
        const user = await harvestMiningGold(teleId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (Number(user.gold) < Number(amount)) return res.status(400).json({ error: 'Số dư không đủ!' });

        const diamonds = Math.floor(amount / 125);
        if (diamonds <= 0) return res.status(400).json({ error: 'Số lượng quá nhỏ!' });

        await pool.query(
            'UPDATE users SET gold = gold - ?, goldBeforeShift = goldBeforeShift - ?, diamonds = diamonds + ? WHERE teleId = ?',
            [amount, amount, diamonds, teleId]
        );

        const [updatedUsers] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        res.json({ success: true, user: updatedUsers[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get User Data (Includes History from separate table)
app.get('/api/user/:id', authMiddleware, async (req, res) => {
    const userId = req.params.id;

    // Ensure user can only fetch their own data, unless they are admin
    if (String(userId) !== String(req.user.id) && String(req.user.id) !== ADMIN_ID) {
        return res.status(403).json({ error: 'Không có quyền truy cập dữ liệu người dùng khác' });
    }

    if (!/^\d+$/.test(userId)) return res.status(400).json({ error: 'Invalid User ID' });

    try {
        const user = await harvestMiningGold(userId);

        // Sync name from Telegram data
        const tgUser = req.user;
        const realName = tgUser?.first_name
            ? (tgUser.last_name ? `${tgUser.first_name} ${tgUser.last_name}` : tgUser.first_name)
            : (tgUser?.username || 'Khách');

        const tgHandle = tgUser?.username || 'none';

        if (!user) {
            const newUser = [userId, realName, tgHandle, 1000, 1000, 1000, 1, 7, 5000, false, null, null, 0, null, 0];
            await pool.query(
                `INSERT INTO users (teleId, username, tgHandle, gold, goldBeforeShift, diamonds, level, miningRate, upgradeCost, isMining, miningStartTime, miningShiftStart, referrals, lastTaskClaim, flappyBestScore)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                newUser
            );

            // --- Referral Logic ---
            const referralId = req.start_param;
            console.log(`[USER CREATE] New user ${userId} created. start_param: ${referralId}`);

            if (referralId && referralId !== String(userId)) {
                try {
                    // 1. Check if inviter exists
                    const [inviters] = await pool.query('SELECT * FROM users WHERE teleId = ?', [referralId]);
                    console.log(`[REFERRAL CHECK] Inviter ${referralId} exists? ${inviters.length > 0}`);

                    if (inviters.length > 0) {
                        const reward = 50000;
                        // 2. Reward inviter
                        await pool.query(
                            'UPDATE users SET gold = gold + ?, goldBeforeShift = goldBeforeShift + ?, referrals = referrals + 1 WHERE teleId = ?',
                            [reward, reward, referralId]
                        );
                        // 3. Record referral
                        const [refResult] = await pool.query(
                            'INSERT IGNORE INTO referrals (inviterId, invitedId, goldReward) VALUES (?, ?, ?)',
                            [referralId, userId, reward]
                        );
                        console.log(`🎁 Referral record result for ${userId}:`, refResult);
                        console.log(`🎁 Referral reward of ${reward} gold sent to ${referralId} for inviting ${userId}`);
                    }
                } catch (refErr) {
                    console.error('[REFERRAL ERROR]', refErr);
                }
            }

            const [newRows] = await pool.query('SELECT * FROM users WHERE teleId = ?', [userId]);
            return res.json(newRows[0]);
        }

        // Auto-sync name/handle if it doesn't match
        if (user.username !== realName || user.tgHandle !== tgHandle) {
            await pool.query('UPDATE users SET username = ?, tgHandle = ? WHERE teleId = ?', [realName, tgHandle, userId]);
            user.username = realName;
            user.tgHandle = tgHandle;
        }

        // Save IP if not exists or update it (User requirement: "first time save first ip", but usually we track latest or first. 
        // Request: "khi lần đầu sài vào đầu tiên sẽ lưu ip truy cập đầu tiên". So only if null.)
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (!user.ip_address && clientIp) {
            await pool.query('UPDATE users SET ip_address = ? WHERE teleId = ?', [clientIp, userId]);
        }

        const [withdraws] = await pool.query('SELECT * FROM withdrawals WHERE teleId = ? ORDER BY createdAt DESC', [userId]);

        user.withdrawHistory = withdraws.map(w => ({
            id: w.id,
            teleId: w.teleId,
            amount: w.amount,
            vnd: w.vndAmount,
            bankName: w.bankName,
            accountNumber: w.accountNumber,
            status: w.status,
            date: new Date(w.createdAt).toLocaleString('vi-VN'),
            qrUrl: w.qrUrl,
            message: w.message || ''
        }));

        res.json({ ...user, serverTime: Date.now() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Referral History (User)
app.get('/api/user/referrals', authMiddleware, async (req, res) => {
    const teleId = req.user.id;
    try {
        const [rows] = await pool.query(`
            SELECT r.*, COALESCE(NULLIF(u.username, ''), CONCAT('Người dùng ', r.invitedId)) as invitedName 
            FROM referrals r
            LEFT JOIN users u ON r.invitedId = u.teleId
            WHERE r.inviterId = ?
            ORDER BY r.createdAt DESC
        `, [teleId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Get Referrals of a specific user (with IP info)
app.get('/api/admin/referrals/:teleId', adminMiddleware, async (req, res) => {
    const { teleId } = req.params;
    try {
        const [rows] = await pool.query(`
            SELECT u.username, u.teleId, u.ip_address, r.createdAt
            FROM referrals r
            JOIN users u ON r.invitedId = u.teleId
            WHERE r.inviterId = ?
        `, [teleId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- GAME LOGIC API (Server-Authoritative) ---

// Start Mining
app.post('/api/game/start-mining', authMiddleware, async (req, res) => {
    const teleId = req.user.id;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });
        const user = users[0];

        if (user.isMining) return res.status(400).json({ error: 'Đang đào rồi!' });

        const now = Date.now();
        await pool.query('UPDATE users SET isMining = TRUE, miningStartTime = ?, miningShiftStart = ? WHERE teleId = ?', [now, now, teleId]);

        res.json({ success: true, miningStartTime: now, miningShiftStart: now });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Claim Mining Reward (Manually harvest and stop mining)
app.post('/api/game/claim-mining', authMiddleware, async (req, res) => {
    const teleId = req.user.id;
    try {
        // Harvest any pending gold first
        const user = await harvestMiningGold(teleId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (!user.isMining && !user.miningStartTime) {
            // If already harvested/stopped, just return the current state
            return res.json({ success: true, reward: 0, gold: Number(user.gold) });
        }

        // Force stop mining
        await pool.query(
            'UPDATE users SET isMining = FALSE, miningStartTime = NULL WHERE teleId = ?',
            [teleId]
        );

        const [finalUsers] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        res.json({ success: true, reward: 0, gold: Number(finalUsers[0].gold) });
    } catch (err) {
        console.error('[CLAIM ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

// Upgrade Miner
app.post('/api/game/upgrade', authMiddleware, async (req, res) => {
    const teleId = req.user.id;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        const user = users[0];

        const nextLevel = user.level + 1;
        const [settings] = await pool.query('SELECT * FROM level_settings WHERE level = ?', [nextLevel]);

        if (settings.length === 0) return res.status(400).json({ error: 'Đã đạt cấp tối đa!' });
        const nextSetting = settings[0];

        if (Number(user.diamonds) < Number(nextSetting.upgradeCost)) return res.status(400).json({ error: 'Không đủ Kim Cương!' });


        await pool.query(
            'UPDATE users SET diamonds = diamonds - ?, level = ?, miningRate = ?, upgradeCost = ? WHERE teleId = ?',
            [nextSetting.upgradeCost, nextLevel, nextSetting.miningRate, nextSetting.upgradeCost, teleId]
        );

        // Fetch new next level for cost display
        const [nextNextSettings] = await pool.query('SELECT * FROM level_settings WHERE level = ?', [nextLevel + 1]);
        const nextUpgradeCost = nextNextSettings.length > 0 ? nextNextSettings[0].upgradeCost : 0;

        if (nextNextSettings.length > 0) {
            await pool.query('UPDATE users SET upgradeCost = ? WHERE teleId = ?', [nextUpgradeCost, teleId]);
        }

        res.json({ success: true, level: nextLevel, miningRate: nextSetting.miningRate, diamonds: Number(user.diamonds) - Number(nextSetting.upgradeCost) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Save User State (Profile only)
app.post('/api/user/:id', authMiddleware, async (req, res) => {
    const userId = req.params.id;

    if (String(userId) !== String(req.user.id)) {
        return res.status(403).json({ error: 'Không có quyền cập nhật dữ liệu người dùng khác' });
    }

    // ONLY update safe fields. Ignore resources.
    const { username } = req.body;

    try {
        await pool.query(
            `UPDATE users SET username = ? WHERE teleId = ?`,
            [username, userId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ADMIN API ---

// Admin Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    // Security check
    if (username === 'khaidzs1tg' && password === ADMIN_PASSWORD) {
        return res.json({ success: true, token: ADMIN_PASSWORD });
    }
    res.status(401).json({ success: false, message: 'Sai thông tin đăng nhập' });
});



// Admin V2 Route (New)
app.get('/khaidz', (req, res) => {
    // Serve admin panel but force HTML content type so browser renders it instead of downloading
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'khaidz', 'index.php'));
});

app.get('/api/admin/data', adminMiddleware, async (req, res) => {
    try {
        const [users] = await pool.query('SELECT * FROM users');
        const [giftCodes] = await pool.query('SELECT * FROM gift_codes ORDER BY createdAt DESC');
        const [flappyConfigRows] = await pool.query('SELECT * FROM flappy_config WHERE id = 1');

        // Fetch all pending withdrawals from the dedicated table
        const [pendingWithdraws] = await pool.query(`
            SELECT w.*, u.username, u.tgHandle 
            FROM withdrawals w
            JOIN users u ON w.teleId = u.teleId
            WHERE w.status = 'Đang xử lý'
            ORDER BY w.createdAt ASC
        `);

        // Map to expected format
        const formattedWithdraws = pendingWithdraws.map(w => ({
            id: w.id,
            userTeleId: w.teleId,
            teleId: w.teleId, // Alias
            username: w.username,
            tgHandle: w.tgHandle || 'none',
            accountName: w.accountName,
            bankName: w.bankName,
            accountNumber: w.accountNumber,
            vnd: w.vndAmount,
            qrUrl: w.qrUrl,
            status: w.status
        }));

        let totalGold = 0;
        let totalDiamonds = 0;
        users.forEach(u => {
            totalGold += Number(u.gold || 0);
            totalDiamonds += Number(u.diamonds || 0);
        });

        const [levels] = await pool.query('SELECT * FROM level_settings ORDER BY level ASC');
        const [tasks] = await pool.query('SELECT * FROM tasks');

        res.json({
            users,
            totalGold,
            totalDiamonds,
            pendingWithdraws: formattedWithdraws,
            giftCodes,
            levels,
            tasks,
            flappyConfig: flappyConfigRows[0] || { rewardGold: 0, rewardDiamonds: 0 }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Level Settings
app.post('/api/admin/config/level', adminMiddleware, async (req, res) => {
    const { level, miningRate, upgradeCost } = req.body;
    try {
        await pool.query(
            'INSERT INTO level_settings (level, miningRate, upgradeCost) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE miningRate = ?, upgradeCost = ?',
            [level, miningRate, upgradeCost, miningRate, upgradeCost]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/flappy/config', adminMiddleware, async (req, res) => {
    const rewardGold = Math.max(0, Math.floor(Number(req.body?.rewardGold || 0)));
    const rewardDiamonds = Math.max(0, Math.floor(Number(req.body?.rewardDiamonds || 0)));

    try {
        await pool.query(
            'INSERT INTO flappy_config (id, rewardGold, rewardDiamonds) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE rewardGold = VALUES(rewardGold), rewardDiamonds = VALUES(rewardDiamonds)',
            [rewardGold, rewardDiamonds]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Task
app.post('/api/admin/config/task', adminMiddleware, async (req, res) => {
    const { id, title, icon, rewardType, rewardAmount, url, type, actionType, telegramChatId, telegramMessageId } = req.body;
    const normalizedActionType = ['click', 'join', 'react_heart'].includes(actionType) ? actionType : 'click';
    const normalizedType = ['community', 'daily', 'one_time', 'ad'].includes(type) ? type : 'community';
    const normalizedRewardType = rewardType === 'diamond' || rewardType === 'diamonds' ? 'diamond' : 'gold';
    const normalizedChatId = telegramChatId ? String(telegramChatId).trim() : null;
    const normalizedMessageId = telegramMessageId !== undefined && telegramMessageId !== null && String(telegramMessageId).trim() !== ''
        ? Number(telegramMessageId)
        : null;

    if (!id || !title) {
        return res.status(400).json({ error: 'Missing task id or title.' });
    }

    if (normalizedActionType === 'join' && !normalizedChatId) {
        return res.status(400).json({ error: 'Join task requires telegramChatId.' });
    }

    if (normalizedActionType === 'react_heart') {
        if (!normalizedChatId) {
            return res.status(400).json({ error: 'Heart task requires telegramChatId.' });
        }

        if (!Number.isFinite(normalizedMessageId) || normalizedMessageId <= 0) {
            return res.status(400).json({ error: 'Heart task requires a valid telegramMessageId.' });
        }
    }

    try {
        await pool.query(
            'INSERT INTO tasks (id, title, icon, rewardType, rewardAmount, url, type, actionType, telegramChatId, telegramMessageId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE title = ?, icon = ?, rewardType = ?, rewardAmount = ?, url = ?, type = ?, actionType = ?, telegramChatId = ?, telegramMessageId = ?',
            [
                id,
                title,
                icon,
                normalizedRewardType,
                rewardAmount,
                url,
                normalizedType,
                normalizedActionType,
                normalizedChatId,
                normalizedActionType === 'react_heart' ? normalizedMessageId : null,
                title,
                icon,
                normalizedRewardType,
                rewardAmount,
                url,
                normalizedType,
                normalizedActionType,
                normalizedChatId,
                normalizedActionType === 'react_heart' ? normalizedMessageId : null
            ]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete Task
app.delete('/api/admin/config/task/:id', adminMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin Create User (Staff)
app.post('/api/admin/user/create', adminMiddleware, async (req, res) => {
    const { teleId, username } = req.body;
    if (!teleId) return res.status(400).json({ error: 'Missing ID' });

    try {
        const [existing] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        if (existing.length > 0) {
            return res.json({ success: false, message: 'User already exists' });
        }

        const newUser = [teleId, username || `Staff_${teleId}`, 1000, 1000, 1000, 1, 7, 5000, false, null, null, 0, null, 0];
        await pool.query(
            `INSERT INTO users (teleId, username, gold, goldBeforeShift, diamonds, level, miningRate, upgradeCost, isMining, miningStartTime, miningShiftStart, referrals, lastTaskClaim, flappyBestScore)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            newUser
        );
        res.json({ success: true, message: 'User created', username: newUser[1] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/adjust', adminMiddleware, async (req, res) => {
    const { targetTeleId, type, amount } = req.body;
    try {
        const query = type === 'gold'
            ? 'UPDATE users SET gold = gold + ?, goldBeforeShift = goldBeforeShift + ? WHERE teleId = ?'
            : 'UPDATE users SET diamonds = diamonds + ? WHERE teleId = ?';

        const params = type === 'gold' ? [amount, amount, targetTeleId] : [amount, targetTeleId];
        await pool.query(query, params);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/withdraw/status', adminMiddleware, async (req, res) => {
    const { withdrawId, newStatus, reason } = req.body;
    try {
        console.log(`[ADMIN] Update Withdrawal #${withdrawId} to ${newStatus}. Reason: ${reason}`);

        // Update status and reason (if column exists, otherwise just status)
        // Attempt to update 'message' column for reason if possible, or just ignore if fail (safe SQL)
        try {
            await pool.query('UPDATE withdrawals SET status = ?, message = ? WHERE id = ?', [newStatus, reason || '', withdrawId]);
        } catch (e) {
            // Fallback if 'message' column doesn't exist
            await pool.query('UPDATE withdrawals SET status = ? WHERE id = ?', [newStatus, withdrawId]);
        }

        res.json({ success: true, message: 'Status updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/user/update', adminMiddleware, async (req, res) => {
    const { teleId, gold, diamonds, isBanned } = req.body;
    try {
        // dynamic update query depending on fields provided? Or just update all?
        // Let's update explicitly passed fields. Actually, simpler to just update main stats.
        await pool.query(
            'UPDATE users SET gold = ?, diamonds = ? WHERE teleId = ?',
            [gold, diamonds, teleId]
        );
        // If isBanned logic exists in DB schema (I don't recall seeing it in initDB but can add column if needed, 
        // user didn't explicitly ask for banning but "manage users". I'll skip banning column for now to avoid schema drift unless requested).
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/giftcode/add', adminMiddleware, async (req, res) => {
    const { code, rewardDiamonds, rewardGold, maxUses } = req.body;
    try {
        await pool.query(
            'INSERT INTO gift_codes (code, rewardDiamonds, rewardGold, maxUses) VALUES (?, ?, ?, ?)',
            [code.trim().toUpperCase(), rewardDiamonds || 0, rewardGold || 0, maxUses]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/giftcode/delete', adminMiddleware, async (req, res) => {
    const { code } = req.body;
    try {
        await pool.query('DELETE FROM gift_codes WHERE code = ?', [code]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- LUCKY DRAW API ---

app.get('/api/lucky-draw/info', authMiddleware, async (req, res) => {
    try {
        const [configRows] = await pool.query('SELECT * FROM lucky_draw_config WHERE id = 1');
        const [participantRows] = await pool.query('SELECT COUNT(*) as count FROM lucky_draw_participants');
        const [isJoinedRows] = await pool.query('SELECT * FROM lucky_draw_participants WHERE teleId = ?', [req.user.id]);
        const [lastWinners] = await pool.query('SELECT * FROM lucky_draw_winners ORDER BY drawDate DESC LIMIT 1');

        res.json({
            config: configRows[0],
            participantCount: participantRows[0].count,
            isJoined: isJoinedRows.length > 0,
            lastWinners: lastWinners.length > 0 ? lastWinners[0] : null
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/lucky-draw/participate', authMiddleware, async (req, res) => {
    try {
        const teleId = req.user.id;
        const [configRows] = await pool.query('SELECT * FROM lucky_draw_config WHERE id = 1');
        const config = configRows[0];
        const entryFee = Number(config.entryFee) || 0;

        // Check if already joined
        const [existing] = await pool.query('SELECT * FROM lucky_draw_participants WHERE teleId = ?', [teleId]);
        if (existing.length > 0) return res.status(400).json({ error: 'Bạn đã tham gia rồi!' });

        // Check user balance
        const [userRows] = await pool.query('SELECT gold FROM users WHERE teleId = ?', [teleId]);
        if (userRows[0].gold < entryFee) return res.status(400).json({ error: 'Không đủ vàng để tham gia!' });

        // Deduct fee and join
        await pool.query('UPDATE users SET gold = gold - ? WHERE teleId = ?', [entryFee, teleId]);
        await pool.query('INSERT IGNORE INTO lucky_draw_participants (teleId) VALUES (?)', [teleId]);

        // Add entry fee to total prize pool
        await pool.query('UPDATE lucky_draw_config SET totalPrize = totalPrize + ? WHERE id = 1', [entryFee]);

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/lucky-draw/data', adminMiddleware, async (req, res) => {
    try {
        const [config] = await pool.query('SELECT * FROM lucky_draw_config WHERE id = 1');
        const [overrides] = await pool.query('SELECT * FROM lucky_draw_overrides ORDER BY rankPos ASC');
        res.json({ config: config[0], overrides });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/lucky-draw/config', adminMiddleware, async (req, res) => {
    const { totalPrize, top1Percent, top2Percent, top3Percent, top4Percent, top5Percent, entryFee, drawHour, drawMinute } = req.body;
    try {
        await pool.query(
            'UPDATE lucky_draw_config SET totalPrize=?, top1Percent=?, top2Percent=?, top3Percent=?, top4Percent=?, top5Percent=?, entryFee=?, drawHour=?, drawMinute=? WHERE id = 1',
            [totalPrize, top1Percent, top2Percent, top3Percent, top4Percent, top5Percent, entryFee, drawHour, drawMinute]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/server-time', adminMiddleware, (req, res) => {
    res.json({ time: new Date().toISOString() });
});



// Lucky Draw Schedule API
app.get('/api/admin/lucky-draw/schedule', adminMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM lucky_draw_schedule ORDER BY drawDate DESC, rankPos ASC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/lucky-draw/schedule', adminMiddleware, async (req, res) => {
    const { date, rank, teleId, fakeName } = req.body;
    try {
        await pool.query(
            'INSERT INTO lucky_draw_schedule (drawDate, rankPos, teleId, fakeName) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE teleId = VALUES(teleId), fakeName = VALUES(fakeName)',
            [date, rank, teleId || null, fakeName || null]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/lucky-draw/schedule/:id', adminMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM lucky_draw_schedule WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Drawing Logic
async function performLuckyDraw() {
    console.log("🎲 [LUCKY DRAW] Starting automated draw...");
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [configRows] = await connection.query('SELECT * FROM lucky_draw_config WHERE id = 1');
        const config = configRows[0];
        const totalPrize = Number(config.totalPrize);

        if (totalPrize <= 0) {
            console.log("🎲 [LUCKY DRAW] Skip: Total prize is 0.");
            await connection.rollback();
            return;
        }

        const [participants] = await connection.query('SELECT p.teleId, u.username FROM lucky_draw_participants p JOIN users u ON p.teleId = u.teleId');
        if (participants.length === 0) {
            console.log("🎲 [LUCKY DRAW] Skip: No participants.");
            await connection.rollback();
            return;
        }

        const [overrides] = await connection.query('SELECT * FROM lucky_draw_overrides ORDER BY rankPos ASC');

        let winners = [];
        let usedIds = new Set();
        const todayStr = new Date().toISOString().split('T')[0];

        // Fetch Scheduled Overrides for TODAY
        const [scheduledOverrides] = await connection.query('SELECT * FROM lucky_draw_schedule WHERE drawDate = ?', [todayStr]);


        // Helper to pick a random winner
        const pickRandom = () => {
            const available = participants.filter(p => !usedIds.has(p.teleId));
            if (available.length === 0) return null;
            return available[Math.floor(Math.random() * available.length)];
        };

        for (let i = 1; i <= 5; i++) {
            // Priority: Schedule -> Global Override (Deprecated/Fallback) -> Random
            const schedule = scheduledOverrides.find(o => o.rankPos === i);
            const override = schedule || overrides.find(o => o.rankPos === i); // Use schedule first

            const percent = config[`top${i}Percent`] || 0;
            const reward = Math.floor(totalPrize * (percent / 100));

            let winner = null;

            if (override && (override.teleId || override.fakeName)) {
                if (override.teleId) {
                    // Try to find in participants, otherwise fetch from DB
                    const joined = participants.find(p => String(p.teleId) === String(override.teleId));
                    if (joined) {
                        winner = { teleId: joined.teleId, username: override.fakeName || joined.username, isFake: false, reward };
                    } else {
                        // Designated user didn't join - we fetch their real name but still reward them (admin choice)
                        const [userRow] = await connection.query('SELECT username FROM users WHERE teleId = ?', [override.teleId]);
                        const name = userRow[0]?.username || 'Người dùng ẩn';
                        winner = { teleId: override.teleId, username: override.fakeName || name, isFake: false, reward };
                    }
                } else if (override.fakeName) {
                    // Pure fake user
                    winner = { teleId: null, username: override.fakeName, isFake: true, reward };
                }
            }

            // If no override or override failed to provide a winner, pick random
            if (!winner) {
                const random = pickRandom();
                if (random) {
                    winner = { teleId: random.teleId, username: random.username, isFake: false, reward };
                } else {
                    winner = { teleId: null, username: 'N/A', isFake: true, reward: 0 };
                }
            }

            if (winner && !winner.isFake && winner.teleId) {
                usedIds.add(winner.teleId);
            }
            winners.push(winner);
        }

        // Distribute rewards to real users
        for (const w of winners) {
            if (w.teleId) {
                await connection.query('UPDATE users SET gold = gold + ?, goldBeforeShift = goldBeforeShift + ? WHERE teleId = ?', [w.reward, w.reward, w.teleId]);
            }
        }

        // Log to history
        await connection.query(`
            INSERT INTO lucky_draw_winners 
            (top1_id, top1_name, top1_reward, top2_id, top2_name, top2_reward, top3_id, top3_name, top3_reward, top4_id, top4_name, top4_reward, top5_id, top5_name, top5_reward)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            winners[0].teleId, winners[0].username, winners[0].reward,
            winners[1].teleId, winners[1].username, winners[1].reward,
            winners[2].teleId, winners[2].username, winners[2].reward,
            winners[3].teleId, winners[3].username, winners[3].reward,
            winners[4].teleId, winners[4].username, winners[4].reward
        ]);

        // Clear participants and reset prize pool
        await connection.query('DELETE FROM lucky_draw_participants');
        await connection.query('UPDATE lucky_draw_config SET totalPrize = 0, lastDrawAt = NOW() WHERE id = 1');

        // CLEAR OVERRIDES (Reset Global only, keep history/schedule)
        await connection.query('UPDATE lucky_draw_overrides SET teleId = NULL, fakeName = NULL');

        await connection.commit();
        console.log("🎲 [LUCKY DRAW] Completed successfully.");
    } catch (err) {
        await connection.rollback();
        console.error("🎲 [LUCKY DRAW] Error:", err);
    } finally {
        connection.release();
    }
}

// Check schedule every minute
setInterval(async () => {
    try {
        const now = new Date();
        const [configRows] = await pool.query('SELECT drawHour, drawMinute, lastDrawAt FROM lucky_draw_config WHERE id = 1');
        if (configRows.length === 0) return;

        const config = configRows[0];
        const h = config.drawHour ?? 23;
        const m = config.drawMinute ?? 59;

        if (now.getHours() === h && now.getMinutes() === m) {
            // Check if we already drew today to avoid double fire
            const todayStr = now.toISOString().split('T')[0];
            const lastDrawStr = config.lastDrawAt ? new Date(config.lastDrawAt).toISOString().split('T')[0] : null;

            if (todayStr !== lastDrawStr) {
                performLuckyDraw();
            }
        }
    } catch (err) {
        console.error("🎲 [LUCKY DRAW SCHEDULER ERROR]", err);
    }
}, 60000);

// Manual trigger for admin (optional/test)
app.post('/api/admin/lucky-draw/trigger', adminMiddleware, async (req, res) => {
    await performLuckyDraw();
    res.json({ success: true });
});

// --- TASK CLAIM API (Server-Authoritative) ---
app.post('/api/task/claim', authMiddleware, async (req, res) => {
    const { taskId } = req.body;
    const teleId = req.user.id;
    if (!teleId || !taskId) return res.status(400).json({ error: 'Missing teleId or taskId' });

    try {
        // 1. Check if task exists
        const [tasks] = await pool.query('SELECT * FROM tasks WHERE id = ?', [taskId]);
        if (tasks.length === 0) return res.status(404).json({ error: 'Task not found' });
        const task = tasks[0];

        // 2. Action Verification
        if (task.actionType === 'join' && task.telegramChatId) {
            try {
                const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${task.telegramChatId}&user_id=${teleId}`);
                const tgData = await tgRes.json();

                if (!tgData.ok || ['left', 'kicked'].includes(tgData.result?.status)) {
                    return res.status(400).json({ error: 'Bạn chưa tham gia nhóm/kênh này!' });
                }
            } catch (err) {
                console.error('[TG VERIFY ERROR]', err);
                // If bot check fails, we might want to skip or fail? 
                // Let's fail for security unless it's a temp network issue.
                return res.status(500).json({ error: 'Không thể xác minh thành viên lúc này.' });
            }
        }

        if (task.actionType === 'react_heart') {
            if (!task.telegramChatId || !task.telegramMessageId) {
                return res.status(400).json({ error: 'Heart task is missing chat or message config.' });
            }

            const [reactionRows] = await pool.query(
                'SELECT reaction FROM telegram_message_reactions WHERE teleId = ? AND chatId = ? AND messageId = ? AND reaction = ? LIMIT 1',
                [teleId, String(task.telegramChatId), Number(task.telegramMessageId), 'heart']
            );

            if (reactionRows.length === 0) {
                return res.status(400).json({
                    error: 'Heart reaction not detected yet. If you already reacted before, remove the heart and react again so the bot can capture it.'
                });
            }
        }

        // 3. Reset/Cooldown Logic
        const [claims] = await pool.query('SELECT * FROM task_claims WHERE teleId = ? AND taskId = ?', [teleId, taskId]);
        const now = new Date();
        const vnNow = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // Rough VN Time

        if (task.type === 'one_time' || task.type === 'community') {
            if (claims.length > 0) return res.status(400).json({ error: 'Bạn đã làm nhiệm vụ này rồi!' });
        } else if (task.type === 'daily') {
            if (claims.length > 0) {
                const lastClaim = new Date(claims[0].claimedAt);
                const vnLast = new Date(lastClaim.getTime() + (7 * 60 * 60 * 1000));

                // If same day in VN (00:00:00 reset)
                if (vnNow.getUTCDate() === vnLast.getUTCDate() &&
                    vnNow.getUTCMonth() === vnLast.getUTCMonth() &&
                    vnNow.getUTCFullYear() === vnLast.getUTCFullYear()) {
                    return res.status(400).json({ error: 'Nhiệm vụ này sẽ reset vào ngày mai!' });
                }
            }
        } else if (task.type === 'ad') {
            // Existing ad logic
            if (claims.length > 0) {
                const lastClaimTime = new Date(claims[0].claimedAt);
                const minutesSince = (now - lastClaimTime) / (1000 * 60);
                if (minutesSince < 15) {
                    return res.status(400).json({ error: `Vui lòng chờ ${Math.ceil(15 - minutesSince)} phút nữa!` });
                }

                const dateStr = vnNow.toISOString().split('T')[0];
                const [logs] = await pool.query('SELECT count FROM ad_daily_log WHERE teleId = ? AND taskId = ? AND logDate = ?', [teleId, taskId, dateStr]);
                const currentCount = logs.length > 0 ? logs[0].count : 0;

                if (currentCount >= 4) {
                    return res.status(400).json({ error: 'Hôm nay bạn đã xem đủ 4 lần rồi!' });
                }

                await pool.query('UPDATE ad_daily_log SET count = count + 1 WHERE teleId = ? AND taskId = ? AND logDate = ?', [teleId, taskId, dateStr]);
            } else {
                const dateStr = vnNow.toISOString().split('T')[0];
                await pool.query('INSERT INTO ad_daily_log (teleId, taskId, logDate, count) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE count = count + 1', [teleId, taskId, dateStr]);
            }
        }

        // 4. Update or Insert Claim
        if (claims.length > 0) {
            await pool.query('UPDATE task_claims SET claimedAt = NOW() WHERE teleId = ? AND taskId = ?', [teleId, taskId]);
        } else {
            await pool.query('INSERT INTO task_claims (teleId, taskId) VALUES (?, ?)', [teleId, taskId]);
        }

        // 5. Award Reward
        const rewardAmount = Math.floor(Number(task.rewardAmount) || 0);
        if (task.rewardType === 'gold' || task.rewardType === 'gold') { // match schema rewardType
            await pool.query('UPDATE users SET gold = gold + ?, goldBeforeShift = goldBeforeShift + ? WHERE teleId = ?', [rewardAmount, rewardAmount, teleId]);
        } else if (task.rewardType === 'diamonds' || task.rewardType === 'diamond') {
            await pool.query('UPDATE users SET diamonds = diamonds + ? WHERE teleId = ?', [rewardAmount, teleId]);
        }

        // 6. Return updated data
        const [users] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        res.json({ success: true, reward: { type: task.rewardType, amount: rewardAmount }, user: users[0] });
    } catch (err) {
        console.error('[TASK CLAIM ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

// --- ADMIN ACTIONS (Protected) ---

// Reset All Database
app.post('/api/admin/reset-db', adminMiddleware, async (req, res) => {
    try {
        console.log("⚠️ [ADMIN] Resetting entire database...");
        await pool.query('DELETE FROM task_claims'); // Also clear task history
        await pool.query('DELETE FROM telegram_message_reactions');
        await pool.query('DELETE FROM gift_code_usage');
        await pool.query('DELETE FROM withdrawals');
        await pool.query('DELETE FROM referrals');
        await pool.query('DELETE FROM users');
        console.log("✅ [ADMIN] Database reset successfully.");
        res.json({ success: true, message: 'Đã xóa toàn bộ dữ liệu người dùng!' });
    } catch (err) {
        console.error('[RESET ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

// --- TELEGRAM BOT WEBHOOK ---

// Handle Telegram Webhook
app.post(`/api/bot/webhook/${BOT_TOKEN}`, async (req, res) => {
    const { message, message_reaction: messageReaction } = req.body || {};

    try {
        if (messageReaction) {
            await syncTelegramReaction(messageReaction);
            return res.sendStatus(200);
        }
    } catch (err) {
        console.error('[BOT REACTION ERROR]', err);
        return res.sendStatus(200);
    }

    if (!message || !message.text) return res.sendStatus(200);

    const chatId = message.chat.id;
    const text = message.text;

    if (text.startsWith('/start')) {
        const welcomeMessage = `🧧 CHÀO MỪNG BẠN ĐẾN VỚI ĐÀO VÀNG KHAI XUÂN! 🧧\n\nChúc bạn một năm mới an khang thịnh vượng, vạn sự như ý!\n\nHãy nhấn nút bên dưới để bắt đầu khai xuân và nhận những phần quà hấp dẫn nhé! 🧨💰`;

        const payload = {
            chat_id: chatId,
            text: welcomeMessage,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "🧧 MỞ MINI APP 🧧",
                            url: "https://t.me/Daoxu100_bot/Daoxu100"
                        }
                    ],
                    [
                        {
                            text: "📢 Tham Gia Kênh",
                            url: "https://t.me/daoxungaytet"
                        }
                    ],
                    [
                        {
                            text: "👨‍💻 Liên Hệ Admin",
                            url: "https://t.me/addaoxu"
                        }
                    ]
                ]
            }
        };

        try {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (err) {
            console.error('[BOT ERROR]', err);
        }
    }

    res.sendStatus(200);
});

// Helper to setup webhook on startup
async function setupBotWebhook() {
    const PUBLIC_URL = 'https://masothue.site';
    try {
        const allowedUpdates = encodeURIComponent(JSON.stringify(['message', 'message_reaction']));
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${PUBLIC_URL}/api/bot/webhook/${BOT_TOKEN}&allowed_updates=${allowedUpdates}`);
        const data = await res.json();
        if (data.ok) {
            console.log("✅ [BOT] Webhook set successfully.");
        } else {
            console.error("❌ [BOT] Webhook setup failed:", data.description);
        }
    } catch (err) {
        console.error("❌ [BOT] Could not reach Telegram API:", err.message);
    }
}

app.use(express.static(path.join(__dirname, 'dist')));
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        setupBotWebhook(); // Try to setup webhook
    });
});
