import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowLeft, LayoutGrid, List as ListIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/property/PropertyCard";
import { EMPTY_PROPERTY_RECOMMENDATIONS, useSearchProperties } from "@/lib/local-properties";
import { goBackOrNavigate } from "@/lib/navigation";
import {
  buildPageRestoreKey,
  consumePendingPageRestore,
  restorePageScroll,
  savePageRestoreSnapshot,
} from "@/lib/page-restore";
import { useSeo } from "@/hooks/useSeo";

const SEARCH_STATE_KEY = "timtro_search_page_state";
const SEARCH_VIEW_MODE_KEY = "timtro_search_view_mode";
const SEARCH_INITIAL_BATCH_SIZE = 40;
const SEARCH_LOAD_MORE_DELAY_MS = 180;

type SearchFilters = {
  keyword: string;
  type: string;
  category: string;
  roomType: string;
  province: string;
  district: string;
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  page: number;
  limit: number;
};

type SearchPageRestoreSnapshot = {
  scrollY: number;
  visibleCount: number;
  propertyId?: number;
};

function parseNumberParam(value: string | null) {
  return value ? Number(value) : undefined;
}

function normalizeStoredFilters(filters: SearchFilters | null): SearchFilters | null {
  if (!filters) return null;

  return {
    keyword: filters.keyword || "",
    type: filters.type || "",
    category: filters.category || "",
    roomType: filters.roomType || "",
    province: filters.province || "",
    district: filters.district || "",
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
    areaMin: filters.areaMin,
    areaMax: filters.areaMax,
    page: 1,
    limit: SEARCH_INITIAL_BATCH_SIZE,
  };
}

function readStoredFilters(): SearchFilters | null {
  try {
    const raw = localStorage.getItem(SEARCH_STATE_KEY);
    if (!raw) return null;
    return normalizeStoredFilters(JSON.parse(raw) as SearchFilters);
  } catch {
    return null;
  }
}

function getInitialFilters(searchParams: URLSearchParams): SearchFilters {
  const hasUrlParams = Array.from(searchParams.keys()).length > 0;
  if (!hasUrlParams) {
    const storedFilters = readStoredFilters();
    if (storedFilters) return storedFilters;
  }

  return {
    keyword: searchParams.get("keyword") || "",
    type: searchParams.get("type") || "",
    category: searchParams.get("category") || "",
    roomType: searchParams.get("roomType") || "",
    province: searchParams.get("province") || "",
    district: searchParams.get("district") || "",
    priceMin: parseNumberParam(searchParams.get("priceMin")),
    priceMax: parseNumberParam(searchParams.get("priceMax")),
    areaMin: parseNumberParam(searchParams.get("areaMin")),
    areaMax: parseNumberParam(searchParams.get("areaMax")),
    page: 1,
    limit: SEARCH_INITIAL_BATCH_SIZE,
  };
}

