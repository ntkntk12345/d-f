import { spawn } from "node:child_process";
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

type ManagedStopMode = "disable" | "restart" | "shutdown" | null;
type ManagedBotChild = ReturnType<typeof spawn>;

type ManagedBotService = {
  child: ManagedBotChild | null;
  restartTimer: NodeJS.Timeout | null;
  stopMode: ManagedStopMode;
  recentStderr: string;
  startInFlight: boolean;
};

type BotSupervisorState = {
  initialized: boolean;
  reconcileTimer: NodeJS.Timeout | null;
  reconcilePromise: Promise<void> | null;
  shuttingDown: boolean;
  shutdownHooksRegistered: boolean;
  services: Record<BotServiceName, ManagedBotService>;
};

type GlobalWithBotSupervisor = typeof globalThis & {
  __bichhaBotSupervisor__?: BotSupervisorState;
};

const botDirectory = path.resolve(process.cwd(), "..", "bot");
const controlFilePath = path.join(botDirectory, "bot_service_control.json");
const statusFilePath = path.join(botDirectory, "bot_service_status.json");
const pythonCommand =
  process.env["BOT_PYTHON"]?.trim() ||
  process.env["PYTHON"]?.trim() ||
  (process.platform === "win32" ? "python" : "python3");

const restartDelayMs = 5_000;
const reconcileIntervalMs = 15_000;
const maxRecentErrorLength = 1_200;

const serviceDefinitions: Record<
  BotServiceName,
  { scriptPath: string; controlKey: keyof BotServiceControlFile; heartbeatStaleAfterMs: number }
> = {
  listener: {
    scriptPath: path.join(botDirectory, "listener.py"),
    controlKey: "listenerEnabled",
    heartbeatStaleAfterMs: 3 * 60 * 1000,
  },
  sender: {
    scriptPath: path.join(botDirectory, "sender.py"),
    controlKey: "senderEnabled",
    heartbeatStaleAfterMs: 3 * 60 * 1000,
  },
};

const globalWithBotSupervisor = globalThis as GlobalWithBotSupervisor;
const botSupervisor =
  globalWithBotSupervisor.__bichhaBotSupervisor__ ||
  (globalWithBotSupervisor.__bichhaBotSupervisor__ = {
    initialized: false,
    reconcileTimer: null,
    reconcilePromise: null,
    shuttingDown: false,
    shutdownHooksRegistered: false,
    services: {
      listener: {
        child: null,
        restartTimer: null,
        stopMode: null,
        recentStderr: "",
        startInFlight: false,
      },
      sender: {
        child: null,
        restartTimer: null,
        stopMode: null,
        recentStderr: "",
        startInFlight: false,
      },
    },
  });

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

async function updateServiceStatusSnapshot(
  serviceName: BotServiceName,
  fields: Partial<BotServiceRuntimeSnapshot>,
) {
  const status = await readStatusFile();
  const currentSnapshot = status[serviceName] || {};
  const nextUpdatedAt = new Date().toISOString();
  const nextSnapshot: BotServiceRuntimeSnapshot = {
    ...currentSnapshot,
    ...fields,
    updatedAt: nextUpdatedAt,
  };

  status[serviceName] = nextSnapshot;
  status.updatedAt = nextUpdatedAt;
  await writeJsonFile(statusFilePath, status);
  return nextSnapshot;
}

function getDesiredEnabled(control: BotServiceControlFile, serviceName: BotServiceName) {
  return Boolean(control[serviceDefinitions[serviceName].controlKey]);
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

function trimRecentError(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxRecentErrorLength
    ? trimmed.slice(trimmed.length - maxRecentErrorLength)
    : trimmed;
}

function parseIsoTimestamp(value?: string) {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? null : ts;
}

function isHeartbeatStale(
  serviceName: BotServiceName,
  snapshot?: BotServiceRuntimeSnapshot,
) {
  const staleAfterMs = serviceDefinitions[serviceName].heartbeatStaleAfterMs;
  const lastHeartbeatAt = parseIsoTimestamp(snapshot?.lastHeartbeatAt);
  const lastStartedAt = parseIsoTimestamp(snapshot?.lastStartedAt);
  const referenceTime = Math.max(lastHeartbeatAt ?? 0, lastStartedAt ?? 0);

  if (!referenceTime) {
    return false;
  }

  return Date.now() - referenceTime > staleAfterMs;
}

function clearRestartTimer(serviceName: BotServiceName) {
  const managed = botSupervisor.services[serviceName];
  if (managed.restartTimer) {
    clearTimeout(managed.restartTimer);
    managed.restartTimer = null;
  }
}

async function terminateProcess(pid?: number | null) {
  if (!pid) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.on("error", () => resolve());
      killer.on("exit", () => resolve());
    });
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
}

