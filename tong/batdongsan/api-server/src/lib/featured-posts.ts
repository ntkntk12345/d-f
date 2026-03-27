import { randomUUID } from "node:crypto";
import { access, copyFile, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSiteSetting, setSiteSetting } from "./site-settings";
import { normalizeSiteContactLink } from "./site-contact";

const FEATURED_POSTS_KEY = "featured_posts_v1";
const FEATURED_POST_DEFAULT_ACTION_LABEL = "Lien he ngay";
const FEATURED_POST_SEND_INTERVAL_DAYS = 4;
const MAX_FEATURED_IMAGE_COUNT = 10;
const MAX_FEATURED_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const featuredUploadsDir = path.resolve(process.cwd(), "public", "uploads", "featured");
const distFeaturedUploadsDir = path.resolve(process.cwd(), "dist", "public", "uploads", "featured");
const botFeedFile = path.resolve(process.cwd(), "..", "bot", "admin_featured_posts.json");
const botScheduleFile = path.resolve(process.cwd(), "..", "bot", "featured_post_schedule.json");

export type FeaturedPostRecord = {
  id: string;
  title: string;
  summary: string;
  content: string;
  address?: string;
  roomType?: string;
  priceLabel?: string;
  imageUrls: string[];
  imageUrl?: string;
  actionLabel?: string;
  actionUrl?: string;
  routingKeywords: string[];
  createdByType?: "admin" | "ctv";
  createdById?: number;
  createdByUsername?: string;
  createdByNickname?: string;
  createdAt: string;
  updatedAt: string;
};

export type FeaturedPostPublic = Omit<
  FeaturedPostRecord,
  "routingKeywords" | "createdByType" | "createdById" | "createdByUsername" | "createdByNickname"
>;

export type CreateFeaturedPostInput = {
  title: string;
  summary?: string;
  content: string;
  address?: string;
  roomType?: string;
  priceLabel?: string;
  imageDataUrl?: string;
  imageDataUrls?: string[];
  actionLabel?: string;
  actionUrl?: string;
  routingKeywords: string[];
  createdByType?: "admin" | "ctv";
  createdById?: number;
  createdByUsername?: string;
  createdByNickname?: string;
};

function normalizeText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeKeywords(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => normalizeText(item, 120))
        .filter(Boolean),
    ),
  ).slice(0, 24);
}

function normalizeImageUrls(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => normalizeText(item, 1024))
        .filter(Boolean),
    ),
  ).slice(0, MAX_FEATURED_IMAGE_COUNT);
}

function getPrimaryImageUrl(imageUrls: string[]) {
  return imageUrls[0] || undefined;
}

function resolveFeaturedImageUrls(raw: Record<string, unknown>) {
  const imageUrls = normalizeImageUrls(raw.imageUrls);
  if (imageUrls.length > 0) {
    return imageUrls;
  }

  const legacyImageUrl = normalizeText(raw.imageUrl, 1024);
  return legacyImageUrl ? [legacyImageUrl] : [];
}

function normalizeActionLabel(value: unknown) {
  return normalizeText(value, 80) || FEATURED_POST_DEFAULT_ACTION_LABEL;
}

function normalizeActionUrl(value: unknown) {
  const raw = normalizeText(value, 1024);
  if (!raw) return undefined;
  return normalizeSiteContactLink(raw) || undefined;
}

function normalizeCreatedByType(value: unknown) {
  return value === "ctv" ? "ctv" : "admin";
}

function buildFeaturedPostTitle(roomType: string, address: string, fallbackTitle: string) {
  if (fallbackTitle) {
    return fallbackTitle;
  }

  if (roomType && address) {
    return `${roomType} - ${address}`.slice(0, 180);
  }

  return roomType || address;
}

