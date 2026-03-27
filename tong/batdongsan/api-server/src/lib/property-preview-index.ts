import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PropertyPreview } from "../../../src/lib/property-preview-search";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const PROPERTY_INDEX_PATH_CANDIDATES = [
  path.resolve(process.cwd(), "public", "data", "properties", "index.json"),
  path.resolve(process.cwd(), "..", "public", "data", "properties", "index.json"),
  path.resolve(moduleDirectory, "..", "..", "..", "public", "data", "properties", "index.json"),
];

type PropertyPreviewIndexSnapshot = {
  filePath: string;
  mtimeMs: number;
  data: PropertyPreview[];
};

let propertyPreviewIndexCache: PropertyPreviewIndexSnapshot | null = null;
let propertyPreviewIndexPromise: Promise<PropertyPreviewIndexSnapshot> | null = null;

async function readPropertyPreviewIndexFromDisk() {
  let lastError: unknown;

  for (const candidatePath of PROPERTY_INDEX_PATH_CANDIDATES) {
    try {
      const [raw, fileStats] = await Promise.all([
        readFile(candidatePath, "utf8"),
        stat(candidatePath),
      ]);
      const parsed = JSON.parse(raw) as unknown;

      if (!Array.isArray(parsed)) {
        throw new Error(`Invalid property preview index at ${candidatePath}`);
      }

      return {
        filePath: candidatePath,
        mtimeMs: fileStats.mtimeMs,
        data: parsed as PropertyPreview[],
      } satisfies PropertyPreviewIndexSnapshot;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Cannot load property preview index.");
}

async function isCachedPropertyPreviewIndexFresh(snapshot: PropertyPreviewIndexSnapshot) {
  try {
    const fileStats = await stat(snapshot.filePath);
    return fileStats.mtimeMs === snapshot.mtimeMs;
  } catch {
    return false;
  }
}

export async function getPropertyPreviewIndex() {
  if (propertyPreviewIndexCache) {
    const isFresh = await isCachedPropertyPreviewIndexFresh(propertyPreviewIndexCache);
    if (isFresh) {
      return propertyPreviewIndexCache.data;
    }
  }

  if (!propertyPreviewIndexPromise) {
    propertyPreviewIndexPromise = readPropertyPreviewIndexFromDisk()
      .then((snapshot) => {
        propertyPreviewIndexCache = snapshot;
        return snapshot;
      })
      .finally(() => {
        propertyPreviewIndexPromise = null;
      });
  }

  const snapshot = await propertyPreviewIndexPromise;
  return snapshot.data;
}
