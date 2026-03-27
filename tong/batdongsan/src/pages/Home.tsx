import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  Loader2,
  MapPin,
  RefreshCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeaturedPostCard } from "@/components/featured/FeaturedPostCard";
import { PropertyCard } from "@/components/property/PropertyCard";
import {
  EMPTY_PROPERTY_RECOMMENDATIONS,
  useHomePropertyData,
  useFeaturedPosts,
  useSearchProperties,
  type PropertyPreview,
  type SearchSuggestion,
} from "@/lib/local-properties";
import {
  buildPageRestoreKey,
  consumePendingPageRestore,
  restorePageScroll,
  savePageRestoreSnapshot,
} from "@/lib/page-restore";
import { type SearchHistory, useSearchHistory } from "@/hooks/useSearchHistory";
import { useSeo } from "@/hooks/useSeo";

const PRICE_MAX = 20;
const PRICE_SELECT_OPTIONS = Array.from({ length: PRICE_MAX }, (_, index) => index + 1);
const INITIAL_VISIBLE_LATEST_SECTIONS = 4;
const LOAD_MORE_LATEST_SECTIONS = 3;
const LOAD_MORE_DELAY_MS = 450;

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

function getSearchSuggestions(query: string, suggestions: SearchSuggestion[]) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const startsWith: SearchSuggestion[] = [];
  const contains: SearchSuggestion[] = [];

  for (const suggestion of suggestions) {
    if (suggestion.searchValue.startsWith(normalizedQuery)) {
      startsWith.push(suggestion);
      continue;
    }

    if (suggestion.searchValue.includes(normalizedQuery)) {
      contains.push(suggestion);
    }
  }

  return [...startsWith, ...contains].slice(0, 6);
}
const ROOM_TYPE_FILTER_OPTIONS = ["1n1k", "2n1k", "studio", "giường tầng", "gác xép"];

function clampPrice(value: number) {
  return Math.min(Math.max(value, 0), PRICE_MAX);
}

function normalizePriceMin(value?: number | null) {
  if (value == null || Number.isNaN(value)) return 0;
  return clampPrice(Math.floor(value));
}

function normalizePriceMax(value?: number | null) {
  if (value == null || Number.isNaN(value)) return PRICE_MAX;
  return clampPrice(Math.ceil(value));
}

