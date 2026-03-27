import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { pool } from "../../db";

const ZALO_VERIFICATION_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS zalo_verifications (
    phone VARCHAR(32) NOT NULL,
    purpose VARCHAR(32) NOT NULL,
    code_hash VARCHAR(128) NOT NULL,
    zalo_uid VARCHAR(64) NULL,
    zalo_name VARCHAR(255) NULL,
    expires_at DATETIME NOT NULL,
    resend_available_at DATETIME NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (phone, purpose),
    INDEX zalo_verifications_expires_idx (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const REGISTER_PURPOSE = "register";
const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_VERIFY_ATTEMPTS = 5;
const HASH_SECRET = process.env.ZALO_VERIFICATION_SECRET || process.env.JWT_SECRET || "timtro_zalo_verify_secret";

type VerificationRow = {
  phone: string;
  purpose: string;
  code_hash: string;
  zalo_uid: string | null;
  zalo_name: string | null;
  expires_at: Date | string;
  resend_available_at: Date | string;
  attempts: number;
};

let ensureZaloVerificationTablePromise: Promise<void> | null = null;

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function hashVerificationCode(phone: string, purpose: string, code: string) {
  return createHash("sha256")
    .update(`${HASH_SECRET}:${purpose}:${phone}:${code}`)
    .digest("hex");
}

function createCode() {
  return String(randomInt(100_000, 1_000_000));
}

function compareHash(expectedHash: string, phone: string, purpose: string, code: string) {
  const actualBuffer = Buffer.from(hashVerificationCode(phone, purpose, code), "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

async function getVerificationRow(phone: string, purpose: string) {
  await ensureZaloVerificationTable();

  const [rows] = await pool.query(
    `
      SELECT
        phone,
        purpose,
        code_hash,
        zalo_uid,
        zalo_name,
        expires_at,
        resend_available_at,
        attempts
      FROM zalo_verifications
      WHERE phone = ? AND purpose = ?
      LIMIT 1
    `,
    [phone, purpose],
  );

  return (rows as VerificationRow[])[0] || null;
}

export async function ensureZaloVerificationTable() {
  if (!ensureZaloVerificationTablePromise) {
    ensureZaloVerificationTablePromise = pool.query(ZALO_VERIFICATION_TABLE_SQL)
      .then(() => undefined)
      .catch((error) => {
        ensureZaloVerificationTablePromise = null;
        throw error;
      });
  }

  await ensureZaloVerificationTablePromise;
}

export function normalizePhoneForVerification(phone: string) {
  return String(phone || "").replace(/\D/g, "").trim();
}

export function buildRegisterVerificationMessage(code: string) {
  return [
    "Ma xac minh dang ky 80LandTimPhong cua ban la:",
    code,
    "",
    `Ma co hieu luc trong ${CODE_TTL_MINUTES} phut.`,
    "Khong chia se ma nay cho nguoi khac.",
  ].join("\n");
}

export async function createRegisterVerificationCode(phone: string, zaloUid: string, zaloName?: string | null) {
  const normalizedPhone = normalizePhoneForVerification(phone);
  if (!/^\d{9,11}$/.test(normalizedPhone)) {
    throw new Error("INVALID_PHONE");
  }

  const existingRow = await getVerificationRow(normalizedPhone, REGISTER_PURPOSE);
  if (existingRow) {
    const resendAvailableAt = toDate(existingRow.resend_available_at);
    if (resendAvailableAt.getTime() > Date.now()) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((resendAvailableAt.getTime() - Date.now()) / 1000),
      );
      const error = new Error("WAIT_BEFORE_RESEND");
      (error as Error & { retryAfterSeconds?: number }).retryAfterSeconds = retryAfterSeconds;
      throw error;
    }
  }

  const code = createCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
  const resendAvailableAt = new Date(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);

  await pool.query(
    `
      INSERT INTO zalo_verifications (
        phone,
        purpose,
        code_hash,
        zalo_uid,
        zalo_name,
        expires_at,
        resend_available_at,
        attempts,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        code_hash = VALUES(code_hash),
        zalo_uid = VALUES(zalo_uid),
        zalo_name = VALUES(zalo_name),
        expires_at = VALUES(expires_at),
        resend_available_at = VALUES(resend_available_at),
        attempts = 0,
        updated_at = NOW()
    `,
    [
      normalizedPhone,
      REGISTER_PURPOSE,
      hashVerificationCode(normalizedPhone, REGISTER_PURPOSE, code),
      zaloUid || null,
      zaloName || null,
      expiresAt,
      resendAvailableAt,
    ],
  );

  return {
    code,
    expiresAt,
    resendAvailableAt,
  };
}

export async function clearRegisterVerificationCode(phone: string) {
  const normalizedPhone = normalizePhoneForVerification(phone);
  if (!normalizedPhone) return;

  await ensureZaloVerificationTable();
  await pool.query(
    "DELETE FROM zalo_verifications WHERE phone = ? AND purpose = ?",
    [normalizedPhone, REGISTER_PURPOSE],
  );
}

export async function consumeRegisterVerificationCode(phone: string, code: string) {
  const normalizedPhone = normalizePhoneForVerification(phone);
  const normalizedCode = String(code || "").trim();

  if (!/^\d{9,11}$/.test(normalizedPhone)) {
    throw new Error("INVALID_PHONE");
  }

  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error("INVALID_VERIFICATION_CODE_FORMAT");
  }

  const row = await getVerificationRow(normalizedPhone, REGISTER_PURPOSE);
  if (!row) {
    throw new Error("VERIFICATION_CODE_NOT_FOUND");
  }

  if (toDate(row.expires_at).getTime() < Date.now()) {
    await clearRegisterVerificationCode(normalizedPhone);
    throw new Error("VERIFICATION_CODE_EXPIRED");
  }

  if ((row.attempts || 0) >= MAX_VERIFY_ATTEMPTS) {
    await clearRegisterVerificationCode(normalizedPhone);
    throw new Error("VERIFICATION_CODE_LOCKED");
  }

  const isValid = compareHash(row.code_hash, normalizedPhone, REGISTER_PURPOSE, normalizedCode);

  if (!isValid) {
    await pool.query(
      `
        UPDATE zalo_verifications
        SET attempts = attempts + 1, updated_at = NOW()
        WHERE phone = ? AND purpose = ?
      `,
      [normalizedPhone, REGISTER_PURPOSE],
    );

    throw new Error("VERIFICATION_CODE_INVALID");
  }

  await clearRegisterVerificationCode(normalizedPhone);

  return {
    zaloUid: row.zalo_uid || undefined,
    zaloName: row.zalo_name || undefined,
  };
}
