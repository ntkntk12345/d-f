import { spawn } from "node:child_process";
import net from "node:net";

const npmExecPath = process.env.npm_execpath;
const clientPort = process.env.CLIENT_PORT || process.env.PORT;
const apiServerPort = process.env.API_SERVER_PORT || "3001";

if (!npmExecPath) {
  throw new Error("Cannot find npm_execpath in current environment.");
}

const processes = [
  {
    name: "server",
    color: "\x1b[33m",
    args: ["run", "dev:server"],
    env: {
      PORT: apiServerPort,
      API_SERVER_PORT: apiServerPort,
    },
  },
  {
    name: "client",
    color: "\x1b[36m",
    args: ["run", "dev:client"],
    env: {
      ...(clientPort ? { CLIENT_PORT: clientPort } : {}),
      API_SERVER_PORT: apiServerPort,
    },
  },
];

function killChild(child) {
  if (!child || child.killed) {
    return;
  }

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    killer.on("error", () => {
      child.kill();
    });
    return;
  }

  child.kill("SIGTERM");
}

function spawnProcess(proc) {
  const child = spawn(process.execPath, [npmExecPath, ...proc.args], {
    stdio: ["inherit", "pipe", "pipe"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...proc.env,
    },
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`${proc.color}[${proc.name}]\x1b[0m ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`${proc.color}[${proc.name}]\x1b[0m ${chunk}`);
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      for (const other of children) {
        if (other !== child) killChild(other);
      }
      process.exitCode = code;
    }
  });

  return child;
}

function waitForPort(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port: Number(port) });

      socket.once("connect", () => {
        socket.end();
        resolve(undefined);
      });

      socket.once("error", () => {
        socket.destroy();

        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for port ${port}`));
          return;
        }

        setTimeout(tryConnect, 250);
      });
    };

    tryConnect();
  });
}

const children = [];
const serverProcess = spawnProcess(processes[0]);
children.push(serverProcess);

waitForPort(apiServerPort)
  .then(() => {
    const clientProcess = spawnProcess(processes[1]);
    children.push(clientProcess);
  })
  .catch((error) => {
    process.stderr.write(`\x1b[31m[dev]\x1b[0m ${error.message}\n`);
    killChild(serverProcess);
    process.exitCode = 1;
  });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const child of children) {
      killChild(child);
    }
    process.exit(0);
  });
}
