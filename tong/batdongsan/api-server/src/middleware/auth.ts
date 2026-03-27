import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "timtro_secret_key_2024";
const BICHHA_ADMIN_TOKEN_TYPE = "bichha-admin";
const BICHHA_CTV_TOKEN_TYPE = "bichha-ctv";

interface BichHaAdminTokenPayload {
  type: typeof BICHHA_ADMIN_TOKEN_TYPE;
  username: string;
}

interface BichHaCtvTokenPayload {
  type: typeof BICHHA_CTV_TOKEN_TYPE;
  id: number;
  username: string;
  nickname: string;
}

export interface AuthUser {
  id: number;
  phone: string;
  name: string;
  role: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      bichHaAdmin?: {
        username: string;
      };
      bichHaCtv?: {
        id: number;
        username: string;
        nickname: string;
      };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ message: "Bạn cần đăng nhập" });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Token không hợp lệ" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.user?.role !== 1) {
      res.status(403).json({ message: "Không có quyền truy cập" });
      return;
    }
    next();
  });
}

export function requireBichHaAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ message: "Ban can dang nhap dashboard" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as BichHaAdminTokenPayload;

    if (decoded.type !== BICHHA_ADMIN_TOKEN_TYPE) {
      res.status(403).json({ message: "Token dashboard khong hop le" });
      return;
    }

    req.bichHaAdmin = {
      username: decoded.username,
    };
    next();
  } catch {
    res.status(401).json({ message: "Token dashboard het han hoac khong hop le" });
  }
}

export function requireBichHaCtv(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ message: "Ban can dang nhap CTV" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as BichHaCtvTokenPayload;

    if (decoded.type !== BICHHA_CTV_TOKEN_TYPE) {
      res.status(403).json({ message: "Token CTV khong hop le" });
      return;
    }

    req.bichHaCtv = {
      id: decoded.id,
      username: decoded.username,
      nickname: decoded.nickname,
    };
    next();
  } catch {
    res.status(401).json({ message: "Token CTV het han hoac khong hop le" });
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET) as AuthUser;
    } catch {}
  }
  next();
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "30d" });
}

export function signBichHaAdminToken(username: string): string {
  return jwt.sign(
    {
      type: BICHHA_ADMIN_TOKEN_TYPE,
      username,
    } satisfies BichHaAdminTokenPayload,
    JWT_SECRET,
    { expiresIn: "30d" },
  );
}

export function signBichHaCtvToken(account: { id: number; username: string; nickname: string }): string {
  return jwt.sign(
    {
      type: BICHHA_CTV_TOKEN_TYPE,
      id: account.id,
      username: account.username,
      nickname: account.nickname,
    } satisfies BichHaCtvTokenPayload,
    JWT_SECRET,
    { expiresIn: "30d" },
  );
}
