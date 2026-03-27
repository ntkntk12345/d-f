import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ListPropertiesParams, Property as PropertyDetail } from "./property-normalizer";
import { apiJsonFetch } from "@/context/AuthContext";
import { buildPropertyRecommendations, type PropertyRecommendations } from "./search-recommendations";
import {
  listPropertyPreviews,
  type PropertyPreview,
  type PropertyPreviewListResponse,
  type PropertySearchParams,
} from "./property-preview-search";

export const ADMIN_CONTACT_LABEL = "Liên hệ Zalo";
export const ADMIN_CONTACT_LINK = "https://zalo.me/0876480130/";
export const ADMIN_CONTACT_NAME = "Admin";

export type Property = PropertyDetail;
export type { PropertyPreview, PropertySearchParams } from "./property-preview-search";

export type SearchSuggestion = {
  label: string;
  district: string;
  province: string;
  searchValue: string;
};

export type HomePropertySection = {
  key: string;
  title: string;
  subtitle: string;
  href: string;
  items: PropertyPreview[];
};

export type HomePropertyData = {
  availableDistricts: string[];
  locationSuggestions: SearchSuggestion[];
  latestSections: HomePropertySection[];
};

export type FeaturedPost = {
  id: string;
  title: string;
  summary: string;
  content: string;
  address?: string;
  roomType?: string;
  priceLabel?: string;
  imageUrls?: string[];
  imageUrl?: string;
  actionLabel?: string;
  actionUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type PropertyListResponse = PropertyPreviewListResponse;

export type PropertySearchResponse = PropertyPreviewListResponse & {
  recommendations: PropertyRecommendations;
};

type PropertyManifest = Record<string, string>;

type ApiPropertyDetail = {
  id: number;
  title: string;
  type: string;
  category: string;
  price: number;
  priceUnit: string;
  area: number;
  address: string;
  province: string;
  district: string;
  ward?: string;
  bedrooms?: number;
  bathrooms?: number;
  floors?: number;
  description: string;
  images?: string[];
  contactName?: string;
  contactPhone?: string;
  contactLink?: string;
  isFeatured?: boolean;
  isVerified?: boolean;
  postedAt: string;
  expiresAt?: string;
  views: number;
  pricePerSqm?: number;
};

type QueryOptions = {
  enabled?: boolean;
};

const STATIC_DATA_STALE_TIME_MS = 24 * 60 * 60 * 1000;
const SEARCH_QUERY_STALE_TIME_MS = 30 * 1000;
const FEATURED_POSTS_STALE_TIME_MS = 30 * 1000;

export const EMPTY_PROPERTY_RECOMMENDATIONS: PropertyRecommendations = {
  locationLabel: null,
  priceLabel: null,
  relatedItems: [],
  roomGroups: [],
  priceGroups: [],
};

function getStaticDataUrl(relativePath: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/data/properties/${relativePath}?v=${encodeURIComponent(__APP_BUILD_ID__)}`;
}

function normalizePropertyKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function buildApiPropertyTimeline(description: string, postedAt: string) {
  const text = description.trim();
  if (!text) return [];

  const timestamp = Number.isNaN(Date.parse(postedAt)) ? Date.now() : Date.parse(postedAt);
  return [
    {
      type: "text" as const,
      timestamp,
      text,
    },
  ];
}

function normalizeApiProperty(raw: ApiPropertyDetail): Property {
  const images = Array.isArray(raw.images) ? raw.images.filter(Boolean) : [];
  const districtKey = normalizePropertyKey(raw.district || "");
  const sourceKeywords = [raw.ward, raw.district, raw.province].filter(
    (value): value is string => Boolean(value?.trim()),
  );

  return {
    id: raw.id,
    title: raw.title,
    type: raw.type,
    category: raw.category,
    price: raw.price,
    priceFrom: raw.price,
    priceTo: raw.price,
    priceUnit: raw.priceUnit,
    area: raw.area,
    address: raw.address,
    province: raw.province,
    district: raw.district,
    districtKey,
    ward: raw.ward,
    bedrooms: raw.bedrooms ?? null,
    bathrooms: raw.bathrooms ?? null,
    floors: raw.floors ?? null,
    roomType: null,
    description: raw.description,
    images,
    contactName: raw.contactName || ADMIN_CONTACT_NAME,
    contactPhone: raw.contactPhone || ADMIN_CONTACT_LABEL,
    contactLink: raw.contactLink || ADMIN_CONTACT_LINK,
    isFeatured: raw.isFeatured === true,
    isVerified: raw.isVerified === true,
    postedAt: raw.postedAt,
    views: raw.views || 0,
    pricePerSqm: raw.pricePerSqm ?? null,
    sourceFile: "api/properties",
    sourceRawId: String(raw.id),
    sourceText: raw.description,
    sourceKeywords,
    photoItems: images.map((url) => ({ url })),
    videoItems: [],
    timelineItems: buildApiPropertyTimeline(raw.description, raw.postedAt),
  };
}

async function readStaticJson<T>(relativePath: string): Promise<T> {
  const response = await fetch(getStaticDataUrl(relativePath), {
    cache: "default",
  });
  if (!response.ok) {
    throw new Error(`Cannot load ${relativePath}`);
  }

  return (await response.json()) as T;
}

function appendNumberParam(params: URLSearchParams, key: string, value: number | undefined) {
  if (value != null) {
    params.set(key, String(value));
  }
}

function buildPropertySearchQueryString(query: PropertySearchParams) {
  const params = new URLSearchParams();

  if (query.type) params.set("type", query.type);
  if (query.category) params.set("category", query.category);
  if (query.roomType) params.set("roomType", query.roomType);
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.requirement) params.set("requirement", query.requirement);
  if (query.province) params.set("province", query.province);
  if (query.district) params.set("district", query.district);
  appendNumberParam(params, "priceMin", query.priceMin);
  appendNumberParam(params, "priceMax", query.priceMax);
  appendNumberParam(params, "areaMin", query.areaMin);
  appendNumberParam(params, "areaMax", query.areaMax);
  appendNumberParam(params, "page", query.page);
  appendNumberParam(params, "limit", query.limit);

  return params.toString();
}

async function loadPropertySearchFallback(query: PropertySearchParams): Promise<PropertySearchResponse> {
  const propertyIndex = await readStaticJson<PropertyPreview[]>("index.json");
  const result = listPropertyPreviews(propertyIndex, query);

  return {
    ...result,
    recommendations: buildPropertyRecommendations(propertyIndex, query, {
      excludedIds: result.data.map((property) => property.id),
      relatedItemLimit: 8,
      groupItemLimit: 4,
      roomGroupLimit: 4,
      priceGroupLimit: 3,
    }),
  };
}

async function readRemotePropertySearch(query: PropertySearchParams): Promise<PropertySearchResponse> {
  const queryString = buildPropertySearchQueryString(query);
  const path = queryString ? `/properties/search?${queryString}` : "/properties/search";
  const { res, data } = await apiJsonFetch<PropertySearchResponse | null>(path, null);

  if (res.ok && data) {
    return {
      ...data,
      recommendations: data.recommendations || EMPTY_PROPERTY_RECOMMENDATIONS,
    };
  }

  return loadPropertySearchFallback(query);
}

export function usePropertyIndex(options: QueryOptions = {}) {
  return useQuery({
    queryKey: ["property-index"],
    queryFn: () => readStaticJson<PropertyPreview[]>("index.json"),
    enabled: options.enabled ?? true,
    staleTime: STATIC_DATA_STALE_TIME_MS,
    gcTime: STATIC_DATA_STALE_TIME_MS,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

export function useHomePropertyData(options: QueryOptions = {}) {
  return useQuery({
    queryKey: ["property-home-data"],
    queryFn: () => readStaticJson<HomePropertyData>("home.json"),
    enabled: options.enabled ?? true,
    staleTime: STATIC_DATA_STALE_TIME_MS,
    gcTime: STATIC_DATA_STALE_TIME_MS,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

export function useSearchProperties(params: PropertySearchParams = {}, options: QueryOptions = {}) {
  return useQuery({
    queryKey: ["property-search", params],
    queryFn: () => readRemotePropertySearch(params),
    enabled: options.enabled ?? true,
    staleTime: SEARCH_QUERY_STALE_TIME_MS,
    gcTime: STATIC_DATA_STALE_TIME_MS,
    refetchOnWindowFocus: false,
  });
}

export function useFeaturedPosts(options: QueryOptions = {}) {
  return useQuery({
    queryKey: ["featured-posts"],
    queryFn: async () => {
      const { res, data } = await apiJsonFetch<FeaturedPost[]>("/site/featured-posts", []);
      return res.ok && Array.isArray(data) ? data : [];
    },
    enabled: options.enabled ?? true,
    staleTime: FEATURED_POSTS_STALE_TIME_MS,
    gcTime: STATIC_DATA_STALE_TIME_MS,
    refetchOnWindowFocus: false,
  });
}

export function useGetFeaturedPost(id: string | undefined, options: QueryOptions = {}) {
  const featuredPostsQuery = useFeaturedPosts({
    enabled: (options.enabled ?? true) && Boolean(id),
  });
  const data = useMemo(
    () => featuredPostsQuery.data?.find((post) => post.id === id),
    [featuredPostsQuery.data, id],
  );

  return {
    data,
    isLoading: featuredPostsQuery.isLoading,
    error: featuredPostsQuery.error,
  };
}

function usePropertyManifest(options: QueryOptions = {}) {
  return useQuery({
    queryKey: ["property-manifest"],
    queryFn: () => readStaticJson<PropertyManifest>("manifest.json"),
    enabled: options.enabled ?? true,
    staleTime: STATIC_DATA_STALE_TIME_MS,
    gcTime: STATIC_DATA_STALE_TIME_MS,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

function useDistrictProperties(districtKey: string | undefined, options: QueryOptions = {}) {
  return useQuery({
    queryKey: ["property-district", districtKey],
    queryFn: () => readStaticJson<Property[]>(`districts/${districtKey}.json`),
    enabled: (options.enabled ?? true) && Boolean(districtKey),
    staleTime: STATIC_DATA_STALE_TIME_MS,
    gcTime: STATIC_DATA_STALE_TIME_MS,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

export function listProperties(allProperties: PropertyPreview[], params: ListPropertiesParams = {}): PropertyListResponse {
  return listPropertyPreviews(allProperties, params);
}

export function useListProperties(params: ListPropertiesParams = {}, options: QueryOptions = {}) {
  const propertyIndexQuery = usePropertyIndex(options);
  const data = useMemo(
    () => (propertyIndexQuery.data ? listProperties(propertyIndexQuery.data, params) : undefined),
    [
      propertyIndexQuery.data,
      params.areaMax,
      params.areaMin,
      params.category,
      params.district,
      params.keyword,
      params.limit,
      params.page,
      params.priceMax,
      params.priceMin,
      params.province,
      params.requirement,
      params.roomType,
      params.type,
    ],
  );

  return {
    data,
    isLoading: propertyIndexQuery.isLoading,
    error: propertyIndexQuery.error,
  };
}

export function useGetFeaturedProperties() {
  const propertyIndexQuery = usePropertyIndex();
  const data = useMemo(
    () => propertyIndexQuery.data?.filter((property) => property.isFeatured).slice(0, 12),
    [propertyIndexQuery.data],
  );

  return {
    data,
    isLoading: propertyIndexQuery.isLoading,
    error: propertyIndexQuery.error,
  };
}

export function useGetProperty(id: number) {
  return useQuery({
    queryKey: ["property-detail", id],
    enabled: id > 0,
    staleTime: SEARCH_QUERY_STALE_TIME_MS,
    gcTime: STATIC_DATA_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const manifest = await readStaticJson<PropertyManifest>("manifest.json");
      const districtKey = manifest[String(id)];

      if (districtKey) {
        const districtProperties = await readStaticJson<Property[]>(`districts/${districtKey}.json`);
        const staticProperty = districtProperties.find((property) => property.id === id);
        if (staticProperty) {
          return staticProperty;
        }
      }

      const { res, data } = await apiJsonFetch<ApiPropertyDetail | null>(`/properties/${id}`, null);

      if (!res.ok || !data) {
        throw new Error(`Cannot load property ${id}`);
      }

      return normalizeApiProperty(data);
    },
  });
}
