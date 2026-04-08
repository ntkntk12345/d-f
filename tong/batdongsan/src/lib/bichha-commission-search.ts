export type BichHaCommissionUnit = "month" | "percent" | "unknown";

export type BichHaCommissionInfo = {
  label: string;
  scope: string;
  unit: BichHaCommissionUnit;
  value: number;
  min: number | null;
  max: number | null;
};

export type BichHaCommissionRecord = {
  id: string;
  groupId: string;
  propertyId: number | null;
  propertyUrl: string | null;
  title: string;
  address: string;
  province: string;
  district: string;
  districtKey: string;
  roomType: string | null;
  price: number | null;
  priceFrom: number | null;
  priceTo: number | null;
  area: number | null;
  imageUrl: string | null;
  images: string[];
  sourceFile: string;
  sourceSymbol: string | null;
  sourceRawId: string;
  commissionLabel: string;
  commissionScope: string;
  commissionUnit: BichHaCommissionUnit;
  commissionValue: number;
  commissionMin: number | null;
  commissionMax: number | null;
  rawText: string;
  postedAt: string;
  searchHaystack: string;
};

export type BichHaCommissionGroup = {
  id: string;
  title: string;
  address: string;
  province: string;
  district: string;
  districtKey: string;
  roomType: string | null;
  price: number | null;
  priceFrom: number | null;
  priceTo: number | null;
  area: number | null;
  imageUrl: string | null;
  propertyId: number | null;
  propertyUrl: string | null;
  bestCommissionLabel: string;
  bestCommissionScope: string;
  bestCommissionUnit: BichHaCommissionUnit;
  bestCommissionValue: number;
  bestCommissionMin: number | null;
  bestCommissionMax: number | null;
  latestPostedAt: string;
  variantCount: number;
  searchHaystack: string;
  variants: BichHaCommissionRecord[];
};

export type BichHaCommissionIndex = {
  generatedAt: string;
  availableDistricts: string[];
  availableRoomTypes: string[];
  totalRecords: number;
  totalGroups: number;
  groups: BichHaCommissionGroup[];
};

export type BichHaCommissionSearchParams = {
  keyword?: string;
  district?: string;
  roomType?: string;
  commissionMin?: number;
  sort?: "commission-desc" | "recent-desc";
  page?: number;
  limit?: number;
};