function normalizeFeaturedPostRecord(value: unknown): FeaturedPostRecord | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const id = normalizeText(raw.id, 64);
  const title = normalizeText(raw.title, 180);
  const summary = normalizeText(raw.summary, 320);
  const content = normalizeText(raw.content, 6000);
  const address = normalizeText(raw.address, 240) || undefined;
  const roomType = normalizeText(raw.roomType, 80) || undefined;
  const priceLabel = normalizeText(raw.priceLabel, 80) || undefined;
  const imageUrls = resolveFeaturedImageUrls(raw);
  const actionLabel = normalizeActionLabel(raw.actionLabel);
  const actionUrl = normalizeActionUrl(raw.actionUrl);
  const routingKeywords = normalizeKeywords(raw.routingKeywords);
  const createdByType = normalizeCreatedByType(raw.createdByType);
  const createdById = Number(raw.createdById);
  const createdByUsername = normalizeText(raw.createdByUsername, 64) || undefined;
  const createdByNickname = normalizeText(raw.createdByNickname, 120) || undefined;
  const createdAt = normalizeText(raw.createdAt, 64);
  const updatedAt = normalizeText(raw.updatedAt, 64);

  if (!id || !title || !content || routingKeywords.length === 0) {
    return null;
  }

  return {
    id,
    title,
    summary,
    content,
    address,
    roomType,
    priceLabel,
    imageUrls,
    imageUrl: getPrimaryImageUrl(imageUrls),
    actionLabel,
    actionUrl,
    routingKeywords,
    createdByType,
    createdById: Number.isInteger(createdById) && createdById > 0 ? createdById : undefined,
    createdByUsername,
    createdByNickname,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  };
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string, fallback: T) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function removeFileIfExists(filePath: string) {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw error;
    }
  }
}

function toFeaturedImageLocalPath(imageUrl: string) {
  const normalizedImageUrl = normalizeText(imageUrl, 1024);
  if (!normalizedImageUrl.startsWith("/uploads/featured/")) {
    return null;
  }

  return path.resolve(process.cwd(), "public", normalizedImageUrl.replace(/^\/+/, ""));
}

async function cleanupBotFeaturedScheduleState(posts: FeaturedPostRecord[]) {
  try {
    const botDir = path.dirname(botScheduleFile);
    if (!(await fileExists(botDir))) {
      return;
    }

    const rawState = await readJsonFile<Record<string, unknown>>(botScheduleFile, {});
    if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
      return;
    }

    const activeIds = new Set(posts.map((post) => post.id));
    const nextState = Object.fromEntries(
      Object.entries(rawState).filter(([postId]) => activeIds.has(postId)),
    );

    await writeFile(botScheduleFile, JSON.stringify(nextState, null, 2), "utf8");
  } catch (error) {
    console.error("[featured-posts.cleanup-schedule]", error);
  }
}

async function removeFeaturedImageFiles(imageUrls: string[] = []) {
  const uniqueImageUrls = Array.from(
    new Set(
      imageUrls
        .map((imageUrl) => normalizeText(imageUrl, 1024))
        .filter((imageUrl) => imageUrl.startsWith("/uploads/featured/")),
    ),
  );

  for (const imageUrl of uniqueImageUrls) {
    const fileName = path.basename(imageUrl);
    if (!fileName) {
      continue;
    }

    await removeFileIfExists(path.join(featuredUploadsDir, fileName));
    await removeFileIfExists(path.join(distFeaturedUploadsDir, fileName));
  }
}

