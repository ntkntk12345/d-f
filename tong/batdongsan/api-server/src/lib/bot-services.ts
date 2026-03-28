import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type BotServiceName = "listener" | "sender";

type BotServiceRuntimeSnapshot = {
  running?: boolean;
  state?: string;
  lastHeartbeatAt?: string;
  lastWorkAt?: string;
  restartCount?: number;
  lastError?: string | null;
  updatedAt?: string;
  pid?: number | null;
  lastStartedAt?: string;
  lastExitedAt?: string;
  exitCode?: number | null;
};

type BotServiceControlFile = {
  listenerEnabled: boolean;
  senderEnabled: boolean;
  updatedAt: string;
};

type BotServiceStatusFile = {
  listener?: BotServiceRuntimeSnapshot;
  sender?: BotServiceRuntimeSnapshot;
  updatedAt?: string;
};

export type BotServiceControl = {
  enabled: boolean;
  running: boolean;
  state: string;
  lastHeartbeatAt?: string;
  lastWorkAt?: string;
  restartCount: number;
  lastError?: string | null;
  updatedAt?: string;
  pid?: number | null;
  lastStartedAt?: string;
  lastExitedAt?: string;
  exitCode?: number | null;
};

export type BotServicesDashboard = Record<BotServiceName, BotServiceControl>;

const botDirectory = path.resolve(process.cwd(), "..", "bot");
const controlFilePath = path.join(botDirectory, "bot_service_control.json");
const statusFilePath = path.join(botDirectory, "bot_service_status.json");

function buildDefaultControlFile(): BotServiceControlFile {
  return {
    listenerEnabled: true,
    senderEnabled: true,
    updatedAt: new Date().toISOString(),
  };
}

function buildDefaultStatusFile(): BotServiceStatusFile {
  const now = new Date().toISOString();

  return {
    listener: {
      running: false,
      state: "stopped",
      restartCount: 0,
      lastError: null,
      updatedAt: now,
      pid: null,
      lastStartedAt: undefined,
      lastExitedAt: undefined,
      exitCode: null,
    },
    sender: {
      running: false,
      state: "stopped",
      restartCount: 0,
      lastError: null,
      updatedAt: now,
      pid: null,
      lastStartedAt: undefined,
      lastExitedAt: undefined,
      exitCode: null,
    },
    updatedAt: now,
  };
}

async function ensureBotFiles() {
  await mkdir(botDirectory, { recursive: true });
}

async function readJsonFile<T>(filePath: string, fallback: T) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, payload: unknown) {
  await ensureBotFiles();
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

async function readControlFile() {
  await ensureBotFiles();
  const control = await readJsonFile<BotServiceControlFile>(controlFilePath, buildDefaultControlFile());

  if (typeof control.listenerEnabled !== "boolean" || typeof control.senderEnabled !== "boolean") {
    const fallback = buildDefaultControlFile();
    await writeJsonFile(controlFilePath, fallback);
    return fallback;
  }

  return control;
}

async function readStatusFile() {
  await ensureBotFiles();
  const fallback = buildDefaultStatusFile();
  const status = await readJsonFile<BotServiceStatusFile>(statusFilePath, fallback);

  return {
    listener: status.listener || fallback.listener,
    sender: status.sender || fallback.sender,
    updatedAt: status.updatedAt || new Date().toISOString(),
  } satisfies BotServiceStatusFile;
}

function normalizeServiceState(enabled: boolean, snapshot?: BotServiceRuntimeSnapshot): BotServiceControl {
  const running = Boolean(snapshot?.running);
  const rawState = String(snapshot?.state || "").trim().toLowerCase();
  const state = !enabled
    ? "disabled"
    : rawState || (running ? "running" : snapshot?.lastError ? "error" : "stopped");

  return {
    enabled,
    running,
    state,
    lastHeartbeatAt: snapshot?.lastHeartbeatAt,
    lastWorkAt: snapshot?.lastWorkAt,
    restartCount: Number(snapshot?.restartCount || 0),
    lastError: snapshot?.lastError || null,
    updatedAt: snapshot?.updatedAt,
    pid: snapshot?.pid ?? null,
    lastStartedAt: snapshot?.lastStartedAt,
    lastExitedAt: snapshot?.lastExitedAt,
    exitCode: snapshot?.exitCode ?? null,
  };
}

export async function startBotServiceSupervisor() {
  await ensureBotFiles();
}

export async function getBotServicesDashboard(): Promise<BotServicesDashboard> {
  const [control, status] = await Promise.all([readControlFile(), readStatusFile()]);

  return {
    listener: normalizeServiceState(control.listenerEnabled, status.listener),
    sender: normalizeServiceState(control.senderEnabled, status.sender),
  };
}

export async function setBotServiceEnabled(serviceName: BotServiceName, isEnabled: boolean) {
  const current = await readControlFile();
  const nextControl: BotServiceControlFile = {
    ...current,
    listenerEnabled: serviceName === "listener" ? isEnabled : current.listenerEnabled,
    senderEnabled: serviceName === "sender" ? isEnabled : current.senderEnabled,
    updatedAt: new Date().toISOString(),
  };

  await writeJsonFile(controlFilePath, nextControl);

  const dashboard = await getBotServicesDashboard();
  return dashboard[serviceName];
}

export function isBotServiceName(value: unknown): value is BotServiceName {
  return value === "listener" || value === "sender";
}
