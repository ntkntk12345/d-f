import { spawn } from "node:child_process";
import { defineConfig, loadEnv, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { resolvePropertyDataInputDirs } from "./scripts/property-data-paths";

function readRuntimeEnv(name: string, env: Record<string, string>) {
  return process.env[name] || env[name];
}

function resolveNpmRunCommand() {
  const npmExecPath = process.env.npm_execpath;

  if (npmExecPath) {
    return {
      command: process.execPath,
      argsPrefix: [npmExecPath],
    };
  }

  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    argsPrefix: [] as string[],
  };
}

function propertyDataSyncPlugin(appRootDir: string) {
  const { watchDirs } = resolvePropertyDataInputDirs(appRootDir);
  const normalizedWatchDirs = watchDirs.map((directoryPath) => path.resolve(directoryPath));
  const npmRunCommand = resolveNpmRunCommand();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let rebuildInFlight = false;
  let queuedReason: string | null = null;

  function isWatchedPropertySource(filePath: string) {
    const normalizedFilePath = path.resolve(filePath);
    return normalizedWatchDirs.some((directoryPath) => {
      const normalizedDirectoryPath = `${directoryPath}${path.sep}`;
      return normalizedFilePath === directoryPath || normalizedFilePath.startsWith(normalizedDirectoryPath);
    });
  }

  return {
    name: "property-data-sync",
    apply: "serve" as const,
    configureServer(server: ViteDevServer) {
      const runRebuild = (reason: string) => {
        if (rebuildInFlight) {
          queuedReason = reason;
          return;
        }

        rebuildInFlight = true;
        server.config.logger.info(`[property-data] rebuilding because ${reason}`, { timestamp: true });

        const child = spawn(
          npmRunCommand.command,
          [...npmRunCommand.argsPrefix, "run", "generate:property-data"],
          {
            cwd: appRootDir,
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );

        child.stdout.on("data", (chunk) => {
          const message = String(chunk).trim();
          if (message) {
            server.config.logger.info(`[property-data] ${message}`, { timestamp: true });
          }
        });

        child.stderr.on("data", (chunk) => {
          const message = String(chunk).trim();
          if (message) {
            server.config.logger.error(`[property-data] ${message}`, { timestamp: true });
          }
        });

        child.on("close", (code) => {
          rebuildInFlight = false;

          if (code === 0) {
            server.config.logger.info("[property-data] data refreshed. Reloading browser.", { timestamp: true });
            server.ws.send({ type: "full-reload" });
          } else {
            server.config.logger.error(
              `[property-data] regenerate failed with exit code ${code ?? "unknown"}.`,
              { timestamp: true },
            );
          }

          if (queuedReason) {
            const nextReason = queuedReason;
            queuedReason = null;
            runRebuild(nextReason);
          }
        });
      };

      const scheduleRebuild = (event: string, filePath: string) => {
        if (!filePath.toLowerCase().endsWith(".json")) {
          return;
        }

        if (!isWatchedPropertySource(filePath)) {
          return;
        }

        queuedReason = `${event} ${path.relative(appRootDir, filePath)}`;

        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
          const reason = queuedReason || "source update";
          queuedReason = null;
          runRebuild(reason);
        }, 250);
      };

      server.watcher.add(normalizedWatchDirs);
      server.config.logger.info(
        `[property-data] watching ${normalizedWatchDirs
          .map((directoryPath) => path.relative(appRootDir, directoryPath))
          .join(", ")}`,
        { timestamp: true },
      );

      const handleWatcherEvent = (event: string, filePath: string) => {
        if (event === "add" || event === "change" || event === "unlink") {
          scheduleRebuild(event, filePath);
        }
      };

      server.watcher.on("all", handleWatcherEvent);
      server.httpServer?.once("close", () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        server.watcher.off("all", handleWatcherEvent);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const appRootDir = path.resolve(import.meta.dirname);
  const env = loadEnv(mode, import.meta.dirname, "");
  const isDevelopment = mode === "development";
  const clientPort = readRuntimeEnv("CLIENT_PORT", env);
  const vitePort = readRuntimeEnv("VITE_PORT", env);
  const portEnv = readRuntimeEnv("PORT", env);
  const apiServerPortEnv = readRuntimeEnv("API_SERVER_PORT", env);
  const apiServerUrlEnv = readRuntimeEnv("API_SERVER_URL", env);
  const basePathEnv = readRuntimeEnv("BASE_PATH", env);
  const buildIdEnv = readRuntimeEnv("APP_BUILD_ID", env);
  const rawPort = isDevelopment
    ? clientPort || vitePort || portEnv || "80"
    : portEnv || clientPort || vitePort || "80";
  const port = Number(rawPort);
  const apiServerPort = apiServerPortEnv || (isDevelopment ? "3001" : "3000");
  const apiTarget = apiServerUrlEnv || `http://127.0.0.1:${apiServerPort}`;
  const basePath = basePathEnv || "/";
  const buildId = buildIdEnv || new Date().toISOString();

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      propertyDataSyncPlugin(appRootDir),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: appRootDir,
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    server: {
      port,
      strictPort: false,
      host: "0.0.0.0",
      allowedHosts: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
        },
      },
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
    preview: {
      port,
      strictPort: false,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