async function syncFeaturedPostsToBot(posts: FeaturedPostRecord[]) {
  try {
    const botDir = path.dirname(botFeedFile);
    if (!(await fileExists(botDir))) {
      return;
    }

    await mkdir(botDir, { recursive: true });
    const payload = {
      updatedAt: new Date().toISOString(),
      sendIntervalDays: FEATURED_POST_SEND_INTERVAL_DAYS,
      posts: posts.map((post) => {
        const imageUrls = post.imageUrls.length > 0
          ? post.imageUrls
          : post.imageUrl
            ? [post.imageUrl]
            : [];
        const localImagePaths = imageUrls
          .map((imageUrl) => toFeaturedImageLocalPath(imageUrl))
          .filter((imagePath): imagePath is string => Boolean(imagePath));

        return {
          id: post.id,
          title: post.title,
          summary: post.summary,
          content: post.content,
          address: post.address || null,
          roomType: post.roomType || null,
          priceLabel: post.priceLabel || null,
          imageUrls,
          imageUrl: getPrimaryImageUrl(imageUrls) || null,
          localImagePaths,
          localImagePath: localImagePaths[0] || null,
          actionLabel: post.actionLabel || FEATURED_POST_DEFAULT_ACTION_LABEL,
          actionUrl: post.actionUrl || null,
          routingKeywords: post.routingKeywords,
          createdByType: post.createdByType || "admin",
          createdById: post.createdById || null,
          createdByUsername: post.createdByUsername || null,
          createdByNickname: post.createdByNickname || null,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
        };
      }),
    };

    await writeFile(botFeedFile, JSON.stringify(payload, null, 2), "utf8");
  } catch (error) {
    console.error("[featured-posts.sync-bot]", error);
  }
}

async function persistFeaturedPosts(posts: FeaturedPostRecord[]) {
  const sortedPosts = [...posts].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );

  await setSiteSetting(FEATURED_POSTS_KEY, JSON.stringify(sortedPosts));
  await syncFeaturedPostsToBot(sortedPosts);
  await cleanupBotFeaturedScheduleState(sortedPosts);
  return sortedPosts;
}