export function Search() {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const pageRestoreKey = buildPageRestoreKey(location, search);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    try {
      const storedViewMode = localStorage.getItem(SEARCH_VIEW_MODE_KEY);
      if (storedViewMode === "list" || storedViewMode === "grid") return storedViewMode;
      return window.matchMedia("(max-width: 767px)").matches ? "list" : "grid";
    } catch {
      return "list";
    }
  });
  const [filters, setFilters] = useState<SearchFilters>(() =>
    getInitialFilters(new URLSearchParams(window.location.search)),
  );
  const [visibleCount, setVisibleCount] = useState(SEARCH_INITIAL_BATCH_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const restoreSnapshotRef = useRef<SearchPageRestoreSnapshot | null>(null);
  const hasRestoredScrollRef = useRef(false);

  const { data, isLoading, error } = useSearchProperties({
    ...filters,
    page: 1,
    limit: visibleCount,
  });

  useEffect(() => {
    const nextFilters = getInitialFilters(new URLSearchParams(search));
    const restoreSnapshot = consumePendingPageRestore<SearchPageRestoreSnapshot>(pageRestoreKey);

    restoreSnapshotRef.current = restoreSnapshot;
    hasRestoredScrollRef.current = false;
    setFilters(nextFilters);
    setVisibleCount(Math.max(restoreSnapshot?.visibleCount || SEARCH_INITIAL_BATCH_SIZE, SEARCH_INITIAL_BATCH_SIZE));
    setIsLoadingMore(false);
  }, [location, pageRestoreKey, search]);

  useEffect(() => {
    try {
      localStorage.setItem(SEARCH_STATE_KEY, JSON.stringify(filters));
    } catch {
      // Ignore storage write failures.
    }
  }, [filters]);

  useEffect(() => {
    try {
      localStorage.setItem(SEARCH_VIEW_MODE_KEY, viewMode);
    } catch {
      // Ignore storage write failures.
    }
  }, [viewMode]);

  useEffect(() => {
    let frameId: number | null = null;

    const persistSnapshot = () => {
      savePageRestoreSnapshot<SearchPageRestoreSnapshot>(pageRestoreKey, {
        scrollY: window.scrollY,
        visibleCount,
      });
    };

    const handleScroll = () => {
      if (frameId != null) return;

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        persistSnapshot();
      });
    };

    persistSnapshot();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      if (frameId != null) window.cancelAnimationFrame(frameId);
      persistSnapshot();
      window.removeEventListener("scroll", handleScroll);
    };
  }, [pageRestoreKey, visibleCount]);

  const displayedCount = data?.data.length || 0;
  const totalCount = data?.total || 0;
  const hasMoreResults = totalCount > displayedCount;

  useEffect(() => {
    const restoreSnapshot = restoreSnapshotRef.current;
    if (!restoreSnapshot || hasRestoredScrollRef.current || isLoading) return;

    const requiredVisibleCount =
      totalCount > 0
        ? Math.min(Math.max(restoreSnapshot.visibleCount, SEARCH_INITIAL_BATCH_SIZE), totalCount)
        : 0;

    if (displayedCount < requiredVisibleCount) return;

    hasRestoredScrollRef.current = true;
    window.requestAnimationFrame(() => {
      restorePageScroll(restoreSnapshot);
      restoreSnapshotRef.current = null;
    });
  }, [displayedCount, isLoading, totalCount, visibleCount]);

  useEffect(() => {
    if (isLoading || isLoadingMore || !hasMoreResults) {
      return;
    }

    const node = loadMoreRef.current;
    if (!node) return;

    let timeoutId: number | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;

        setIsLoadingMore(true);
        observer.disconnect();

        timeoutId = window.setTimeout(() => {
          setVisibleCount((current) => Math.min(current + SEARCH_INITIAL_BATCH_SIZE, totalCount));
          setIsLoadingMore(false);
        }, SEARCH_LOAD_MORE_DELAY_MS);
      },
      {
        rootMargin: "320px 0px",
      },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [displayedCount, hasMoreResults, isLoading, totalCount]);

  const handleGoBack = () => {
    goBackOrNavigate(navigate, "/");
  };

  const pageTitle =
    filters.category === "studio"
      ? "Studio & Chung cư mini"
      : filters.category === "nha-nguyen-can"
        ? "Nhà nguyên căn cho thuê"
        : filters.category === "o-ghep"
          ? "Tìm người ở ghép"
          : filters.category === "mat-bang"
            ? "Mặt bằng kinh doanh"
            : "Phòng trọ cho thuê";

  const breadcrumbLabel =
    filters.category === "studio"
      ? "Studio & Chung cư mini"
      : filters.category === "nha-nguyen-can"
        ? "Nhà nguyên căn"
        : filters.category === "o-ghep"
          ? "Ở ghép"
          : filters.category === "mat-bang"
            ? "Mặt bằng kinh doanh"
            : "Phòng trọ";

  const activeFilterChips = [
    filters.district,
    filters.province && !filters.district ? filters.province : "",
    filters.roomType ? `Loại ${filters.roomType}` : "",
    filters.keyword ? `"${filters.keyword}"` : "",
    filters.priceMin != null && filters.priceMax != null
      ? `${filters.priceMin}-${filters.priceMax} triệu`
      : filters.priceMin != null
        ? `Từ ${filters.priceMin} triệu`
        : filters.priceMax != null
          ? `Đến ${filters.priceMax} triệu`
          : "",
  ].filter(Boolean);

  const seoLocation = filters.district || filters.province || "Hà Nội";
  const seoKeyword = filters.keyword ? `${filters.keyword} ` : "";

  useSeo({
    title: `${seoKeyword}${pageTitle} tại ${seoLocation} | ${totalCount} tin | 80LandTimPhong.vn`,
    description: `Danh sách ${pageTitle.toLowerCase()} tại ${seoLocation}. Hiện có ${totalCount} tin đăng${
      filters.roomType ? `, dạng phòng ${filters.roomType}` : ""
    }${
      filters.priceMin != null || filters.priceMax != null ? ", có lọc theo mức giá" : ""
    }.`,
    image: "/opengraph.jpg",
    type: "website",
  });

  const hasMeaningfulFilters = Boolean(
    filters.keyword ||
    filters.roomType ||
    filters.category ||
    filters.province ||
    filters.district ||
    filters.priceMin != null ||
    filters.priceMax != null,
  );
  const searchRecommendations = data?.recommendations || EMPTY_PROPERTY_RECOMMENDATIONS;
  const hasSearchRecommendations =
    searchRecommendations.relatedItems.length > 0 ||
    searchRecommendations.roomGroups.length > 0 ||
    searchRecommendations.priceGroups.length > 0;
  const shouldShowRecommendations = hasMeaningfulFilters && hasSearchRecommendations;
  const recommendationDescription = [
    searchRecommendations.priceLabel ? `ưu tiên cùng tầm ${searchRecommendations.priceLabel}` : "ưu tiên các tin gần với mức giá đang tìm",
    searchRecommendations.locationLabel ? `quanh ${searchRecommendations.locationLabel}` : "theo khu vực liên quan",
  ].join(" · ");

  return (
    <div className="min-h-screen bg-muted/30 pb-24 pt-4 md:pt-6 lg:pb-10">
      <div className="mx-auto max-w-[1140px] px-4">
        <div className="mb-4 rounded-2xl border border-border/70 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tìm phòng / {breadcrumbLabel}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGoBack}
                className="h-9 rounded-full border-border/70 bg-white px-3"
              >
                <ArrowLeft className="h-4 w-4" />
                Quay lại
              </Button>
            </div>
          </div>

          <h1 className="text-xl font-bold text-foreground md:text-2xl">
            {pageTitle}
            {filters.province ? ` tại ${filters.province}` : " trên toàn khu vực"}
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Hiện có {totalCount} tin đăng
            {filters.district ? ` tại ${filters.district}` : filters.province ? ` tại ${filters.province}` : ""}
            {filters.roomType ? ` · loại ${filters.roomType}` : ""}
            {filters.keyword ? ` · khớp "${filters.keyword}"` : ""}.
          </p>

          {activeFilterChips.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {activeFilterChips.map((chip) => (
                <span
                  key={chip}
                  className="whitespace-nowrap rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>

        <main>
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-white p-3 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span className="font-medium text-foreground">Ưu tiên xem:</span>
                <button className="border-b-2 border-primary pb-1 font-medium text-primary">Thông thường</button>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
                  Kiểu hiển thị
                </span>
                <div className="flex rounded bg-muted p-0.5">
                  <button
                    onClick={() => setViewMode("list")}
                    className={`rounded p-1 ${viewMode === "list" ? "bg-white text-primary shadow-sm" : "text-muted-foreground"}`}
                  >
                    <ListIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`rounded p-1 ${viewMode === "grid" ? "bg-white text-primary shadow-sm" : "text-muted-foreground"}`}
                  >
                    <LayoutGrid className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Đang hiển thị {displayedCount}/{totalCount} tin.
              {hasMoreResults
                ? ` Cuộn xuống để tải thêm ${SEARCH_INITIAL_BATCH_SIZE} phòng tiếp theo.`
                : " Tất cả kết quả đã hiển thị."}
            </p>
          </div>

          {isLoading ? (
            <div className={viewMode === "grid" ? "grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4" : "space-y-4"}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((item) =>
                viewMode === "grid" ? (
                  <div key={item} className="animate-pulse overflow-hidden rounded-2xl border border-border bg-white">
                    <div className="bg-muted" style={{ paddingBottom: "75%" }} />
                    <div className="space-y-2 p-3">
                      <div className="h-3 w-1/3 rounded bg-muted" />
                      <div className="h-4 w-3/4 rounded bg-muted" />
                      <div className="h-3 w-1/2 rounded bg-muted" />
                      <div className="mt-2 h-8 w-full rounded bg-muted" />
                    </div>
                  </div>
                ) : (
                  <div key={item} className="animate-pulse rounded-xl border border-border bg-white sm:h-40">
                    <div className="flex h-full flex-col sm:flex-row">
                      <div className="h-40 w-full shrink-0 bg-muted sm:h-auto sm:w-[220px]" />
                      <div className="flex-1 space-y-3 p-4">
                        <div className="h-4 w-3/4 rounded bg-muted" />
                        <div className="h-5 w-1/3 rounded bg-muted" />
                        <div className="h-3 w-1/2 rounded bg-muted" />
                      </div>
                    </div>
                  </div>
                ),
              )}
            </div>
          ) : error ? (
            <div className="rounded-lg border border-border bg-white p-8 text-center text-destructive">
              Đã có lỗi xảy ra.
            </div>
          ) : data?.data && data.data.length > 0 ? (
            <>
              <div className={viewMode === "list" ? "space-y-4" : "grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4"}>
                {data.data.map((property) => (
                  <PropertyCard key={property.id} property={property} layout={viewMode} />
                ))}
              </div>

              {hasMoreResults && (
                <div ref={loadMoreRef} className="mt-6 flex items-center justify-center py-4">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-muted-foreground shadow-sm">
                    <Loader2 className={`h-4 w-4 ${isLoadingMore ? "animate-spin" : ""}`} />
                    {isLoadingMore ? "Đang tải thêm phòng..." : "Cuộn xuống để xem tiếp"}
                  </div>
                </div>
              )}

              {shouldShowRecommendations && (
                <section className="mt-10 space-y-8">
                  <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-white p-5 shadow-sm">
                    <h2 className="text-lg font-extrabold text-foreground">Phòng liên quan để xem tiếp</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Hệ thống đang gợi ý thêm các tin {recommendationDescription} để bạn lướt nhanh hơn.
                    </p>
                  </div>

                  {searchRecommendations.relatedItems.length > 0 && (
                    <div>
                      <div className="mb-4">
                        <h3 className="text-base font-extrabold text-foreground">Các phòng cùng gu tìm kiếm</h3>
                        <p className="text-sm text-muted-foreground">
                          Giữ gần khu vực và mức giá hiện tại, rồi mới mở rộng sang các phòng phù hợp khác.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                        {searchRecommendations.relatedItems.map((property) => (
                          <PropertyCard key={`related-${property.id}`} property={property} layout="grid" />
                        ))}
                      </div>
                    </div>
                  )}

                  {searchRecommendations.roomGroups.length > 0 && (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-base font-extrabold text-foreground">Lướt theo loại phòng cùng khu vực</h3>
                        <p className="text-sm text-muted-foreground">
                          Ví dụ không ra đúng `2N1K` thì vẫn có thể xem `studio`, `1N1K` hoặc nhóm phòng gần nhất trong cùng vùng giá.
                        </p>
                      </div>

                      {searchRecommendations.roomGroups.map((group) => (
                        <div key={group.key}>
                          <div className="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                            <div>
                              <h4 className="text-sm font-extrabold text-foreground">{group.title}</h4>
                              <p className="text-xs text-muted-foreground">{group.subtitle}</p>
                            </div>
                            <Link href={group.href} className="text-xs font-bold text-primary hover:underline">
                              Xem nhóm này
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
                  )}

                  {searchRecommendations.priceGroups.length > 0 && (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-base font-extrabold text-foreground">Lướt theo tầm giá gần nhất</h3>
                        <p className="text-sm text-muted-foreground">
                          Khi không có tin khớp tuyệt đối, phần này vẫn show các cụm giá sát với bộ lọc hiện tại.
                        </p>
                      </div>

                      {searchRecommendations.priceGroups.map((group) => (
                        <div key={group.key}>
                          <div className="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                            <div>
                              <h4 className="text-sm font-extrabold text-foreground">{group.title}</h4>
                              <p className="text-xs text-muted-foreground">{group.subtitle}</p>
                            </div>
                            <Link href={group.href} className="text-xs font-bold text-primary hover:underline">
                              Xem tầm giá này
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
                  )}
                </section>
              )}
            </>
          ) : (
            <div className="space-y-8">
              <div className="rounded-2xl border border-border bg-white p-8 text-center">
                <p className="font-semibold text-foreground">Không có tin khớp 100% với bộ lọc hiện tại.</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {shouldShowRecommendations
                    ? `Mình đang gợi ý tiếp các phòng ${recommendationDescription} để bạn vẫn có cái xem ngay.`
                    : "Bạn thử đổi loại phòng, nới rộng tầm giá hoặc đổi khu vực nhé."}
                </p>
              </div>

              {shouldShowRecommendations && (
                <section className="space-y-8">
                  {searchRecommendations.relatedItems.length > 0 && (
                    <div>
                      <div className="mb-4">
                        <h2 className="text-lg font-extrabold text-foreground">Phòng liên quan cùng giá và khu vực</h2>
                        <p className="text-sm text-muted-foreground">
                          Đây là lớp gợi ý đầu tiên: giữ giá và vị trí gần nhất, rồi mới mở rộng sang nhóm khác.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                        {searchRecommendations.relatedItems.map((property) => (
                          <PropertyCard key={`fallback-related-${property.id}`} property={property} layout="grid" />
                        ))}
                      </div>
                    </div>
                  )}

                  {searchRecommendations.roomGroups.length > 0 && (
                    <div className="space-y-6">
                      {searchRecommendations.roomGroups.map((group) => (
                        <div key={group.key}>
                          <div className="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                            <div>
                              <h3 className="text-sm font-extrabold text-foreground">{group.title}</h3>
                              <p className="text-xs text-muted-foreground">{group.subtitle}</p>
                            </div>
                            <Link href={group.href} className="text-xs font-bold text-primary hover:underline">
                              Xem nhóm này
                            </Link>
                          </div>
                          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                            {group.items.map((property) => (
                              <PropertyCard key={`${group.key}-fallback-${property.id}`} property={property} layout="grid" />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {searchRecommendations.priceGroups.length > 0 && (
                    <div className="space-y-6">
                      {searchRecommendations.priceGroups.map((group) => (
                        <div key={group.key}>
                          <div className="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                            <div>
                              <h3 className="text-sm font-extrabold text-foreground">{group.title}</h3>
                              <p className="text-xs text-muted-foreground">{group.subtitle}</p>
                            </div>
                            <Link href={group.href} className="text-xs font-bold text-primary hover:underline">
                              Xem tầm giá này
                            </Link>
                          </div>
                          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                            {group.items.map((property) => (
                              <PropertyCard key={`${group.key}-price-${property.id}`} property={property} layout="grid" />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
