import type { PropertyPreview } from "./property-preview-search";

export type RecommendationCriteria = {
  keyword?: string;
  category?: string;
  roomType?: string;
  province?: string;
  district?: string;
  priceMin?: number;
  priceMax?: number;
};

export type RecommendationGroup = {
  key: string;
  title: string;
  subtitle: string;
  href: string;
  items: PropertyPreview[];
};

export type PropertyRecommendations = {
  locationLabel: string | null;
  priceLabel: string | null;
  relatedItems: PropertyPreview[];
  roomGroups: RecommendationGroup[];
  priceGroups: RecommendationGroup[];
};

type PriceBucket = {
  key: string;
  label: string;
  min?: number;
  max?: number;
};

const DEFAULT_RELATED_ITEM_LIMIT = 8;
const DEFAULT_GROUP_ITEM_LIMIT = 4;
const DEFAULT_ROOM_GROUP_LIMIT = 4;
const DEFAULT_PRICE_GROUP_LIMIT = 3;

const ROOM_TYPE_PATTERNS = [
  { key: "studio", label: "Studio", patterns: ["studio"] },
  { key: "1n1k", label: "1N1K", patterns: ["1n1k", "1pn1k", "1 ngu 1 khach", "1 phong ngu 1 khach"] },
  { key: "1n1b", label: "1N1B", patterns: ["1n1b", "1pn1b", "1 ngu 1 bep", "1 phong ngu 1 bep"] },
  { key: "2n1k", label: "2N1K", patterns: ["2n1k", "2pn1k", "2 ngu 1 khach", "2 phong ngu 1 khach"] },
  { key: "1 ngu", label: "1 ngủ", patterns: ["1 ngu", "1 phong ngu", "1pn"] },
  { key: "2 ngu", label: "2 ngủ", patterns: ["2 ngu", "2 phong ngu", "2pn"] },
  { key: "gac xep", label: "Gác xép", patterns: ["gac xep", "duplex", "loft", "mezzanine"] },
  { key: "giuong tang", label: "Giường tầng", patterns: ["giuong tang", "ki tuc xa", "ktx", "bedspace", "dorm"] },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  "phong-tro": "Phòng trọ",
  studio: "Studio",
  "nha-nguyen-can": "Nhà nguyên căn",
  "o-ghep": "Ở ghép",
  "mat-bang": "Mặt bằng",
  "van-phong": "Văn phòng",
};

const PRICE_BUCKETS: PriceBucket[] = [
  { key: "under-2", label: "Dưới 2 triệu", max: 2 },
  { key: "2-3", label: "2-3 triệu", min: 2, max: 3 },
  { key: "3-5", label: "3-5 triệu", min: 3, max: 5 },
  { key: "5-7", label: "5-7 triệu", min: 5, max: 7 },
  { key: "7-10", label: "7-10 triệu", min: 7, max: 10 },
  { key: "10-plus", label: "Trên 10 triệu", min: 10 },
];

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\u0111/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function includesNormalized(source: string, query: string) {
  const normalizedSource = normalizeSearchText(source);
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedSource || !normalizedQuery) return false;
  return normalizedSource.includes(normalizedQuery);
}

