import { promises as fs } from "node:fs";
import path from "node:path";
import {
  buildPropertyCollection,
  type DistrictSource,
  type Property,
  type RawDistrictSummary,
} from "../src/lib/property-normalizer.ts";
import {
  buildBichHaCommissionGroupId,
  buildBichHaCommissionIndex,
  extractBichHaCommissionInfo,
  type BichHaCommissionRecord,
} from "../src/lib/bichha-commission-search.ts";
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
const PUBLIC_OUTPUT_DIR = path.join(ROOT_DIR, "public", "data", "properties");
const PUBLIC_OUTPUT_DISTRICT_DIR = path.join(PUBLIC_OUTPUT_DIR, "districts");
const PRIVATE_COMMISSION_OUTPUT_DIR = path.join(ROOT_DIR, "data", "bichha-commissions");
const PRIVATE_COMMISSION_DISTRICT_DIR = path.join(PRIVATE_COMMISSION_OUTPUT_DIR, "districts");
const HOME_LATEST_SECTION_ITEM_LIMIT = 8;
const PUBLIC_OUTPUT_TOP_LEVEL_FILES = ["home.json", "manifest.json", "index.json"] as const;
const PRIVATE_COMMISSION_TOP_LEVEL_FILES = ["index.json"] as const;
const BUILD_LOCK_DIR = path.join(ROOT_DIR, ".property-data-build.lock");
const TEMP_BUILD_ROOT_DIR = path.join(ROOT_DIR, ".tmp-property-data");
const BUILD_LOCK_RETRY_MS = 500;
const BUILD_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

const DISTRICT_LABELS: Record<string, string> = {
  badinh: "Ba \u0110\u00ecnh",
  bactuliem: "B\u1eafc T\u1eeb Li\u00eam",
  caugiay: "C\u1ea7u Gi\u1ea5y",
  dongda: "\u0110\u1ed1ng \u0110a",
  hadong: "H\u00e0 \u0110\u00f4ng",
  haibatrung: "Hai B\u00e0 Tr\u01b0ng",
  hoaiduc: "Ho\u00e0i \u0110\u1ee9c",
  hoangmai: "Ho\u00e0ng Mai",
  hoankiem: "Ho\u00e0n Ki\u1ebfm",
  khaicute: "Khaicute",
  longbien: "Long Bi\u00ean",
  mydinh: "M\u1ef9 \u0110\u00ecnh",
  namtuliem: "Nam T\u1eeb Li\u00eam",
  tayho: "T\u00e2y H\u1ed3",
  thanhtri: "Thanh Tr\u00ec",
  thanhxuan: "Thanh Xu\u00e2n",
};

const DISTRICT_CANONICAL_LABELS: Record<string, string> = {
  "ba dinh": "Ba \u0110\u00ecnh",
  "bac tu liem": "B\u1eafc T\u1eeb Li\u00eam",
  "cau giay": "C\u1ea7u Gi\u1ea5y",
  "dong da": "\u0110\u1ed1ng \u0110a",
  "ha dong": "H\u00e0 \u0110\u00f4ng",
  "hai ba trung": "Hai B\u00e0 Tr\u01b0ng",
  "hoai duc": "Ho\u00e0i \u0110\u1ee9c",
  "hoang mai": "Ho\u00e0ng Mai",
  "hoan kiem": "Ho\u00e0n Ki\u1ebfm",
  "long bien": "Long Bi\u00ean",
  "my dinh": "M\u1ef9 \u0110\u00ecnh",
  "nam tu liem": "Nam T\u1eeb Li\u00eam",
  "tay ho": "T\u00e2y H\u1ed3",
  "thanh tri": "Thanh Tr\u00ec",
  "thanh xuan": "Thanh Xu\u00e2n",
};

const PROVINCE_CANONICAL_LABELS: Record<string, string> = {
  "ha noi": "H\u00e0 N\u1ed9i",
};

