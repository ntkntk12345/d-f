import { promises as fs } from "node:fs";
import path from "node:path";
import {
  buildPropertyCollection,
  type DistrictSource,
  type Property,
  type RawDistrictProperty,
  type RawDistrictSummary,
} from "../src/lib/property-normalizer.ts";
import { resolvePropertyDataInputDirs } from "./property-data-paths.ts";

type PropertyPreview = {
  id: number;
  title: string;
  type: string;
  category: string;
  price: number;
  priceFrom: number | null;
  priceTo: number | null;
  priceUnit: string;
  area: number;
  address: string;
  province: string;
  district: string;
  districtKey: string;
  roomType: string | null;
  images: string[];
  contactLink: string;
  isFeatured: boolean;
  isVerified: boolean;
  postedAt: string;
  views: number;
  pricePerSqm?: number | null;
  searchHaystack: string;
  roomTypeHaystack: string;
  provinceSlug: string;
  districtSlug: string;
};

type SearchSuggestion = {
  label: string;
  district: string;
  province: string;
  searchValue: string;
};

type HomePropertySection = {
  key: string;
  title: string;
  subtitle: string;
  href: string;
  items: PropertyPreview[];
};

const ROOT_DIR = path.resolve(import.meta.dirname, "..");
const PROPERTY_DATA_DIRS = resolvePropertyDataInputDirs(ROOT_DIR);
const FULL_DISTRICT_DIR = PROPERTY_DATA_DIRS.fullDir;
const SUMMARY_DISTRICT_DIR = PROPERTY_DATA_DIRS.summaryDir;
const OUTPUT_DIR = path.join(ROOT_DIR, "public", "data", "properties");
const OUTPUT_DISTRICT_DIR = path.join(OUTPUT_DIR, "districts");
const HOME_LATEST_SECTION_ITEM_LIMIT = 8;
const OUTPUT_TOP_LEVEL_FILES = ["home.json", "manifest.json", "index.json"] as const;
const BUILD_LOCK_DIR = path.join(ROOT_DIR, ".property-data-build.lock");
const TEMP_BUILD_ROOT_DIR = path.join(ROOT_DIR, ".tmp-property-data");
const BUILD_LOCK_RETRY_MS = 500;
const BUILD_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