function formatPrice(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function formatSelectedPriceRange(min: number, max: number) {
  if (min <= 0 && max >= PRICE_MAX) return "Tất cả mức giá";
  if (min > 0 && max < PRICE_MAX) return `${formatPrice(min)} - ${formatPrice(max)} triệu`;
  if (min > 0) return `Từ ${formatPrice(min)} triệu`;
  return `Đến ${formatPrice(max)} triệu`;
}

function formatPriceLabel(min?: number | null, max?: number | null) {
  if (min != null && max != null) return `${formatPrice(min)}–${formatPrice(max)} triệu`;
  if (min != null) return `trên ${formatPrice(min)} triệu`;
  if (max != null) return `dưới ${formatPrice(max)} triệu`;
  return null;
}

type HomePageRestoreSnapshot = {
  scrollY: number;
  visibleLatestSectionCount: number;
  propertyId?: number;
};

const PRICE_BUCKETS = [
  { key: "under-2", label: "Dưới 2 triệu", max: 2 },
  { key: "2-3", label: "2-3 triệu", min: 2, max: 3 },
  { key: "3-5", label: "3-5 triệu", min: 3, max: 5 },
  { key: "5-7", label: "5-7 triệu", min: 5, max: 7 },
  { key: "7-10", label: "7-10 triệu", min: 7, max: 10 },
  { key: "10-plus", label: "Trên 10 triệu", min: 10 },
];

const LATEST_PRICE_BUCKETS = [
  { key: "4-5", label: "4-5 triệu", min: 4, max: 5 },
  { key: "5-7", label: "5-7 triệu", min: 5, max: 7 },
  { key: "7-10", label: "7-10 triệu", min: 7, max: 10 },
  { key: "10-plus", label: "Trên 10 triệu", min: 10 },
  { key: "3-4", label: "3-4 triệu", min: 3, max: 4 },
  { key: "2-3", label: "2-3 triệu", min: 2, max: 3 },
  { key: "under-2", label: "Dưới 2 triệu", max: 2 },
];

function formatGroupTitle(value: string) {
  const normalized = value.trim().toLowerCase();
  const titleMap: Record<string, string> = {
    studio: "Studio",
    "gác xép": "Gác xép",
    "giường tầng": "Giường tầng",
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
    "phong-tro": "Phòng trọ",
    studio: "Studio",
    "nha-nguyen-can": "Nhà nguyên căn",
    "o-ghep": "Ở ghép",
    "mat-bang": "Mặt bằng kinh doanh",
  };

  return titleMap[value] || formatGroupTitle(value.replace(/-/g, " "));
}

function includesNormalized(source: string, query?: string) {
  if (!query) return true;
  return normalizeSearchText(source).includes(normalizeSearchText(query));
}

function matchesDiscoveryPreferences(property: PropertyPreview, search: SearchHistory) {
  if (property.type !== "cho-thue") return false;
  if (search.category && property.category !== search.category) return false;
  if (search.province && normalizeSearchText(property.province) !== normalizeSearchText(search.province)) return false;
  if (search.district && normalizeSearchText(property.district) !== normalizeSearchText(search.district)) return false;

  if (!includesNormalized(property.searchHaystack, search.keyword)) return false;

  return true;
}

function buildSearchUrlFromHistory(search: SearchHistory | null, overrides: Partial<SearchHistory> = {}) {
  const params = new URLSearchParams({ type: "cho-thue" });
  const merged = { ...(search || {}), ...overrides };

  if (merged.category) params.append("category", merged.category);
  if (merged.keyword) params.append("keyword", merged.keyword);
  if (merged.roomType) params.append("roomType", merged.roomType);
  if (merged.province) params.append("province", merged.province);
  if (merged.district) params.append("district", merged.district);
  if (merged.priceMin != null) params.append("priceMin", String(merged.priceMin));
  if (merged.priceMax != null) params.append("priceMax", String(merged.priceMax));

  return `/search?${params.toString()}`;
}

function getPriceBucketScore(search: SearchHistory, min?: number, max?: number) {
  const targetMin = search.priceMin ?? 0;
  const targetMax = search.priceMax ?? PRICE_MAX;
  const bucketMin = min ?? 0;
  const bucketMax = max ?? PRICE_MAX;
  const overlap = Math.max(0, Math.min(targetMax, bucketMax) - Math.max(targetMin, bucketMin));

  if (overlap > 0) return overlap + 100;

  const distance = bucketMax < targetMin ? targetMin - bucketMax : bucketMin - targetMax;
  return -distance;
}

export function Home() {
  const [location, setLocation] = useLocation();
  const pageRestoreKey = buildPageRestoreKey(location);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const [roomType, setRoomType] = useState("");
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, PRICE_MAX]);
  const [visibleLatestSectionCount, setVisibleLatestSectionCount] = useState(INITIAL_VISIBLE_LATEST_SECTIONS);
  const [isLoadingMoreLatestSections, setIsLoadingMoreLatestSections] = useState(false);
  const [hasStartedScrollingLatest, setHasStartedScrollingLatest] = useState(false);
  const latestLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const latestScrollPositionRef = useRef(0);
  const restoreSnapshotRef = useRef<HomePageRestoreSnapshot | null>(null);
  const hasRestoredScrollRef = useRef(false);

  const handlePriceMinChange = (value: string) => {
    const nextMin = value ? normalizePriceMin(Number(value)) : 0;
    setPriceRange((prev) => [nextMin, Math.max(nextMin, prev[1])]);
  };

  const handlePriceMaxChange = (value: string) => {
    const nextMax = value ? normalizePriceMax(Number(value)) : PRICE_MAX;
    setPriceRange((prev) => [Math.min(prev[0], nextMax), nextMax]);
  };

  const handleProvinceChange = (value: string) => {
    setProvince(value);
    setDistrict("");
  };

  const { personalizedSearch, addSearch, clearHistory } = useSearchHistory();
  const { data: homeData, isLoading: isHomeDataLoading } = useHomePropertyData();
  const { data: featuredPosts = [], isLoading: isFeaturedPostsLoading } = useFeaturedPosts();

  useEffect(() => {
    if (!personalizedSearch) return;

    if (personalizedSearch.keyword) setSearchQuery(personalizedSearch.keyword);
    if (personalizedSearch.roomType) setRoomType(personalizedSearch.roomType);
    if (personalizedSearch.province) setProvince(personalizedSearch.province);
    if (personalizedSearch.district) setDistrict(personalizedSearch.district);

    setPriceRange([
      normalizePriceMin(personalizedSearch.priceMin),
      normalizePriceMax(personalizedSearch.priceMax),
    ]);
  }, [personalizedSearch]);

  const { data: personalizedData } = useSearchProperties(
    personalizedSearch
      ? {
          type: "cho-thue",
          category: personalizedSearch.category,
          keyword: personalizedSearch.keyword,
          roomType: personalizedSearch.roomType,
          province: personalizedSearch.province,
          district: personalizedSearch.district,
          priceMin: personalizedSearch.priceMin,
          priceMax: personalizedSearch.priceMax,
          page: 1,
          limit: 4,
        }
      : {},
    { enabled: Boolean(personalizedSearch) },
  );

  /*
  const latestPropertyList = allProperties.filter((property) => property.type === "cho-thue");
  const latestDisplaySections: RecommendationGroup[] = Array.from(
    latestPropertyList.reduce((map, property) => {
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

      if (!bucket) return map;

      const sectionKey = `${baseKey}:${bucket.key}`;
      const current = map.get(sectionKey) || {
        key: sectionKey,
        title: `${baseTitle} · ${bucket.label}`,
        subtitle: "",
        href: property.roomType?.trim()
          ? `/search?type=cho-thue&roomType=${encodeURIComponent(property.roomType.trim())}${bucket.min != null ? `&priceMin=${bucket.min}` : ""}${bucket.max != null ? `&priceMax=${bucket.max}` : ""}`
          : `/search?type=cho-thue&category=${property.category.trim()}${bucket.min != null ? `&priceMin=${bucket.min}` : ""}${bucket.max != null ? `&priceMax=${bucket.max}` : ""}`,
        items: [] as Property[],
      };

      current.items.push(property);
      map.set(sectionKey, current);
      return map;
    }, new Map<string, RecommendationGroup>()).values(),
  )
    .map((group) => ({
      ...group,
      subtitle: `${group.items.length} tin mới`,
    }))
    .sort((a, b) => {
      const bucketIndexA = LATEST_PRICE_BUCKETS.findIndex((bucket) => a.key.endsWith(`:${bucket.key}`));
      const bucketIndexB = LATEST_PRICE_BUCKETS.findIndex((bucket) => b.key.endsWith(`:${bucket.key}`));

      if (bucketIndexA !== bucketIndexB) return bucketIndexA - bucketIndexB;
      return b.items.length - a.items.length;
    });
  */
  const latestSections = homeData?.latestSections || [];
  const visibleLatestSections = latestSections.slice(0, visibleLatestSectionCount);
  const personalizedPropertyList = Array.isArray(personalizedData?.data) ? personalizedData.data : [];
  const districtOptions = province ? homeData?.availableDistricts || [] : [];
  const addressSuggestions = useMemo(
    () => getSearchSuggestions(searchQuery, homeData?.locationSuggestions || []),
    [homeData?.locationSuggestions, searchQuery],
  );

  useEffect(() => {
    const restoreSnapshot = consumePendingPageRestore<HomePageRestoreSnapshot>(pageRestoreKey);
    const nextVisibleLatestSectionCount =
      latestSections.length > 0
        ? Math.min(
            restoreSnapshot?.visibleLatestSectionCount || INITIAL_VISIBLE_LATEST_SECTIONS,
            latestSections.length,
          )
        : 0;

    restoreSnapshotRef.current = restoreSnapshot;
    hasRestoredScrollRef.current = false;
    setVisibleLatestSectionCount(nextVisibleLatestSectionCount);
    setIsLoadingMoreLatestSections(false);
    setHasStartedScrollingLatest(false);
    latestScrollPositionRef.current = window.scrollY;
  }, [latestSections.length, pageRestoreKey]);

  useEffect(() => {
    latestScrollPositionRef.current = window.scrollY;
    let frameId: number | null = null;

    const persistSnapshot = () => {
      savePageRestoreSnapshot<HomePageRestoreSnapshot>(pageRestoreKey, {
        scrollY: window.scrollY,
        visibleLatestSectionCount,
      });
    };

    const queuePersistSnapshot = () => {
      if (frameId != null) return;

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        persistSnapshot();
      });
    };

    const handleScroll = () => {
      const nextScrollY = window.scrollY;
      const hasScrolledDownEnough =
        nextScrollY > latestScrollPositionRef.current && nextScrollY - latestScrollPositionRef.current > 24;

      if (hasScrolledDownEnough) {
        setHasStartedScrollingLatest(true);
      }

      latestScrollPositionRef.current = nextScrollY;
      queuePersistSnapshot();
    };

    persistSnapshot();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (frameId != null) window.cancelAnimationFrame(frameId);
      persistSnapshot();
      window.removeEventListener("scroll", handleScroll);
    };
  }, [pageRestoreKey, visibleLatestSectionCount]);

  useEffect(() => {
    const restoreSnapshot = restoreSnapshotRef.current;
    if (!restoreSnapshot || hasRestoredScrollRef.current) return;

    const requiredSectionCount =
      latestSections.length > 0
        ? Math.min(
            restoreSnapshot.visibleLatestSectionCount || INITIAL_VISIBLE_LATEST_SECTIONS,
            latestSections.length,
          )
        : 0;

    if (visibleLatestSectionCount < requiredSectionCount) return;

    hasRestoredScrollRef.current = true;
    window.requestAnimationFrame(() => {
      restorePageScroll(restoreSnapshot);
      restoreSnapshotRef.current = null;
    });
  }, [latestSections.length, personalizedPropertyList.length, visibleLatestSectionCount]);

  useEffect(() => {
    if (
      visibleLatestSectionCount >= latestSections.length ||
      !hasStartedScrollingLatest
    ) {
      return;
    }

    const node = latestLoadMoreRef.current;
    if (!node) return;

    let timeoutId: number | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;

        setIsLoadingMoreLatestSections(true);
        observer.disconnect();

        timeoutId = window.setTimeout(() => {
          setVisibleLatestSectionCount((current) =>
            Math.min(current + LOAD_MORE_LATEST_SECTIONS, latestSections.length),
          );
          setIsLoadingMoreLatestSections(false);
          setHasStartedScrollingLatest(false);
          latestScrollPositionRef.current = window.scrollY;
        }, LOAD_MORE_DELAY_MS);
      },
      {
        rootMargin: "240px 0px",
      },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [hasStartedScrollingLatest, latestSections.length, visibleLatestSectionCount]);

  const applySuggestion = (suggestion: SearchSuggestion) => {
    setSearchQuery(suggestion.label);
    setProvince(suggestion.province || "Hà Nội");
    setDistrict(suggestion.district || "");
    setIsSuggestionOpen(false);
  };

  const buildContinueSearchUrl = () => {
    if (!personalizedSearch) return "/search?type=cho-thue";

    const params = new URLSearchParams({ type: "cho-thue" });
    if (personalizedSearch.keyword) params.append("keyword", personalizedSearch.keyword);
    if (personalizedSearch.roomType) params.append("roomType", personalizedSearch.roomType);
    if (personalizedSearch.province) params.append("province", personalizedSearch.province);
    if (personalizedSearch.district) params.append("district", personalizedSearch.district);
    if (personalizedSearch.priceMin != null) params.append("priceMin", String(personalizedSearch.priceMin));
    if (personalizedSearch.priceMax != null) params.append("priceMax", String(personalizedSearch.priceMax));
    return `/search?${params.toString()}`;
  };

  const priceLabel = formatPriceLabel(personalizedSearch?.priceMin, personalizedSearch?.priceMax);
  const personalizedRecommendations = personalizedData?.recommendations || EMPTY_PROPERTY_RECOMMENDATIONS;
  const personalizedLocationLabel =
    personalizedRecommendations.locationLabel ||
    personalizedSearch?.district ||
    personalizedSearch?.keyword ||
    personalizedSearch?.province ||
    null;
  const recommendationRoomGroups = personalizedRecommendations.roomGroups;
  const recommendationPriceGroups = personalizedRecommendations.priceGroups;
  const leadPersonalizedItems =
    personalizedPropertyList.length > 0
      ? personalizedPropertyList
      : personalizedRecommendations.relatedItems;
  const isPersonalizedFallback =
    Boolean(personalizedSearch) &&
    personalizedPropertyList.length === 0 &&
    leadPersonalizedItems.length > 0;
  const hasPersonalizedRecommendations =
    Boolean(personalizedSearch) &&
    (
      leadPersonalizedItems.length > 0 ||
      recommendationRoomGroups.length > 0 ||
      recommendationPriceGroups.length > 0
    );

  useSeo({
    title: "80LandTimPhong.vn | Tìm phòng trọ, studio, chung cư mini tại Hà Nội",
    description:
      "Tìm phòng trọ, studio, chung cư mini, nhà nguyên căn và ở ghép tại Hà Nội. Lọc theo quận, mức giá và dạng phòng nhanh gọn hơn.",
    image: "/opengraph.jpg",
    type: "website",
  });

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setIsSuggestionOpen(false);

    const [minPrice, maxPrice] = priceRange;
    const priceMin = minPrice > 0 ? minPrice : undefined;
    const priceMax = maxPrice < PRICE_MAX ? maxPrice : undefined;

    addSearch({ keyword: searchQuery, province, district, roomType, priceMin, priceMax });

    const params = new URLSearchParams();
    params.append("type", "cho-thue");
    if (searchQuery) params.append("keyword", searchQuery);
    if (roomType) params.append("roomType", roomType);
    if (province) params.append("province", province);
    if (district) params.append("district", district);
    if (priceMin != null) params.append("priceMin", String(priceMin));
    if (priceMax != null) params.append("priceMax", String(priceMax));

    setLocation(`/search?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#f8f8f8] pb-24 lg:pb-0">
      <section className="w-full bg-gradient-to-b from-[#fff7ec] via-[#fffdf8] to-[#f8f8f8]">
        <div className="mx-auto max-w-[1140px] px-4 pb-8 pt-5 md:pb-12 md:pt-8">
          <form onSubmit={handleSearch} className="mx-auto max-w-4xl overflow-hidden rounded-[24px] bg-white shadow-xl md:rounded-2xl md:shadow-2xl">
            <div className="border-b border-border">
              <div className="relative px-2 py-2">
                <Search className="absolute left-6 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Nhập địa chỉ, phường/xã, quận/huyện, tỉnh/thành..."
                  className="h-12 w-full rounded-2xl border border-border bg-white pl-12 pr-16 text-[15px] focus:outline-none focus:ring-1 focus:ring-primary/20 sm:h-14"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSuggestionOpen(true);
                  }}
                  onFocus={() => setIsSuggestionOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setIsSuggestionOpen(false), 120);
                  }}
                />
                {isSuggestionOpen && addressSuggestions.length > 0 && (
                  <div className="absolute inset-x-2 top-[calc(100%-2px)] z-20 overflow-hidden rounded-b-2xl border border-border bg-white py-2 shadow-2xl">
                    {addressSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.searchValue}
                        type="button"
                        onMouseDown={() => applySuggestion(suggestion)}
                        className="flex w-full items-start gap-3 px-4 py-2 text-left transition-colors hover:bg-muted/50"
                      >
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-foreground">{suggestion.label}</span>
                          <span className="block text-xs text-muted-foreground">
                            {suggestion.district}, {suggestion.province}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <Button
                  type="submit"
                  size="icon"
                  className="absolute right-4 top-1/2 h-9 w-9 -translate-y-1/2 rounded-lg border-0 bg-[#ef3b2d] p-0 text-white hover:bg-[#dc2f22]"
                >
                  <Search className="h-4 w-4" />
                  <span className="sr-only">Tìm kiếm</span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 border-t border-border md:grid-cols-5">
              <div className="border-b border-border p-3 md:border-r md:border-b-0">
                <label className="mb-1 block text-[10px] font-semibold uppercase text-muted-foreground">
                  🏠 Loại phòng
                </label>
                <select
                  value={roomType}
                  onChange={(e) => setRoomType(e.target.value)}
                  className="w-full cursor-pointer bg-transparent text-sm font-medium text-foreground focus:outline-none"
                >
                  <option value="">Tất cả loại</option>
                  {ROOM_TYPE_FILTER_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-b border-border p-3 md:border-r md:border-b-0">
                <label className="mb-1 block text-[10px] font-semibold uppercase text-muted-foreground">
                  📍 Thành phố
                </label>
                <select
                  value={province}
                  onChange={(e) => handleProvinceChange(e.target.value)}
                  className="w-full cursor-pointer bg-transparent text-sm font-medium text-foreground focus:outline-none"
                >
                  <option value="">Chọn thành phố</option>
                  <option value="Hà Nội">Hà Nội</option>
                </select>
              </div>

              <div className="border-b border-border p-3 md:col-span-2 md:border-r md:border-b-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="block text-[10px] font-semibold uppercase text-muted-foreground">
                    💰 Giá thuê
                  </label>
                  <span className="text-xs font-medium text-foreground">
                    {formatSelectedPriceRange(priceRange[0], priceRange[1])}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Từ</label>
                    <select
                      value={priceRange[0] > 0 ? String(priceRange[0]) : ""}
                      onChange={(e) => handlePriceMinChange(e.target.value)}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-foreground focus:outline-none"
                    >
                      <option value="">Không giới hạn</option>
                      {PRICE_SELECT_OPTIONS.map((value) => (
                        <option key={`price-min-${value}`} value={value}>
                          {value}tr
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Đến</label>
                    <select
                      value={priceRange[1] < PRICE_MAX ? String(priceRange[1]) : ""}
                      onChange={(e) => handlePriceMaxChange(e.target.value)}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-foreground focus:outline-none"
                    >
                      <option value="">Không giới hạn</option>
                      {PRICE_SELECT_OPTIONS.map((value) => (
                        <option key={`price-max-${value}`} value={value}>
                          {value >= PRICE_MAX ? `${PRICE_MAX}+tr` : `${value}tr`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-end gap-2 p-3">
                <div className="flex-grow">
                  <label className="mb-1 block text-[10px] font-semibold uppercase text-muted-foreground">
                    🗺️ {province ? "Quận / Huyện" : "Khu vực"}
                  </label>
                  {districtOptions.length > 0 ? (
                    <select
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full cursor-pointer bg-transparent text-sm font-medium text-foreground focus:outline-none"
                    >
                      <option value="">Tất cả quận</option>
                      {districtOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      placeholder={province ? "Nhập khu vực..." : "Chọn TP trước"}
                      disabled={!province}
                      className="w-full bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-40"
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsSuggestionOpen(false);
                    setRoomType("");
                    setProvince("");
                    setDistrict("");
                    setSearchQuery("");
                    setPriceRange([0, PRICE_MAX]);
                  }}
                  className="mb-0.5 shrink-0 text-muted-foreground transition-colors hover:text-primary"
                  title="Xóa bộ lọc"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>

      {hasPersonalizedRecommendations && (
        <section className="border-y-2 border-amber-300 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 py-8">
          <div className="mx-auto max-w-[1140px] px-4">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-400 shadow-md">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-extrabold text-foreground">Gợi ý riêng cho bạn</h2>
                    <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-white">MỚI</span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Dựa trên lịch sử tìm kiếm của bạn
                    {personalizedLocationLabel && (
                      <>
                        {" · "}
                        <span className="font-bold text-primary">{personalizedLocationLabel}</span>
                      </>
                    )}
                    {personalizedSearch.roomType && (
                      <>
                        {" · "}
                        <span className="font-bold text-primary">{personalizedSearch.roomType}</span>
                      </>
                    )}
                    {priceLabel && (
                      <>
                        {" · "}
                        <span className="font-bold text-amber-600">{priceLabel}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
                <Link href={buildContinueSearchUrl()}>
                  <button className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary/90 sm:w-auto">
                    Tiếp tục tìm kiếm
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </Link>
                <button
                  onClick={clearHistory}
                  className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground"
                  title="Xóa lịch sử"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {isPersonalizedFallback && (
              <div className="mb-5 rounded-2xl border border-amber-200 bg-white/80 px-4 py-3 text-sm text-muted-foreground shadow-sm">
                Không có nhiều tin khớp tuyệt đối với lượt tìm gần nhất, nên hệ thống đang bung tiếp các phòng cùng khu vực và tầm giá để bạn xem nhanh hơn.
              </div>
            )}

            {leadPersonalizedItems.length > 0 && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                {leadPersonalizedItems.map((property) => (
                  <PropertyCard key={property.id} property={property} layout="grid" />
                ))}
              </div>
            )}

            {recommendationRoomGroups.length > 0 && (
              <div className="mt-8">
                <div className="mb-4">
                  <h3 className="text-base font-extrabold text-foreground">Lướt Theo Loại Phòng</h3>
                  <p className="text-sm text-muted-foreground">Chia theo nhóm phòng để người xem có thêm điểm bấm và lướt lâu hơn.</p>
                </div>
                <div className="space-y-6">
                  {recommendationRoomGroups.map((group) => (
                    <div key={group.key}>
                      <div className="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                        <div>
                          <h4 className="text-sm font-extrabold text-foreground">{group.title}</h4>
                          <p className="text-xs text-muted-foreground">{group.subtitle}</p>
                        </div>
                        <Link href={group.href} className="text-xs font-bold text-primary hover:underline">
                          Xem Nhóm Này
                        </Link>
                      </div>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                        {group.items.map((property) => (
                          <PropertyCard key={`${group.key}-${property.id}`} property={property} layout="grid" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {recommendationPriceGroups.length > 0 && (
              <div className="mt-8">
                <div className="mb-4">
                  <h3 className="text-base font-extrabold text-foreground">Lướt Theo Tầm Giá</h3>
                  <p className="text-sm text-muted-foreground">Tách sẵn theo mức giá để người dùng lướt tiếp mà không cần vào trang tất cả.</p>
                </div>
                <div className="space-y-6">
                  {recommendationPriceGroups.map((group) => (
                    <div key={group.key}>
                      <div className="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                        <div>
                          <h4 className="text-sm font-extrabold text-foreground">{group.title}</h4>
                          <p className="text-xs text-muted-foreground">{group.subtitle}</p>
                        </div>
                        <Link href={group.href} className="text-xs font-bold text-primary hover:underline">
                          Xem Tầm Giá Này
                        </Link>
                      </div>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                        {group.items.map((property) => (
                          <PropertyCard key={`${group.key}-${property.id}`} property={property} layout="grid" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {personalizedPropertyList.length > 0 && (personalizedData?.total ?? personalizedPropertyList.length) > 4 && (
              <div className="mt-5 text-center">
                <Link href={buildContinueSearchUrl()}>
                  <button className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
                    Xem thêm {(personalizedData?.total ?? personalizedPropertyList.length) - 4} kết quả
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="bg-[linear-gradient(180deg,#fff8ee_0%,#fffdf8_54%,#f8f8f8_100%)] py-10">
        <div className="mx-auto max-w-[1140px] px-4">
          <div className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#fff1d9] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#b45309]">
                <Sparkles className="h-3.5 w-3.5" />
                Noi Bat
              </div>
              <h2 className="mt-3 text-2xl font-black text-foreground">Bai viet noi bat tu admin</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Bai viet moi se hien ngay tren web va duoc dong bo sang bot de gui lai theo chu ky.
              </p>
            </div>
          </div>

          {isFeaturedPostsLoading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="animate-pulse overflow-hidden rounded-2xl border border-border/50 bg-white shadow-sm">
                  <div className="bg-[#f7efe2]" style={{ paddingBottom: "75%" }} />
                  <div className="space-y-2 p-3">
                    <div className="h-3 w-20 rounded bg-[#f3e5cf]" />
                    <div className="h-4 w-5/6 rounded bg-[#f3e5cf]" />
                    <div className="h-3 w-2/3 rounded bg-[#f8e7ca]" />
                    <div className="h-3 w-1/2 rounded bg-[#f8e7ca]" />
                    <div className="mt-2 h-8 w-full rounded bg-[#f7efe2]" />
                  </div>
                </div>
              ))}
            </div>
          ) : featuredPosts.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
              {featuredPosts.slice(0, 4).map((post) => (
                <FeaturedPostCard key={post.id} post={post} />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="bg-[#f8f8f8] py-12">
        <div className="mx-auto max-w-[1140px] px-4">
          <div className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-bold text-foreground">🔥 Tin đăng mới nhất</h2>
            </div>
            <Link href="/search?type=cho-thue" className="text-sm font-bold text-primary hover:underline">
              Xem tất cả →
            </Link>
          </div>

          {isHomeDataLoading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
                <div key={item} className="animate-pulse overflow-hidden rounded-2xl border border-border bg-white">
                  <div className="bg-muted" style={{ paddingBottom: "75%" }} />
                  <div className="space-y-2 p-3">
                    <div className="h-3 w-1/3 rounded bg-muted" />
                    <div className="h-4 w-3/4 rounded bg-muted" />
                    <div className="h-3 w-1/2 rounded bg-muted" />
                    <div className="mt-2 h-8 w-full rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : latestSections.length > 0 ? (
            <div className="space-y-8">
              {visibleLatestSections.map((section) => (
                <div key={section.key}>
                  <div className="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <h3 className="text-base font-extrabold text-foreground">{section.title}</h3>
                      <p className="text-xs text-muted-foreground">{section.subtitle}</p>
                    </div>
                    <Link href={section.href} className="text-xs font-bold text-primary hover:underline">
                      Xem Nhóm Này
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
                    {section.items.map((property) => (
                      <PropertyCard key={`${section.key}-${property.id}`} property={property} layout="grid" />
                    ))}
                  </div>
                </div>
              ))}

              {visibleLatestSectionCount < latestSections.length && (
                <div ref={latestLoadMoreRef} className="flex items-center justify-center py-4">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-muted-foreground shadow-sm">
                    <Loader2 className={`h-4 w-4 ${isLoadingMoreLatestSections ? "animate-spin" : ""}`} />
                    {isLoadingMoreLatestSections ? "Đang tải thêm tin mới..." : "Kéo xuống để tải thêm"}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-white py-16 text-center">
              <p className="text-muted-foreground">Chưa có tin đăng nào.</p>
            </div>
          )}
        </div>
      </section>

      <section className="bg-primary py-12 text-white">
        <div className="mx-auto grid max-w-[1140px] grid-cols-2 gap-8 divide-x divide-white/20 px-4 text-center md:grid-cols-4">
          <div className="space-y-2">
            <div className="text-4xl font-black">50K+</div>
            <div className="text-sm font-semibold opacity-90">Phòng trọ đang cho thuê</div>
          </div>
          <div className="space-y-2">
            <div className="text-4xl font-black">1M+</div>
            <div className="text-sm font-semibold opacity-90">Lượt tìm phòng mỗi tháng</div>
          </div>
          <div className="space-y-2">
            <div className="text-4xl font-black">100%</div>
            <div className="text-sm font-semibold opacity-90">Miễn phí đăng & tìm tin</div>
          </div>
          <div className="space-y-2">
            <div className="text-4xl font-black">63</div>
            <div className="text-sm font-semibold opacity-90">Tỉnh thành phủ sóng</div>
          </div>
        </div>
      </section>

    </div>
  );
}