const ROOM_TYPE_CANONICAL_LABELS: Record<string, string> = {
  studio: "Studio",
  "1k1n": "1N1K",
  "1n1k": "1N1K",
  "1n1k1b": "1N1K",
  "1n1b": "1N1B",
  "2n1b": "2N1B",
  "2n1k": "2N1K",
  "3n1k": "3N1K",
  "1 ngu": "1 ng\u1ee7",
  "2 ngu": "2 ng\u1ee7",
  "gac xep": "G\u00e1c x\u1ebfp",
  "giuong tang": "Gi\u01b0\u1eddng t\u1ea7ng",
  vsc: "VSC",
  vskk: "VSKK",
  "don vskk": "VSKK",
};

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

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function canonicalizeLabel(
  value: string | null | undefined,
  labelMap: Record<string, string>,
) {
  const trimmedValue = collapseWhitespace(value || "");
  if (!trimmedValue) return null;

  return labelMap[normalizeSearchText(trimmedValue)] || trimmedValue;
}

function canonicalizeDistrictLabel(value: string | null | undefined) {
  return canonicalizeLabel(value, DISTRICT_CANONICAL_LABELS);
}

function canonicalizeProvinceLabel(value: string | null | undefined) {
  return canonicalizeLabel(value, PROVINCE_CANONICAL_LABELS);
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

function fileNameToDistrictKey(sourceFile: string) {
  return sourceFile.split("/").pop()?.replace(/\.json$/i, "") || sourceFile;
}

function toPropertyLookupKey(sourceFile: string, rawId: string) {
  return `${sourceFile}:${rawId}`;
}

function parseMoneyToMillions(value: string | number | null | undefined): number | null {
  if (value == null) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const compact = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/trieu/g, "tr")
    .replace(/nghin/g, "k")
    .replace(/\s+/g, "")
    .replace(/,/g, ".");

  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(raw.replace(/\s+/g, ""))) {
    const numeric = Number.parseInt(raw.replace(/[^\d]/g, ""), 10);
    return Number.isNaN(numeric) ? null : Number.parseFloat((numeric / 1_000_000).toFixed(2));
  }

  if (compact.includes("ty")) {
    const [major, minor = ""] = compact.split("ty");
    const base = Number.parseFloat(major || "0");
    if (Number.isNaN(base)) return null;
    const fraction = minor ? Number.parseFloat(`0.${minor}`) : 0;
    return Number.parseFloat(((base + fraction) * 1000).toFixed(2));
  }

  if (compact.includes("tr")) {
    const [major, minor = ""] = compact.split("tr");
    const base = Number.parseFloat(major || "0");
    if (Number.isNaN(base)) return null;
    if (!minor) return Number.parseFloat(base.toFixed(2));
    const divider = minor.length === 1 ? 10 : 100;
    return Number.parseFloat((base + Number.parseFloat(minor) / divider).toFixed(2));
  }

  if (compact.endsWith("k")) {
    const base = Number.parseFloat(compact.slice(0, -1));
    return Number.isNaN(base) ? null : Number.parseFloat((base / 1000).toFixed(2));
  }

  const parsed = Number.parseFloat(compact);
  if (Number.isNaN(parsed)) return null;
  if (parsed > 1000) {
    return Number.parseFloat((parsed / 1_000_000).toFixed(2));
  }

  return Number.parseFloat(parsed.toFixed(2));
}

function extractAreaFromText(text: string): number | null {
  const areaMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:-|to)?\s*(\d+(?:[.,]\d+)?)?\s*m(?:2|²)/i);
  if (!areaMatch) return null;

  const min = Number.parseFloat(areaMatch[1].replace(",", "."));
  const max = areaMatch[2] ? Number.parseFloat(areaMatch[2].replace(",", ".")) : min;

  if (Number.isNaN(min)) return null;
  if (Number.isNaN(max)) return Number.parseFloat(min.toFixed(2));

  return Number.parseFloat((((min + max) / 2)).toFixed(2));
}

function normalizeRoomTypeLabel(value: string | null | undefined) {
  const normalized = normalizeSearchText(value || "");

  if (!normalized) return null;
  if (normalized === "null" || normalized === "undefined") return null;

  if (ROOM_TYPE_CANONICAL_LABELS[normalized]) {
    return ROOM_TYPE_CANONICAL_LABELS[normalized];
  }

  return detectRoomTypeFromText(value || "");
}