function attachChildLogger(
  serviceName: BotServiceName,
  streamName: "stdout" | "stderr",
  stream: NodeJS.ReadableStream,
) {
  const managed = botSupervisor.services[serviceName];
  let carry = "";
  stream.setEncoding("utf8");

  stream.on("data", (chunk: string) => {
    if (streamName === "stderr") {
      managed.recentStderr = trimRecentError(`${managed.recentStderr}\n${chunk}`) || "";
    }

    carry += chunk;
    const lines = carry.split(/\r?\n/);
    carry = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line.trim()) {
        continue;
      }

      if (streamName === "stderr") {
        console.error(`[bot:${serviceName}] ${line}`);
      } else {
        console.log(`[bot:${serviceName}] ${line}`);
      }
    }
  });

  stream.on("end", () => {
    const lastLine = carry.trim();
    if (!lastLine) {
      return;
    }

    if (streamName === "stderr") {
      console.error(`[bot:${serviceName}] ${lastLine}`);
    } else {
      console.log(`[bot:${serviceName}] ${lastLine}`);
    }
  });
}

async function scheduleServiceRestart(serviceName: BotServiceName, reason: string) {
  const managed = botSupervisor.services[serviceName];
  const control = await readControlFile();

  if (botSupervisor.shuttingDown || !getDesiredEnabled(control, serviceName)) {
    return;
  }

  if (managed.restartTimer || managed.child || managed.startInFlight) {
    return;
  }

  await updateServiceStatusSnapshot(serviceName, {
    running: false,
    state: "restarting",
    lastError: trimRecentError(reason),
    pid: null,
  });

  managed.restartTimer = setTimeout(() => {
    managed.restartTimer = null;
    void spawnManagedService(serviceName);
  }, restartDelayMs);

  managed.restartTimer.unref?.();
}

async function handleManagedServiceExit(
  serviceName: BotServiceName,
  child: ManagedBotChild,
  exitCode: number | null,
  signal: NodeJS.Signals | null,
) {
  const managed = botSupervisor.services[serviceName];

  if (managed.child !== child) {
    return;
  }

  managed.child = null;
  managed.startInFlight = false;

  const control = await readControlFile();
  const enabled = getDesiredEnabled(control, serviceName);
  const stopMode = managed.stopMode;
  const exitLabel = exitCode !== null ? `code ${exitCode}` : signal ? `signal ${signal}` : "unknown exit";
  const lastError =
    trimRecentError(managed.recentStderr) ||
    (stopMode === "disable" || stopMode === "shutdown" ? null : `Process exited with ${exitLabel}`);

  managed.stopMode = null;
  managed.recentStderr = "";

  const shouldRestart = enabled && stopMode !== "disable" && stopMode !== "shutdown" && !botSupervisor.shuttingDown;

  await updateServiceStatusSnapshot(serviceName, {
    running: false,
    state: shouldRestart ? "restarting" : enabled ? "stopped" : "disabled",
    lastError,
    pid: null,
    exitCode,
    lastExitedAt: new Date().toISOString(),
  });

  if (shouldRestart) {
    console.warn(`[bot-supervisor] ${serviceName} exited (${exitLabel}). Restarting in ${restartDelayMs / 1000}s.`);
    await scheduleServiceRestart(serviceName, lastError || `Process exited with ${exitLabel}`);
  } else {
    console.log(`[bot-supervisor] ${serviceName} exited (${exitLabel}).`);
  }
}

