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
  const propertyManifestQuery = usePropertyManifest({ enabled: id > 0 });
  const districtKey = id > 0 ? propertyManifestQuery.data?.[String(id)] : undefined;
  const districtPropertiesQuery = useDistrictProperties(districtKey, { enabled: Boolean(districtKey) });

  const data = useMemo(
    () => districtPropertiesQuery.data?.find((property) => property.id === id),
    [districtPropertiesQuery.data, id],
  );

  return {
    data,
    isLoading: propertyManifestQuery.isLoading || districtPropertiesQuery.isLoading,
    error: propertyManifestQuery.error || districtPropertiesQuery.error,
  };
}
