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
const adminEventClients = new Set();
const WITHDRAW_BANK_WALLET_FEE_PERCENT = 10;
const DEFAULT_USD_TO_VND_RATE_K = (() => {
    const raw = Number(process.env.USD_TO_VND_RATE_K || process.env.USDT_VND_RATE_K || 26);
    return Number.isFinite(raw) && raw > 0 ? raw : 26;
})();
const HEART_REACTIONS = new Set(['â¤', 'â¤ï¸', 'â™¥', 'â™¥ï¸']);


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
        return res.status(401).json({ error: 'Thiáº¿u thÃ´ng tin xÃ¡c thá»±c' });
    }

    const initData = authHeader.split(' ')[1];

    if (!verifyTelegramInitData(initData)) {
        return res.status(403).json({ error: 'ThÃ´ng tin xÃ¡c thá»±c khÃ´ng há»£p lá»‡' });
    }

    try {
        const urlParams = new URLSearchParams(initData);
        const userStr = urlParams.get('user');
        if (!userStr) return res.status(400).json({ error: 'Dá»¯ liá»‡u ngÆ°á»i dÃ¹ng khÃ´ng há»£p lá»‡' });
        req.user = JSON.parse(userStr);

        // Extract referral from start_param if exists
        req.start_param = urlParams.get('start_param');
        if (req.start_param) console.log(`[AUTH] start_param detected: ${req.start_param} for user ${req.user.id}`);

        next();
    } catch (e) {
        res.status(400).json({ error: 'Lá»—i Ä‘á»‹nh dáº¡ng dá»¯ liá»‡u ngÆ°á»i dÃ¹ng' });
    }
};

function getAdminPasswordFromRequest(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('AdminPass ')) {
        return authHeader.slice('AdminPass '.length);
    }

    if (typeof req.query?.token === 'string') {
        return req.query.token;
    }

    return '';
}

function sendSseEvent(res, eventName, payload) {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastAdminRefresh(reason, extra = {}) {
    if (adminEventClients.size === 0) {
        return;
    }

    const payload = {
        reason,
        at: Date.now(),
        ...extra,
    };

    for (const client of Array.from(adminEventClients)) {
        try {
            sendSseEvent(client.res, 'admin-refresh', payload);
        } catch (error) {
            clearInterval(client.keepAlive);
            adminEventClients.delete(client);
        }
    }
}

function registerAdminEventClient(req, res) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(': connected\n\n');

    const client = {
        res,
        keepAlive: setInterval(() => {
            try {
                res.write(': ping\n\n');
            } catch (error) {
                clearInterval(client.keepAlive);
                adminEventClients.delete(client);
            }
        }, 25000),
    };

    adminEventClients.add(client);
    sendSseEvent(res, 'connected', { ok: true, at: Date.now() });

    const cleanup = () => {
        clearInterval(client.keepAlive);
        adminEventClients.delete(client);
    };

    req.on('close', cleanup);
    res.on('close', cleanup);
}

