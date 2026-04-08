export interface RawPropertyPhoto {
  url: string;
  width?: number;
  height?: number;
  timestamp?: number;
  mid?: string;
}

export interface RawPropertyVideo {
  url: string;
  thumb?: string;
  duration?: number;
  width?: number;
  height?: number;
  timestamp?: number;
  mid?: string;
}

export interface RawPropertyText {
  text: string;
  original_text?: string;
  timestamp?: number;
}

export interface RawPropertyTimelineEntry {
  type: "text" | "photo" | "video";
  timestamp?: number;
  data?: RawPropertyText | RawPropertyPhoto | RawPropertyVideo | string;
}

export interface RawDistrictProperty {
  id: string;
  text?: string;
  original_text?: string;
  texts?: Array<RawPropertyText | string>;
  photos?: RawPropertyPhoto[];
  videos?: RawPropertyVideo[];
  timeline?: RawPropertyTimelineEntry[];
  timestamp?: number;
  symbol?: string;
  keywords?: string[];
}

export interface RawDistrictSummary {
  id: string;
  address?: string;
  price?: string;
  price1?: string | number;
  price2?: string | number;
  type?: string | null;
  raw_text?: string;
  original_raw_text?: string;
}

export type PropertyTimelineItem =
  | {
      type: "text";
      timestamp: number;
      text: string;
    }
  | {
      type: "photo";
      timestamp: number;
      photo: RawPropertyPhoto;
    }
  | {
      type: "video";
      timestamp: number;
      video: RawPropertyVideo;
    };

export interface Property {
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
  ward?: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floors?: number | null;
  roomType: string | null;
  description: string;
  images: string[];
  contactName: string;
  contactPhone: string;
  contactLink: string;
  isFeatured: boolean;
  isVerified: boolean;
  postedAt: string;
  views: number;
  pricePerSqm?: number | null;
  sourceFile: string;
  sourceRawId: string;
  sourceSymbol?: string;
  sourceText: string;
  sourceKeywords: string[];
  photoItems: RawPropertyPhoto[];
  videoItems: RawPropertyVideo[];
  timelineItems: PropertyTimelineItem[];
}

export const ADMIN_CONTACT_NAME = "Admin";
export const ADMIN_CONTACT_LABEL = "Liên hệ Zalo";
export const ADMIN_CONTACT_LINK = "https://zalo.me/0876480130/";

