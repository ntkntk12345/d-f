import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export type PropertyDataInputDirectories = {
  fullDir: string;
  summaryDir: string;
  watchDirs: string[];
};

function resolveOverridePath(appRootDir: string, overrideValue: string | undefined) {
  if (!overrideValue) return null;
  return path.isAbsolute(overrideValue) ? overrideValue : path.resolve(appRootDir, overrideValue);
}

function isUsableJsonDirectory(directoryPath: string) {
  try {
    if (!existsSync(directoryPath)) {
      return false;
    }

    if (!statSync(directoryPath).isDirectory()) {
      return false;
    }

    return readdirSync(directoryPath).some((fileName) => fileName.toLowerCase().endsWith(".json"));
  } catch {
    return false;
  }
}

function resolveExistingDirectory(candidates: string[], label: string) {
  const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));

  for (const candidatePath of uniqueCandidates) {
    if (isUsableJsonDirectory(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error(
    `Cannot find a usable ${label} directory. Checked: ${uniqueCandidates.join(", ")}`,
  );
}

export function resolvePropertyDataInputDirs(appRootDir: string): PropertyDataInputDirectories {
  const workspaceRootDir = path.resolve(appRootDir, "..");
  const propertyDataRootOverride = resolveOverridePath(appRootDir, process.env.PROPERTY_DATA_ROOT);
  const fullDirOverride = resolveOverridePath(appRootDir, process.env.PROPERTY_FULL_DIR);
  const summaryDirOverride = resolveOverridePath(appRootDir, process.env.PROPERTY_SUMMARY_DIR);

  const fullDir = resolveExistingDirectory(
    [
      fullDirOverride || "",
      propertyDataRootOverride ? path.join(propertyDataRootOverride, "districts_full") : "",
      path.join(workspaceRootDir, "bot", "districts_full"),
      path.join(appRootDir, "districts_full"),
    ],
    "property full data",
  );

  const summaryDir = resolveExistingDirectory(
    [
      summaryDirOverride || "",
      propertyDataRootOverride ? path.join(propertyDataRootOverride, "districts_ok") : "",
      path.join(workspaceRootDir, "bot", "districts_ok"),
      path.join(appRootDir, "districts_ok"),
      propertyDataRootOverride ? path.join(propertyDataRootOverride, "districts_summary") : "",
      path.join(workspaceRootDir, "bot", "districts_summary"),
      path.join(appRootDir, "districts_summary"),
    ],
    "property summary data",
  );

  return {
    fullDir,
    summaryDir,
    watchDirs: Array.from(new Set([fullDir, summaryDir])),
  };
}