const adminMiddleware = (req, res, next) => {
    const pass = getAdminPasswordFromRequest(req);
    if (pass === ADMIN_PASSWORD) {
        req.user = { id: ADMIN_ID, isWebAdmin: true }; // Fake admin user
        return next();
    }

    authMiddleware(req, res, () => {
        if (String(req.user.id) !== ADMIN_ID) {
            return res.status(403).json({ error: 'Truy cáº­p bá»‹ tá»« chá»‘i: KhÃ´ng pháº£i admin' });
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

const DEFAULT_ECONOMY_CONFIG = Object.freeze({
    newUserGold: 1000,
    newUserDiamonds: 1000,
    referralRewardGold: 0,
    referralRewardDiamonds: 0,
    referralRewardUsdt: 0.02,
    exchangeGoldPerDiamond: 125,
    withdrawMinGold: 6000000,
    withdrawVndPerGold: 0.0005,
    usdToVndRateK: DEFAULT_USD_TO_VND_RATE_K,
    taskMilestoneCount: 0,
    taskMilestoneRewardGold: 0,
    taskMilestoneRewardDiamonds: 0,
});

const DEFAULT_LIXI_CONFIG = Object.freeze({
    minGold: 5000,
    maxGold: 25000,
    maxClaimsPerRound: 10,
    cooldownMinutes: 60,
    requiredAdViews: 3,
});

async function initDB() {
    console.log("ðŸ› ï¸ Initializing Database...");
    try {
        pool = mysql.createPool(dbConfig);
        console.log("ðŸ“¡ Connection pool created.");

        const connection = await pool.getConnection();
        console.log("ðŸ”Œ Database connected successfully.");

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
                usdtBalance DECIMAL(24, 8) DEFAULT 0,
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
                goldReward DECIMAL(65, 0) DEFAULT 0,
                diamondReward DECIMAL(65, 0) DEFAULT 0,
                usdtReward DECIMAL(24, 8) DEFAULT 0.02,
                status VARCHAR(32) DEFAULT 'pending',
                rewardedAt TIMESTAMP NULL DEFAULT NULL,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY (invitedId)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
        await safeAlter("ALTER TABLE referrals CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        await safeAlter("ALTER TABLE referrals MODIFY COLUMN goldReward DECIMAL(65,0) DEFAULT 0");
        await safeAlter("ALTER TABLE referrals ADD COLUMN diamondReward DECIMAL(65,0) DEFAULT 0 AFTER goldReward");
        await safeAlter("ALTER TABLE referrals MODIFY COLUMN diamondReward DECIMAL(65,0) DEFAULT 0");
        await safeAlter("ALTER TABLE referrals ADD COLUMN usdtReward DECIMAL(24,8) DEFAULT 0.02 AFTER diamondReward");
        await safeAlter("ALTER TABLE referrals MODIFY COLUMN usdtReward DECIMAL(24,8) DEFAULT 0.02");
        await safeAlter("ALTER TABLE referrals ADD COLUMN status VARCHAR(32) DEFAULT 'pending' AFTER usdtReward");
        await safeAlter("ALTER TABLE referrals MODIFY COLUMN status VARCHAR(32) DEFAULT 'pending'");
        await safeAlter("ALTER TABLE referrals ADD COLUMN rewardedAt TIMESTAMP NULL DEFAULT NULL AFTER status");
        await connection.query("UPDATE referrals SET status = 'pending' WHERE status IS NULL OR status = ''");
        await connection.query("UPDATE referrals SET usdtReward = 0 WHERE usdtReward IS NULL");
        await connection.query("UPDATE referrals SET rewardedAt = createdAt WHERE status = 'rewarded' AND rewardedAt IS NULL");
        await safeAlter("ALTER TABLE users CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        await safeAlter("ALTER TABLE users ADD COLUMN tgHandle VARCHAR(255)");
        await safeAlter("ALTER TABLE users MODIFY COLUMN gold DECIMAL(65,0) DEFAULT 0");
        await safeAlter("ALTER TABLE users MODIFY COLUMN goldBeforeShift DECIMAL(65,0) DEFAULT 0");
        await safeAlter("ALTER TABLE users MODIFY COLUMN diamonds DECIMAL(65,0) DEFAULT 1000");
        await safeAlter("ALTER TABLE users ADD COLUMN usdtBalance DECIMAL(24,8) DEFAULT 0 AFTER diamonds");
        await safeAlter("ALTER TABLE users MODIFY COLUMN usdtBalance DECIMAL(24,8) DEFAULT 0");
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
                amount DECIMAL(65, 8),
                sourceWallet VARCHAR(16) DEFAULT 'gold',
                sourceCurrency VARCHAR(16) DEFAULT 'GOLD',
                sourceAmount DECIMAL(65, 8) DEFAULT 0,
                withdrawMethod VARCHAR(20) DEFAULT 'bank',
                withdrawNetwork VARCHAR(32) DEFAULT NULL,
                vndAmount DECIMAL(65, 0),
                feePercent DECIMAL(5, 2) DEFAULT 0,
                feeAmount DECIMAL(65, 0) DEFAULT 0,
                payoutAmount DECIMAL(65, 8) DEFAULT 0,
                payoutCurrency VARCHAR(16) DEFAULT 'VND',
                bankBin VARCHAR(50),
                bankName VARCHAR(255),
                accountNumber VARCHAR(255),
                accountName VARCHAR(255),
                status VARCHAR(50) DEFAULT 'Äang xá»­ lÃ½',
                qrUrl TEXT,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
        await safeAlter("ALTER TABLE withdrawals CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        await safeAlter("ALTER TABLE withdrawals MODIFY COLUMN amount DECIMAL(65,8)");
        await safeAlter("ALTER TABLE withdrawals ADD COLUMN sourceWallet VARCHAR(16) DEFAULT 'gold' AFTER amount");
        await safeAlter("ALTER TABLE withdrawals MODIFY COLUMN sourceWallet VARCHAR(16) DEFAULT 'gold'");
        await safeAlter("ALTER TABLE withdrawals ADD COLUMN sourceCurrency VARCHAR(16) DEFAULT 'GOLD' AFTER sourceWallet");
        await safeAlter("ALTER TABLE withdrawals MODIFY COLUMN sourceCurrency VARCHAR(16) DEFAULT 'GOLD'");
        await safeAlter("ALTER TABLE withdrawals ADD COLUMN sourceAmount DECIMAL(65,8) DEFAULT 0 AFTER sourceCurrency");
        await safeAlter("ALTER TABLE withdrawals MODIFY COLUMN sourceAmount DECIMAL(65,8) DEFAULT 0");
        await safeAlter("ALTER TABLE withdrawals ADD COLUMN withdrawMethod VARCHAR(20) DEFAULT 'bank' AFTER amount");
        await safeAlter("ALTER TABLE withdrawals MODIFY COLUMN withdrawMethod VARCHAR(20) DEFAULT 'bank'");
        await safeAlter("ALTER TABLE withdrawals ADD COLUMN withdrawNetwork VARCHAR(32) DEFAULT NULL AFTER withdrawMethod");
        await safeAlter("ALTER TABLE withdrawals MODIFY COLUMN withdrawNetwork VARCHAR(32) DEFAULT NULL");
        await safeAlter("ALTER TABLE withdrawals MODIFY COLUMN vndAmount DECIMAL(65,0)");
        await safeAlter("ALTER TABLE withdrawals ADD COLUMN feePercent DECIMAL(5,2) DEFAULT 0 AFTER vndAmount");
        await safeAlter("ALTER TABLE withdrawals MODIFY COLUMN feePercent DECIMAL(5,2) DEFAULT 0");
        await safeAlter("ALTER TABLE withdrawals ADD COLUMN feeAmount DECIMAL(65,0) DEFAULT 0 AFTER feePercent");
        await safeAlter("ALTER TABLE withdrawals MODIFY COLUMN feeAmount DECIMAL(65,0) DEFAULT 0");
        await safeAlter("ALTER TABLE withdrawals ADD COLUMN payoutAmount DECIMAL(65,8) DEFAULT 0 AFTER feeAmount");
        await safeAlter("ALTER TABLE withdrawals MODIFY COLUMN payoutAmount DECIMAL(65,8) DEFAULT 0");
        await safeAlter("ALTER TABLE withdrawals ADD COLUMN payoutCurrency VARCHAR(16) DEFAULT 'VND' AFTER payoutAmount");
        await safeAlter("ALTER TABLE withdrawals MODIFY COLUMN payoutCurrency VARCHAR(16) DEFAULT 'VND'");
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
            CREATE TABLE IF NOT EXISTS task_claim_events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                teleId BIGINT,
                taskId VARCHAR(50),
                claimedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_task_claim_events_tele_date (teleId, claimedAt),
                FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS task_milestone_rewards (
                teleId BIGINT,
                rewardDate DATE,
                taskCount INT DEFAULT 0,
                rewardGold DECIMAL(65, 0) DEFAULT 0,
                rewardDiamonds DECIMAL(65, 0) DEFAULT 0,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (teleId, rewardDate)
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

        await connection.query(`
            CREATE TABLE IF NOT EXISTS economy_config (
                id INT PRIMARY KEY DEFAULT 1,
                newUserGold DECIMAL(65, 0) DEFAULT 1000,
                newUserDiamonds DECIMAL(65, 0) DEFAULT 1000,
                referralRewardGold DECIMAL(65, 0) DEFAULT 0,
                referralRewardDiamonds DECIMAL(65, 0) DEFAULT 0,
                referralRewardUsdt DECIMAL(24, 8) DEFAULT 0.02,
                exchangeGoldPerDiamond DECIMAL(65, 0) DEFAULT 125,
                withdrawMinGold DECIMAL(65, 0) DEFAULT 6000000,
                withdrawVndPerGold DECIMAL(18, 8) DEFAULT 0.0005,
                usdToVndRateK DECIMAL(12, 4) DEFAULT 26,
                taskMilestoneCount INT DEFAULT 0,
                taskMilestoneRewardGold DECIMAL(65, 0) DEFAULT 0,
                taskMilestoneRewardDiamonds DECIMAL(65, 0) DEFAULT 0
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
        await safeAlter("ALTER TABLE economy_config CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        await safeAlter("ALTER TABLE economy_config MODIFY COLUMN newUserGold DECIMAL(65,0) DEFAULT 1000");
        await safeAlter("ALTER TABLE economy_config MODIFY COLUMN newUserDiamonds DECIMAL(65,0) DEFAULT 1000");
        await safeAlter("ALTER TABLE economy_config ADD COLUMN referralRewardGold DECIMAL(65,0) DEFAULT 0 AFTER newUserDiamonds");
        await safeAlter("ALTER TABLE economy_config MODIFY COLUMN referralRewardGold DECIMAL(65,0) DEFAULT 0");
        await safeAlter("ALTER TABLE economy_config ADD COLUMN referralRewardDiamonds DECIMAL(65,0) DEFAULT 0 AFTER referralRewardGold");
        await safeAlter("ALTER TABLE economy_config MODIFY COLUMN referralRewardDiamonds DECIMAL(65,0) DEFAULT 0");
        await safeAlter("ALTER TABLE economy_config ADD COLUMN referralRewardUsdt DECIMAL(24,8) DEFAULT 0.02 AFTER referralRewardDiamonds");
        await safeAlter("ALTER TABLE economy_config MODIFY COLUMN referralRewardUsdt DECIMAL(24,8) DEFAULT 0.02");
        await safeAlter("ALTER TABLE economy_config ADD COLUMN exchangeGoldPerDiamond DECIMAL(65,0) DEFAULT 125 AFTER referralRewardUsdt");
        await safeAlter("ALTER TABLE economy_config MODIFY COLUMN exchangeGoldPerDiamond DECIMAL(65,0) DEFAULT 125");
        await safeAlter("ALTER TABLE economy_config ADD COLUMN withdrawMinGold DECIMAL(65,0) DEFAULT 6000000 AFTER exchangeGoldPerDiamond");
        await safeAlter("ALTER TABLE economy_config MODIFY COLUMN withdrawMinGold DECIMAL(65,0) DEFAULT 6000000");
        await safeAlter("ALTER TABLE economy_config ADD COLUMN withdrawVndPerGold DECIMAL(18,8) DEFAULT 0.0005 AFTER withdrawMinGold");
        await safeAlter("ALTER TABLE economy_config MODIFY COLUMN withdrawVndPerGold DECIMAL(18,8) DEFAULT 0.0005");
        await safeAlter("ALTER TABLE economy_config ADD COLUMN usdToVndRateK DECIMAL(12,4) DEFAULT 26 AFTER withdrawVndPerGold");
        await safeAlter("ALTER TABLE economy_config MODIFY COLUMN usdToVndRateK DECIMAL(12,4) DEFAULT 26");
        await safeAlter("ALTER TABLE economy_config ADD COLUMN taskMilestoneCount INT DEFAULT 0 AFTER usdToVndRateK");
        await safeAlter("ALTER TABLE economy_config MODIFY COLUMN taskMilestoneCount INT DEFAULT 0");
        await safeAlter("ALTER TABLE economy_config ADD COLUMN taskMilestoneRewardGold DECIMAL(65,0) DEFAULT 0 AFTER taskMilestoneCount");
        await safeAlter("ALTER TABLE economy_config MODIFY COLUMN taskMilestoneRewardGold DECIMAL(65,0) DEFAULT 0");
        await safeAlter("ALTER TABLE economy_config ADD COLUMN taskMilestoneRewardDiamonds DECIMAL(65,0) DEFAULT 0 AFTER taskMilestoneRewardGold");
        await safeAlter("ALTER TABLE economy_config MODIFY COLUMN taskMilestoneRewardDiamonds DECIMAL(65,0) DEFAULT 0");
        await connection.query(
            `INSERT IGNORE INTO economy_config (
                id,
                newUserGold,
                newUserDiamonds,
                referralRewardGold,
                referralRewardDiamonds,
                referralRewardUsdt,
                exchangeGoldPerDiamond,
                withdrawMinGold,
                withdrawVndPerGold,
                usdToVndRateK,
                taskMilestoneCount,
                taskMilestoneRewardGold,
                taskMilestoneRewardDiamonds
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                1,
                DEFAULT_ECONOMY_CONFIG.newUserGold,
                DEFAULT_ECONOMY_CONFIG.newUserDiamonds,
                DEFAULT_ECONOMY_CONFIG.referralRewardGold,
                DEFAULT_ECONOMY_CONFIG.referralRewardDiamonds,
                DEFAULT_ECONOMY_CONFIG.referralRewardUsdt,
                DEFAULT_ECONOMY_CONFIG.exchangeGoldPerDiamond,
                DEFAULT_ECONOMY_CONFIG.withdrawMinGold,
                DEFAULT_ECONOMY_CONFIG.withdrawVndPerGold,
                DEFAULT_ECONOMY_CONFIG.usdToVndRateK,
                DEFAULT_ECONOMY_CONFIG.taskMilestoneCount,
                DEFAULT_ECONOMY_CONFIG.taskMilestoneRewardGold,
                DEFAULT_ECONOMY_CONFIG.taskMilestoneRewardDiamonds,
            ]
        );

        await connection.query(`
            CREATE TABLE IF NOT EXISTS lixi_config (
                id INT PRIMARY KEY DEFAULT 1,
                minGold DECIMAL(65, 0) DEFAULT 5000,
                maxGold DECIMAL(65, 0) DEFAULT 25000,
                maxClaimsPerRound INT DEFAULT 10,
                cooldownMinutes INT DEFAULT 60,
                requiredAdViews INT DEFAULT 3
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
        await safeAlter("ALTER TABLE lixi_config CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        await safeAlter("ALTER TABLE lixi_config MODIFY COLUMN minGold DECIMAL(65,0) DEFAULT 5000");
        await safeAlter("ALTER TABLE lixi_config MODIFY COLUMN maxGold DECIMAL(65,0) DEFAULT 25000");
        await safeAlter("ALTER TABLE lixi_config ADD COLUMN maxClaimsPerRound INT DEFAULT 10 AFTER maxGold");
        await safeAlter("ALTER TABLE lixi_config MODIFY COLUMN maxClaimsPerRound INT DEFAULT 10");
        await safeAlter("ALTER TABLE lixi_config ADD COLUMN cooldownMinutes INT DEFAULT 60 AFTER maxClaimsPerRound");
        await safeAlter("ALTER TABLE lixi_config MODIFY COLUMN cooldownMinutes INT DEFAULT 60");
        await safeAlter("ALTER TABLE lixi_config ADD COLUMN requiredAdViews INT DEFAULT 3 AFTER cooldownMinutes");
        await safeAlter("ALTER TABLE lixi_config MODIFY COLUMN requiredAdViews INT DEFAULT 3");
        await connection.query(
            `INSERT IGNORE INTO lixi_config (id, minGold, maxGold, maxClaimsPerRound, cooldownMinutes, requiredAdViews)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                1,
                DEFAULT_LIXI_CONFIG.minGold,
                DEFAULT_LIXI_CONFIG.maxGold,
                DEFAULT_LIXI_CONFIG.maxClaimsPerRound,
                DEFAULT_LIXI_CONFIG.cooldownMinutes,
                DEFAULT_LIXI_CONFIG.requiredAdViews,
            ]
        );

        await connection.query(`
            CREATE TABLE IF NOT EXISTS lixi_state (
                id INT PRIMARY KEY DEFAULT 1,
                roundNumber INT DEFAULT 1,
                remainingClaims INT DEFAULT 10,
                cooldownEndsAt BIGINT NULL,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
        await safeAlter("ALTER TABLE lixi_state CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        await safeAlter("ALTER TABLE lixi_state MODIFY COLUMN roundNumber INT DEFAULT 1");
        await safeAlter("ALTER TABLE lixi_state MODIFY COLUMN remainingClaims INT DEFAULT 10");
        await safeAlter("ALTER TABLE lixi_state ADD COLUMN cooldownEndsAt BIGINT NULL AFTER remainingClaims");
        await connection.query(
            `INSERT IGNORE INTO lixi_state (id, roundNumber, remainingClaims, cooldownEndsAt)
             VALUES (?, ?, ?, NULL)`,
            [1, 1, DEFAULT_LIXI_CONFIG.maxClaimsPerRound]
        );

        await connection.query(`
            CREATE TABLE IF NOT EXISTS lixi_claims (
                id INT AUTO_INCREMENT PRIMARY KEY,
                teleId BIGINT NOT NULL,
                roundNumber INT NOT NULL,
                rewardGold DECIMAL(65, 0) DEFAULT 0,
                claimedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_lixi_claim (teleId, roundNumber),
                INDEX idx_lixi_round_claims (roundNumber, claimedAt)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
        await safeAlter("ALTER TABLE lixi_claims CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        await safeAlter("ALTER TABLE lixi_claims MODIFY COLUMN rewardGold DECIMAL(65,0) DEFAULT 0");

        await connection.query(`
            CREATE TABLE IF NOT EXISTS lixi_ad_progress (
                teleId BIGINT NOT NULL,
                roundNumber INT NOT NULL,
                watchedCount INT DEFAULT 0,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (teleId, roundNumber)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);
        await safeAlter("ALTER TABLE lixi_ad_progress CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        await safeAlter("ALTER TABLE lixi_ad_progress MODIFY COLUMN watchedCount INT DEFAULT 0");

        // Populate Default Levels if empty or incomplete
        const [levs] = await connection.query("SELECT COUNT(*) as count FROM level_settings");
        if (levs[0].count < 100) {
            console.log(`ðŸ“¦ Populating default level settings (Current count: ${levs[0].count})...`);
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
            console.log("âœ… Level settings updated.");
        }

        // Populate Default Tasks if empty
        const [task_count] = await connection.query("SELECT COUNT(*) as count FROM tasks");
        if (task_count[0].count === 0) {
            console.log("ðŸ“¦ Populating default tasks...");
            // JOIN TASK Example (Uses verification)
            await connection.query("INSERT INTO tasks (id, title, icon, rewardType, rewardAmount, url, type, actionType, telegramChatId) VALUES ('tg_join', 'Tham Gia Channel', 'ðŸ“¢', 'gold', 10000, 'https://t.me/GomXuDaoVang', 'community', 'join', '-1002360813959')");

            // CLICK TASK Example (Just click to reward)
            await connection.query("INSERT INTO tasks (id, title, icon, rewardType, rewardAmount, url, type, actionType) VALUES ('tg_group', 'NhÃ³m Tháº£o Luáº­n', 'ðŸ’¬', 'gold', 10000, 'https://t.me/GomXuDaoVangGroup', 'community', 'click')");

            // AD TASKS
            await connection.query("INSERT INTO tasks (id, title, icon, rewardType, rewardAmount, url, type) VALUES ('daily_ad_gold', 'Xem Quáº£ng CÃ¡o VÃ ng', 'ðŸŽ¬', 'gold', 20000, null, 'ad')");
            await connection.query("INSERT INTO tasks (id, title, icon, rewardType, rewardAmount, url, type) VALUES ('daily_ad_diamond', 'Xem Quáº£ng CÃ¡o KC', 'ðŸ’Ž', 'diamond', 50, null, 'ad')");
            console.log("âœ… Default tasks added.");
        }

        // 11. Referrals Table (Moved earlier)
        // await connection.query(...);

        // --- MIGRATION LOGIC ---
        const [cols] = await connection.query("SHOW COLUMNS FROM users LIKE 'withdrawHistory'");
        if (cols.length > 0) {
            console.log("ðŸ”„ Migrating old withdrawal history...");
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
                            [user.teleId, w.gold || w.amount || 0, w.vnd || 0, w.bankBin || '', w.bankName || '', w.accountNumber || '', w.accountName || '', w.status || 'Äang xá»­ lÃ½', w.qrUrl || null, new Date(w.date || Date.now())]
                        );
                    }
                }
            }
            await connection.query("ALTER TABLE users DROP COLUMN withdrawHistory");
            console.log("âœ… Migration complete.");
        }

        connection.release();
        console.log("âœ… Database Setup Complete");
    } catch (err) {
        console.error("âŒ MySQL Setup Failed:", err);
    }
}

app.use(cors());
app.use(express.json());

// --- HELPERS ---

function normalizeEconomyConfig(row = {}) {
    const toInt = (value, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
    };
    const toRate = (value, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    };
    const toDecimal = (value, fallback) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) {
            return fallback;
        }
        return Number(parsed.toFixed(8));
    };

    return {
        newUserGold: toInt(row.newUserGold, DEFAULT_ECONOMY_CONFIG.newUserGold),
        newUserDiamonds: toInt(row.newUserDiamonds, DEFAULT_ECONOMY_CONFIG.newUserDiamonds),
        referralRewardGold: toInt(row.referralRewardGold, DEFAULT_ECONOMY_CONFIG.referralRewardGold),
        referralRewardDiamonds: toInt(row.referralRewardDiamonds, DEFAULT_ECONOMY_CONFIG.referralRewardDiamonds),
        referralRewardUsdt: toDecimal(row.referralRewardUsdt, DEFAULT_ECONOMY_CONFIG.referralRewardUsdt),
        exchangeGoldPerDiamond: Math.max(1, toInt(row.exchangeGoldPerDiamond, DEFAULT_ECONOMY_CONFIG.exchangeGoldPerDiamond)),
        withdrawMinGold: toInt(row.withdrawMinGold, DEFAULT_ECONOMY_CONFIG.withdrawMinGold),
        withdrawVndPerGold: toRate(row.withdrawVndPerGold, DEFAULT_ECONOMY_CONFIG.withdrawVndPerGold),
        usdToVndRateK: Math.max(1, toRate(row.usdToVndRateK, DEFAULT_ECONOMY_CONFIG.usdToVndRateK)),
        taskMilestoneCount: toInt(row.taskMilestoneCount, DEFAULT_ECONOMY_CONFIG.taskMilestoneCount),
        taskMilestoneRewardGold: toInt(row.taskMilestoneRewardGold, DEFAULT_ECONOMY_CONFIG.taskMilestoneRewardGold),
        taskMilestoneRewardDiamonds: toInt(row.taskMilestoneRewardDiamonds, DEFAULT_ECONOMY_CONFIG.taskMilestoneRewardDiamonds),
    };
}

async function getEconomyConfig() {
    const [rows] = await pool.query('SELECT * FROM economy_config WHERE id = 1 LIMIT 1');
    return normalizeEconomyConfig(rows[0] || {});
}

function normalizeLixiConfig(row = {}) {
    const toInt = (value, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
    };

    const minGold = toInt(row.minGold, DEFAULT_LIXI_CONFIG.minGold);
    const rawMaxGold = toInt(row.maxGold, DEFAULT_LIXI_CONFIG.maxGold);

    return {
        minGold,
        maxGold: Math.max(minGold, rawMaxGold),
        maxClaimsPerRound: Math.max(1, toInt(row.maxClaimsPerRound, DEFAULT_LIXI_CONFIG.maxClaimsPerRound)),
        cooldownMinutes: Math.max(1, toInt(row.cooldownMinutes, DEFAULT_LIXI_CONFIG.cooldownMinutes)),
        requiredAdViews: Math.max(1, toInt(row.requiredAdViews, DEFAULT_LIXI_CONFIG.requiredAdViews)),
    };
}

async function getLixiConfig(db = pool) {
    const [rows] = await db.query('SELECT * FROM lixi_config WHERE id = 1 LIMIT 1');
    return normalizeLixiConfig(rows[0] || {});
}

async function ensureLixiState(db = pool, configInput = null, options = {}) {
    const config = configInput || await getLixiConfig(db);
    const selectSql = options.lock
        ? 'SELECT * FROM lixi_state WHERE id = 1 LIMIT 1 FOR UPDATE'
        : 'SELECT * FROM lixi_state WHERE id = 1 LIMIT 1';

    let [rows] = await db.query(selectSql);

    if (rows.length === 0) {
        await db.query(
            'INSERT INTO lixi_state (id, roundNumber, remainingClaims, cooldownEndsAt) VALUES (1, 1, ?, NULL)',
            [config.maxClaimsPerRound]
        );
        [rows] = await db.query(selectSql);
    }

    const rawState = rows[0] || {};
    let roundNumber = Math.max(1, Number(rawState.roundNumber || 1));
    let remainingClaims = Math.max(0, Math.floor(Number(rawState.remainingClaims ?? config.maxClaimsPerRound)));
    let cooldownEndsAt = rawState.cooldownEndsAt ? Number(rawState.cooldownEndsAt) : null;
    const now = Date.now();

    if (cooldownEndsAt && now >= cooldownEndsAt) {
        roundNumber += 1;
        remainingClaims = config.maxClaimsPerRound;
        cooldownEndsAt = null;
        await db.query(
            'UPDATE lixi_state SET roundNumber = ?, remainingClaims = ?, cooldownEndsAt = NULL WHERE id = 1',
            [roundNumber, remainingClaims]
        );
    } else {
        const normalizedRemaining = Math.min(remainingClaims, config.maxClaimsPerRound);

        if (normalizedRemaining !== remainingClaims) {
            remainingClaims = normalizedRemaining;
            await db.query('UPDATE lixi_state SET remainingClaims = ? WHERE id = 1', [remainingClaims]);
        }

        if (!cooldownEndsAt && remainingClaims <= 0) {
            cooldownEndsAt = now + config.cooldownMinutes * 60 * 1000;
            await db.query('UPDATE lixi_state SET remainingClaims = 0, cooldownEndsAt = ? WHERE id = 1', [cooldownEndsAt]);
        }
    }

    return {
        roundNumber,
        remainingClaims,
        claimedCount: Math.max(0, config.maxClaimsPerRound - remainingClaims),
        cooldownEndsAt,
        maxClaimsPerRound: config.maxClaimsPerRound,
        cooldownMinutes: config.cooldownMinutes,
        isCoolingDown: Boolean(cooldownEndsAt && remainingClaims <= 0),
        isAvailable: !cooldownEndsAt && remainingClaims > 0,
    };
}

async function getLixiInfoForUser(teleId, db = pool) {
    const config = await getLixiConfig(db);
    const state = await ensureLixiState(db, config);
    const [claimRows] = await db.query(
        'SELECT rewardGold, claimedAt FROM lixi_claims WHERE teleId = ? AND roundNumber = ? LIMIT 1',
        [teleId, state.roundNumber]
    );
    const currentClaim = claimRows[0] || null;
    const [progressRows] = await db.query(
        'SELECT watchedCount FROM lixi_ad_progress WHERE teleId = ? AND roundNumber = ? LIMIT 1',
        [teleId, state.roundNumber]
    );
    const watchedAdViews = Math.max(0, Number(progressRows[0]?.watchedCount || 0));
    const remainingAdViews = Math.max(0, config.requiredAdViews - watchedAdViews);

    return {
        config,
        state,
        user: {
            hasClaimed: Boolean(currentClaim),
            rewardGold: Number(currentClaim?.rewardGold || 0),
            claimedAt: currentClaim?.claimedAt || null,
            watchedAdViews,
            remainingAdViews,
            canClaim: !currentClaim && !state.cooldownEndsAt && state.remainingClaims > 0 && remainingAdViews === 0,
        },
        serverTime: Date.now(),
    };
}

function isSingleClaimTaskType(taskType) {
    return ['one_time', 'community', 'newbie'].includes(String(taskType || ''));
}

async function getNewbieTaskProgress(teleId, db = pool, options = {}) {
    const [taskRows] = await db.query("SELECT COUNT(*) AS total FROM tasks WHERE type = 'newbie'");
    const totalNewbieTasks = Number(taskRows[0]?.total || 0);

    if (totalNewbieTasks === 0) {
        return {
            totalNewbieTasks: 0,
            completedNewbieTasks: 0,
        };
    }

    const minClaimedAt = options.minClaimedAt ? new Date(options.minClaimedAt) : null;
    const hasMinClaimedAt = Boolean(minClaimedAt && !Number.isNaN(minClaimedAt.getTime()));
    const claimSql = hasMinClaimedAt
        ? `SELECT COUNT(DISTINCT tc.taskId) AS completed
           FROM task_claims tc
           INNER JOIN tasks t ON t.id = tc.taskId
           WHERE tc.teleId = ? AND t.type = 'newbie' AND tc.claimedAt >= ?`
        : `SELECT COUNT(DISTINCT tc.taskId) AS completed
           FROM task_claims tc
           INNER JOIN tasks t ON t.id = tc.taskId
           WHERE tc.teleId = ? AND t.type = 'newbie'`;
    const claimParams = hasMinClaimedAt ? [teleId, minClaimedAt] : [teleId];
    const [claimRows] = await db.query(
        claimSql,
        claimParams
    );

    return {
        totalNewbieTasks,
        completedNewbieTasks: Number(claimRows[0]?.completed || 0),
    };
}

async function hasCompletedAllNewbieTasks(teleId, db = pool, options = {}) {
    const progress = await getNewbieTaskProgress(teleId, db, options);
    if (progress.totalNewbieTasks === 0) {
        return false;
    }

    return progress.completedNewbieTasks >= progress.totalNewbieTasks;
}

async function getNewbieLockStateForInvitee(teleId, db = pool) {
    const defaultState = {
        required: false,
        inviterId: 0,
        totalNewbieTasks: 0,
        completedNewbieTasks: 0,
        remainingNewbieTasks: 0,
        referralStatus: 'none',
        message: '',
    };

    if (!teleId) {
        return defaultState;
    }

    const [referralRows] = await db.query(
        'SELECT inviterId, status, createdAt FROM referrals WHERE invitedId = ? ORDER BY createdAt DESC LIMIT 1',
        [teleId]
    );

    if (referralRows.length === 0) {
        return defaultState;
    }

    const referral = referralRows[0];
    const referralStatus = String(referral.status || '').toLowerCase();
    const progress = await getNewbieTaskProgress(teleId, db, {
        minClaimedAt: referral.createdAt,
    });
    const remainingNewbieTasks = Math.max(0, progress.totalNewbieTasks - progress.completedNewbieTasks);
    const required = referralStatus === 'pending' && progress.totalNewbieTasks > 0 && remainingNewbieTasks > 0;
    const inviterId = Number(referral.inviterId || 0);

    return {
        required,
        inviterId,
        totalNewbieTasks: progress.totalNewbieTasks,
        completedNewbieTasks: progress.completedNewbieTasks,
        remainingNewbieTasks,
        referralStatus,
        message: required
            ? `Ban duoc moi boi ${inviterId > 0 ? `ID ${inviterId}` : 'mot nguoi choi'}. Hay hoan thanh ${remainingNewbieTasks} nhiem vu tan thu con lai de mo khoa cac chuc nang khac.`
            : '',
    };
}

async function settleReferralRewardForInvitee(invitedId) {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [referralRows] = await connection.query(
            'SELECT * FROM referrals WHERE invitedId = ? LIMIT 1 FOR UPDATE',
            [invitedId]
        );

        if (referralRows.length === 0) {
            await connection.commit();
            return { rewarded: false, reason: 'missing-referral' };
        }

        const referral = referralRows[0];
        if (String(referral.status || '').toLowerCase() === 'rewarded') {
            await connection.commit();
            return { rewarded: false, reason: 'already-rewarded' };
        }

        const completedAllNewbieTasks = await hasCompletedAllNewbieTasks(invitedId, connection, {
            minClaimedAt: referral.createdAt,
        });
        if (!completedAllNewbieTasks) {
            await connection.commit();
            return { rewarded: false, reason: 'waiting-newbie-tasks' };
        }

        await connection.query(
            'UPDATE users SET gold = gold + ?, goldBeforeShift = goldBeforeShift + ?, diamonds = diamonds + ?, usdtBalance = usdtBalance + ?, referrals = referrals + 1 WHERE teleId = ?',
            [referral.goldReward, referral.goldReward, referral.diamondReward, referral.usdtReward || 0, referral.inviterId]
        );

        await connection.query(
            "UPDATE referrals SET status = 'rewarded', rewardedAt = NOW() WHERE invitedId = ?",
            [invitedId]
        );

        await connection.commit();
        broadcastAdminRefresh('referral-awarded', { inviterId: referral.inviterId, invitedId, source: 'newbie-complete' });

        return {
            rewarded: true,
            inviterId: referral.inviterId,
            invitedId,
            goldReward: Number(referral.goldReward || 0),
            diamondReward: Number(referral.diamondReward || 0),
            usdtReward: Number(referral.usdtReward || 0),
        };
    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error('[REFERRAL ROLLBACK ERROR]', rollbackError);
        }

        throw error;
    } finally {
        connection.release();
    }
}

async function newbieTaskLockMiddleware(req, res, next) {
    const teleId = req.user?.id;
    if (!teleId) {
        return res.status(401).json({ error: 'Missing user context' });
    }

    try {
        const newbieLock = await getNewbieLockStateForInvitee(teleId);
        req.newbieLock = newbieLock;

        if (newbieLock.required) {
            return res.status(403).json({
                success: false,
                error: newbieLock.message || 'Ban can hoan thanh nhiem vu tan thu de su dung tinh nang nay.',
                newbieLock,
            });
        }

        next();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function harvestMiningGold(teleId) {
    const [users] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
    if (users.length === 0) return null;
    const user = users[0];

    if (!user.isMining || !user.miningStartTime || !user.miningShiftStart) return user;

    const now = Date.now();
    const elapsedSinceStart = now - user.miningShiftStart;
    const elapsedSinceLastHarvest = now - user.miningStartTime;
    const SHIFT_DURATION = 6 * 60 * 60 * 1000; // 6 Hours (PhÃ¡t Lá»™c Khai XuÃ¢n)

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
        broadcastAdminRefresh('mining-shift-complete', { teleId });
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
        broadcastAdminRefresh('mining-checkpoint', { teleId });

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

app.get('/api/config/economy', authMiddleware, async (req, res) => {
    try {
        res.json(await getEconomyConfig());
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/lixi/info', authMiddleware, async (req, res) => {
    try {
        res.json(await getLixiInfoForUser(req.user.id));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/lixi/watch-ad', authMiddleware, newbieTaskLockMiddleware, async (req, res) => {
    const teleId = req.user.id;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const config = await getLixiConfig(connection);
        const state = await ensureLixiState(connection, config, { lock: true });
        const [claimRows] = await connection.query(
            'SELECT id FROM lixi_claims WHERE teleId = ? AND roundNumber = ? LIMIT 1 FOR UPDATE',
            [teleId, state.roundNumber]
        );

        if (claimRows.length > 0) {
            await connection.commit();
            return res.status(400).json({ error: 'BÃ¡ÂºÂ¡n Ã„â€˜ÃƒÂ£ nhÃ¡ÂºÂ­n lÃƒÂ¬ xÃƒÂ¬ Ã¡Â»Å¸ lÃ†Â°Ã¡Â»Â£t nÃƒÂ y rÃ¡Â»â€œi.', lixi: await getLixiInfoForUser(teleId) });
        }

        if (state.cooldownEndsAt || state.remainingClaims <= 0) {
            await connection.commit();
            return res.status(400).json({ error: 'LÃ†Â°Ã¡Â»Â£t lÃƒÂ¬ xÃƒÂ¬ Ã„â€˜ÃƒÂ£ hÃ¡ÂºÂ¿t, vui lÃƒÂ²ng quay lÃ¡ÂºÂ¡i sau.', lixi: await getLixiInfoForUser(teleId) });
        }

        const [progressRows] = await connection.query(
            'SELECT watchedCount FROM lixi_ad_progress WHERE teleId = ? AND roundNumber = ? LIMIT 1 FOR UPDATE',
            [teleId, state.roundNumber]
        );

        const currentWatchedCount = Math.max(0, Number(progressRows[0]?.watchedCount || 0));
        const nextWatchedCount = Math.min(config.requiredAdViews, currentWatchedCount + 1);

        await connection.query(
            `INSERT INTO lixi_ad_progress (teleId, roundNumber, watchedCount)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE watchedCount = VALUES(watchedCount)`,
            [teleId, state.roundNumber, nextWatchedCount]
        );

        await connection.commit();

        const lixi = await getLixiInfoForUser(teleId);
        res.json({
            success: true,
            watchedAdViews: nextWatchedCount,
            remainingAdViews: Math.max(0, config.requiredAdViews - nextWatchedCount),
            lixi,
        });
    } catch (err) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error('[LIXI WATCH ROLLBACK ERROR]', rollbackError);
        }

        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

app.post('/api/lixi/claim', authMiddleware, newbieTaskLockMiddleware, async (req, res) => {
    const teleId = req.user.id;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const config = await getLixiConfig(connection);
        const state = await ensureLixiState(connection, config, { lock: true });
        const [userRows] = await connection.query('SELECT * FROM users WHERE teleId = ? LIMIT 1 FOR UPDATE', [teleId]);

        if (userRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'User not found.' });
        }

        const [existingClaimRows] = await connection.query(
            'SELECT rewardGold, claimedAt FROM lixi_claims WHERE teleId = ? AND roundNumber = ? LIMIT 1 FOR UPDATE',
            [teleId, state.roundNumber]
        );
        const [progressRows] = await connection.query(
            'SELECT watchedCount FROM lixi_ad_progress WHERE teleId = ? AND roundNumber = ? LIMIT 1 FOR UPDATE',
            [teleId, state.roundNumber]
        );
        const watchedAdViews = Math.max(0, Number(progressRows[0]?.watchedCount || 0));

        if (existingClaimRows.length > 0) {
            await connection.commit();
            return res.status(400).json({
                error: 'BÃ¡ÂºÂ¡n Ã„â€˜ÃƒÂ£ nhÃ¡ÂºÂ­n lÃƒÂ¬ xÃƒÂ¬ Ã¡Â»Å¸ lÃ†Â°Ã¡Â»Â£t nÃƒÂ y rÃ¡Â»â€œi.',
                lixi: {
                    config,
                    state,
                    user: {
                        hasClaimed: true,
                        rewardGold: Number(existingClaimRows[0].rewardGold || 0),
                        claimedAt: existingClaimRows[0].claimedAt || null,
                    },
                    serverTime: Date.now(),
                },
            });
        }

        if (watchedAdViews < config.requiredAdViews) {
            await connection.commit();
            return res.status(400).json({
                error: `BÃ¡ÂºÂ¡n cÃ¡ÂºÂ§n xem Ã„â€˜Ã¡Â»Â§ ${config.requiredAdViews} video mÃ¡Â»â€ºi nhÃ¡ÂºÂ­n Ã„â€˜Ã†Â°Ã¡Â»Â£c lÃƒÂ¬ xÃƒÂ¬.`,
                lixi: await getLixiInfoForUser(teleId),
            });
        }

        if (state.cooldownEndsAt || state.remainingClaims <= 0) {
            await connection.commit();
            return res.status(400).json({
                error: 'LÃ†Â°Ã¡Â»Â£t lÃƒÂ¬ xÃƒÂ¬ Ã„â€˜ÃƒÂ£ hÃ¡ÂºÂ¿t, vui lÃƒÂ²ng quay lÃ¡ÂºÂ¡i sau.',
                lixi: {
                    config,
                    state,
                    user: {
                        hasClaimed: false,
                        rewardGold: 0,
                        claimedAt: null,
                    },
                    serverTime: Date.now(),
                },
            });
        }

        const rewardRange = Math.max(0, config.maxGold - config.minGold);
        const rewardGold = config.minGold + Math.floor(Math.random() * (rewardRange + 1));
        const nextRemainingClaims = Math.max(0, state.remainingClaims - 1);
        const cooldownEndsAt = nextRemainingClaims === 0
            ? Date.now() + config.cooldownMinutes * 60 * 1000
            : null;

        await connection.query(
            'INSERT INTO lixi_claims (teleId, roundNumber, rewardGold) VALUES (?, ?, ?)',
            [teleId, state.roundNumber, rewardGold]
        );
        await connection.query(
            'UPDATE users SET gold = gold + ?, goldBeforeShift = goldBeforeShift + ? WHERE teleId = ?',
            [rewardGold, rewardGold, teleId]
        );
        await connection.query(
            'UPDATE lixi_state SET remainingClaims = ?, cooldownEndsAt = ? WHERE id = 1',
            [nextRemainingClaims, cooldownEndsAt]
        );

        await connection.commit();

        const [updatedUsers] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        const lixi = await getLixiInfoForUser(teleId);

        broadcastAdminRefresh('lixi-claimed', {
            teleId,
            rewardGold,
            roundNumber: state.roundNumber,
            remainingClaims: nextRemainingClaims,
        });

        if (cooldownEndsAt) {
            broadcastAdminRefresh('lixi-round-exhausted', {
                roundNumber: state.roundNumber,
                cooldownEndsAt,
            });
        }

        res.json({
            success: true,
            rewardGold,
            user: updatedUsers[0],
            lixi,
        });
    } catch (err) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error('[LIXI ROLLBACK ERROR]', rollbackError);
        }

        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
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

app.post('/api/flappy/submit-score', authMiddleware, newbieTaskLockMiddleware, async (req, res) => {
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
        broadcastAdminRefresh('flappy-score-updated', { teleId });
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
app.post('/api/user/redeem', authMiddleware, newbieTaskLockMiddleware, async (req, res) => {
    const { code } = req.body;
    const teleId = req.user.id;
    if (!code) return res.json({ success: false, message: 'Vui lÃ²ng nháº­p mÃ£!' });

    const cleanCode = code.toString().trim().toUpperCase();

    try {
        const user = await harvestMiningGold(teleId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        const [codes] = await pool.query('SELECT * FROM gift_codes WHERE code = ?', [cleanCode]);
        if (codes.length === 0) return res.json({ success: false, message: 'MÃ£ khÃ´ng tá»“n táº¡i!' });

        const gift = codes[0];
        if (gift.usedCount >= gift.maxUses) return res.json({ success: false, message: 'MÃ£ Ä‘Ã£ háº¿t lÆ°á»£t!' });

        const [usage] = await pool.query('SELECT * FROM gift_code_usage WHERE code = ? AND teleId = ?', [cleanCode, teleId]);
        if (usage.length > 0) return res.json({ success: false, message: 'Báº¡n Ä‘Ã£ dÃ¹ng mÃ£ nÃ y rá»“i!' });

        if (gift.rewardDiamonds > 0) await pool.query('UPDATE users SET diamonds = diamonds + ? WHERE teleId = ?', [gift.rewardDiamonds, teleId]);
        if (gift.rewardGold > 0) await pool.query('UPDATE users SET gold = gold + ?, goldBeforeShift = goldBeforeShift + ? WHERE teleId = ?', [gift.rewardGold, gift.rewardGold, teleId]);

        await pool.query('UPDATE gift_codes SET usedCount = usedCount + 1 WHERE code = ?', [cleanCode]);
        await pool.query('INSERT INTO gift_code_usage (code, teleId) VALUES (?, ?)', [cleanCode, teleId]);

        const [users] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        const updatedUser = users[0];
        broadcastAdminRefresh('giftcode-redeemed', { teleId, code: cleanCode });

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
app.post('/api/withdraw/create', authMiddleware, newbieTaskLockMiddleware, async (req, res) => {
    const { amount, amountUnit, bankBin, bankName, accountNumber, accountName, method, network } = req.body || {};
    const teleId = req.user.id;

    const normalizeMethod = (rawMethod, rawBankName) => {
        const normalized = String(rawMethod || '').trim().toLowerCase();
        if (normalized === 'bank' || normalized === 'wallet' || normalized === 'usdt') {
            return normalized;
        }

        const lowerBankName = String(rawBankName || '').toLowerCase();
        if (lowerBankName.includes('usdt')) return 'usdt';
        if (
            lowerBankName.includes('momo') ||
            lowerBankName.includes('zalopay') ||
            lowerBankName.includes('viettel money') ||
            lowerBankName.includes('viettelmoney') ||
            lowerBankName.includes('vnpt money') ||
            lowerBankName.includes('vnptmoney') ||
            lowerBankName.includes('wallet') ||
            lowerBankName.includes('ví')
        ) {
            return 'wallet';
        }

        return 'bank';
    };

    const normalizeAmountUnit = (rawUnit) => {
        const normalized = String(rawUnit || '').trim().toLowerCase();
        if (normalized === 'usdt' || normalized === 'usd') {
            return 'usdt';
        }

        return 'gold';
    };

    try {
        const user = await harvestMiningGold(teleId);
        const economyConfig = await getEconomyConfig();
        if (!user) return res.status(404).json({ error: 'User not found' });

        const sourceWallet = normalizeAmountUnit(amountUnit);
        const rawAmount = Number(String(amount ?? 0).replace(',', '.'));
        const sourceAmount = sourceWallet === 'usdt'
            ? Number(rawAmount.toFixed(6))
            : Math.floor(rawAmount);

        if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
            return res.json({ success: false, message: 'Số lượng rút không hợp lệ!' });
        }

        const userGold = Number(user.gold || 0);
        const userUsdt = Number(user.usdtBalance || 0);
        if (sourceWallet === 'gold' && userGold < sourceAmount) {
            return res.json({ success: false, message: 'Số dư vàng không đủ!' });
        }
        if (sourceWallet === 'usdt' && userUsdt < sourceAmount) {
            return res.json({ success: false, message: 'Số dư USDT không đủ!' });
        }

        const usdToVndRate = Math.max(
            1,
            Number(economyConfig.usdToVndRateK || DEFAULT_USD_TO_VND_RATE_K) * 1000
        );

        const grossVndAmount = sourceWallet === 'gold'
            ? Math.floor(sourceAmount * economyConfig.withdrawVndPerGold)
            : Math.floor(sourceAmount * usdToVndRate);
        const minWithdrawVnd = Math.floor(economyConfig.withdrawMinGold * economyConfig.withdrawVndPerGold);
        const minWithdrawUsdt = minWithdrawVnd > 0 ? Number((minWithdrawVnd / usdToVndRate).toFixed(6)) : 0;

        if (sourceWallet === 'gold' && sourceAmount < economyConfig.withdrawMinGold) {
            return res.json({ success: false, message: `Rút tối thiểu ${economyConfig.withdrawMinGold.toLocaleString('vi-VN')} Gold!` });
        }

        if (sourceWallet === 'usdt' && minWithdrawUsdt > 0 && sourceAmount < minWithdrawUsdt) {
            return res.json({ success: false, message: `Rút tối thiểu ${minWithdrawUsdt.toLocaleString('en-US')} USDT!` });
        }

        if (grossVndAmount <= 0) {
            return res.json({ success: false, message: 'Giá trị quy đổi quá thấp, không thể tạo lệnh rút.' });
        }

        const withdrawMethod = normalizeMethod(method, bankName);
        const withdrawNetwork = withdrawMethod === 'usdt'
            ? String(network || 'TRC20').trim().toUpperCase()
            : '';
        const sanitizedBankBin = String(bankBin || '').trim();
        const sanitizedBankName = String(bankName || '').trim();
        const sanitizedAccountNumber = String(accountNumber || '').trim();
        const sanitizedAccountName = String(accountName || '').trim();

        if (!sanitizedAccountNumber) {
            return res.json({ success: false, message: 'Thiếu số tài khoản / địa chỉ nhận!' });
        }
        if (withdrawMethod !== 'usdt' && !sanitizedAccountName) {
            return res.json({ success: false, message: 'Thiếu tên chủ tài khoản / chủ ví!' });
        }
        if (!sanitizedBankName && withdrawMethod !== 'usdt') {
            return res.json({ success: false, message: 'Thiếu thông tin ngân hàng / ví điện tử!' });
        }

        const feePercent = withdrawMethod === 'bank' || withdrawMethod === 'wallet' ? WITHDRAW_BANK_WALLET_FEE_PERCENT : 0;
        const feeAmount = feePercent > 0 ? Math.floor((grossVndAmount * feePercent) / 100) : 0;
        const netVndAmount = Math.max(0, grossVndAmount - feeAmount);
        const payoutCurrency = withdrawMethod === 'usdt' ? 'USDT' : 'VND';
        const payoutAmount = withdrawMethod === 'usdt'
            ? Number((grossVndAmount / usdToVndRate).toFixed(6))
            : netVndAmount;
        const storedVndAmount = withdrawMethod === 'usdt' ? grossVndAmount : netVndAmount;
        const savedBankName = withdrawMethod === 'usdt'
            ? `USDT (${withdrawNetwork || 'TRC20'})`
            : sanitizedBankName;

        const qrUrl =
            withdrawMethod !== 'usdt' && sanitizedBankBin
                ? `https://img.vietqr.io/image/${sanitizedBankBin}-${sanitizedAccountNumber}-compact2.png?amount=${netVndAmount}&addInfo=Bot%20Kiem%20Tien%20Done%20${teleId}&accountName=${encodeURIComponent(sanitizedAccountName)}`
                : null;

        if (sourceWallet === 'gold') {
            await pool.query(
                'UPDATE users SET gold = gold - ?, goldBeforeShift = goldBeforeShift - ? WHERE teleId = ?',
                [sourceAmount, sourceAmount, teleId]
            );
        } else {
            await pool.query('UPDATE users SET usdtBalance = usdtBalance - ? WHERE teleId = ?', [sourceAmount, teleId]);
        }

        await pool.query(
            `INSERT INTO withdrawals (
                teleId, amount, sourceWallet, sourceCurrency, sourceAmount, withdrawMethod, withdrawNetwork,
                vndAmount, feePercent, feeAmount, payoutAmount, payoutCurrency,
                bankBin, bankName, accountNumber, accountName, qrUrl
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                teleId,
                sourceAmount,
                sourceWallet,
                sourceWallet === 'usdt' ? 'USDT' : 'GOLD',
                sourceAmount,
                withdrawMethod,
                withdrawNetwork || null,
                storedVndAmount,
                feePercent,
                feeAmount,
                payoutAmount,
                payoutCurrency,
                withdrawMethod === 'usdt' ? '' : sanitizedBankBin,
                savedBankName,
                sanitizedAccountNumber,
                sanitizedAccountName || 'USDT WALLET',
                qrUrl
            ]
        );

        console.log(
            `[WITHDRAW] New request from ${teleId}: ${sourceAmount} ${sourceWallet.toUpperCase()} -> ${payoutAmount} ${payoutCurrency}` +
            ` (method=${withdrawMethod}, fee=${feePercent}%)`
        );

        const [users] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        broadcastAdminRefresh('withdraw-created', { teleId, method: withdrawMethod, payoutCurrency, sourceWallet });
        res.json({ success: true, user: users[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Exchange Gold to Diamonds
app.post('/api/game/exchange', authMiddleware, newbieTaskLockMiddleware, async (req, res) => {
    const { amount } = req.body; // Amount of gold to exchange
    const teleId = req.user.id;

    if (!amount || amount <= 0) return res.status(400).json({ error: 'Sá»‘ lÆ°á»£ng khÃ´ng há»£p lá»‡' });

    try {
        const user = await harvestMiningGold(teleId);
        const economyConfig = await getEconomyConfig();
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (Number(user.gold) < Number(amount)) return res.status(400).json({ error: 'Sá»‘ dÆ° khÃ´ng Ä‘á»§!' });

        const diamonds = Math.floor(amount / economyConfig.exchangeGoldPerDiamond);
        if (diamonds <= 0) return res.status(400).json({ error: 'Sá»‘ lÆ°á»£ng quÃ¡ nhá»!' });

        await pool.query(
            'UPDATE users SET gold = gold - ?, goldBeforeShift = goldBeforeShift - ?, diamonds = diamonds + ? WHERE teleId = ?',
            [amount, amount, diamonds, teleId]
        );

        const [updatedUsers] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        broadcastAdminRefresh('exchange-completed', { teleId });
        res.json({ success: true, user: updatedUsers[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get User Data (Includes History from separate table)
app.get('/api/user/:id', authMiddleware, async (req, res) => {
    const userId = req.params.id;

    // Ensure user can only fetch their own data, unless they are admin
    if (String(userId) !== String(req.user.id) && String(req.user.id) !== ADMIN_ID) {
        return res.status(403).json({ error: 'KhÃ´ng cÃ³ quyá»n truy cáº­p dá»¯ liá»‡u ngÆ°á»i dÃ¹ng khÃ¡c' });
    }

    if (!/^\d+$/.test(userId)) return res.status(400).json({ error: 'Invalid User ID' });

    try {
        let user = await harvestMiningGold(userId);
        const economyConfig = await getEconomyConfig();

        // Sync name from Telegram data
        const tgUser = req.user;
        const realName = tgUser?.first_name
            ? (tgUser.last_name ? `${tgUser.first_name} ${tgUser.last_name}` : tgUser.first_name)
            : (tgUser?.username || 'KhÃ¡ch');

        const tgHandle = tgUser?.username || 'none';

        if (!user) {
            const startingGold = economyConfig.newUserGold;
            const startingDiamonds = economyConfig.newUserDiamonds;
            const newUser = [userId, realName, tgHandle, startingGold, startingGold, startingDiamonds, 0, 1, 7, 5000, false, null, null, 0, null, 0];
            await pool.query(
                `INSERT INTO users (teleId, username, tgHandle, gold, goldBeforeShift, diamonds, usdtBalance, level, miningRate, upgradeCost, isMining, miningStartTime, miningShiftStart, referrals, lastTaskClaim, flappyBestScore)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                        const rewardGold = economyConfig.referralRewardGold;
                        const rewardDiamonds = economyConfig.referralRewardDiamonds;
                        const rewardUsdt = economyConfig.referralRewardUsdt;
                        const [refResult] = await pool.query(
                            'INSERT IGNORE INTO referrals (inviterId, invitedId, goldReward, diamondReward, usdtReward, status) VALUES (?, ?, ?, ?, ?, ?)',
                            [referralId, userId, rewardGold, rewardDiamonds, rewardUsdt, 'pending']
                        );
                        console.log(`ðŸŽ Referral record result for ${userId}:`, refResult);
                        console.log(`ðŸŽ Referral created for ${referralId} -> ${userId}: waiting for newbie task completion (${rewardUsdt} USD)`);
                        broadcastAdminRefresh('referral-created', { inviterId: referralId, invitedId: userId });
                        await settleReferralRewardForInvitee(userId);
                    }
                } catch (refErr) {
                    console.error('[REFERRAL ERROR]', refErr);
                }
            }

            const [newRows] = await pool.query('SELECT * FROM users WHERE teleId = ?', [userId]);
            const newbieLock = await getNewbieLockStateForInvitee(userId);
            broadcastAdminRefresh('user-created', { teleId: userId });
            return res.json({ ...newRows[0], newbieLock, serverTime: Date.now() });
        }

        // Auto-sync name/handle if it doesn't match
        if (user.username !== realName || user.tgHandle !== tgHandle) {
            await pool.query('UPDATE users SET username = ?, tgHandle = ? WHERE teleId = ?', [realName, tgHandle, userId]);
            user.username = realName;
            user.tgHandle = tgHandle;
            broadcastAdminRefresh('user-profile-synced', { teleId: userId });
        }

        // Save IP if not exists or update it (User requirement: "first time save first ip", but usually we track latest or first. 
        // Request: "khi láº§n Ä‘áº§u sÃ i vÃ o Ä‘áº§u tiÃªn sáº½ lÆ°u ip truy cáº­p Ä‘áº§u tiÃªn". So only if null.)
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (!user.ip_address && clientIp) {
            await pool.query('UPDATE users SET ip_address = ? WHERE teleId = ?', [clientIp, userId]);
            broadcastAdminRefresh('user-ip-captured', { teleId: userId });
        }

        await settleReferralRewardForInvitee(userId);

        const [withdraws] = await pool.query('SELECT * FROM withdrawals WHERE teleId = ? ORDER BY createdAt DESC', [userId]);

        user.withdrawHistory = withdraws.map(w => ({
            id: w.id,
            teleId: w.teleId,
            amount: w.amount,
            sourceWallet: w.sourceWallet || 'gold',
            sourceCurrency: w.sourceCurrency || 'GOLD',
            sourceAmount: Number(w.sourceAmount || w.amount || 0),
            vnd: w.vndAmount,
            method: w.withdrawMethod || 'bank',
            network: w.withdrawNetwork || '',
            feePercent: Number(w.feePercent || 0),
            feeAmount: Number(w.feeAmount || 0),
            payoutAmount: Number(w.payoutAmount || w.vndAmount || 0),
            payoutCurrency: w.payoutCurrency || 'VND',
            bankName: w.bankName,
            accountNumber: w.accountNumber,
            status: w.status,
            date: new Date(w.createdAt).toLocaleString('vi-VN'),
            qrUrl: w.qrUrl,
            message: w.message || ''
        }));

        const newbieLock = await getNewbieLockStateForInvitee(userId);
        res.json({ ...user, newbieLock, serverTime: Date.now() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Referral History (User)
app.get('/api/user/referrals', authMiddleware, async (req, res) => {
    const teleId = req.user.id;
    try {
        const [rows] = await pool.query(`
            SELECT r.*, COALESCE(NULLIF(u.username, ''), CONCAT('NgÆ°á»i dÃ¹ng ', r.invitedId)) as invitedName 
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
app.post('/api/game/start-mining', authMiddleware, newbieTaskLockMiddleware, async (req, res) => {
    const teleId = req.user.id;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });
        const user = users[0];

        if (user.isMining) return res.status(400).json({ error: 'Äang Ä‘Ã o rá»“i!' });

        const now = Date.now();
        await pool.query('UPDATE users SET isMining = TRUE, miningStartTime = ?, miningShiftStart = ? WHERE teleId = ?', [now, now, teleId]);
        broadcastAdminRefresh('mining-started', { teleId });

        res.json({ success: true, miningStartTime: now, miningShiftStart: now });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Claim Mining Reward (Manually harvest and stop mining)
app.post('/api/game/claim-mining', authMiddleware, newbieTaskLockMiddleware, async (req, res) => {
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
        broadcastAdminRefresh('mining-stopped', { teleId });

        const [finalUsers] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        res.json({ success: true, reward: 0, gold: Number(finalUsers[0].gold) });
    } catch (err) {
        console.error('[CLAIM ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

// Upgrade Miner
app.post('/api/game/upgrade', authMiddleware, newbieTaskLockMiddleware, async (req, res) => {
    const teleId = req.user.id;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        const user = users[0];

        const nextLevel = user.level + 1;
        const [settings] = await pool.query('SELECT * FROM level_settings WHERE level = ?', [nextLevel]);

        if (settings.length === 0) return res.status(400).json({ error: 'ÄÃ£ Ä‘áº¡t cáº¥p tá»‘i Ä‘a!' });
        const nextSetting = settings[0];

        if (Number(user.diamonds) < Number(nextSetting.upgradeCost)) return res.status(400).json({ error: 'KhÃ´ng Ä‘á»§ Kim CÆ°Æ¡ng!' });


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

        broadcastAdminRefresh('miner-upgraded', { teleId, level: nextLevel });
        res.json({ success: true, level: nextLevel, miningRate: nextSetting.miningRate, diamonds: Number(user.diamonds) - Number(nextSetting.upgradeCost) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Save User State (Profile only)
app.post('/api/user/:id', authMiddleware, async (req, res) => {
    const userId = req.params.id;

    if (String(userId) !== String(req.user.id)) {
        return res.status(403).json({ error: 'KhÃ´ng cÃ³ quyá»n cáº­p nháº­t dá»¯ liá»‡u ngÆ°á»i dÃ¹ng khÃ¡c' });
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
    res.status(401).json({ success: false, message: 'Sai thÃ´ng tin Ä‘Äƒng nháº­p' });
});



function sendAdminApp(req, res) {
    const adminAppPath = path.join(__dirname, 'dist', 'khaidz', 'index.html');

    if (!fs.existsSync(adminAppPath)) {
        return res.status(503).send('Admin app is not built yet. Run "npm run build" first.');
    }

    res.sendFile(adminAppPath);
}

async function getAdminSnapshot() {
    const [users] = await pool.query('SELECT * FROM users');
    const [giftCodes] = await pool.query('SELECT * FROM gift_codes ORDER BY createdAt DESC');
    const [flappyConfigRows] = await pool.query('SELECT * FROM flappy_config WHERE id = 1');
    const economyConfig = await getEconomyConfig();
    const lixiConfig = await getLixiConfig();
    const lixiState = await ensureLixiState(pool, lixiConfig);

    const [pendingWithdraws] = await pool.query(`
        SELECT w.*, u.username, u.tgHandle
        FROM withdrawals w
        JOIN users u ON w.teleId = u.teleId
        WHERE w.status = 'Äang xá»­ lÃ½'
        ORDER BY w.createdAt ASC
    `);

    const formattedWithdraws = pendingWithdraws.map((w) => ({
        id: w.id,
        userTeleId: w.teleId,
        teleId: w.teleId,
        username: w.username,
        tgHandle: w.tgHandle || 'none',
        sourceWallet: w.sourceWallet || 'gold',
        sourceCurrency: w.sourceCurrency || 'GOLD',
        sourceAmount: Number(w.sourceAmount || w.amount || 0),
        accountName: w.accountName,
        bankName: w.bankName,
        accountNumber: w.accountNumber,
        vnd: w.vndAmount,
        method: w.withdrawMethod || 'bank',
        network: w.withdrawNetwork || '',
        feePercent: Number(w.feePercent || 0),
        feeAmount: Number(w.feeAmount || 0),
        payoutAmount: Number(w.payoutAmount || w.vndAmount || 0),
        payoutCurrency: w.payoutCurrency || 'VND',
        qrUrl: w.qrUrl,
        status: w.status,
        createdAt: w.createdAt,
        message: w.message || ''
    }));

    let totalGold = 0;
    let totalDiamonds = 0;
    users.forEach((u) => {
        totalGold += Number(u.gold || 0);
        totalDiamonds += Number(u.diamonds || 0);
    });

    const [levels] = await pool.query('SELECT * FROM level_settings ORDER BY level ASC');
    const [tasks] = await pool.query('SELECT * FROM tasks');
    const serverTime = Date.now();

    return {
        users,
        totalGold,
        totalDiamonds,
        pendingWithdraws: formattedWithdraws,
        giftCodes,
        levels,
        tasks,
        flappyConfig: flappyConfigRows[0] || { rewardGold: 0, rewardDiamonds: 0 },
        economyConfig,
        lixiConfig,
        lixiState,
        serverTime
    };
}

// Admin V2 Route (New)
app.get('/admin.html', (req, res) => {
    res.redirect(302, '/khaidz');
});

app.get('/khaidz/index.php', (req, res) => {
    res.redirect(302, '/khaidz');
});

app.get(/^\/khaidz(?:\/.*)?$/, sendAdminApp);

app.get('/api/admin/events', adminMiddleware, (req, res) => {
    registerAdminEventClient(req, res);
});

app.get('/api/admin/data', adminMiddleware, async (req, res) => {
    try {
        res.json(await getAdminSnapshot());
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
        broadcastAdminRefresh('level-config-updated', { level });
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
        broadcastAdminRefresh('flappy-config-updated');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/lixi/config', adminMiddleware, async (req, res) => {
    const config = normalizeLixiConfig(req.body || {});

    try {
        await pool.query(
            `INSERT INTO lixi_config (id, minGold, maxGold, maxClaimsPerRound, cooldownMinutes, requiredAdViews)
             VALUES (1, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                minGold = VALUES(minGold),
                maxGold = VALUES(maxGold),
                maxClaimsPerRound = VALUES(maxClaimsPerRound),
                cooldownMinutes = VALUES(cooldownMinutes),
                requiredAdViews = VALUES(requiredAdViews)`,
            [config.minGold, config.maxGold, config.maxClaimsPerRound, config.cooldownMinutes, config.requiredAdViews]
        );
        const state = await ensureLixiState(pool, config);
        broadcastAdminRefresh('lixi-config-updated');
        res.json({ success: true, config, state });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/economy-config', adminMiddleware, async (req, res) => {
    const config = normalizeEconomyConfig(req.body || {});

    try {
        await pool.query(
            `INSERT INTO economy_config (
                id,
                newUserGold,
                newUserDiamonds,
                referralRewardGold,
                referralRewardDiamonds,
                referralRewardUsdt,
                exchangeGoldPerDiamond,
                withdrawMinGold,
                withdrawVndPerGold,
                usdToVndRateK,
                taskMilestoneCount,
                taskMilestoneRewardGold,
                taskMilestoneRewardDiamonds
            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                newUserGold = VALUES(newUserGold),
                newUserDiamonds = VALUES(newUserDiamonds),
                referralRewardGold = VALUES(referralRewardGold),
                referralRewardDiamonds = VALUES(referralRewardDiamonds),
                referralRewardUsdt = VALUES(referralRewardUsdt),
                exchangeGoldPerDiamond = VALUES(exchangeGoldPerDiamond),
                withdrawMinGold = VALUES(withdrawMinGold),
                withdrawVndPerGold = VALUES(withdrawVndPerGold),
                usdToVndRateK = VALUES(usdToVndRateK),
                taskMilestoneCount = VALUES(taskMilestoneCount),
                taskMilestoneRewardGold = VALUES(taskMilestoneRewardGold),
                taskMilestoneRewardDiamonds = VALUES(taskMilestoneRewardDiamonds)`,
            [
                config.newUserGold,
                config.newUserDiamonds,
                config.referralRewardGold,
                config.referralRewardDiamonds,
                config.referralRewardUsdt,
                config.exchangeGoldPerDiamond,
                config.withdrawMinGold,
                config.withdrawVndPerGold,
                config.usdToVndRateK,
                config.taskMilestoneCount,
                config.taskMilestoneRewardGold,
                config.taskMilestoneRewardDiamonds,
            ]
        );
        broadcastAdminRefresh('economy-config-updated');
        res.json({ success: true, config });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Task
app.post('/api/admin/config/task', adminMiddleware, async (req, res) => {
    const { id, title, icon, rewardType, rewardAmount, url, type, actionType, telegramChatId } = req.body;
    const normalizedActionType = ['click', 'join', 'react_heart'].includes(actionType) ? actionType : 'click';
    const normalizedType = ['community', 'daily', 'one_time', 'ad', 'newbie'].includes(type) ? type : 'community';
    const normalizedRewardType = rewardType === 'diamond' || rewardType === 'diamonds' ? 'diamond' : 'gold';
    const normalizedChatId = telegramChatId ? String(telegramChatId).trim() : null;

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
                null,
                title,
                icon,
                normalizedRewardType,
                rewardAmount,
                url,
                normalizedType,
                normalizedActionType,
                normalizedChatId,
                null
            ]
        );
        broadcastAdminRefresh('task-config-updated', { taskId: id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete Task
app.delete('/api/admin/config/task/:id', adminMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
        broadcastAdminRefresh('task-deleted', { taskId: req.params.id });
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

        const newUser = [teleId, username || `Staff_${teleId}`, 1000, 1000, 1000, 0, 1, 7, 5000, false, null, null, 0, null, 0];
        await pool.query(
            `INSERT INTO users (teleId, username, gold, goldBeforeShift, diamonds, usdtBalance, level, miningRate, upgradeCost, isMining, miningStartTime, miningShiftStart, referrals, lastTaskClaim, flappyBestScore)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            newUser
        );
        broadcastAdminRefresh('admin-user-created', { teleId });
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
        broadcastAdminRefresh('admin-balance-adjusted', { teleId: targetTeleId, resourceType: type });
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

        broadcastAdminRefresh('withdraw-status-updated', { withdrawId, status: newStatus });
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
        broadcastAdminRefresh('admin-user-updated', { teleId });
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
        broadcastAdminRefresh('giftcode-created', { code: code.trim().toUpperCase() });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/giftcode/delete', adminMiddleware, async (req, res) => {
    const { code } = req.body;
    try {
        await pool.query('DELETE FROM gift_codes WHERE code = ?', [code]);
        broadcastAdminRefresh('giftcode-deleted', { code });
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

app.post('/api/lucky-draw/participate', authMiddleware, newbieTaskLockMiddleware, async (req, res) => {
    try {
        const teleId = req.user.id;
        const [configRows] = await pool.query('SELECT * FROM lucky_draw_config WHERE id = 1');
        const config = configRows[0];
        const entryFee = Number(config.entryFee) || 0;

        // Check if already joined
        const [existing] = await pool.query('SELECT * FROM lucky_draw_participants WHERE teleId = ?', [teleId]);
        if (existing.length > 0) return res.status(400).json({ error: 'Báº¡n Ä‘Ã£ tham gia rá»“i!' });

        // Check user balance
        const [userRows] = await pool.query('SELECT gold FROM users WHERE teleId = ?', [teleId]);
        if (userRows[0].gold < entryFee) return res.status(400).json({ error: 'KhÃ´ng Ä‘á»§ vÃ ng Ä‘á»ƒ tham gia!' });

        // Deduct fee and join
        await pool.query('UPDATE users SET gold = gold - ? WHERE teleId = ?', [entryFee, teleId]);
        await pool.query('INSERT IGNORE INTO lucky_draw_participants (teleId) VALUES (?)', [teleId]);

        // Add entry fee to total prize pool
        await pool.query('UPDATE lucky_draw_config SET totalPrize = totalPrize + ? WHERE id = 1', [entryFee]);

        broadcastAdminRefresh('lucky-draw-joined', { teleId });
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
        broadcastAdminRefresh('lucky-draw-config-updated');
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
        broadcastAdminRefresh('lucky-draw-schedule-updated', { date, rank });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/lucky-draw/schedule/:id', adminMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM lucky_draw_schedule WHERE id = ?', [req.params.id]);
        broadcastAdminRefresh('lucky-draw-schedule-deleted', { scheduleId: req.params.id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Drawing Logic
async function performLuckyDraw() {
    console.log("ðŸŽ² [LUCKY DRAW] Starting automated draw...");
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [configRows] = await connection.query('SELECT * FROM lucky_draw_config WHERE id = 1');
        const config = configRows[0];
        const totalPrize = Number(config.totalPrize);

        if (totalPrize <= 0) {
            console.log("ðŸŽ² [LUCKY DRAW] Skip: Total prize is 0.");
            await connection.rollback();
            return;
        }

        const [participants] = await connection.query('SELECT p.teleId, u.username FROM lucky_draw_participants p JOIN users u ON p.teleId = u.teleId');
        if (participants.length === 0) {
            console.log("ðŸŽ² [LUCKY DRAW] Skip: No participants.");
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
                        const name = userRow[0]?.username || 'NgÆ°á»i dÃ¹ng áº©n';
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
        broadcastAdminRefresh('lucky-draw-finished');
        console.log("ðŸŽ² [LUCKY DRAW] Completed successfully.");
    } catch (err) {
        await connection.rollback();
        console.error("ðŸŽ² [LUCKY DRAW] Error:", err);
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
        console.error("ðŸŽ² [LUCKY DRAW SCHEDULER ERROR]", err);
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
                    return res.status(400).json({ error: 'Báº¡n chÆ°a tham gia nhÃ³m/kÃªnh nÃ y!' });
                }
            } catch (err) {
                console.error('[TG VERIFY ERROR]', err);
                // If bot check fails, we might want to skip or fail? 
                // Let's fail for security unless it's a temp network issue.
                return res.status(500).json({ error: 'KhÃ´ng thá»ƒ xÃ¡c minh thÃ nh viÃªn lÃºc nÃ y.' });
            }
        }

        if (task.actionType === 'react_heart') {
            if (!task.telegramChatId) {
                return res.status(400).json({ error: 'Heart task is missing chat config.' });
            }

            const [reactionRows] = await pool.query(
                'SELECT reaction FROM telegram_message_reactions WHERE teleId = ? AND chatId = ? AND reaction = ? LIMIT 1',
                [teleId, String(task.telegramChatId), 'heart']
            );

            if (reactionRows.length === 0) {
                return res.status(400).json({
                    error: 'Heart reaction not detected in this group yet. Please react with a heart on any message, then come back and verify again.'
                });
            }
        }

        // 3. Reset/Cooldown Logic
        const [claims] = await pool.query('SELECT * FROM task_claims WHERE teleId = ? AND taskId = ?', [teleId, taskId]);
        const now = new Date();
        const vnNow = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // Rough VN Time

        if (isSingleClaimTaskType(task.type)) {
            if (claims.length > 0) return res.status(400).json({ error: 'Báº¡n Ä‘Ã£ lÃ m nhiá»‡m vá»¥ nÃ y rá»“i!' });
        } else if (task.type === 'daily') {
            if (claims.length > 0) {
                const lastClaim = new Date(claims[0].claimedAt);
                const vnLast = new Date(lastClaim.getTime() + (7 * 60 * 60 * 1000));

                // If same day in VN (00:00:00 reset)
                if (vnNow.getUTCDate() === vnLast.getUTCDate() &&
                    vnNow.getUTCMonth() === vnLast.getUTCMonth() &&
                    vnNow.getUTCFullYear() === vnLast.getUTCFullYear()) {
                    return res.status(400).json({ error: 'Nhiá»‡m vá»¥ nÃ y sáº½ reset vÃ o ngÃ y mai!' });
                }
            }
        } else if (task.type === 'ad') {
            // Existing ad logic
            if (claims.length > 0) {
                const lastClaimTime = new Date(claims[0].claimedAt);
                const minutesSince = (now - lastClaimTime) / (1000 * 60);
                if (minutesSince < 15) {
                    return res.status(400).json({ error: `Vui lÃ²ng chá» ${Math.ceil(15 - minutesSince)} phÃºt ná»¯a!` });
                }

                const dateStr = vnNow.toISOString().split('T')[0];
                const [logs] = await pool.query('SELECT count FROM ad_daily_log WHERE teleId = ? AND taskId = ? AND logDate = ?', [teleId, taskId, dateStr]);
                const currentCount = logs.length > 0 ? logs[0].count : 0;

                if (currentCount >= 4) {
                    return res.status(400).json({ error: 'HÃ´m nay báº¡n Ä‘Ã£ xem Ä‘á»§ 4 láº§n rá»“i!' });
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
        await pool.query('INSERT INTO task_claim_events (teleId, taskId) VALUES (?, ?)', [teleId, taskId]);

        // 5. Award Reward
        const rewardAmount = Math.floor(Number(task.rewardAmount) || 0);
        if (task.rewardType === 'gold' || task.rewardType === 'gold') { // match schema rewardType
            await pool.query('UPDATE users SET gold = gold + ?, goldBeforeShift = goldBeforeShift + ? WHERE teleId = ?', [rewardAmount, rewardAmount, teleId]);
        } else if (task.rewardType === 'diamonds' || task.rewardType === 'diamond') {
            await pool.query('UPDATE users SET diamonds = diamonds + ? WHERE teleId = ?', [rewardAmount, teleId]);
        }

        await settleReferralRewardForInvitee(teleId);

        let milestoneReward = null;
        const economyConfig = await getEconomyConfig();
        const milestoneHasReward = economyConfig.taskMilestoneRewardGold > 0 || economyConfig.taskMilestoneRewardDiamonds > 0;
        if (economyConfig.taskMilestoneCount > 0 && milestoneHasReward) {
            const rewardDate = vnNow.toISOString().split('T')[0];
            const [existingMilestoneRewards] = await pool.query(
                'SELECT teleId FROM task_milestone_rewards WHERE teleId = ? AND rewardDate = ? LIMIT 1',
                [teleId, rewardDate]
            );

            if (existingMilestoneRewards.length === 0) {
                const [milestoneCountRows] = await pool.query(
                    'SELECT COUNT(*) AS total FROM task_claim_events WHERE teleId = ? AND DATE(DATE_ADD(claimedAt, INTERVAL 7 HOUR)) = ?',
                    [teleId, rewardDate]
                );
                const completedCount = Number(milestoneCountRows[0]?.total || 0);

                if (completedCount >= economyConfig.taskMilestoneCount) {
                    if (economyConfig.taskMilestoneRewardGold > 0) {
                        await pool.query(
                            'UPDATE users SET gold = gold + ?, goldBeforeShift = goldBeforeShift + ? WHERE teleId = ?',
                            [economyConfig.taskMilestoneRewardGold, economyConfig.taskMilestoneRewardGold, teleId]
                        );
                    }

                    if (economyConfig.taskMilestoneRewardDiamonds > 0) {
                        await pool.query(
                            'UPDATE users SET diamonds = diamonds + ? WHERE teleId = ?',
                            [economyConfig.taskMilestoneRewardDiamonds, teleId]
                        );
                    }

                    await pool.query(
                        'INSERT INTO task_milestone_rewards (teleId, rewardDate, taskCount, rewardGold, rewardDiamonds) VALUES (?, ?, ?, ?, ?)',
                        [
                            teleId,
                            rewardDate,
                            completedCount,
                            economyConfig.taskMilestoneRewardGold,
                            economyConfig.taskMilestoneRewardDiamonds,
                        ]
                    );

                    milestoneReward = {
                        count: economyConfig.taskMilestoneCount,
                        completedCount,
                        gold: economyConfig.taskMilestoneRewardGold,
                        diamonds: economyConfig.taskMilestoneRewardDiamonds,
                    };
                    broadcastAdminRefresh('task-milestone-earned', { teleId, taskId, completedCount });
                }
            }
        }

        // 6. Return updated data
        const [users] = await pool.query('SELECT * FROM users WHERE teleId = ?', [teleId]);
        const newbieLock = await getNewbieLockStateForInvitee(teleId);
        broadcastAdminRefresh('task-claimed', { teleId, taskId });
        res.json({
            success: true,
            reward: { type: task.rewardType, amount: rewardAmount },
            milestoneReward,
            user: {
                ...users[0],
                newbieLock,
            }
        });
    } catch (err) {
        console.error('[TASK CLAIM ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

// --- ADMIN ACTIONS (Protected) ---

// Reset All Database
app.post('/api/admin/reset-db', adminMiddleware, async (req, res) => {
    try {
        console.log("âš ï¸ [ADMIN] Resetting entire database...");
        await pool.query('DELETE FROM task_claims'); // Also clear task history
        await pool.query('DELETE FROM task_claim_events');
        await pool.query('DELETE FROM task_milestone_rewards');
        await pool.query('DELETE FROM telegram_message_reactions');
        await pool.query('DELETE FROM gift_code_usage');
        await pool.query('DELETE FROM withdrawals');
        await pool.query('DELETE FROM referrals');
        await pool.query('DELETE FROM users');
        broadcastAdminRefresh('database-reset');
        console.log("âœ… [ADMIN] Database reset successfully.");
        res.json({ success: true, message: 'ÄÃ£ xÃ³a toÃ n bá»™ dá»¯ liá»‡u ngÆ°á»i dÃ¹ng!' });
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
        const welcomeMessage = `ðŸ§§ CHÃ€O Má»ªNG Báº N Äáº¾N Vá»šI ÄÃ€O VÃ€NG KHAI XUÃ‚N! ðŸ§§\n\nChÃºc báº¡n má»™t nÄƒm má»›i an khang thá»‹nh vÆ°á»£ng, váº¡n sá»± nhÆ° Ã½!\n\nHÃ£y nháº¥n nÃºt bÃªn dÆ°á»›i Ä‘á»ƒ báº¯t Ä‘áº§u khai xuÃ¢n vÃ  nháº­n nhá»¯ng pháº§n quÃ  háº¥p dáº«n nhÃ©! ðŸ§¨ðŸ’°`;

        const payload = {
            chat_id: chatId,
            text: welcomeMessage,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "ðŸ§§ Má»ž MINI APP ðŸ§§",
                            url: "https://t.me/Daoxu100_bot/Daoxu100"
                        }
                    ],
                    [
                        {
                            text: "ðŸ“¢ Tham Gia KÃªnh",
                            url: "https://t.me/daoxungaytet"
                        }
                    ],
                    [
                        {
                            text: "ðŸ‘¨â€ðŸ’» LiÃªn Há»‡ Admin",
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
            console.log("âœ… [BOT] Webhook set successfully.");
        } else {
            console.error("âŒ [BOT] Webhook setup failed:", data.description);
        }
    } catch (err) {
        console.error("âŒ [BOT] Could not reach Telegram API:", err.message);
    }
}

app.use(express.static(path.join(__dirname, 'dist')));
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`ðŸš€ Server running on port ${PORT}`);
        setupBotWebhook(); // Try to setup webhook
    });
});

