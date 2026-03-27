export interface PropertyPreview {
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
}

export interface PropertyPreviewListResponse {
  data: PropertyPreview[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PropertySearchParams {
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

const ROOM_TYPE_ALIASES: Record<string, string[]> = {
  studio: ["studio"],
  "1n1k": ["1n1k", "1pn1k", "1 ngu 1 khach"],
  "1n1b": ["1n1b", "1pn1b", "1 ngu 1 bep"],
  "2n1k": ["2n1k", "2pn1k", "2 ngu 1 khach", "2 phong ngu 1 khach"],
  "1 ngu": ["1 ngu", "1 phong ngu", "1pn", "1n1b", "1n1k"],
  "2 ngu": ["2 ngu", "2 phong ngu", "2pn", "2n1k"],
  "gac xep": ["gac xep", "duplex", "loft", "mezzanine"],
  "giuong tang": ["giuong tang", "ki tuc xa", "ktx", "bedspace", "dorm"],
};

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\u0111/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsNormalizedPhrase(source: string, phrase: string) {
  if (!source || !phrase) return false;

  const matcher = new RegExp(`(?:^|\\b)${escapeRegExp(phrase)}(?:\\b|$)`, "i");
  return matcher.test(source);
}

function getRoomTypeAliases(value: string | undefined) {
  const normalizedValue = normalizeSearchText(value || "");
  if (!normalizedValue) return [];
  return (ROOM_TYPE_ALIASES[normalizedValue] || [normalizedValue]).map((alias) => normalizeSearchText(alias));
}

export function listPropertyPreviews(
  allProperties: PropertyPreview[],
  params: PropertySearchParams = {},
): PropertyPreviewListResponse {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const keyword = normalizeSearchText(params.keyword || "");
  const requirement = normalizeSearchText(params.requirement || "");
  const roomTypeAliases = getRoomTypeAliases(params.roomType);
  const provinceSlug = params.province ? normalizeSearchText(params.province) : "";
  const districtSlug = params.district ? normalizeSearchText(params.district) : "";

  const filtered = allProperties.filter((property) => {
    const priceFloor = property.priceFrom ?? property.price;
    const priceCeil = property.priceTo ?? property.price;

    if (params.type && property.type !== params.type) return false;
    if (params.category && property.category !== params.category) return false;
    if (roomTypeAliases.length > 0) {
      if (!roomTypeAliases.some((alias) => containsNormalizedPhrase(property.roomTypeHaystack, alias))) return false;
    }
    if (keyword && !property.searchHaystack.includes(keyword)) return false;
    if (requirement && !property.searchHaystack.includes(requirement)) return false;
    if (provinceSlug && property.provinceSlug !== provinceSlug) return false;
    if (districtSlug && property.districtSlug !== districtSlug) return false;
    if (params.priceMin != null && priceCeil < params.priceMin) return false;
    if (params.priceMax != null && priceFloor > params.priceMax) return false;
    if (params.areaMin != null && property.area < params.areaMin) return false;
    if (params.areaMax != null && property.area > params.areaMax) return false;
    return true;
  });

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
