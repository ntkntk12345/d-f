import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../../db";
import { usersTable } from "../../db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, signToken } from "../middleware/auth";
import { ensureGeneralGroup, joinGeneralGroup } from "./groups";
import { lookupZaloAccountByPhone, sendZaloTextToUid } from "../lib/zalo-bot";
import {
  buildRegisterVerificationMessage,
  clearRegisterVerificationCode,
  consumeRegisterVerificationCode,
  createRegisterVerificationCode,
  normalizePhoneForVerification,
} from "../lib/zalo-verification";

const router = Router();
const avatarDir = path.resolve(process.cwd(), "public", "uploads", "avatars");

async function getUserById(id: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return user;
}

function parseReferralCode(code: string) {
  const match = code.trim().toUpperCase().match(/^TIMTRO-(\d+)$/);
  if (!match) {
    return null;
  }

  const referrerId = Number.parseInt(match[1], 10);
  return Number.isInteger(referrerId) && referrerId > 0 ? referrerId : null;
}

function normalizePhoneInput(phone: string) {
  const compact = phone.replace(/[\s\-\+\(\)]/g, "");
  return /^\d+$/.test(compact) ? phone.replace(/\D/g, "") : phone.trim();
}

async function saveAvatarDataUrl(userId: number, avatarDataUrl: string) {
  const match = avatarDataUrl
    .trim()
    .match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);

  if (!match) {
    throw new Error("INVALID_AVATAR_FORMAT");
  }

  const mimeType = match[1];
  const fileBuffer = Buffer.from(match[2], "base64");

  if (fileBuffer.length === 0 || fileBuffer.length > 2 * 1024 * 1024) {
    throw new Error("INVALID_AVATAR_SIZE");
  }

  const extension = mimeType === "image/png"
    ? "png"
    : mimeType === "image/webp"
      ? "webp"
      : "jpg";

  await mkdir(avatarDir, { recursive: true });

  const fileName = `user-${userId}-${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;
  await writeFile(path.join(avatarDir, fileName), fileBuffer);

  return `/uploads/avatars/${fileName}`;
}

router.get("/auth/validate-referral", async (req, res) => {
  try {
    const referrerId = parseReferralCode(String(req.query.code ?? ""));
    if (referrerId === null) {
      res.json({ valid: false });
      return;
    }

    const [referrer] = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, referrerId))
      .limit(1);

    res.json({
      valid: !!referrer,
      user: referrer ? { id: referrer.id, name: referrer.name } : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ valid: false, message: "Lá»—i há»‡ thá»‘ng" });
  }
});

router.post("/auth/register/request-verification", async (req, res) => {
  const phoneClean = normalizePhoneForVerification(String(req.body?.phone ?? ""));

  if (!/^\d{9,11}$/.test(phoneClean)) {
    res.status(400).json({ message: "So dien thoai khong hop le" });
    return;
  }

  try {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.phone, phoneClean))
      .limit(1);

    if (existing) {
      res.status(409).json({ message: "So dien thoai da duoc dang ky" });
      return;
    }

    const zaloAccount = await lookupZaloAccountByPhone(phoneClean);

    let verificationCode: Awaited<ReturnType<typeof createRegisterVerificationCode>>;
    try {
      verificationCode = await createRegisterVerificationCode(
        phoneClean,
        zaloAccount.uid,
        zaloAccount.name,
      );

      await sendZaloTextToUid(
        zaloAccount.uid,
        buildRegisterVerificationMessage(verificationCode.code),
      );
    } catch (error) {
      await clearRegisterVerificationCode(phoneClean);
      throw error;
    }

    res.json({
      message: "Da gui ma xac minh qua Zalo",
      delivery: "zalo",
      accountName: zaloAccount.name || null,
      expiresAt: verificationCode.expiresAt.toISOString(),
      resendAvailableAt: verificationCode.resendAvailableAt.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Khong the gui ma xac minh";
    const retryAfterSeconds = typeof (error as { retryAfterSeconds?: number })?.retryAfterSeconds === "number"
      ? (error as { retryAfterSeconds: number }).retryAfterSeconds
      : null;

    if (message === "WAIT_BEFORE_RESEND" && retryAfterSeconds) {
      res.status(429).json({
        message: `Vui long cho ${retryAfterSeconds}s roi gui lai ma`,
        retryAfterSeconds,
      });
      return;
    }

    if (
      message.includes("Khong the tim tai khoan Zalo")
      || message.toLowerCase().includes("khong tim thay")
      || message.toLowerCase().includes("khong dung zalo")
    ) {
      res.status(400).json({
        message: "Khong tim thay tai khoan Zalo theo so dien thoai nay. Vui long kiem tra lai hoac bo an so tren Zalo.",
      });
      return;
    }

    if (message.includes("dich vu Zalo bot")) {
      res.status(503).json({ message: "Dich vu Zalo bot chua san sang de gui ma xac minh" });
      return;
    }

    console.error("[auth.request-verification]", error);
    res.status(500).json({ message: "Khong the gui ma xac minh qua Zalo" });
  }
});

router.post("/auth/register", async (req, res) => {
  try {
    const { phone, password, name, referralCode, verificationCode } = req.body;
    const phoneInput = String(phone ?? "").trim();
    const nameInput = String(name ?? "").trim();
    if (!phoneInput || !password || !nameInput) {
      res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin" });
      return;
    }
    const phoneClean = phoneInput.replace(/\D/g, "");
    if (phoneClean.length < 9 || phoneClean.length > 11) {
      res.status(400).json({ message: "Số điện thoại không hợp lệ" });
      return;
    }
    const existing = await db.select().from(usersTable).where(eq(usersTable.phone, phoneClean)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ message: "Số điện thoại đã được đăng ký" });
      return;
    }

    // Validate referral code if provided
    let referredById: number | null = null;
    if (referralCode?.trim()) {
      const referrerId = parseReferralCode(referralCode);
      if (referrerId === null) {
        res.status(400).json({ message: "Mã giới thiệu không hợp lệ" });
        return;
      }
      const [referrer] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, referrerId)).limit(1);
      if (!referrer) {
        res.status(400).json({ message: "Mã giới thiệu không tồn tại" });
        return;
      }
      referredById = referrer.id;
    }

    try {
      await consumeRegisterVerificationCode(phoneClean, String(verificationCode ?? ""));
    } catch (error) {
      const message = error instanceof Error ? error.message : "VERIFY_FAILED";

      if (message === "INVALID_VERIFICATION_CODE_FORMAT") {
        res.status(400).json({ message: "Vui long nhap ma xac minh 6 so" });
        return;
      }

      if (message === "VERIFICATION_CODE_NOT_FOUND") {
        res.status(400).json({ message: "Vui long gui ma xac minh Zalo truoc khi dang ky" });
        return;
      }

      if (message === "VERIFICATION_CODE_EXPIRED") {
        res.status(400).json({ message: "Ma xac minh da het han. Vui long gui lai ma moi" });
        return;
      }

      if (message === "VERIFICATION_CODE_LOCKED") {
        res.status(400).json({ message: "Ban nhap sai ma qua nhieu lan. Vui long gui lai ma moi" });
        return;
      }

      if (message === "VERIFICATION_CODE_INVALID") {
        res.status(400).json({ message: "Ma xac minh Zalo khong dung" });
        return;
      }

      throw error;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [{ id }] = await db.insert(usersTable).values({
      phone: phoneClean,
      passwordHash,
      name: nameInput,
      role: 0,
      ...(referredById ? { referredBy: referredById } : {}),
    }).$returningId();
    const user = await getUserById(id);
    if (!user) {
      res.status(500).json({ message: "Khong the tai lai tai khoan vua tao" });
      return;
    }

    await ensureGeneralGroup();
    await joinGeneralGroup(user.id, user.role);

    const token = signToken({ id: user.id, phone: user.phone, name: user.name, role: user.role });
    res.json({ token, user: { id: user.id, phone: user.phone, name: user.name, role: user.role, avatar: user.avatar } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      res.status(400).json({ message: "Vui lòng nhập số điện thoại và mật khẩu" });
      return;
    }
    const phoneClean = /^\d+$/.test(phone.replace(/[\s\-\+\(\)]/g, ""))
      ? phone.replace(/\D/g, "")
      : phone.trim();
    let [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phoneClean)).limit(1);
    if (!user && phoneClean !== phone.trim()) {
      [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone.trim())).limit(1);
    }
    if (!user) {
      res.status(401).json({ message: "Số điện thoại hoặc mật khẩu không đúng" });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ message: "Số điện thoại hoặc mật khẩu không đúng" });
      return;
    }
    await ensureGeneralGroup();
    await joinGeneralGroup(user.id, user.role);
    const token = signToken({ id: user.id, phone: user.phone, name: user.name, role: user.role });
    res.json({ token, user: { id: user.id, phone: user.phone, name: user.name, role: user.role, avatar: user.avatar } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.post("/auth/zalo-login", async (req, res) => {
  try {
    const { zaloId, name, avatar, accessToken } = req.body;
    if (!zaloId || !name) {
      res.status(400).json({ message: "Thiếu thông tin Zalo" });
      return;
    }

    // Optionally verify access token with Zalo API
    if (accessToken) {
      try {
        const zaloRes = await fetch(
          `https://graph.zalo.me/v2.0/me?fields=id,name`,
          { headers: { access_token: accessToken } }
        );
        if (zaloRes.ok) {
          const zaloData = await zaloRes.json() as { id?: string; name?: string; error?: number };
          if (zaloData.error || (zaloData.id && zaloData.id !== zaloId)) {
            res.status(401).json({ message: "Token Zalo không hợp lệ" });
            return;
          }
        }
      } catch {
        // Token verification failed silently — continue anyway (may be in dev env)
      }
    }

    // Find existing user by Zalo ID
    let [user] = await db.select().from(usersTable).where(eq(usersTable.zaloId, zaloId)).limit(1);

    if (!user) {
      // Create new user from Zalo info
      const zaloPhone = `zalo_${zaloId}`;
      const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, zaloPhone)).limit(1);
      if (existing) {
        await db.update(usersTable).set({ zaloId, avatar: avatar || null }).where(eq(usersTable.id, existing.id));
        user = await getUserById(existing.id);
      } else {
        const [{ id }] = await db.insert(usersTable).values({
          phone: zaloPhone,
          passwordHash: "",
          name,
          avatar: avatar || null,
          zaloId,
          role: 0,
        }).$returningId();
        user = await getUserById(id);
        if (!user) {
          res.status(500).json({ message: "Khong the tai lai tai khoan Zalo vua tao" });
          return;
        }
        await ensureGeneralGroup();
        await joinGeneralGroup(user.id, user.role);
      }
    } else {
      // Update name/avatar if changed
      await db.update(usersTable).set({ name, avatar: avatar || user.avatar }).where(eq(usersTable.id, user.id));
      user = await getUserById(user.id);
    }

    if (!user) {
      res.status(500).json({ message: "Khong the tai lai thong tin tai khoan" });
      return;
    }

    const token = signToken({ id: user.id, phone: user.phone, name: user.name, role: user.role });
    res.json({ token, user: { id: user.id, phone: user.phone, name: user.name, role: user.role, avatar: user.avatar } });
  } catch (err) {
    console.error("[zalo-login]", err);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const [user] = await db.select({
      id: usersTable.id,
      phone: usersTable.phone,
      name: usersTable.name,
      role: usersTable.role,
      avatar: usersTable.avatar,
      createdAt: usersTable.createdAt,
    }).from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user) {
      res.status(404).json({ message: "Không tìm thấy tài khoản" });
      return;
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.put("/auth/profile", requireAuth, async (req, res) => {
  try {
    const nameInput = String(req.body.name ?? "").trim();
    const phoneInput = String(req.body.phone ?? "").trim();
    const avatarDataUrl = typeof req.body.avatarDataUrl === "string"
      ? req.body.avatarDataUrl.trim()
      : "";

    if (!nameInput) {
      res.status(400).json({ message: "Vui long nhap ten" });
      return;
    }

    if (nameInput.length > 255) {
      res.status(400).json({ message: "Ten qua dai" });
      return;
    }

    const currentUser = await getUserById(req.user!.id);
    if (!currentUser) {
      res.status(404).json({ message: "Khong tim thay tai khoan" });
      return;
    }

    const nextPhone = phoneInput ? normalizePhoneInput(phoneInput) : currentUser.phone;
    const phoneChanged = nextPhone !== currentUser.phone;

    if (!nextPhone) {
      res.status(400).json({ message: "Vui long nhap so dien thoai" });
      return;
    }

    if (phoneChanged) {
      if (!/^\d{9,11}$/.test(nextPhone)) {
        res.status(400).json({ message: "So dien thoai khong hop le" });
        return;
      }

      const [existingPhone] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.phone, nextPhone))
        .limit(1);

      if (existingPhone && existingPhone.id !== req.user!.id) {
        res.status(409).json({ message: "So dien thoai da duoc dang ky" });
        return;
      }
    }

    const updates: { name: string; phone: string; avatar?: string } = {
      name: nameInput,
      phone: nextPhone,
    };

    if (avatarDataUrl) {
      try {
        updates.avatar = await saveAvatarDataUrl(req.user!.id, avatarDataUrl);
      } catch (error) {
        const message = error instanceof Error ? error.message : "INVALID_AVATAR";
        const isSizeError = message === "INVALID_AVATAR_SIZE";
        res.status(400).json({
          message: isSizeError
            ? "Anh dai dien qua lon"
            : "Anh dai dien khong hop le",
        });
        return;
      }
    }

    await db.update(usersTable).set(updates).where(eq(usersTable.id, req.user!.id));

    const user = await getUserById(req.user!.id);
    if (!user) {
      res.status(404).json({ message: "Khong tim thay tai khoan" });
      return;
    }

    const token = signToken({ id: user.id, phone: user.phone, name: user.name, role: user.role });
    res.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Loi he thong" });
  }
});