async function saveFeaturedImageDataUrl(postId: string, imageDataUrl: string) {
  const match = imageDataUrl
    .trim()
    .match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);

  if (!match) {
    throw new Error("INVALID_FEATURED_IMAGE_FORMAT");
  }

  const mimeType = match[1];
  const fileBuffer = Buffer.from(match[2], "base64");

  if (fileBuffer.length === 0 || fileBuffer.length > MAX_FEATURED_IMAGE_SIZE_BYTES) {
    throw new Error("INVALID_FEATURED_IMAGE_SIZE");
  }

  const extension = mimeType === "image/png"
    ? "png"
    : mimeType === "image/webp"
      ? "webp"
      : "jpg";

  await mkdir(featuredUploadsDir, { recursive: true });

  const fileName = `featured-${postId}-${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;
  const destinationPath = path.join(featuredUploadsDir, fileName);

  await writeFile(destinationPath, fileBuffer);

  if (await fileExists(path.resolve(process.cwd(), "dist", "public"))) {
    await mkdir(distFeaturedUploadsDir, { recursive: true });
    await copyFile(destinationPath, path.join(distFeaturedUploadsDir, fileName));
  }

  return `/uploads/featured/${fileName}`;
}

async function saveFeaturedImageDataUrls(postId: string, imageDataUrls: string[]) {
  if (imageDataUrls.length > MAX_FEATURED_IMAGE_COUNT) {
    throw new Error("INVALID_FEATURED_IMAGE_COUNT");
  }

  const savedImageUrls: string[] = [];

  try {
    for (const [index, imageDataUrl] of imageDataUrls.entries()) {
      const savedImageUrl = await saveFeaturedImageDataUrl(`${postId}-${index + 1}`, imageDataUrl);
      savedImageUrls.push(savedImageUrl);
    }

    return savedImageUrls;
  } catch (error) {
    await removeFeaturedImageFiles(savedImageUrls);
    throw error;
  }
}

function getInputImageDataUrls(input: CreateFeaturedPostInput) {
  const imageDataUrls = Array.isArray(input.imageDataUrls)
    ? input.imageDataUrls.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];

  if (imageDataUrls.length > 0) {
    return imageDataUrls;
  }

  const legacyImageDataUrl = String(input.imageDataUrl ?? "").trim();
  return legacyImageDataUrl ? [legacyImageDataUrl] : [];
}

export function mapFeaturedPostForPublic(post: FeaturedPostRecord): FeaturedPostPublic {
  return {
    id: post.id,
    title: post.title,
    summary: post.summary,
    content: post.content,
    address: post.address,
    roomType: post.roomType,
    priceLabel: post.priceLabel,
    imageUrls: post.imageUrls,
    imageUrl: post.imageUrl || getPrimaryImageUrl(post.imageUrls),
    actionLabel: post.actionLabel,
    actionUrl: post.actionUrl,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

export async function listFeaturedPosts() {
  const row = await getSiteSetting(FEATURED_POSTS_KEY);

  if (!row?.settingValue) {
    return [] as FeaturedPostRecord[];
  }

  try {
    const parsed = JSON.parse(row.settingValue) as unknown[];
    const posts = Array.isArray(parsed)
      ? parsed
        .map(normalizeFeaturedPostRecord)
        .filter((post): post is FeaturedPostRecord => Boolean(post))
      : [];

    return posts.sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
  } catch (error) {
    console.error("[featured-posts.list]", error);
    return [] as FeaturedPostRecord[];
  }
}

export async function listFeaturedPostsForPublic() {
  const posts = await listFeaturedPosts();
  return posts.map(mapFeaturedPostForPublic);
}

export async function createFeaturedPost(input: CreateFeaturedPostInput) {
  const address = normalizeText(input.address, 240);
  const roomType = normalizeText(input.roomType, 80);
  const priceLabel = normalizeText(input.priceLabel, 80);
  const title = buildFeaturedPostTitle(roomType, address, normalizeText(input.title, 180));
  const summary = normalizeText(input.summary, 320) || priceLabel;
  const content = normalizeText(input.content, 6000);
  const routingKeywords = normalizeKeywords(input.routingKeywords);
  const actionLabel = normalizeActionLabel(input.actionLabel);
  const actionUrl = normalizeActionUrl(input.actionUrl);
  const imageDataUrls = getInputImageDataUrls(input);
  const createdByType = normalizeCreatedByType(input.createdByType);
  const createdByUsername = normalizeText(input.createdByUsername, 64) || undefined;
  const createdByNickname = normalizeText(input.createdByNickname, 120) || undefined;
  const createdById = Number(input.createdById);

  if (!title) {
    throw new Error("FEATURED_POST_TITLE_REQUIRED");
  }

  if (!content) {
    throw new Error("FEATURED_POST_CONTENT_REQUIRED");
  }

  if (!address) {
    throw new Error("FEATURED_POST_ADDRESS_REQUIRED");
  }

  if (!priceLabel) {
    throw new Error("FEATURED_POST_PRICE_REQUIRED");
  }

  if (routingKeywords.length === 0) {
    throw new Error("FEATURED_POST_KEYWORDS_REQUIRED");
  }

  if (imageDataUrls.length > MAX_FEATURED_IMAGE_COUNT) {
    throw new Error("INVALID_FEATURED_IMAGE_COUNT");
  }

  const id = `fp_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const imageUrls = imageDataUrls.length > 0
    ? await saveFeaturedImageDataUrls(id, imageDataUrls)
    : [];

  const post: FeaturedPostRecord = {
    id,
    title,
    summary,
    content,
    address,
    roomType,
    priceLabel,
    imageUrls,
    imageUrl: getPrimaryImageUrl(imageUrls),
    actionLabel,
    actionUrl,
    routingKeywords,
    createdByType,
    createdById: Number.isInteger(createdById) && createdById > 0 ? createdById : undefined,
    createdByUsername,
    createdByNickname,
    createdAt: now,
    updatedAt: now,
  };

  const existingPosts = await listFeaturedPosts();
  await persistFeaturedPosts([post, ...existingPosts]);

  return post;
}

export async function deleteFeaturedPost(postId: string) {
  const normalizedId = normalizeText(postId, 64);
  if (!normalizedId) {
    throw new Error("FEATURED_POST_ID_REQUIRED");
  }

  const existingPosts = await listFeaturedPosts();
  const removedPost = existingPosts.find((post) => post.id === normalizedId);
  const nextPosts = existingPosts.filter((post) => post.id !== normalizedId);

  if (nextPosts.length === existingPosts.length) {
    return false;
  }

  await persistFeaturedPosts(nextPosts);
  await removeFeaturedImageFiles(removedPost?.imageUrls || []);
  return true;
}