function detectRoomTypeFromText(text: string) {
  const normalized = normalizeSearchText(text);

  if (normalized.includes("3n1k")) return "3N1K";
  if (normalized.includes("2n1b")) return "2N1B";
  if (normalized.includes("2n1k")) return "2N1K";
  if (normalized.includes("1n1k1b") || normalized.includes("1k1n")) return "1N1K";
  if (normalized.includes("1n1k")) return "1N1K";
  if (normalized.includes("1n1b")) return "1N1B";
  if (normalized.includes("studio")) return "Studio";
  if (normalized.includes("gac xep") || normalized.includes("duplex") || normalized.includes("loft")) {
    return "G\u00e1c x\u1ebfp";
  }
  if (normalized.includes("giuong tang") || normalized.includes("ktx") || normalized.includes("bedspace")) {
    return "Gi\u01b0\u1eddng t\u1ea7ng";
  }
  if (normalized.includes("2 phong ngu") || normalized.includes("2 ngu")) return "2 ng\u1ee7";
  if (normalized.includes("1 phong ngu") || normalized.includes("1 ngu")) return "1 ng\u1ee7";
  if (normalized.includes("don vskk") || normalized.includes("vskk")) return "VSKK";
  if (normalized.includes("vsc")) return "VSC";

  return null;
}

function extractAddressFromText(text: string) {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/^(?:[🏠🏡🏪📍]|(?:dia chi|địa chỉ)\b|dc\b)/iu.test(line)) {
      const parts = line.split(/[:\-]/);
      if (parts.length > 1) {
        const value = collapseWhitespace(parts.slice(1).join(" "));
        if (value) return value;
      }

      return collapseWhitespace(line.replace(/^(?:[🏠🏡🏪📍]\s*)?((?:dia chi|địa chỉ|dc)\s*:?)/iu, ""));
    }
  }

  return null;
}

function buildCommissionRecordTitle(input: {
  address: string;
  district: string;
  roomType: string | null;
  price: number | null;
  area: number | null;
}) {
  const roomLabel = input.roomType || "Phong tro";
  const areaLabel = input.area != null && input.area > 0 ? `${input.area}m2` : "";
  const priceLabel = input.price != null && input.price > 0 ? `${input.price} trieu/thang` : "";

  return [roomLabel, areaLabel, input.district, priceLabel || input.address].filter(Boolean).join(" - ");
}

