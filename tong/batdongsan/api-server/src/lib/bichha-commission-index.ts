import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BichHaCommissionIndex } from "../../../src/lib/bichha-commission-search";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const COMMISSION_INDEX_PATH_CANDIDATES = [
  path.resolve(process.cwd(), "data", "bichha-commissions", "index.json"),
  path.resolve(process.cwd(), "..", "data", "bichha-commissions", "index.json"),
  path.resolve(moduleDirectory, "..", "..", "..", "data", "bichha-commissions", "index.json"),
];

type BichHaCommissionIndexSnapshot = {
  filePath: string;
  mtimeMs: number;
  data: BichHaCommissionIndex;
};

let bichHaCommissionIndexCache: BichHaCommissionIndexSnapshot | null = null;
let bichHaCommissionIndexPromise: Promise<BichHaCommissionIndexSnapshot> | null = null;

async function readBichHaCommissionIndexFromDisk() {
  let lastError: unknown;

  for (const candidatePath of COMMISSION_INDEX_PATH_CANDIDATES) {
    try {
      const [raw, fileStats] = await Promise.all([
        readFile(candidatePath, "utf8"),
        stat(candidatePath),
      ]);
      const parsed = JSON.parse(raw) as unknown;

      if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as BichHaCommissionIndex).groups)) {
        throw new Error(`Invalid bichha commission index at ${candidatePath}`);
      }

      return {
        filePath: candidatePath,
        mtimeMs: fileStats.mtimeMs,
        data: parsed as BichHaCommissionIndex,
      } satisfies BichHaCommissionIndexSnapshot;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Cannot load bichha commission index.");
}

async function isCachedBichHaCommissionIndexFresh(snapshot: BichHaCommissionIndexSnapshot) {
  try {
    const fileStats = await stat(snapshot.filePath);
    return fileStats.mtimeMs === snapshot.mtimeMs;
  } catch {
    return false;
  }
}

export async function getBichHaCommissionIndex() {
  if (bichHaCommissionIndexCache) {
    const isFresh = await isCachedBichHaCommissionIndexFresh(bichHaCommissionIndexCache);
    if (isFresh) {
      return bichHaCommissionIndexCache.data;
    }
  }

  if (!bichHaCommissionIndexPromise) {
    bichHaCommissionIndexPromise = readBichHaCommissionIndexFromDisk()
      .then((snapshot) => {
        bichHaCommissionIndexCache = snapshot;
        return snapshot;
      })
      .finally(() => {
        bichHaCommissionIndexPromise = null;
      });
  }

  const snapshot = await bichHaCommissionIndexPromise;
  return snapshot.data;
}