export type BichHaCommissionSearchResult = {
  data: BichHaCommissionGroup[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  filteredVariantCount: number;
};

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildStableHash(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

function formatCommissionNumber(value: number) {
  return Number.isInteger(value) ? `${value}` : `${value}`.replace(/\.0+$/, "");
}

function sortUniqueNumbers(values: number[]) {
  return Array.from(new Set(values.map((value) => Number.parseFloat(value.toFixed(2))))).sort(
    (left, right) => left - right,
  );
}

function toNumericValue(rawValue: string) {
  const parsed = Number.parseFloat(rawValue.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function getCommissionScope(rawText: string) {
  const lines = rawText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return "";

  const scope: string[] = [];

  for (const line of lines) {
    if (
      scope.length > 0
      && /^(?:[🏠🏡🏪📍]|(?:dia chi|dc|d c)\b|(?:địa chỉ)\b)/iu.test(line)
    ) {
      break;
    }

    scope.push(line);

    if (scope.length >= 3) {
      break;
    }
  }

  return collapseWhitespace(scope.join(" "));
}

function extractCommissionNumbers(scope: string, unit: "month" | "percent") {
  const normalizedScope = normalizeSearchText(scope);

  if (unit === "month") {
    return sortUniqueNumbers(
      Array.from(normalizedScope.matchAll(/(\d+(?:[.,]\d+)?)\s*(?=th\b|thang\b|thg\b)/g))
        .map((match) => toNumericValue(match[1] || ""))
        .filter((value): value is number => value != null && value > 0 && value <= 36),
    );
  }

  return sortUniqueNumbers(
    Array.from(normalizedScope.matchAll(/(\d+(?:[.,]\d+)?)\s*(?=%)/g))
      .map((match) => toNumericValue(match[1] || ""))
      .filter((value): value is number => value != null && value > 0 && value <= 100),
  );
}

export function extractBichHaCommissionInfo(rawText: string): BichHaCommissionInfo | null {
  const scope = getCommissionScope(rawText);
  if (!scope) return null;

  const monthValues = extractCommissionNumbers(scope, "month");
  if (monthValues.length > 0) {
    const min = monthValues[0] ?? null;
    const max = monthValues[monthValues.length - 1] ?? null;
    const label =
      min != null && max != null && min !== max
        ? `${formatCommissionNumber(min)}-${formatCommissionNumber(max)} thang`
        : `${formatCommissionNumber(max ?? min ?? 0)} thang`;

    return {
      label,
      scope,
      unit: "month",
      value: max ?? min ?? 0,
      min,
      max,
    };
  }

  const percentValues = extractCommissionNumbers(scope, "percent");
  if (percentValues.length > 0) {
    const min = percentValues[0] ?? null;
    const max = percentValues[percentValues.length - 1] ?? null;
    const label =
      min != null && max != null && min !== max
        ? `${formatCommissionNumber(min)}-${formatCommissionNumber(max)}%`
        : `${formatCommissionNumber(max ?? min ?? 0)}%`;

    return {
      label,
      scope,
      unit: "percent",
      value: max ?? min ?? 0,
      min,
      max,
    };
  }

  const normalizedScope = normalizeSearchText(scope);
  if (/\bhh\b|hoa hong/.test(normalizedScope)) {
    return {
      label: scope,
      scope,
      unit: "unknown",
      value: 0,
      min: null,
      max: null,
    };
  }

  return null;
}

function extractUnitKey(rawText: string) {
  const normalizedText = normalizeSearchText(rawText);
  const patterns = [
    /\bp\s*\d{2,4}[a-z]?\b/i,
    /\btruc\s*\d+\b/i,
    /\btang\s*\d+\b/i,
    /\bphong\s*\d{2,4}[a-z]?\b/i,
  ];

  for (const pattern of patterns) {
    const match = normalizedText.match(pattern);
    if (match?.[0]) {
      return collapseWhitespace(match[0]);
    }
  }

  return "";
}

export function buildBichHaCommissionGroupId(record: {
  districtKey: string;
  address: string;
  roomType: string | null;
  priceFrom: number | null;
  priceTo: number | null;
  area: number | null;
  rawText: string;
}) {
  const groupingKey = [
    record.districtKey,
    normalizeSearchText(record.address),
    normalizeSearchText(record.roomType || ""),
    record.priceFrom ?? "",
    record.priceTo ?? "",
    record.area ?? "",
    extractUnitKey(record.rawText),
  ].join("|");

  return `${record.districtKey}-${buildStableHash(groupingKey)}`;
}

function buildGroupSearchHaystack(group: {
  title: string;
  address: string;
  district: string;
  roomType: string | null;
  variants: BichHaCommissionRecord[];
}) {
  return normalizeSearchText(
    [
      group.title,
      group.address,
      group.district,
      group.roomType || "",
      ...group.variants.map((variant) =>
        [
          variant.commissionLabel,
          variant.commissionScope,
          variant.sourceSymbol || "",
          variant.rawText,
        ].join(" "),
      ),
    ].join(" "),
  );
}

function compareIsoDateDesc(left: string, right: string) {
  return new Date(right).getTime() - new Date(left).getTime();
}

export function buildBichHaCommissionIndex(
  records: BichHaCommissionRecord[],
  generatedAt: string,
): BichHaCommissionIndex {
  const grouped = new Map<string, BichHaCommissionRecord[]>();

  for (const record of records) {
    const existing = grouped.get(record.groupId) || [];
    existing.push(record);
    grouped.set(record.groupId, existing);
  }

  const groups = Array.from(grouped.entries())
    .map(([groupId, variants]) => {
      const sortedVariants = variants.slice().sort((left, right) => {
        if (right.commissionValue !== left.commissionValue) {
          return right.commissionValue - left.commissionValue;
        }

        return compareIsoDateDesc(left.postedAt, right.postedAt);
      });

      const bestVariant = sortedVariants[0]!;
      const latestPostedAt = sortedVariants.reduce(
        (latest, variant) =>
          new Date(variant.postedAt).getTime() > new Date(latest).getTime()
            ? variant.postedAt
            : latest,
        bestVariant.postedAt,
      );

      const group: BichHaCommissionGroup = {
        id: groupId,
        title: bestVariant.title,
        address: bestVariant.address,
        province: bestVariant.province,
        district: bestVariant.district,
        districtKey: bestVariant.districtKey,
        roomType: bestVariant.roomType,
        price: bestVariant.price,
        priceFrom: bestVariant.priceFrom,
        priceTo: bestVariant.priceTo,
        area: bestVariant.area,
        imageUrl: bestVariant.imageUrl,
        propertyId: bestVariant.propertyId,
        propertyUrl: bestVariant.propertyUrl,
        bestCommissionLabel: bestVariant.commissionLabel,
        bestCommissionScope: bestVariant.commissionScope,
        bestCommissionUnit: bestVariant.commissionUnit,
        bestCommissionValue: bestVariant.commissionValue,
        bestCommissionMin: bestVariant.commissionMin,
        bestCommissionMax: bestVariant.commissionMax,
        latestPostedAt,
        variantCount: sortedVariants.length,
        searchHaystack: "",
        variants: sortedVariants,
      };

      group.searchHaystack = buildGroupSearchHaystack(group);
      return group;
    })
    .sort((left, right) => {
      if (right.bestCommissionValue !== left.bestCommissionValue) {
        return right.bestCommissionValue - left.bestCommissionValue;
      }

      if (right.variantCount !== left.variantCount) {
        return right.variantCount - left.variantCount;
      }

      return compareIsoDateDesc(left.latestPostedAt, right.latestPostedAt);
    });

  return {
    generatedAt,
    availableDistricts: Array.from(new Set(groups.map((group) => group.district)))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right)),
    availableRoomTypes: Array.from(new Set(groups.map((group) => group.roomType || "")))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right)),
    totalRecords: records.length,
    totalGroups: groups.length,
    groups,
  };
}