function toDisplayRoomType(value: string) {
  const normalized = normalizeSearchText(value);
  const matched = ROOM_TYPE_PATTERNS.find((item) => item.key === normalized);

  if (matched) return matched.label;

  return value
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPrice(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function formatPriceLabel(priceMin?: number, priceMax?: number) {
  if (priceMin != null && priceMax != null) return `${formatPrice(priceMin)}-${formatPrice(priceMax)} triệu`;
  if (priceMin != null) return `từ ${formatPrice(priceMin)} triệu`;
  if (priceMax != null) return `đến ${formatPrice(priceMax)} triệu`;
  return null;
}

function getBufferedPriceRange(criteria: RecommendationCriteria) {
  const minBuffer = criteria.priceMin != null ? Math.max(0.5, Math.round(criteria.priceMin * 0.2 * 10) / 10) : undefined;
  const maxBuffer = criteria.priceMax != null ? Math.max(0.5, Math.round(criteria.priceMax * 0.2 * 10) / 10) : undefined;

  return {
    min: criteria.priceMin != null ? Math.max(0, criteria.priceMin - minBuffer!) : undefined,
    max: criteria.priceMax != null ? criteria.priceMax + maxBuffer! : undefined,
  };
}

function getPropertyPriceBounds(property: PropertyPreview) {
  return {
    min: property.priceFrom ?? property.price,
    max: property.priceTo ?? property.price,
  };
}

function matchesPrice(property: PropertyPreview, priceMin?: number, priceMax?: number) {
  const bounds = getPropertyPriceBounds(property);

  if (priceMin != null && bounds.max < priceMin) return false;
  if (priceMax != null && bounds.min > priceMax) return false;
  return true;
}

function getPreferredRoomTypes(criteria: RecommendationCriteria) {
  const matched = new Set<string>();
  const sources = [criteria.roomType, criteria.keyword].filter(Boolean);

  for (const source of sources) {
    const normalized = normalizeSearchText(source || "");
    if (!normalized) continue;

    for (const roomType of ROOM_TYPE_PATTERNS) {
      if (roomType.patterns.some((pattern) => includesNormalized(normalized, pattern))) {
        matched.add(roomType.key);
      }
    }
  }

  return Array.from(matched);
}

function getKeywordTokens(criteria: RecommendationCriteria) {
  const preferredRoomTypes = new Set(getPreferredRoomTypes(criteria));

  return normalizeSearchText(criteria.keyword || "")
    .split(" ")
    .filter((token) => token.length > 1)
    .filter((token) => !preferredRoomTypes.has(token));
}

function matchesDistrict(property: PropertyPreview, district?: string) {
  if (!district) return true;
  return property.districtSlug === normalizeSearchText(district);
}

function matchesProvince(property: PropertyPreview, province?: string) {
  if (!province) return true;
  return property.provinceSlug === normalizeSearchText(province);
}

function buildRecommendationSearchUrl(
  criteria: RecommendationCriteria,
  overrides: Partial<RecommendationCriteria> = {},
) {
  const merged: RecommendationCriteria = { ...criteria, ...overrides };
  const params = new URLSearchParams({ type: "cho-thue" });

  if (merged.category) params.append("category", merged.category);
  if (merged.roomType) params.append("roomType", merged.roomType);
  if (merged.province) params.append("province", merged.province);
  if (merged.district) params.append("district", merged.district);
  if (merged.priceMin != null) params.append("priceMin", String(merged.priceMin));
  if (merged.priceMax != null) params.append("priceMax", String(merged.priceMax));

  return `/search?${params.toString()}`;
}

function getLocationLabel(criteria: RecommendationCriteria) {
  return criteria.district || criteria.province || null;
}

function getGroupInfo(property: PropertyPreview) {
  if (property.category === "studio") {
    return {
      key: "category:studio",
      title: "Studio",
      hrefOverrides: {
        category: "studio",
        roomType: undefined,
        keyword: undefined,
      } satisfies Partial<RecommendationCriteria>,
      sortKey: "studio",
    };
  }

  if (property.roomType?.trim()) {
    const roomType = property.roomType.trim();

    return {
      key: `room:${normalizeSearchText(roomType)}`,
      title: toDisplayRoomType(roomType),
      hrefOverrides: {
        roomType,
        category: undefined,
        keyword: undefined,
      } satisfies Partial<RecommendationCriteria>,
      sortKey: normalizeSearchText(roomType),
    };
  }

  return {
    key: `category:${property.category}`,
    title: CATEGORY_LABELS[property.category] || toDisplayRoomType(property.category.replace(/-/g, " ")),
    hrefOverrides: {
      category: property.category,
      roomType: undefined,
      keyword: undefined,
    } satisfies Partial<RecommendationCriteria>,
    sortKey: property.category,
  };
}

function getPriceBucketScore(criteria: RecommendationCriteria, bucket: PriceBucket) {
  const targetMin = criteria.priceMin ?? 0;
  const targetMax = criteria.priceMax ?? 20;
  const bucketMin = bucket.min ?? 0;
  const bucketMax = bucket.max ?? 20;
  const overlap = Math.max(0, Math.min(targetMax, bucketMax) - Math.max(targetMin, bucketMin));

  if (overlap > 0) return overlap + 100;

  const distance = bucketMax < targetMin ? targetMin - bucketMax : bucketMin - targetMax;
  return -distance;
}

function createPropertyScorer(criteria: RecommendationCriteria) {
  const preferredRoomTypes = getPreferredRoomTypes(criteria);
  const keywordTokens = getKeywordTokens(criteria);
  const bufferedPriceRange = getBufferedPriceRange(criteria);

  return (property: PropertyPreview) => {
    let score = 0;
    const haystack = property.searchHaystack;

    if (criteria.district && matchesDistrict(property, criteria.district)) {
      score += 80;
    } else if (criteria.province && matchesProvince(property, criteria.province)) {
      score += 40;
    }

    if (criteria.priceMin != null || criteria.priceMax != null) {
      if (matchesPrice(property, criteria.priceMin, criteria.priceMax)) {
        score += 60;
      } else if (matchesPrice(property, bufferedPriceRange.min, bufferedPriceRange.max)) {
        score += 30;
      }
    }

    if (criteria.category && property.category === criteria.category) {
      score += 20;
    }

    if (preferredRoomTypes.length > 0) {
      const groupInfo = getGroupInfo(property);
      if (preferredRoomTypes.includes(groupInfo.sortKey)) {
        score += 28;
      }
    }

    for (const token of keywordTokens) {
      if (includesNormalized(haystack, token)) {
        score += 6;
      }
    }

    return score;
  };
}

function sortProperties(properties: PropertyPreview[], scoreProperty: (property: PropertyPreview) => number) {
  return [...properties].sort((a, b) => {
    const scoreDiff = scoreProperty(b) - scoreProperty(a);
    if (scoreDiff !== 0) return scoreDiff;

    const timeDiff = new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime();
    if (timeDiff !== 0) return timeDiff;

    return b.views - a.views;
  });
}

function pickItems(properties: PropertyPreview[], excludedIds: Set<number>, limit: number) {
  const filtered = properties.filter((property) => !excludedIds.has(property.id));
  if (filtered.length > 0) return filtered.slice(0, limit);
  return properties.slice(0, limit);
}

export function buildPropertyRecommendations(
  properties: PropertyPreview[],
  criteria: RecommendationCriteria,
  options?: {
    excludedIds?: number[];
    relatedItemLimit?: number;
    groupItemLimit?: number;
    roomGroupLimit?: number;
    priceGroupLimit?: number;
  },
): PropertyRecommendations {
  const excludedIds = new Set(options?.excludedIds || []);
  const relatedItemLimit = options?.relatedItemLimit ?? DEFAULT_RELATED_ITEM_LIMIT;
  const groupItemLimit = options?.groupItemLimit ?? DEFAULT_GROUP_ITEM_LIMIT;
  const roomGroupLimit = options?.roomGroupLimit ?? DEFAULT_ROOM_GROUP_LIMIT;
  const priceGroupLimit = options?.priceGroupLimit ?? DEFAULT_PRICE_GROUP_LIMIT;
  const scoreProperty = createPropertyScorer(criteria);
  const locationLabel = getLocationLabel(criteria);
  const priceLabel = formatPriceLabel(criteria.priceMin, criteria.priceMax);
  const preferredRoomTypes = getPreferredRoomTypes(criteria);
  const basePool = properties.filter((property) => property.type === "cho-thue");
  const districtPool = criteria.district
    ? basePool.filter((property) => matchesDistrict(property, criteria.district))
    : [];
  const provincePool = criteria.province
    ? basePool.filter((property) => matchesProvince(property, criteria.province))
    : [];
  const locationPool =
    districtPool.length > 0
      ? districtPool
      : provincePool.length > 0
        ? provincePool
        : basePool;
  const bufferedPriceRange = getBufferedPriceRange(criteria);
  const samePricePool =
    criteria.priceMin != null || criteria.priceMax != null
      ? locationPool.filter((property) => matchesPrice(property, bufferedPriceRange.min, bufferedPriceRange.max))
      : locationPool;
  const discoveryPool = samePricePool.length > 0 ? samePricePool : locationPool;
  const sortedDiscoveryPool = sortProperties(discoveryPool, scoreProperty);
  const sortedLocationPool = sortProperties(locationPool, scoreProperty);

  const relatedItems = pickItems(sortedDiscoveryPool, excludedIds, relatedItemLimit);

  const roomGroups = Array.from(
    discoveryPool.reduce((map, property) => {
      const groupInfo = getGroupInfo(property);
      const current = map.get(groupInfo.key) || {
        ...groupInfo,
        items: [] as PropertyPreview[],
      };

      current.items.push(property);
      map.set(groupInfo.key, current);
      return map;
    }, new Map<string, ReturnType<typeof getGroupInfo> & { items: PropertyPreview[] }>()),
  )
    .sort(([, groupA], [, groupB]) => {
      const groupAScore = (preferredRoomTypes.includes(groupA.sortKey) ? 1000 : 0) + groupA.items.length;
      const groupBScore = (preferredRoomTypes.includes(groupB.sortKey) ? 1000 : 0) + groupB.items.length;
      return groupBScore - groupAScore;
    })
    .slice(0, roomGroupLimit)
    .map(([, group]) => ({
      key: group.key,
      title: locationLabel ? `${group.title} ở ${locationLabel}` : group.title,
      subtitle: [
        `${group.items.length} tin liên quan`,
        priceLabel ? `cùng tầm ${priceLabel}` : "",
      ].filter(Boolean).join(" · "),
      href: buildRecommendationSearchUrl(criteria, group.hrefOverrides),
      items: pickItems(sortProperties(group.items, scoreProperty), excludedIds, groupItemLimit),
    }))
    .filter((group) => group.items.length > 0);

  const priceGroups = PRICE_BUCKETS
    .map((bucket) => {
      const items = sortedLocationPool.filter((property) => {
        if (bucket.min != null && property.price < bucket.min) return false;
        if (bucket.max != null && property.price > bucket.max) return false;
        return true;
      });

      return {
        bucket,
        items,
        score: getPriceBucketScore(criteria, bucket) + items.length,
      };
    })
    .filter((entry) => entry.items.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, priceGroupLimit)
    .map(({ bucket, items }) => ({
      key: `price:${bucket.key}`,
      title: locationLabel ? `${bucket.label} ở ${locationLabel}` : bucket.label,
      subtitle: `${items.length} tin cùng khu vực`,
      href: buildRecommendationSearchUrl(criteria, {
        category: undefined,
        roomType: undefined,
        keyword: undefined,
        priceMin: bucket.min,
        priceMax: bucket.max,
      }),
      items: pickItems(items, excludedIds, groupItemLimit),
    }))
    .filter((group) => group.items.length > 0);

  return {
    locationLabel,
    priceLabel,
    relatedItems,
    roomGroups,
    priceGroups,
  };
}
