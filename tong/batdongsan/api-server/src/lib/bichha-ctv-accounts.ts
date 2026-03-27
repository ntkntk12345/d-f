import bcrypt from "bcryptjs";
import { desc, eq } from "drizzle-orm";
import { db, pool, bichHaCtvAccountsTable } from "../../db";

const CREATE_BICHHA_CTV_ACCOUNTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS bichha_ctv_accounts (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(64) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nickname VARCHAR(120) NOT NULL,
    is_enabled INT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY bichha_ctv_accounts_username_unique (username),
    KEY bichha_ctv_accounts_enabled_idx (is_enabled)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export type BichHaCtvAccountRecord = {
  id: number;
  username: string;
  nickname: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type BichHaCtvAccountRow = {
  id: number;
  username: string;
  passwordHash: string;
  nickname: string;
  isEnabled: number;
  createdAt: Date;
  updatedAt: Date;
};

type CreateBichHaCtvAccountInput = {
  username: string;
  password: string;
  nickname: string;
  isEnabled?: boolean;
};

type UpdateBichHaCtvAccountInput = {
  username?: string;
  password?: string;
  nickname?: string;
  isEnabled?: boolean;
};

let ensureCtvAccountsTablePromise: Promise<void> | null = null;

function normalizeUsername(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .slice(0, 64);
}

function normalizeNickname(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function normalizePassword(value: unknown) {
  return String(value ?? "").trim();
}

function mapAccountRow(row: BichHaCtvAccountRow): BichHaCtvAccountRecord {
  return {
    id: Number(row.id),
    username: row.username,
    nickname: row.nickname,
    isEnabled: Boolean(row.isEnabled),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getAccountRowById(id: number) {
  await ensureBichHaCtvAccountsTable();

  const [row] = await db
    .select()
    .from(bichHaCtvAccountsTable)
    .where(eq(bichHaCtvAccountsTable.id, id))
    .limit(1);

  return row as BichHaCtvAccountRow | undefined;
}

async function getAccountRowByUsername(username: string) {
  await ensureBichHaCtvAccountsTable();

  const [row] = await db
    .select()
    .from(bichHaCtvAccountsTable)
    .where(eq(bichHaCtvAccountsTable.username, username))
    .limit(1);

  return row as BichHaCtvAccountRow | undefined;
}

export async function ensureBichHaCtvAccountsTable() {
  if (!ensureCtvAccountsTablePromise) {
    ensureCtvAccountsTablePromise = pool.query(CREATE_BICHHA_CTV_ACCOUNTS_TABLE_SQL)
      .then(() => undefined)
      .catch((error) => {
        ensureCtvAccountsTablePromise = null;
        throw error;
      });
  }

  await ensureCtvAccountsTablePromise;
}

export async function listBichHaCtvAccounts() {
  await ensureBichHaCtvAccountsTable();

  const rows = await db
    .select()
    .from(bichHaCtvAccountsTable)
    .orderBy(desc(bichHaCtvAccountsTable.createdAt));

  return rows.map((row) => mapAccountRow(row as BichHaCtvAccountRow));
}

export async function createBichHaCtvAccount(input: CreateBichHaCtvAccountInput) {
  const username = normalizeUsername(input.username);
  const password = normalizePassword(input.password);
  const nickname = normalizeNickname(input.nickname);
  const isEnabled = input.isEnabled !== false;

  if (!username) {
    throw new Error("BICHHA_CTV_USERNAME_REQUIRED");
  }

  if (password.length < 4) {
    throw new Error("BICHHA_CTV_PASSWORD_REQUIRED");
  }

  if (!nickname) {
    throw new Error("BICHHA_CTV_NICKNAME_REQUIRED");
  }

  await ensureBichHaCtvAccountsTable();

  const existingAccount = await getAccountRowByUsername(username);
  if (existingAccount) {
    throw new Error("BICHHA_CTV_USERNAME_EXISTS");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();

  await db.insert(bichHaCtvAccountsTable).values({
    username,
    passwordHash,
    nickname,
    isEnabled: isEnabled ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  });

  const createdAccount = await getAccountRowByUsername(username);
  if (!createdAccount) {
    throw new Error("BICHHA_CTV_CREATE_FAILED");
  }

  return mapAccountRow(createdAccount);
}

export async function updateBichHaCtvAccount(id: number, input: UpdateBichHaCtvAccountInput) {
  const accountId = Number(id);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw new Error("BICHHA_CTV_ACCOUNT_ID_INVALID");
  }

  const existingAccount = await getAccountRowById(accountId);
  if (!existingAccount) {
    return null;
  }

  const nextUsername = input.username == null ? existingAccount.username : normalizeUsername(input.username);
  const nextNickname = input.nickname == null ? existingAccount.nickname : normalizeNickname(input.nickname);
  const nextPassword = input.password == null ? "" : normalizePassword(input.password);
  const nextIsEnabled = typeof input.isEnabled === "boolean" ? input.isEnabled : Boolean(existingAccount.isEnabled);

  if (!nextUsername) {
    throw new Error("BICHHA_CTV_USERNAME_REQUIRED");
  }

  if (!nextNickname) {
    throw new Error("BICHHA_CTV_NICKNAME_REQUIRED");
  }

  if (nextPassword && nextPassword.length < 4) {
    throw new Error("BICHHA_CTV_PASSWORD_TOO_SHORT");
  }

  const sameUsername = nextUsername === existingAccount.username;
  if (!sameUsername) {
    const conflictAccount = await getAccountRowByUsername(nextUsername);
    if (conflictAccount && Number(conflictAccount.id) !== accountId) {
      throw new Error("BICHHA_CTV_USERNAME_EXISTS");
    }
  }

  const passwordHash = nextPassword
    ? await bcrypt.hash(nextPassword, 10)
    : existingAccount.passwordHash;

  await db
    .update(bichHaCtvAccountsTable)
    .set({
      username: nextUsername,
      nickname: nextNickname,
      passwordHash,
      isEnabled: nextIsEnabled ? 1 : 0,
      updatedAt: new Date(),
    })
    .where(eq(bichHaCtvAccountsTable.id, accountId));

  const updatedAccount = await getAccountRowById(accountId);
  return updatedAccount ? mapAccountRow(updatedAccount) : null;
}

export async function deleteBichHaCtvAccount(id: number) {
  const accountId = Number(id);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw new Error("BICHHA_CTV_ACCOUNT_ID_INVALID");
  }

  const existingAccount = await getAccountRowById(accountId);
  if (!existingAccount) {
    return false;
  }

  await db.delete(bichHaCtvAccountsTable).where(eq(bichHaCtvAccountsTable.id, accountId));
  return true;
}

export async function verifyBichHaCtvCredentials(usernameInput: string, passwordInput: string) {
  const username = normalizeUsername(usernameInput);
  const password = normalizePassword(passwordInput);

  if (!username || !password) {
    return null;
  }

  const account = await getAccountRowByUsername(username);
  if (!account || !account.isEnabled) {
    return null;
  }

  const matches = await bcrypt.compare(password, account.passwordHash);
  if (!matches) {
    return null;
  }

  return mapAccountRow(account);
}