const LATEST_PRICE_BUCKETS = [
  { key: "4-5", label: "4-5 trieu", min: 4, max: 5 },
  { key: "5-7", label: "5-7 trieu", min: 5, max: 7 },
  { key: "7-10", label: "7-10 trieu", min: 7, max: 10 },
  { key: "10-plus", label: "Tren 10 trieu", min: 10 },
  { key: "3-4", label: "3-4 trieu", min: 3, max: 4 },
  { key: "2-3", label: "2-3 trieu", min: 2, max: 3 },
  { key: "under-2", label: "Duoi 2 trieu", max: 2 },
];

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\u0111/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatGroupTitle(value: string) {
  const normalized = value.trim().toLowerCase();
  const titleMap: Record<string, string> = {
    studio: "Studio",
    "gac xep": "Gac xep",
    "giuong tang": "Giuong tang",
    "1n1k": "1N1K",
    "2n1k": "2N1K",
  };

  if (titleMap[normalized]) return titleMap[normalized];

  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatCategoryTitle(value: string) {
  const titleMap: Record<string, string> = {
    "phong-tro": "Phong tro",
    studio: "Studio",
    "nha-nguyen-can": "Nha nguyen can",
    "o-ghep": "O ghep",
    "mat-bang": "Mat bang kinh doanh",
  };

  return titleMap[value] || formatGroupTitle(value.replace(/-/g, " "));
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const fileContents = await fs.readFile(filePath, "utf8");
  return JSON.parse(fileContents) as T;
}

async function loadDistrictSources(): Promise<DistrictSource[]> {
  const [fullDistrictFiles, summaryDistrictFiles] = await Promise.all([
    fs.readdir(FULL_DISTRICT_DIR),
    fs.readdir(SUMMARY_DISTRICT_DIR),
  ]);

  const summaryFileSet = new Set(summaryDistrictFiles.filter((fileName) => fileName.endsWith(".json")));
  const districtSources = await Promise.all(
    fullDistrictFiles
      .filter((fileName) => fileName.endsWith(".json"))
      .sort((left, right) => left.localeCompare(right))
      .map(async (fileName) => {
        const [fullRecords, summaryRecords] = await Promise.all([
          readJsonFile<RawDistrictProperty[]>(path.join(FULL_DISTRICT_DIR, fileName)),
          summaryFileSet.has(fileName)
            ? readJsonFile<RawDistrictSummary[]>(path.join(SUMMARY_DISTRICT_DIR, fileName))
            : Promise.resolve([]),
        ]);

        return {
          sourceFile: `../../districts_full/${fileName}`,
          fullRecords,
          summaryRecords,
        } satisfies DistrictSource;
      }),
  );

  return districtSources;
}

function toPropertyPreview(property: Property): PropertyPreview {
  return {
    id: property.id,
    title: property.title,
    type: property.type,
    category: property.category,
    price: property.price,
    priceFrom: property.priceFrom,
    priceTo: property.priceTo,
    priceUnit: property.priceUnit,
    area: property.area,
    address: property.address,
    province: property.province,
    district: property.district,
    districtKey: property.districtKey,
    roomType: property.roomType,
    images: property.images.slice(0, 4),
    contactLink: property.contactLink,
    isFeatured: property.isFeatured,
    isVerified: property.isVerified,
    postedAt: property.postedAt,
    views: property.views,
    pricePerSqm: property.pricePerSqm,
    searchHaystack: normalizeSearchText(
      [
        property.title,
        property.address,
        property.description,
        property.district,
        property.province,
        property.roomType || "",
        ...(property.sourceKeywords || []),
      ].join(" "),
    ),
    roomTypeHaystack: normalizeSearchText(`${property.roomType || ""}\n${property.description}`),
    provinceSlug: normalizeSearchText(property.province),
    districtSlug: normalizeSearchText(property.district),
  };
}

function buildAvailableDistricts(properties: PropertyPreview[]) {
  return Array.from(new Set(properties.map((property) => property.district)))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function buildLocationSuggestions(properties: PropertyPreview[]): SearchSuggestion[] {
  const seen = new Set<string>();
  const suggestions: SearchSuggestion[] = [];

  for (const property of properties) {
    const labels = [
      property.address?.trim(),
      [property.district, property.province].filter(Boolean).join(", "),
      property.district?.trim(),
    ];

    for (const rawLabel of labels) {
      if (!rawLabel) continue;

      const label = rawLabel.replace(/\s+/g, " ").trim();
      const searchValue = normalizeSearchText(label);

      if (!searchValue || seen.has(searchValue)) continue;

      seen.add(searchValue);
      suggestions.push({
        label,
        district: property.district,
        province: property.province,
        searchValue,
      });
    }
  }

  return suggestions;
}

function buildLatestSections(properties: PropertyPreview[]): HomePropertySection[] {
  return Array.from(
    properties
      .filter((property) => property.type === "cho-thue")
      .reduce((sections, property) => {
        const baseKey = property.roomType?.trim()
          ? `roomType:${property.roomType.trim()}`
          : `category:${property.category.trim()}`;
        const baseTitle = property.roomType?.trim()
          ? formatGroupTitle(property.roomType.trim())
          : formatCategoryTitle(property.category.trim());

        const bucket = LATEST_PRICE_BUCKETS.find((item) => {
          if (item.min != null && property.price < item.min) return false;
          if (item.max != null && property.price > item.max) return false;
          return true;
        });

        if (!bucket) return sections;

        const sectionKey = `${baseKey}:${bucket.key}`;
        const currentSection = sections.get(sectionKey) || {
          key: sectionKey,
          title: `${baseTitle} - ${bucket.label}`,
          subtitle: "",
          href: property.roomType?.trim()
            ? `/search?type=cho-thue&roomType=${encodeURIComponent(property.roomType.trim())}${bucket.min != null ? `&priceMin=${bucket.min}` : ""}${bucket.max != null ? `&priceMax=${bucket.max}` : ""}`
            : `/search?type=cho-thue&category=${property.category.trim()}${bucket.min != null ? `&priceMin=${bucket.min}` : ""}${bucket.max != null ? `&priceMax=${bucket.max}` : ""}`,
          items: [] as PropertyPreview[],
        };

        currentSection.items.push(property);
        sections.set(sectionKey, currentSection);
        return sections;
      }, new Map<string, HomePropertySection>()),
  )
    .map(([, section]) => ({
      ...section,
      subtitle: `${section.items.length} tin moi`,
      items: section.items.slice(0, HOME_LATEST_SECTION_ITEM_LIMIT),
    }))
    .sort((left, right) => {
      const leftBucketIndex = LATEST_PRICE_BUCKETS.findIndex((bucket) => left.key.endsWith(`:${bucket.key}`));
      const rightBucketIndex = LATEST_PRICE_BUCKETS.findIndex((bucket) => right.key.endsWith(`:${bucket.key}`));

      if (leftBucketIndex !== rightBucketIndex) return leftBucketIndex - rightBucketIndex;
      return right.items.length - left.items.length;
    });
}

async function writeJsonFile(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireBuildLock() {
  const deadline = Date.now() + BUILD_LOCK_TIMEOUT_MS;

  while (true) {
    try {
      await fs.mkdir(BUILD_LOCK_DIR);
      return;
    } catch (error) {
      const errorCode = (error as NodeJS.ErrnoException).code;

      if (errorCode !== "EEXIST") {
        throw error;
      }

      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for property data build lock at ${BUILD_LOCK_DIR}`);
      }

      await sleep(BUILD_LOCK_RETRY_MS);
    }
  }
}

async function releaseBuildLock() {
  await fs.rm(BUILD_LOCK_DIR, { recursive: true, force: true });
}

async function copyFileIntoPlace(sourcePath: string, targetPath: string) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}

async function syncDistrictOutput(sourceDir: string, targetDir: string) {
  await fs.mkdir(targetDir, { recursive: true });

  const [sourceEntries, targetEntries] = await Promise.all([
    fs.readdir(sourceDir, { withFileTypes: true }),
    fs.readdir(targetDir, { withFileTypes: true }).catch(() => []),
  ]);

  const sourceFileEntries = sourceEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name));
  const sourceFileNames = new Set(sourceFileEntries.map((entry) => entry.name));

  for (const entry of sourceFileEntries) {
    await copyFileIntoPlace(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
  }

  for (const entry of targetEntries) {
    if (!sourceFileNames.has(entry.name)) {
      await fs.rm(path.join(targetDir, entry.name), { recursive: true, force: true });
    }
  }
}

async function removeStaleTopLevelEntries(outputDir: string) {
  const expectedEntries = new Set<string>(["districts", ...OUTPUT_TOP_LEVEL_FILES]);
  const currentEntries = await fs.readdir(outputDir, { withFileTypes: true }).catch(() => []);

  for (const entry of currentEntries) {
    if (!expectedEntries.has(entry.name)) {
      await fs.rm(path.join(outputDir, entry.name), { recursive: true, force: true });
    }
  }
}

async function syncGeneratedOutput(tempOutputDir: string) {
  const tempDistrictDir = path.join(tempOutputDir, "districts");

  await syncDistrictOutput(tempDistrictDir, OUTPUT_DISTRICT_DIR);

  for (const fileName of OUTPUT_TOP_LEVEL_FILES) {
    await copyFileIntoPlace(path.join(tempOutputDir, fileName), path.join(OUTPUT_DIR, fileName));
  }

  await removeStaleTopLevelEntries(OUTPUT_DIR);
}

async function main() {
  let tempBuildDir: string | null = null;
  let buildLockAcquired = false;

  try {
    await acquireBuildLock();
    buildLockAcquired = true;

    const districtSources = await loadDistrictSources();
    const allProperties = buildPropertyCollection(districtSources);
    const propertyIndex = allProperties.map(toPropertyPreview);
    const propertyManifest = Object.fromEntries(
      allProperties.map((property) => [String(property.id), property.districtKey]),
    );
    const latestSections = buildLatestSections(propertyIndex);
    const availableDistricts = buildAvailableDistricts(propertyIndex);
    const locationSuggestions = buildLocationSuggestions(propertyIndex);
    const propertiesByDistrict = allProperties.reduce((groups, property) => {
      const currentDistrictProperties = groups.get(property.districtKey) || [];
      currentDistrictProperties.push(property);
      groups.set(property.districtKey, currentDistrictProperties);
      return groups;
    }, new Map<string, Property[]>());

    tempBuildDir = path.join(TEMP_BUILD_ROOT_DIR, `properties-${process.pid}-${Date.now()}`);
    const tempOutputDir = path.join(tempBuildDir, "properties");
    const tempOutputDistrictDir = path.join(tempOutputDir, "districts");

    await fs.rm(tempBuildDir, { recursive: true, force: true });
    await fs.mkdir(tempOutputDistrictDir, { recursive: true });

    await Promise.all([
      writeJsonFile(path.join(tempOutputDir, "index.json"), propertyIndex),
      writeJsonFile(
        path.join(tempOutputDir, "home.json"),
        {
          availableDistricts,
          locationSuggestions,
          latestSections,
        },
      ),
      writeJsonFile(path.join(tempOutputDir, "manifest.json"), propertyManifest),
    ]);

    await Promise.all(
      Array.from(propertiesByDistrict.entries()).map(([districtKey, districtProperties]) =>
        writeJsonFile(path.join(tempOutputDistrictDir, `${districtKey}.json`), districtProperties),
      ),
    );

    await syncGeneratedOutput(tempOutputDir);

    console.log(
      JSON.stringify(
        {
          properties: allProperties.length,
          districts: propertiesByDistrict.size,
          outputDir: path.relative(ROOT_DIR, OUTPUT_DIR),
          inputDirs: {
            full: path.relative(ROOT_DIR, FULL_DISTRICT_DIR),
            summary: path.relative(ROOT_DIR, SUMMARY_DISTRICT_DIR),
          },
          refreshMode: "staged-sync",
        },
        null,
        2,
      ),
    );
  } finally {
    if (tempBuildDir) {
      await fs.rm(tempBuildDir, { recursive: true, force: true }).catch(() => undefined);
    }

    if (buildLockAcquired) {
      await releaseBuildLock().catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