router.get("/users/search", requireAuth, async (req, res) => {
  try {
    const { phone } = req.query as { phone: string };
    if (!phone) {
      res.status(400).json({ message: "Nhập số điện thoại để tìm kiếm" });
      return;
    }
    const phoneClean = String(phone).replace(/\D/g, "");
    const users = await db.select({
      id: usersTable.id,
      phone: usersTable.phone,
      name: usersTable.name,
    }).from(usersTable)
      .where(eq(usersTable.phone, phoneClean))
      .limit(5);
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.put("/auth/change-password", requireAuth, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword ?? "");
    const newPassword = String(req.body.newPassword ?? "");

    if (!newPassword) {
      res.status(400).json({ message: "Vui long nhap mat khau moi" });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ message: "Mat khau moi phai co it nhat 6 ky tu" });
      return;
    }

    const user = await getUserById(req.user!.id);
    if (!user) {
      res.status(404).json({ message: "Khong tim thay tai khoan" });
      return;
    }

    if (user.passwordHash) {
      if (!currentPassword) {
        res.status(400).json({ message: "Vui long nhap mat khau hien tai" });
        return;
      }

      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        res.status(400).json({ message: "Mat khau hien tai khong dung" });
        return;
      }
    }

    const samePassword = user.passwordHash
      ? await bcrypt.compare(newPassword, user.passwordHash)
      : false;

    if (samePassword) {
      res.status(400).json({ message: "Mat khau moi phai khac mat khau cu" });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, user.id));

    res.json({ success: true, message: "Doi mat khau thanh cong" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Loi he thong" });
  }
});

export default router;