async function spawnManagedService(serviceName: BotServiceName) {
  const managed = botSupervisor.services[serviceName];

  if (botSupervisor.shuttingDown || managed.child || managed.startInFlight) {
    return;
  }

  const control = await readControlFile();
  if (!getDesiredEnabled(control, serviceName)) {
    return;
  }

  managed.startInFlight = true;
  clearRestartTimer(serviceName);

  try {
    const child = spawn(pythonCommand, [serviceDefinitions[serviceName].scriptPath], {
      cwd: botDirectory,
      env: { ...process.env },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    managed.child = child;
    managed.stopMode = null;
    managed.recentStderr = "";

    attachChildLogger(serviceName, "stdout", child.stdout);
    attachChildLogger(serviceName, "stderr", child.stderr);

    child.on("error", (error) => {
      if (managed.child !== child) {
        return;
      }

      managed.child = null;
      managed.startInFlight = false;
      managed.recentStderr = trimRecentError(`${managed.recentStderr}\n${String(error)}`) || "";

      void updateServiceStatusSnapshot(serviceName, {
        running: false,
        state: "error",
        lastError: trimRecentError(String(error)),
        pid: null,
        exitCode: null,
        lastExitedAt: new Date().toISOString(),
      }).then(async () => {
        await scheduleServiceRestart(serviceName, String(error));
      });
    });

    child.on("exit", (exitCode, signal) => {
      void handleManagedServiceExit(serviceName, child, exitCode, signal);
    });

    await updateServiceStatusSnapshot(serviceName, {
      running: true,
      state: "starting",
      lastError: null,
      pid: child.pid ?? null,
      lastStartedAt: new Date().toISOString(),
      exitCode: null,
    });

    console.log(`[bot-supervisor] Started ${serviceName} with PID ${child.pid ?? "unknown"}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateServiceStatusSnapshot(serviceName, {
      running: false,
      state: "error",
      lastError: trimRecentError(message),
      pid: null,
      exitCode: null,
      lastExitedAt: new Date().toISOString(),
    });
    await scheduleServiceRestart(serviceName, message);
  } finally {
    managed.startInFlight = false;
  }
}

async function stopManagedService(serviceName: BotServiceName, stopMode: Exclude<ManagedStopMode, null>) {
  const managed = botSupervisor.services[serviceName];
  clearRestartTimer(serviceName);

  if (!managed.child) {
    if (stopMode === "disable" || stopMode === "shutdown") {
      await updateServiceStatusSnapshot(serviceName, {
        running: false,
        state: "disabled",
        lastError: null,
        pid: null,
      });
    }
    return;
  }

  managed.stopMode = stopMode;

  if (stopMode === "disable" || stopMode === "shutdown") {
    await updateServiceStatusSnapshot(serviceName, {
      running: false,
      state: "disabled",
      lastError: null,
      pid: null,
    });
  }

  await terminateProcess(managed.child.pid);
}

async function reconcileManagedServices() {
  const control = await readControlFile();
  const status = await readStatusFile();

  for (const serviceName of ["listener", "sender"] as const) {
    const enabled = getDesiredEnabled(control, serviceName);
    const managed = botSupervisor.services[serviceName];

    if (!enabled) {
      await stopManagedService(serviceName, "disable");
      continue;
    }

    if (!managed.child) {
      if (!managed.restartTimer && !managed.startInFlight) {
        await spawnManagedService(serviceName);
      }
      continue;
    }

    if (isHeartbeatStale(serviceName, status[serviceName])) {
      const lastHeartbeatAt = status[serviceName]?.lastHeartbeatAt || status[serviceName]?.lastStartedAt || "unknown";
      const staleReason = `Heartbeat stale since ${lastHeartbeatAt}`;
      console.warn(`[bot-supervisor] ${serviceName} stale heartbeat. Restarting process.`);
      await updateServiceStatusSnapshot(serviceName, {
        running: false,
        state: "restarting",
        lastError: staleReason,
      });
      await stopManagedService(serviceName, "restart");
    }
  }
}

async function runSupervisorReconcile() {
  if (botSupervisor.reconcilePromise) {
    return botSupervisor.reconcilePromise;
  }

  botSupervisor.reconcilePromise = (async () => {
    try {
      await reconcileManagedServices();
    } finally {
      botSupervisor.reconcilePromise = null;
    }
  })();

  return botSupervisor.reconcilePromise;
}

async function shutdownBotServiceSupervisor() {
  if (botSupervisor.shuttingDown) {
    return;
  }

  botSupervisor.shuttingDown = true;

  if (botSupervisor.reconcileTimer) {
    clearInterval(botSupervisor.reconcileTimer);
    botSupervisor.reconcileTimer = null;
  }

  await Promise.all(
    (["listener", "sender"] as const).map((serviceName) => stopManagedService(serviceName, "shutdown")),
  );
}

function registerSupervisorShutdownHooks() {
  if (botSupervisor.shutdownHooksRegistered) {
    return;
  }

  botSupervisor.shutdownHooksRegistered = true;

  const shutdownAndExit = (signal: "SIGINT" | "SIGTERM") => {
    void shutdownBotServiceSupervisor().finally(() => {
      process.exit(signal === "SIGINT" ? 130 : 0);
    });
  };

  process.once("SIGINT", () => shutdownAndExit("SIGINT"));
  process.once("SIGTERM", () => shutdownAndExit("SIGTERM"));
}

export async function startBotServiceSupervisor() {
  if (botSupervisor.initialized) {
    return;
  }

  botSupervisor.initialized = true;
  botSupervisor.shuttingDown = false;

  registerSupervisorShutdownHooks();
  await ensureBotFiles();
  await runSupervisorReconcile();

  botSupervisor.reconcileTimer = setInterval(() => {
    void runSupervisorReconcile();
  }, reconcileIntervalMs);

  botSupervisor.reconcileTimer.unref?.();
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
  await startBotServiceSupervisor();
  await runSupervisorReconcile();

  const dashboard = await getBotServicesDashboard();
  return dashboard[serviceName];
}

export function isBotServiceName(value: unknown): value is BotServiceName {
  return value === "listener" || value === "sender";
}