function buildCommissionSearchHaystack(input: {
  title: string;
  address: string;
  district: string;
  province: string;
  roomType: string | null;
  sourceSymbol: string | null;
  commissionLabel: string;
  commissionScope: string;
  rawText: string;
}) {
  return normalizeSearchText(
    [
      input.title,
      input.address,
      input.district,
      input.province,
      input.roomType || "",
      input.sourceSymbol || "",
      input.commissionLabel,
      input.commissionScope,
      input.rawText,
    ].join(" "),
  );
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
          readJsonFile<DistrictSource["fullRecords"]>(path.join(FULL_DISTRICT_DIR, fileName)),
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

function buildPropertyLookup(properties: Property[]) {
  return new Map(
    properties.map((property) => [
      toPropertyLookupKey(property.sourceFile, String(property.sourceRawId)),
      property,
    ]),
  );
}

function buildCommissionRecords(
  districtSources: DistrictSource[],
  propertyLookup: Map<string, Property>,
) {
  const recordsByDistrict = new Map<string, BichHaCommissionRecord[]>();

  for (const source of districtSources) {
    const districtKey = fileNameToDistrictKey(source.sourceFile);
    const districtLabel = DISTRICT_LABELS[districtKey] || districtKey;
    const summaryById = new Map(
      (source.summaryRecords || []).map((record) => [String(record.id), record] as const),
    );

    for (const record of source.fullRecords) {
      const sourceRawId = String(record.id || "");
      const summary = summaryById.get(sourceRawId);
      const rawText = String(
        record.original_text
        || summary?.original_raw_text
        || record.text
        || summary?.raw_text
        || "",
      )
        .replace(/\r/g, "")
        .trim();

      if (!rawText) continue;

      const commissionInfo = extractBichHaCommissionInfo(rawText);
      if (!commissionInfo) continue;

      const property = propertyLookup.get(toPropertyLookupKey(source.sourceFile, sourceRawId));
      const address =
        property?.address
        || collapseWhitespace(String(summary?.address || "").trim())
        || extractAddressFromText(rawText)
        || "Dang cap nhat";
      const roomType =
        normalizeRoomTypeLabel(property?.roomType)
        || normalizeRoomTypeLabel(summary?.type)
        || detectRoomTypeFromText(rawText);
      const priceFrom = property?.priceFrom ?? parseMoneyToMillions(summary?.price1 ?? summary?.price);
      const priceTo = property?.priceTo ?? parseMoneyToMillions(summary?.price2 ?? summary?.price1 ?? summary?.price);
      const price = property?.price ?? priceFrom ?? priceTo;
      const area = property?.area && property.area > 0 ? property.area : extractAreaFromText(rawText);
      const district = canonicalizeDistrictLabel(property?.district || districtLabel) || districtLabel;
      const province =
        canonicalizeProvinceLabel(property?.province || "H\u00e0 N\u1ed9i")
        || "H\u00e0 N\u1ed9i";
      const propertyImages = property?.images?.slice(0, 4) || [];
      const fallbackImages = (record.photos || []).map((photo) => photo.url).filter(Boolean).slice(0, 4);
      const images = propertyImages.length > 0 ? propertyImages : fallbackImages;
      const imageUrl = images[0] || (record.videos || []).map((video) => video.thumb).find(Boolean) || null;
      const title = property?.title || buildCommissionRecordTitle({
        address,
        district,
        roomType,
        price,
        area,
      });
      const fallbackPostedMs =
        typeof record.timestamp === "number" && record.timestamp > 0
          ? record.timestamp * 1000
          : Number.parseInt(sourceRawId, 10) || Date.now();
      const postedAt = property?.postedAt || new Date(fallbackPostedMs).toISOString();
      const sourceSymbol = record.symbol || property?.sourceSymbol || null;
      const groupId = buildBichHaCommissionGroupId({
        districtKey,
        address,
        roomType,
        priceFrom: priceFrom ?? null,
        priceTo: priceTo ?? priceFrom ?? null,
        area: area ?? null,
        rawText,
      });

      const commissionRecord: BichHaCommissionRecord = {
        id: sourceRawId,
        groupId,
        propertyId: property?.id ?? null,
        propertyUrl: property ? `/property/${property.id}` : null,
        title,
        address,
        province,
        district,
        districtKey,
        roomType,
        price: price ?? null,
        priceFrom: priceFrom ?? null,
        priceTo: priceTo ?? priceFrom ?? null,
        area: area ?? null,
        imageUrl,
        images,
        sourceFile: source.sourceFile,
        sourceSymbol,
        sourceRawId,
        commissionLabel: commissionInfo.label,
        commissionScope: commissionInfo.scope,
        commissionUnit: commissionInfo.unit,
        commissionValue: commissionInfo.value,
        commissionMin: commissionInfo.min,
        commissionMax: commissionInfo.max,
        rawText,
        postedAt,
        searchHaystack: buildCommissionSearchHaystack({
          title,
          address,
          district,
          province,
          roomType,
          sourceSymbol,
          commissionLabel: commissionInfo.label,
          commissionScope: commissionInfo.scope,
          rawText,
        }),
      };

      const districtRecords = recordsByDistrict.get(districtKey) || [];
      districtRecords.push(commissionRecord);
      recordsByDistrict.set(districtKey, districtRecords);
    }
  }

  const sortedRecordsByDistrict = new Map(
    Array.from(recordsByDistrict.entries()).map(([districtKey, records]) => [
      districtKey,
      records.slice().sort((left, right) => {
        if (right.commissionValue !== left.commissionValue) {
          return right.commissionValue - left.commissionValue;
        }

        return new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime();
      }),
    ]),
  );

  return {
    allRecords: Array.from(sortedRecordsByDistrict.values()).flat(),
    recordsByDistrict: sortedRecordsByDistrict,
  };
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

async function syncJsonDirectory(sourceDir: string, targetDir: string) {
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

async function removeStaleTopLevelEntries(outputDir: string, expectedTopLevelFiles: readonly string[]) {
  const expectedEntries = new Set<string>(["districts", ...expectedTopLevelFiles]);
  const currentEntries = await fs.readdir(outputDir, { withFileTypes: true }).catch(() => []);

  for (const entry of currentEntries) {
    if (!expectedEntries.has(entry.name)) {
      await fs.rm(path.join(outputDir, entry.name), { recursive: true, force: true });
    }
  }
}

async function syncGeneratedOutput(
  tempOutputDir: string,
  targetDir: string,
  targetDistrictDir: string,
  topLevelFiles: readonly string[],
) {
  const tempDistrictDir = path.join(tempOutputDir, "districts");

  await syncJsonDirectory(tempDistrictDir, targetDistrictDir);

  for (const fileName of topLevelFiles) {
    await copyFileIntoPlace(path.join(tempOutputDir, fileName), path.join(targetDir, fileName));
  }

  await removeStaleTopLevelEntries(targetDir, topLevelFiles);
}

async function main() {
  let tempBuildDir: string | null = null;
  let buildLockAcquired = false;

  try {
    await acquireBuildLock();
    buildLockAcquired = true;

    const districtSources = await loadDistrictSources();
    const generatedAt = new Date().toISOString();
    const allProperties = buildPropertyCollection(districtSources);
    const propertyLookup = buildPropertyLookup(allProperties);
    const propertyIndex = allProperties.map(toPropertyPreview);
    const propertyManifest = Object.fromEntries(
      allProperties.map((property) => [String(property.id), property.districtKey]),
    );
    const latestSections = buildLatestSections(propertyIndex);
    const availableDistricts = buildAvailableDistricts(propertyIndex);
    const locationSuggestions = buildLocationSuggestions(propertyIndex);
    const {
      allRecords: commissionRecords,
      recordsByDistrict: commissionRecordsByDistrict,
    } = buildCommissionRecords(districtSources, propertyLookup);
    const commissionIndex = buildBichHaCommissionIndex(commissionRecords, generatedAt);
    const propertiesByDistrict = allProperties.reduce((groups, property) => {
      const currentDistrictProperties = groups.get(property.districtKey) || [];
      currentDistrictProperties.push(property);
      groups.set(property.districtKey, currentDistrictProperties);
      return groups;
    }, new Map<string, Property[]>());

    tempBuildDir = path.join(TEMP_BUILD_ROOT_DIR, `properties-${process.pid}-${Date.now()}`);
    const tempPublicOutputDir = path.join(tempBuildDir, "properties");
    const tempPublicOutputDistrictDir = path.join(tempPublicOutputDir, "districts");
    const tempPrivateCommissionOutputDir = path.join(tempBuildDir, "bichha-commissions");
    const tempPrivateCommissionDistrictDir = path.join(tempPrivateCommissionOutputDir, "districts");

    await fs.rm(tempBuildDir, { recursive: true, force: true });
    await Promise.all([
      fs.mkdir(tempPublicOutputDistrictDir, { recursive: true }),
      fs.mkdir(tempPrivateCommissionDistrictDir, { recursive: true }),
    ]);

    await Promise.all([
      writeJsonFile(path.join(tempPublicOutputDir, "index.json"), propertyIndex),
      writeJsonFile(
        path.join(tempPublicOutputDir, "home.json"),
        {
          availableDistricts,
          locationSuggestions,
          latestSections,
        },
      ),
      writeJsonFile(path.join(tempPublicOutputDir, "manifest.json"), propertyManifest),
      writeJsonFile(path.join(tempPrivateCommissionOutputDir, "index.json"), commissionIndex),
    ]);

    await Promise.all(
      Array.from(propertiesByDistrict.entries()).map(([districtKey, districtProperties]) =>
        writeJsonFile(path.join(tempPublicOutputDistrictDir, `${districtKey}.json`), districtProperties),
      ),
    );

    await Promise.all(
      Array.from(commissionRecordsByDistrict.entries()).map(([districtKey, districtRecords]) =>
        writeJsonFile(path.join(tempPrivateCommissionDistrictDir, `${districtKey}.json`), districtRecords),
      ),
    );

    await Promise.all([
      syncGeneratedOutput(
        tempPublicOutputDir,
        PUBLIC_OUTPUT_DIR,
        PUBLIC_OUTPUT_DISTRICT_DIR,
        PUBLIC_OUTPUT_TOP_LEVEL_FILES,
      ),
      syncGeneratedOutput(
        tempPrivateCommissionOutputDir,
        PRIVATE_COMMISSION_OUTPUT_DIR,
        PRIVATE_COMMISSION_DISTRICT_DIR,
        PRIVATE_COMMISSION_TOP_LEVEL_FILES,
      ),
    ]);

    console.log(
      JSON.stringify(
        {
          properties: allProperties.length,
          districts: propertiesByDistrict.size,
          commissionRecords: commissionIndex.totalRecords,
          commissionGroups: commissionIndex.totalGroups,
          publicOutputDir: path.relative(ROOT_DIR, PUBLIC_OUTPUT_DIR),
          privateCommissionOutputDir: path.relative(ROOT_DIR, PRIVATE_COMMISSION_OUTPUT_DIR),
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
