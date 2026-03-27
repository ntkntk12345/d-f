import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { createServer } from "http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server as SocketIO } from "socket.io";
import router from "./routes";
import { ensureGeneralGroup, syncAllUsersToGeneralGroup } from "./routes/groups";
import { maintenanceModeGuard } from "./middleware/maintenance";

const app: Express = express();
export const httpServer = createServer(app);
const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const runtimePublicDirectory = path.resolve(appDirectory, "..", "..", "public");
const staticPublicDirectory = path.resolve(appDirectory, "..", "..", "dist", "public");
const staticIndexFile = path.join(staticPublicDirectory, "index.html");
const API_BODY_LIMIT = process.env.API_BODY_LIMIT || "12mb";

type ApiRuntimeError = Partial<NodeJS.ErrnoException> & {
  status?: number;
  type?: string;
  message?: string;
  port?: number | string;
};

function getErrorPort(error: ApiRuntimeError) {
  const port = error.port
    ?? error.message?.match(/:(\d+)\b/)?.[1];
  const value = Number(port);
  return Number.isFinite(value) ? value : null;
}

function buildApiErrorPayload(error: unknown) {
  const apiError = error as ApiRuntimeError;

  if (apiError.type === "entity.too.large" || apiError.status === 413) {
    return {
      status: 413,
      message: "Du lieu gui len qua lon. Vui long giam kich thuoc anh va thu lai.",
    };
  }

  if (apiError.code === "ER_ACCESS_DENIED_ERROR" || apiError.code === "ER_BAD_DB_ERROR") {
    return {
      status: 503,
      message: "Khong the ket noi den MySQL. Vui long kiem tra lai cau hinh co so du lieu.",
    };
  }

  if (
    apiError.code === "ECONNREFUSED"
    || apiError.code === "EHOSTUNREACH"
    || apiError.code === "ETIMEDOUT"
    || apiError.code === "PROTOCOL_CONNECTION_LOST"
  ) {
    const port = getErrorPort(apiError);

    if (port === 3306) {
      return {
        status: 503,
        message: "MySQL chua san sang. Vui long kiem tra dich vu co so du lieu.",
      };
    }

    if (port === 5050) {
      return {
        status: 503,
        message: "Dich vu Zalo bot chua san sang.",
      };
    }

    return {
      status: 503,
      message: "Khong the ket noi den dich vu noi bo cua he thong. Vui long thu lai sau.",
    };
  }

  const status = apiError.status && apiError.status >= 400 && apiError.status < 600
    ? apiError.status
    : 500;

  return {
    status,
    message: "Loi he thong API",
  };
}

app.set("trust proxy", true);

export const io = new SocketIO(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  path: "/api/socket.io",
});

const onlineUsers = new Map<number, string>();

io.on("connection", (socket) => {
  const userId = Number(socket.handshake.query.userId);
  if (userId) {
    onlineUsers.set(userId, socket.id);
    socket.join(`user_${userId}`);
  }

  socket.on("join_group", (groupId: number) => {
    socket.join(`group_${groupId}`);
  });

  socket.on("send_message", (data: { receiverId: number; content: string; senderId: number; senderName: string }) => {
    io.to(`user_${data.receiverId}`).emit("new_message", {
      senderId: data.senderId,
      receiverId: data.receiverId,
      content: data.content,
      senderName: data.senderName,
      createdAt: new Date().toISOString(),
    });
  });

  socket.on("send_group_message", (data: { groupId: number; content: string; senderId: number; senderName: string; msgId?: number }) => {
    io.to(`group_${data.groupId}`).emit("new_group_message", {
      groupId: data.groupId,
      senderId: data.senderId,
      senderName: data.senderName,
      content: data.content,
      createdAt: new Date().toISOString(),
      id: data.msgId,
      isDeleted: false,
    });
  });

  socket.on("delete_group_message", (data: { groupId: number; msgId: number }) => {
    io.to(`group_${data.groupId}`).emit("group_message_deleted", { msgId: data.msgId });
  });

  socket.on("kick_member", (data: { groupId: number; userId: number }) => {
    io.to(`user_${data.userId}`).emit("kicked_from_group", { groupId: data.groupId });
  });

  socket.on("disconnect", () => {
    if (userId) onlineUsers.delete(userId);
  });
});

app.use(cors());
app.use(express.json({ limit: API_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: API_BODY_LIMIT }));
app.use("/api", maintenanceModeGuard, router);

if (existsSync(staticIndexFile)) {
  if (existsSync(runtimePublicDirectory)) {
    app.use(express.static(runtimePublicDirectory, { index: false }));
  }

  app.use(express.static(staticPublicDirectory, { index: false }));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    res.sendFile(staticIndexFile, (error) => {
      if (error) next(error);
    });
  });
}

app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  const isApiRequest = req.originalUrl.startsWith("/api") || req.path.startsWith("/api");

  if (!isApiRequest) {
    next(error);
    return;
  }

  if (res.headersSent) {
    next(error);
    return;
  }

  const { status, message } = buildApiErrorPayload(error);
  console.error(`[api.error] ${req.method} ${req.originalUrl}`, error);
  res.status(status).json({ message });
});

const CRON_INTERVAL_MS = 5 * 60 * 1000;

syncAllUsersToGeneralGroup().catch(console.error);
setInterval(() => {
  syncAllUsersToGeneralGroup().catch(console.error);
}, CRON_INTERVAL_MS);

export default app;