export interface PropertyListResponse {
  data: Property[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListPropertiesParams {
  type?: string;
  category?: string;
  roomType?: string;
  keyword?: string;
  requirement?: string;
  province?: string;
  district?: string;
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  page?: number;
  limit?: number;
}

export interface DistrictSource {
  sourceFile: string;
  fullRecords: RawDistrictProperty[];
  summaryRecords?: RawDistrictSummary[];
}

const FILE_DISTRICT_MAP: Record<string, string> = {
  badinh: "Ba Đình",
  bactuliem: "Bắc Từ Liêm",
  caugiay: "Cầu Giấy",
  dongda: "Đống Đa",
  hadong: "Hà Đông",
  haibatrung: "Hai Bà Trưng",
  hoaiduc: "Hoài Đức",
  hoangmai: "Hoàng Mai",
  hoankiem: "Hoàn Kiếm",
  khaicute: "Khaicute",
  longbien: "Long Biên",
  mydinh: "Mỹ Đình",
  namtuliem: "Nam Từ Liêm",
  tayho: "Tây Hồ",
  thanhtri: "Thanh Trì",
  thanhxuan: "Thanh Xuân",
};

const ROOM_TYPE_ALIASES: Record<string, string[]> = {
  studio: ["studio"],
  "1n1k": ["1n1k", "1pn1k", "1 ngủ 1 khách"],
  "1n1b": ["1n1b", "1pn1b", "1 ngủ 1 bếp"],
  "2n1k": ["2n1k", "2pn1k", "2 ngủ 1 khách", "2 phòng ngủ 1 khách"],
  "1 ngu": ["1 ngủ", "1 phòng ngủ", "1pn", "1n1b", "1n1k"],
  "2 ngu": ["2 ngủ", "2 phòng ngủ", "2pn", "2n1k"],
  "gac xep": ["gác xép", "duplex", "loft", "mezzanine"],
  "giuong tang": ["giường tầng", "kí túc xá", "ktx", "bedspace", "dorm"],
};

const ROOM_TYPE_DEFINITIONS = [
  { key: "studio", label: "Studio", patterns: ["studio"] },
  { key: "1n1k", label: "1N1K", patterns: ["1n1k", "1pn1k", "1 ngủ 1 khách"] },
  { key: "1n1b", label: "1N1B", patterns: ["1n1b", "1pn1b", "1 ngủ 1 bếp"] },
  { key: "2n1k", label: "2N1K", patterns: ["2n1k", "2pn1k", "2 ngủ 1 khách", "2 phòng ngủ 1 khách"] },
  { key: "1 ngu", label: "1 ngủ", patterns: ["1 phòng ngủ", "1 ngủ", "1pn"] },
  { key: "2 ngu", label: "2 ngủ", patterns: ["2 phòng ngủ", "2 ngủ", "2pn"] },
  { key: "gac xep", label: "Gác xép", patterns: ["gác xép", "duplex", "loft", "mezzanine"] },
  { key: "giuong tang", label: "Giường tầng", patterns: ["giường tầng", "kí túc xá", "ktx", "bedspace", "dorm"] },
] as const;

const FORCED_CATEGORY_BY_SYMBOL: Record<string, string> = {
  tchome: "nha-nguyen-can",
  vietquoc: "nha-nguyen-can",
  vietquoc1: "nha-nguyen-can",
  taiphat: "nha-nguyen-can",
  taiphat1: "nha-nguyen-can",
};

function normalizeRoomTypeKey(value: string): string {
  return slugify(value).replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsNormalizedPhrase(source: string, phrase: string): boolean {
  const normalizedSource = normalizeRoomTypeKey(source);
  const normalizedPhrase = normalizeRoomTypeKey(phrase);

  if (!normalizedSource || !normalizedPhrase) return false;

  const matcher = new RegExp(`(?:^|\\b)${escapeRegExp(normalizedPhrase)}(?:\\b|$)`, "i");
  return matcher.test(normalizedSource);
}

function getRoomTypeAliases(value: string | null | undefined): string[] {
  const key = normalizeRoomTypeKey(value || "");
  if (!key) return [];
  return (ROOM_TYPE_ALIASES[key] || [key]).map((alias) => normalizeRoomTypeKey(alias));
}

function formatRoomTypeLabel(roomType: string | null | undefined, category: string): string {
  const normalized = normalizeRoomTypeKey(roomType || "");
  const roomTypeDefinition = ROOM_TYPE_DEFINITIONS.find((item) => item.key === normalized);
  if (roomTypeDefinition) return roomTypeDefinition.label;
  if (roomType) return toDisplayText(roomType);

  return category === "studio"
    ? "Studio"
    : category === "nha-nguyen-can"
      ? "Nhà nguyên căn"
      : category === "o-ghep"
        ? "Ở ghép"
        : category === "mat-bang"
          ? "Mặt bằng"
          : category === "van-phong"
            ? "Văn phòng"
            : "Phòng trọ";
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanText(value: string): string {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, arr) => !(line === "" && arr[index - 1] === ""))
    .join("\n")
    .trim();
}

function extractSourceMarker(symbol?: string, text?: string): string {
  const normalizedSymbol = slugify(symbol || "");
  if (normalizedSymbol) return normalizedSymbol;

  const firstToken = (text || "")
    .trim()
    .split(/\s+/)
    .find(Boolean);

  return slugify(firstToken || "");
}

function extractForcedCategoryBySymbol(symbol?: string, text?: string): string | null {
  const sourceMarker = extractSourceMarker(symbol, text);
  return FORCED_CATEGORY_BY_SYMBOL[sourceMarker] || null;
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toDisplayText(value: string): string {
  return collapseSpaces(value || "");
}

function fileNameToDistrictKey(sourceFile: string): string {
  return sourceFile.split("/").pop()?.replace(/\.json$/i, "") || sourceFile;
}

function extractLabeledValue(text: string, labels: string[]): string {
  const lines = cleanText(text).split("\n");

  for (const line of lines) {
    const normalized = slugify(line);
    if (!labels.some((label) => normalized.includes(label))) {
      continue;
    }

    const parts = line.split(/[:\-]/);
    if (parts.length > 1) {
      const value = toDisplayText(parts.slice(1).join(" "));
      if (value) return value;
    }

    const stripped = toDisplayText(line.replace(/^[^\w\d]+/g, ""));
    if (stripped) return stripped;
  }

  return "";
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

function parseMoneyRangeToMillions(value: string | number | null | undefined): number[] {
  if (value == null) return [];

  const raw = String(value).trim();
  if (!raw) return [];

  const normalizedRaw = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const matches =
    normalizedRaw.match(/\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?(?:trieu\d+|trieu|tr\d+|tr|k|ty\d+|ty)/gi) || [];

  return matches
    .map((match) => parseMoneyToMillions(match))
    .filter((amount): amount is number => amount != null && amount > 0);
}

function extractPriceBounds(
  text: string,
  summary?: RawDistrictSummary,
): { min: number; max: number } {
  const summaryStructuredCandidates = [
    parseMoneyToMillions(summary?.price1),
    parseMoneyToMillions(summary?.price2),
  ].filter((value): value is number => value != null && value > 0);

  if (summaryStructuredCandidates.length > 0) {
    return {
      min: Math.min(...summaryStructuredCandidates),
      max: Math.max(...summaryStructuredCandidates),
    };
  }

  const summaryRangeCandidates = parseMoneyRangeToMillions(summary?.price);
  if (summaryRangeCandidates.length > 0) {
    return {
      min: Math.min(...summaryRangeCandidates),
      max: Math.max(...summaryRangeCandidates),
    };
  }

  const priceScope = extractLabeledValue(text, ["gia", "price"]) || text;
  const normalizedPriceScope = priceScope.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const matches =
    normalizedPriceScope.match(/\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?(?:trieu\d+|trieu|tr\d+|tr|k|ty\d+|ty)/gi) || [];

  const prices = matches
    .map((match) => parseMoneyToMillions(match))
    .filter((value): value is number => value != null && value > 0);

  if (prices.length === 0) {
    return { min: 0, max: 0 };
  }

  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}

function extractAddress(text: string, summary?: RawDistrictSummary): string {
  if (summary?.address?.trim()) {
    return toDisplayText(summary.address);
  }

  const labeled = extractLabeledValue(text, ["dia chi"]);
  if (labeled) {
    return labeled;
  }

  const firstUsefulLine = cleanText(text)
    .split("\n")
    .find((line) => line.length > 8);

  return toDisplayText(firstUsefulLine || "Đang cập nhật");
}

function extractArea(text: string): number {
  const areaMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:-|–|to)?\s*(\d+(?:[.,]\d+)?)?\s*m(?:2|²)/i);
  if (!areaMatch) return 0;

  const min = Number.parseFloat(areaMatch[1].replace(",", "."));
  const max = areaMatch[2] ? Number.parseFloat(areaMatch[2].replace(",", ".")) : min;

  if (Number.isNaN(min)) return 0;
  if (Number.isNaN(max)) return Number.parseFloat(min.toFixed(2));

  return Number.parseFloat((((min + max) / 2)).toFixed(2));
}

function detectRoomTypeLabel(value: string): string | null {
  const normalized = normalizeRoomTypeKey(value);
  if (!normalized) return null;

  for (const roomTypeDefinition of ROOM_TYPE_DEFINITIONS) {
    if (roomTypeDefinition.patterns.some((pattern) => containsNormalizedPhrase(normalized, pattern))) {
      return roomTypeDefinition.label;
    }
  }

  return null;
}

function extractRoomType(text: string): string | null {
  const labeledRoomType = extractLabeledValue(text, ["dang phong", "loai phong"]);
  const sources = [labeledRoomType, text].filter(Boolean);

  for (const source of sources) {
    const roomType = detectRoomTypeLabel(source);
    if (roomType) {
      return roomType;
    }
  }

  return null;
}

function extractBedrooms(text: string, roomType?: string | null): number | null {
  const sources = [
    roomType || "",
    extractLabeledValue(text, ["dang phong", "loai phong"]),
    text,
  ]
    .map((value) => slugify(value))
    .filter(Boolean);

  for (const source of sources) {
    const shortMatch = source.match(/\b(\d+)\s*n(?:\s*\d+\s*[kb])?\b/i);
    if (shortMatch) {
      return Number.parseInt(shortMatch[1], 10);
    }

    const bedroomMatch = source.match(/\b(\d+)\s*(?:pn|phong ngu|ngu)\b/i);
    if (bedroomMatch) {
      return Number.parseInt(bedroomMatch[1], 10);
    }
  }

  return null;
}

function extractCategory(
  text: string,
  _bedrooms: number | null,
  roomType?: string | null,
  sourceSymbol?: string,
): string {
  const forcedCategory = extractForcedCategoryBySymbol(sourceSymbol, text);
  if (forcedCategory) {
    return forcedCategory;
  }

  const normalized = slugify(`${roomType || ""}\n${text}`);

  if (normalized.includes("mat bang")) {
    return "mat-bang";
  }

  if (normalized.includes("van phong")) {
    return "van-phong";
  }

  if (normalized.includes("o ghep") || normalized.includes("nguoi ghep")) {
    return "o-ghep";
  }

  const normalizedRoomType = normalizeRoomTypeKey(roomType || "");
  if (normalizedRoomType === "studio" || (normalized.includes("studio") && !normalized.includes("gac xep"))) {
    return "studio";
  }

  return "phong-tro";
}

function extractDistrict(sourceFile: string, keywords: string[]): { key: string; label: string } {
  const key = fileNameToDistrictKey(sourceFile);
  const label = FILE_DISTRICT_MAP[key];

  if (label) {
    return { key, label };
  }

  const fallbackKeyword = keywords.find((keyword) => keyword.trim().length > 2);
  if (fallbackKeyword) {
    return { key, label: toDisplayText(fallbackKeyword) };
  }

  return { key, label: toDisplayText(key) };
}

function buildTitle(category: string, roomType: string | null, district: string, price: number, area: number, _address: string): string {
  const categoryLabel = formatRoomTypeLabel(roomType, category);
  const priceLabel = price > 0 ? `${price} triệu/tháng` : "giá tốt";
  const areaLabel = area > 0 ? `${area}m2` : "";

  return [categoryLabel, areaLabel, district, priceLabel].filter(Boolean).join(" - ");
}

function dedupeById(properties: Property[]): Property[] {
  const seen = new Set<string>();
  return properties.filter((property) => {
    const key = `${property.sourceFile}:${property.sourceRawId || property.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createStablePropertyId(sourceFile: string, rawId: string, fallback: number): number {
  const input = `${fileNameToDistrictKey(sourceFile)}:${rawId || fallback}`;
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash || fallback;
}

function isRawPropertyText(data: unknown): data is RawPropertyText {
  return Boolean(data) && typeof data === "object" && "text" in (data as RawPropertyText);
}

function extractTimelineText(data: RawPropertyText | RawPropertyPhoto | RawPropertyVideo | string | undefined): string {
  if (typeof data === "string") {
    return cleanText(data);
  }

  if (isRawPropertyText(data)) {
    return cleanText(data.text || "");
  }

  return "";
}

function extractTimelineTimestamp(
  data: RawPropertyText | RawPropertyPhoto | RawPropertyVideo | string | undefined,
  fallback = 0,
): number {
  if (data && typeof data === "object" && "timestamp" in data && typeof data.timestamp === "number") {
    return data.timestamp;
  }

  return fallback;
}

function buildTimelineItems(record: RawDistrictProperty, description: string): PropertyTimelineItem[] {
  if (Array.isArray(record.timeline) && record.timeline.length > 0) {
    return record.timeline.reduce<PropertyTimelineItem[]>((items, entry) => {
      const timestamp = entry.timestamp ?? extractTimelineTimestamp(entry.data, 0);

      if (entry.type === "text") {
        const text = extractTimelineText(entry.data);
        if (text) {
          items.push({ type: "text", timestamp, text });
        }
        return items;
      }

      if (entry.type === "photo" && entry.data && typeof entry.data === "object" && "url" in entry.data) {
        items.push({ type: "photo", timestamp, photo: entry.data as RawPropertyPhoto });
        return items;
      }

      if (entry.type === "video" && entry.data && typeof entry.data === "object" && "url" in entry.data) {
        items.push({ type: "video", timestamp, video: entry.data as RawPropertyVideo });
        return items;
      }

      return items;
    }, []);
  }

  const textItems =
    Array.isArray(record.texts) && record.texts.length > 0
      ? record.texts.map((item) => ({
          type: "text" as const,
          timestamp: extractTimelineTimestamp(item, record.timestamp ?? 0),
          text: extractTimelineText(item),
        }))
      : [
          {
            type: "text" as const,
            timestamp: record.timestamp ?? 0,
            text: description,
          },
        ];

  const allItems: PropertyTimelineItem[] = [
    ...textItems.filter((item) => item.text),
    ...(record.photos || []).map((photo) => ({
      type: "photo" as const,
      timestamp: photo.timestamp ?? 0,
      photo,
    })),
    ...(record.videos || []).map((video) => ({
      type: "video" as const,
      timestamp: video.timestamp ?? 0,
      video,
    })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  const grouped: PropertyTimelineItem[][] = [];
  let currentGroup: PropertyTimelineItem[] = [];
  let lastTimestamp: number | null = null;

  for (const item of allItems) {
    if (lastTimestamp === null || Math.abs(item.timestamp - lastTimestamp) <= 2) {
      currentGroup.push(item);
      lastTimestamp = item.timestamp;
      continue;
    }

    if (currentGroup.length > 0) {
      grouped.push(currentGroup);
    }

    currentGroup = [item];
    lastTimestamp = item.timestamp;
  }

  if (currentGroup.length > 0) {
    grouped.push(currentGroup);
  }

  return grouped.flatMap((group) => {
    const texts = group.filter((item) => item.type === "text");
    const media = group.filter((item) => item.type !== "text");
    return [...texts, ...media];
  });
}

function extractImageUrls(record: RawDistrictProperty): string[] {
  const photoUrls = (record.photos || []).map((photo) => photo.url).filter(Boolean);
  if (photoUrls.length > 0) {
    return photoUrls;
  }

  return (record.videos || []).map((video) => video.thumb).filter((thumb): thumb is string => Boolean(thumb));
}

export function normalizeDistrictRecords(
  sourceFile: string,
  fullRecords: RawDistrictProperty[],
  summaryRecords: RawDistrictSummary[] = [],
): Property[] {
  const summaryById = new Map(summaryRecords.map((record) => [String(record.id), record]));

  return fullRecords
    .map<Property | null>((record, index) => {
      const summary = summaryById.get(String(record.id));
      const description = cleanText(record.text || summary?.raw_text || "");
      const images = extractImageUrls(record);

      if (!description || images.length === 0) {
        return null;
      }

      const { key: districtKey, label: district } = extractDistrict(sourceFile, record.keywords || []);
      const address = extractAddress(description, summary);
      const area = extractArea(description);
      const roomType = extractRoomType(description);
      const bedrooms = extractBedrooms(description, roomType);
      const { min: priceFrom, max: priceTo } = extractPriceBounds(description, summary);
      const price = priceFrom > 0 ? priceFrom : priceTo;
      const category = extractCategory(description, bedrooms, roomType, record.symbol);
      const timelineItems = buildTimelineItems(record, description);
      const fallbackId = Number.parseInt(record.id, 10) || Number.parseInt(`${index + 1}`, 10);
      const numericId = createStablePropertyId(sourceFile, String(record.id || ""), fallbackId);

      const postedTimestamp =
        typeof record.timestamp === "number" && record.timestamp > 0
          ? record.timestamp
          : Number.parseInt(record.id, 10) / 1000 || Date.now() / 1000;

      const postedAt = new Date(postedTimestamp * 1000).toISOString();
      const pricePerSqm = price > 0 && area > 0 ? Number.parseFloat((price / area).toFixed(2)) : null;

      const property: Property = {
        id: numericId,
        title: buildTitle(category, roomType, district, price, area, address),
        type: "cho-thue",
        category,
        price,
        priceFrom: priceFrom || null,
        priceTo: priceTo || (priceFrom || null),
        priceUnit: "triệu/tháng",
        area,
        address,
        province: "Hà Nội",
        district,
        districtKey,
        ward: undefined,
        bedrooms,
        bathrooms: null,
        floors: null,
        roomType,
        description,
        images,
        contactName: ADMIN_CONTACT_NAME,
        contactPhone: ADMIN_CONTACT_LABEL,
        contactLink: ADMIN_CONTACT_LINK,
        isFeatured: false,
        isVerified: true,
        postedAt,
        views: Math.max(images.length * 12, 24),
        pricePerSqm,
        sourceFile,
        sourceRawId: record.id,
        sourceSymbol: record.symbol,
        sourceText: record.text || description,
        sourceKeywords: record.keywords || [],
        photoItems: record.photos || [],
        videoItems: record.videos || [],
        timelineItems,
      };

      return property;
    })
    .filter((property): property is Property => property !== null);
}

export function buildPropertyCollection(sources: DistrictSource[]): Property[] {
  const all = dedupeById(
    sources.flatMap(({ sourceFile, fullRecords, summaryRecords }) =>
      normalizeDistrictRecords(sourceFile, fullRecords, summaryRecords || []),
    ),
  ).sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());

  return all.map((property, index) => ({
    ...property,
    isFeatured: index < 12,
  }));
}

type IndexedProperty = {
  property: Property;
  haystack: string;
  requirementHaystack: string;
  roomTypeHaystack: string;
  provinceSlug: string;
  districtSlug: string;
};

const propertySearchIndexCache = new WeakMap<Property[], IndexedProperty[]>();

function getIndexedProperties(allProperties: Property[]): IndexedProperty[] {
  const cached = propertySearchIndexCache.get(allProperties);
  if (cached) {
    return cached;
  }

  const indexedProperties = allProperties.map((property) => ({
    property,
    haystack: slugify([
      property.title,
      property.address,
      property.description,
      property.district,
      property.province,
      property.roomType || "",
      ...(property.sourceKeywords || []),
    ].join(" ")),
    requirementHaystack: slugify([
      property.description,
      property.roomType || "",
      ...(property.sourceKeywords || []),
      property.sourceText,
    ].join(" ")),
    roomTypeHaystack: slugify(`${property.roomType || ""}\n${property.description}`),
    provinceSlug: slugify(property.province),
    districtSlug: slugify(property.district),
  }));

  propertySearchIndexCache.set(allProperties, indexedProperties);
  return indexedProperties;
}

export function listProperties(
  allProperties: Property[],
  params: ListPropertiesParams = {},
): PropertyListResponse {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const keyword = slugify(params.keyword || "");
  const requirement = slugify(params.requirement || "");
  const roomTypeAliases = getRoomTypeAliases(params.roomType);
  const provinceSlug = params.province ? slugify(params.province) : "";
  const districtSlug = params.district ? slugify(params.district) : "";

  const filtered = getIndexedProperties(allProperties)
    .filter(({ property, haystack, requirementHaystack, roomTypeHaystack, provinceSlug: indexedProvinceSlug, districtSlug: indexedDistrictSlug }) => {
    const priceFloor = property.priceFrom ?? property.price;
    const priceCeil = property.priceTo ?? property.price;

    if (params.type && property.type !== params.type) return false;
    if (params.category && property.category !== params.category) return false;
    if (roomTypeAliases.length > 0) {
      if (!roomTypeAliases.some((alias) => containsNormalizedPhrase(roomTypeHaystack, alias))) return false;
    }
    if (keyword && !haystack.includes(keyword)) return false;
    if (requirement && !requirementHaystack.includes(requirement)) return false;
    if (provinceSlug && indexedProvinceSlug !== provinceSlug) return false;
    if (districtSlug && indexedDistrictSlug !== districtSlug) return false;
    if (params.priceMin != null && priceCeil < params.priceMin) return false;
    if (params.priceMax != null && priceFloor > params.priceMax) return false;
    if (params.areaMin != null && property.area < params.areaMin) return false;
    if (params.areaMax != null && property.area > params.areaMax) return false;
    return true;
    })
    .map(({ property }) => property);

  const total = filtered.length;
  const totalPages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;
  const start = limit > 0 ? (page - 1) * limit : 0;

  return {
    data: limit > 0 ? filtered.slice(start, start + limit) : [],
    total,
    page,
    limit,
    totalPages,
  };
}

export function getFeaturedProperties(allProperties: Property[]): Property[] {
  return allProperties.filter((property) => property.isFeatured).slice(0, 12);
}

export function getPropertyById(allProperties: Property[], id: number): Property | undefined {
  return allProperties.find((property) => property.id === id);
}