export function listBichHaCommissionGroups(
  groups: BichHaCommissionGroup[],
  params: BichHaCommissionSearchParams = {},
): BichHaCommissionSearchResult {
  const page = Math.max(1, Math.trunc(params.page || 1));
  const limit = Math.max(1, Math.trunc(params.limit || 20));
  const keyword = normalizeSearchText(params.keyword || "");
  const district = normalizeSearchText(params.district || "");
  const roomType = normalizeSearchText(params.roomType || "");
  const commissionMin = params.commissionMin != null ? Number(params.commissionMin) : null;
  const sort = params.sort || "commission-desc";

  const filtered = groups
    .filter((group) => {
      if (keyword && !group.searchHaystack.includes(keyword)) return false;
      if (
        district
        && normalizeSearchText(group.district) !== district
        && normalizeSearchText(group.districtKey) !== district
      ) {
        return false;
      }
      if (roomType && normalizeSearchText(group.roomType || "") !== roomType) return false;
      if (commissionMin != null && group.bestCommissionValue < commissionMin) return false;
      return true;
    })
    .sort((left, right) => {
      if (sort === "recent-desc") {
        const recentComparison = compareIsoDateDesc(left.latestPostedAt, right.latestPostedAt);
        if (recentComparison !== 0) return recentComparison;
      }

      if (right.bestCommissionValue !== left.bestCommissionValue) {
        return right.bestCommissionValue - left.bestCommissionValue;
      }

      if (sort !== "recent-desc") {
        const recentComparison = compareIsoDateDesc(left.latestPostedAt, right.latestPostedAt);
        if (recentComparison !== 0) return recentComparison;
      }

      return right.variantCount - left.variantCount;
    });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;

  return {
    data: filtered.slice(start, start + limit),
    total,
    page,
    limit,
    totalPages,
    filteredVariantCount: filtered.reduce((sum, group) => sum + group.variantCount, 0),
  };
}
