import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const PROPERTY_DATA_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;
const STARTUP_REFRESH_DELAY_MS = 15 * 1000;
const APP_ROOT_CANDIDATES = [
  process.cwd(),
  path.resolve(moduleDirectory, "..", "..", ".."),
];

let refreshPromise: Promise<void> | null = null;
let schedulerStarted = false;

function resolveAppRootDir() {
  for (const candidatePath of APP_ROOT_CANDIDATES) {
    const buildScriptPath = path.join(candidatePath, "scripts", "build-property-data.ts");

    if (existsSync(buildScriptPath)) {
      return {
        appRootDir: candidatePath,
        buildScriptPath,
      };
    }
  }

  throw new Error("Cannot resolve app root for property data refresh.");
}

function relayProcessOutput(prefix: string, chunk: unknown, writer: (message: string) => void) {
  const message = String(chunk).trim();
  if (message) {
    writer(`[property-data] ${prefix}${message}`);
  }
}

export function refreshPropertyData(reason = "manual") {
  if (refreshPromise) {
    console.log(`[property-data] refresh skipped (${reason}) because another refresh is running.`);
    return refreshPromise;
  }

  const { appRootDir, buildScriptPath } = resolveAppRootDir();

  refreshPromise = new Promise<void>((resolve, reject) => {
    console.log(`[property-data] refresh started (${reason}).`);

    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", buildScriptPath],
      {
        cwd: appRootDir,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    child.stdout.on("data", (chunk) => {
      relayProcessOutput("", chunk, console.log);
    });

    child.stderr.on("data", (chunk) => {
      relayProcessOutput("", chunk, console.error);
    });

    child.once("error", (error) => {
      reject(error);
    });

    child.once("close", (code) => {
      if (code === 0) {
        console.log(`[property-data] refresh completed (${reason}).`);
        resolve();
        return;
      }

      reject(new Error(`Property data refresh failed with exit code ${code ?? "unknown"}.`));
    });
  }).finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export function startPropertyDataRefreshScheduler() {
  if (schedulerStarted) {
    return;
  }

  schedulerStarted = true;

  const runScheduledRefresh = (reason: string) => {
    refreshPropertyData(reason).catch((error) => {
      console.error(`[property-data] refresh error (${reason})`, error);
    });
  };

  const startupTimer = setTimeout(() => {
    runScheduledRefresh("startup");
  }, STARTUP_REFRESH_DELAY_MS);

  const intervalTimer = setInterval(() => {
    runScheduledRefresh("interval");
  }, PROPERTY_DATA_REFRESH_INTERVAL_MS);

  startupTimer.unref?.();
  intervalTimer.unref?.();

  console.log(
    `[property-data] scheduler enabled. Refresh interval: ${PROPERTY_DATA_REFRESH_INTERVAL_MS}ms.`,
  );
}
