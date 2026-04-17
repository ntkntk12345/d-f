import { type FormEvent, useEffect, useState } from "react";
import {
  ArrowDownWideNarrow,
  Building2,
  CalendarClock,
  Copy,
  ExternalLink,
  Filter,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiJsonFetch } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { BichHaCommissionGroup } from "@/lib/bichha-commission-search";

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

function extractPropertyIdFromUrl(url: string) {
  const candidate = String(url || "").trim();
  if (!candidate) return null;

  // Examples we try to support:
  // - /property/123
  // - /properties/123
  // - https://domain.tld/property/123?x=y
  const match =
    candidate.match(/\/property\/(\d+)(?:[/?#]|$)/i)
    || candidate.match(/\/properties\/(\d+)(?:[/?#]|$)/i)
    || candidate.match(/[?&]id=(\d+)(?:[&#]|$)/i);
  if (!match?.[1]) return null;

  const id = Number(match[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

type BichHaCommissionSearchResponse = {
  generatedAt: string;
  availableDistricts: string[];
  availableRoomTypes: string[];
  totalRecords: number;
  totalGroups: number;
  data: BichHaCommissionGroup[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  filteredVariantCount: number;
};

type SearchDraft = {
  keyword: string;
  district: string;
  roomType: string;
  commissionMin: string;
  sort: "commission-desc" | "recent-desc";
};

type AppliedQuery = {
  keyword: string;
  district: string;
  roomType: string;
  commissionMin?: number;
  sort: "commission-desc" | "recent-desc";
};

type BichHaCommissionSearchPanelProps = {
  token: string;
  endpoint: string;
  title: string;
  description: string;
};

const EMPTY_RESPONSE: BichHaCommissionSearchResponse = {
  generatedAt: "",
  availableDistricts: [],
  availableRoomTypes: [],
  totalRecords: 0,
  totalGroups: 0,
  data: [],
  total: 0,
  page: 1,
  limit: 12,
  totalPages: 1,
  filteredVariantCount: 0,
};

const DEFAULT_DRAFT: SearchDraft = {
  keyword: "",
  district: "",
  roomType: "",
  commissionMin: "",
  sort: "commission-desc",
};

const DEFAULT_QUERY: AppliedQuery = {
  keyword: "",
  district: "",
  roomType: "",
  sort: "commission-desc",
};

function fmtDate(value?: string) {
  if (!value) return "Chua co";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatPrice(value?: number | null) {
  if (value == null || Number.isNaN(value) || value <= 0) return "Dang cap nhat";
  return `${value} tr`;
}

function formatArea(value?: number | null) {
  if (value == null || Number.isNaN(value) || value <= 0) return "Dang cap nhat";
  return `${value} m2`;
}

function summarizeRawText(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= 220) return compact;
  return `${compact.slice(0, 220)}...`;
}

function shouldHideAdminGroup(group: {
  price?: number | null;
  priceFrom?: number | null;
  priceTo?: number | null;
  latestPostedAt?: string;
}) {
  const effectivePrice = group.price ?? group.priceFrom ?? group.priceTo ?? null;
  if (effectivePrice !== 210) return false;
  const latestMs = new Date(group.latestPostedAt || "").getTime();
  if (!Number.isFinite(latestMs)) return false;
  const excludedMs = new Date("2026-04-17T08:57:00+07:00").getTime();
  return Math.abs(latestMs - excludedMs) <= 60_000;
}

function buildSearchParams(query: AppliedQuery, page: number) {
  const params = new URLSearchParams();

  if (query.keyword) params.set("keyword", query.keyword);
  if (query.district) params.set("district", query.district);
  if (query.roomType) params.set("roomType", query.roomType);
  if (query.commissionMin != null) params.set("commissionMin", String(query.commissionMin));
  params.set("sort", query.sort);
  params.set("page", String(page));
  params.set("limit", "12");

  return params.toString();
}

export function BichHaCommissionSearchPanel({
  token,
  endpoint,
  title,
  description,
}: BichHaCommissionSearchPanelProps) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<SearchDraft>(DEFAULT_DRAFT);
  const [query, setQuery] = useState<AppliedQuery>(DEFAULT_QUERY);
  const [page, setPage] = useState(1);
  const [response, setResponse] = useState<BichHaCommissionSearchResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [webCache, setWebCache] = useState<
    Record<
      number,
      {
        status: "idle" | "loading" | "ready" | "error";
        description?: string;
        title?: string;
        address?: string;
        errorMessage?: string;
        statusCode?: number;
        source?: "api" | "static-data" | "web-html";
      }
    >
  >({});

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      const queryString = buildSearchParams(query, page);
      const path = queryString ? `${endpoint}?${queryString}` : endpoint;
      const { res, data } = await apiJsonFetch<BichHaCommissionSearchResponse>(
        path,
        EMPTY_RESPONSE,
        {},
        token,
      );

      if (cancelled) return;

      if (!res.ok) {
        setError("Khong the tai du lieu hoa hong");
        setLoading(false);
        return;
      }

      setResponse(data);
      setLoading(false);
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [endpoint, page, query, token]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextCommissionMin = draft.commissionMin ? Number(draft.commissionMin) : undefined;
    setQuery({
      keyword: draft.keyword.trim(),
      district: draft.district,
      roomType: draft.roomType,
      commissionMin: Number.isFinite(nextCommissionMin) ? nextCommissionMin : undefined,
      sort: draft.sort,
    });
    setPage(1);
  }

  function handleReset() {
    setDraft(DEFAULT_DRAFT);
    setQuery(DEFAULT_QUERY);
    setPage(1);
  }

  async function handleCopy(rawText: string) {
    try {
      await navigator.clipboard.writeText(rawText);
      toast({ title: "Da copy tin nhan goc" });
    } catch {
      toast({ title: "Khong the copy tin nhan", variant: "destructive" });
    }
  }

  async function ensureWebDetail(propertyId: number, propertyUrl?: string | null) {
    const primaryId = propertyId > 0 ? propertyId : 0;
    const fallbackId = extractPropertyIdFromUrl(propertyUrl || "") || 0;
    const attemptIds = Array.from(new Set([primaryId, fallbackId].filter((value) => value > 0)));

    if (attemptIds.length === 0) {
      setWebCache((current) => ({
        ...current,
        [propertyId]: {
          status: "error",
          errorMessage: "Khong co propertyId hop le de tai tin web.",
          statusCode: 400,
        },
      }));
      return;
    }

    setWebCache((current) => {
      const existing = current[primaryId] || (fallbackId ? current[fallbackId] : undefined);
      if (existing && (existing.status === "loading" || existing.status === "ready")) return current;
      const next = { ...current };
      for (const id of attemptIds) {
        next[id] = { status: "loading" };
      }
      return next;
    });

    async function fetchPropertyDetail(id: number) {
      const unauth = await apiJsonFetch<ApiPropertyDetail | null>(`/properties/${id}`, null);
      if (unauth.res.ok && unauth.data) return unauth;
      if (token) {
        const authed = await apiJsonFetch<ApiPropertyDetail | null>(`/properties/${id}`, null, {}, token);
        return authed;
      }
      return unauth;
    }

    async function fetchPropertyFromStaticData(id: number) {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const manifestRes = await fetch(`${base}/data/properties/manifest.json`, { method: "GET" });
      if (!manifestRes.ok) {
        return null;
      }

      const manifest = (await manifestRes.json()) as Record<string, string>;
      const districtKey = manifest[String(id)];
      if (!districtKey) {
        return null;
      }

      const districtRes = await fetch(`${base}/data/properties/districts/${districtKey}.json`, { method: "GET" });
      if (!districtRes.ok) {
        return null;
      }

      const districtPayload = (await districtRes.json()) as Array<{ id: number; description?: string; title?: string; address?: string }>;
      const found = districtPayload.find((property) => property?.id === id);
      if (!found) {
        return null;
      }

      return {
        id,
        title: String(found.title || ""),
        address: String(found.address || ""),
        description: String(found.description || ""),
      };
    }

    let successId: number | null = null;
    let successData: ApiPropertyDetail | null = null;
    let lastError: { status: number; message: string } | null = null;

    for (const id of attemptIds) {
      const { res, data } = await fetchPropertyDetail(id);
      if (res.ok && data) {
        successId = id;
        successData = data;
        break;
      }

      const message =
        typeof (data as unknown as { message?: string })?.message === "string"
          ? (data as unknown as { message?: string }).message
          : res.statusText || "Khong tai duoc tin web.";
      lastError = { status: res.status, message: String(message) };
    }

    if (!successId || !successData) {
      // Fallback 1: static data in public/data (manifest + districts/*.json)
      for (const id of attemptIds) {
        try {
          const staticFound = await fetchPropertyFromStaticData(id);
          if (staticFound) {
            const payload = {
              status: "ready" as const,
              description: staticFound.description || "Khong co noi dung",
              title: staticFound.title || "",
              address: staticFound.address || "",
              source: "static-data" as const,
            };
            setWebCache((current) => {
              const next = { ...current };
              for (const key of attemptIds) {
                next[key] = payload;
              }
              return next;
            });
            return;
          }
        } catch {
          // ignore
        }
      }

      // Fallback: fetch HTML directly from propertyUrl (same-origin deployment),
      // so user can read "tin web" without opening a new tab.
      const urlToFetch = String(propertyUrl || "").trim();
      if (urlToFetch) {
        try {
          const htmlRes = await fetch(urlToFetch, { method: "GET" });
          const htmlText = await htmlRes.text();
          if (htmlRes.ok && htmlText) {
            const doc = new DOMParser().parseFromString(htmlText, "text/html");
            const titleText = (doc.querySelector("title")?.textContent || "").trim();
            // Remove scripts/styles so we don't pick up injected JS text.
            doc.querySelectorAll("script, style, noscript").forEach((node) => node.remove());

            const rootNode =
              doc.querySelector("main")
              || doc.querySelector("article")
              || doc.querySelector('[role="main"]')
              || doc.querySelector("#root")
              || doc.body;

            const pickHeadline = () => {
              if (!rootNode) return "";
              const headline = rootNode.querySelector("h1, h2, .title, [data-title]");
              return (headline?.textContent || "").replace(/\s+/g, " ").trim();
            };

            const compactText = (value: string) => value.replace(/\s+/g, " ").trim();
            const rawTextContent = compactText(rootNode?.textContent || "");

            // Prefer short meaningful headline; fallback to first 800 chars of content.
            const headlineText = pickHeadline();
            const extractedBase = headlineText || rawTextContent || "Dang cap nhat du lieu";
            const extracted = extractedBase.length > 800 ? `${extractedBase.slice(0, 800)}...` : extractedBase;
            const payload = {
              status: "ready" as const,
              description: extracted,
              title: titleText,
              address: "",
              source: "web-html" as const,
            };

            setWebCache((current) => {
              const next = { ...current };
              // Store under both ids so UI can read it
              for (const id of attemptIds) {
                next[id] = payload;
              }
              return next;
            });
            return;
          }
        } catch {
          // ignore, show API error below
        }
      }

      const statusCode = lastError?.status ?? 404;
      const baseMessage = lastError?.message || "Khong tai duoc tin web.";
      const attemptMessage =
        attemptIds.length > 1 ? ` (da thu: ${attemptIds.join(", ")})` : "";

      setWebCache((current) => {
        const next = { ...current };
        for (const id of attemptIds) {
          next[id] = { status: "error", errorMessage: `${baseMessage}${attemptMessage}`, statusCode };
        }
        return next;
      });
      return;
    }

    const readyPayload = {
      status: "ready" as const,
      description: successData.description || "",
      title: successData.title || "",
      address: successData.address || "",
      source: "api" as const,
    };

    // Save under success id, and also alias under primary id so UI can read even when primaryId is wrong.
    setWebCache((current) => ({
      ...current,
      [successId]: readyPayload,
      ...(primaryId && primaryId !== successId ? { [primaryId]: readyPayload } : {}),
    }));
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl border bg-[linear-gradient(135deg,#0f172a_0%,#13233f_48%,#1f4f46_100%)] text-white shadow-xl">
        <div className="grid gap-6 px-5 py-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/80">
              <Search className="h-3.5 w-3.5" /> Hoa hong BichHa
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight">{title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">{description}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-white/75">
              <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1">
                Snapshot 2h/lap
              </span>
              <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1">
                Update {fmtDate(response.generatedAt)}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur-sm">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/65">Can dang co HH</div>
              <div className="mt-3 text-3xl font-black">{response.totalRecords}</div>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur-sm">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/65">Nhom can</div>
              <div className="mt-3 text-3xl font-black">{response.totalGroups}</div>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur-sm">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/65">Ket qua hien tai</div>
              <div className="mt-3 text-3xl font-black">{response.total}</div>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Loc va tim hoa hong</h3>
            <p className="text-sm text-muted-foreground">
              Tim theo dia chi, ma can, noi dung tin nhan hoac loc theo quan, dang phong, muc HH.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handleReset}>
              <RefreshCw className="h-4 w-4" /> Reset
            </Button>
            <Button type="submit">
              <Search className="h-4 w-4" /> Tim HH
            </Button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.5fr_0.8fr_0.8fr_0.7fr_0.8fr]">
          <Input
            value={draft.keyword}
            onChange={(event) => setDraft((current) => ({ ...current, keyword: event.target.value }))}
            placeholder="Dia chi, ma can, nguon, noi dung..."
          />

          <select
            value={draft.district}
            onChange={(event) => setDraft((current) => ({ ...current, district: event.target.value }))}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Tat ca quan</option>
            {response.availableDistricts.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>

          <select
            value={draft.roomType}
            onChange={(event) => setDraft((current) => ({ ...current, roomType: event.target.value }))}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Tat ca dang phong</option>
            {response.availableRoomTypes.map((roomType) => (
              <option key={roomType} value={roomType}>
                {roomType}
              </option>
            ))}
          </select>

          <Input
            value={draft.commissionMin}
            onChange={(event) => setDraft((current) => ({ ...current, commissionMin: event.target.value }))}
            inputMode="numeric"
            placeholder="HH toi thieu"
          />

          <select
            value={draft.sort}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                sort: event.target.value as SearchDraft["sort"],
              }))
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="commission-desc">HH cao nhat</option>
            <option value="recent-desc">Moi cap nhat</option>
          </select>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Filter className="h-4 w-4" /> Nhom can sau loc
            </div>
            <div className="mt-3 text-2xl font-black text-foreground">{response.total}</div>
          </div>
          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <ArrowDownWideNarrow className="h-4 w-4" /> Bien the sau loc
            </div>
            <div className="mt-3 text-2xl font-black text-foreground">{response.filteredVariantCount}</div>
          </div>
          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="h-4 w-4" /> Cap nhat
            </div>
            <div className="mt-3 text-sm font-semibold text-foreground">{fmtDate(response.generatedAt)}</div>
          </div>
        </div>
      </form>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border bg-white px-6 py-10 text-sm text-muted-foreground shadow-sm">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Dang tai du lieu hoa hong...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      ) : response.data.length === 0 ? (
        <div className="rounded-2xl border bg-white px-5 py-10 text-center text-sm text-muted-foreground shadow-sm">
          Khong tim thay can nao phu hop bo loc hien tai.
        </div>
      ) : (
        <div className="space-y-4">
          {response.data.filter((group) => !shouldHideAdminGroup(group)).map((group) => (
            <div key={group.id} className="overflow-hidden rounded-3xl border bg-white shadow-sm">
              <div className="grid gap-0 xl:grid-cols-[240px_1fr]">
                <div className="relative min-h-[220px] bg-[radial-gradient(circle_at_top,_#dff7ea,_#f8fafc_55%,_#e2e8f0)]">
                  {group.variants?.[0]?.sourceSymbol ? (
                    <div className="absolute left-3 top-3 z-10">
                      <Badge className="bg-slate-950/90 text-white shadow-md backdrop-blur hover:bg-slate-950/90">
                        {group.variants[0].sourceSymbol}
                      </Badge>
                    </div>
                  ) : null}
                  {group.imageUrl ? (
                    <img
                      src={group.imageUrl}
                      alt={group.address}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500">
                      <div className="rounded-full bg-white/80 p-4 shadow">
                        <Building2 className="h-8 w-8" />
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-[0.24em]">No image</span>
                    </div>
                  )}
                </div>

                <div className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          HH cao nhat {group.bestCommissionLabel}
                        </Badge>
                        <Badge variant="outline">{group.variantCount} bien the</Badge>
                        <Badge variant="outline">{group.district}</Badge>
                        {group.roomType ? <Badge variant="outline">{group.roomType}</Badge> : null}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-foreground">{group.address}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{group.title}</p>
                      </div>
                    </div>

                    {group.propertyUrl ? (
                      <Button variant="outline" asChild>
                        <a href={group.propertyUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" /> Mo tin
                        </a>
                      </Button>
                    ) : null}
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border bg-slate-50 p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Gia thue
                      </div>
                      <div className="mt-2 text-lg font-bold">{formatPrice(group.price || group.priceFrom || group.priceTo)}</div>
                    </div>
                    <div className="rounded-2xl border bg-slate-50 p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Dien tich
                      </div>
                      <div className="mt-2 text-lg font-bold">{formatArea(group.area)}</div>
                    </div>
                    <div className="rounded-2xl border bg-slate-50 p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Cap nhat moi nhat
                      </div>
                      <div className="mt-2 text-sm font-semibold">{fmtDate(group.latestPostedAt)}</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {group.variants.map((variant, index) => (
                      <div
                        key={`${group.id}-${variant.id}`}
                        className={`rounded-2xl border p-4 ${
                          index === 0
                            ? "border-emerald-200 bg-emerald-50/70"
                            : "bg-slate-50/70"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-2">
                              <Badge className={index === 0 ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}>
                                {variant.commissionLabel}
                              </Badge>
                              <Badge variant="outline">ID {variant.id}</Badge>
                              {variant.sourceSymbol ? <Badge variant="outline">{variant.sourceSymbol}</Badge> : null}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Scope HH: <strong>{variant.commissionScope}</strong>
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {variant.propertyUrl ? (
                              <Button variant="outline" size="sm" asChild>
                                <a href={variant.propertyUrl} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-4 w-4" /> Tin
                                </a>
                              </Button>
                            ) : null}
                            <Button variant="outline" size="sm" onClick={() => void handleCopy(variant.rawText)}>
                              <Copy className="h-4 w-4" /> Copy text
                            </Button>
                          </div>
                        </div>

                        <p className="mt-3 text-sm leading-6 text-slate-700">{summarizeRawText(variant.rawText)}</p>

                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>Cap nhat: <strong>{fmtDate(variant.postedAt)}</strong></span>
                          <span>Gia: <strong>{formatPrice(variant.price || variant.priceFrom || variant.priceTo)}</strong></span>
                          <span>Dien tich: <strong>{formatArea(variant.area)}</strong></span>
                        </div>

                        <details className="mt-3 rounded-xl border bg-white/85 p-3">
                          <summary className="cursor-pointer text-sm font-semibold text-foreground">
                            Xem tin nhan goc
                          </summary>
                          <pre className="mt-3 whitespace-pre-wrap text-xs leading-6 text-slate-700">
                            {variant.rawText}
                          </pre>
                        </details>

                        {variant.propertyId || variant.propertyUrl ? (
                          <details
                            className="mt-3 rounded-xl border bg-white/85 p-3"
                            onToggle={(event) => {
                              const element = event.currentTarget;
                              if (element.open) {
                                void ensureWebDetail(Number(variant.propertyId || 0), variant.propertyUrl);
                              }
                            }}
                          >
                            <summary className="cursor-pointer text-sm font-semibold text-foreground">
                              Xem tin web (khong can mo web)
                            </summary>
                            <div className="mt-3 space-y-2 text-xs leading-6 text-slate-700">
                              {(() => {
                                const cacheKey =
                                  (typeof variant.propertyId === "number" && variant.propertyId > 0
                                    ? variant.propertyId
                                    : extractPropertyIdFromUrl(variant.propertyUrl || "") || 0) || 0;
                                const cached = cacheKey ? webCache[cacheKey] : undefined;

                                if (cached?.status === "loading") {
                                  return (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" /> Dang tai tin web...
                                </div>
                                  );
                                }

                                if (cached?.status === "error") {
                                  return (
                                <div className="space-y-1 text-red-600">
                                  <div>Khong tai duoc tin web.</div>
                                  <div className="text-[11px] text-red-700/80">
                                    {cached?.statusCode
                                      ? `HTTP ${cached?.statusCode}: `
                                      : ""}
                                    {cached?.errorMessage || ""}
                                  </div>
                                </div>
                                  );
                                }

                                if (cached?.status === "ready") {
                                  return (
                                    <div className="space-y-2">
                                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        Nguon:{" "}
                                        <span className="text-foreground">
                                          {cached?.source === "static-data"
                                            ? "public/data"
                                            : cached?.source === "web-html"
                                              ? "web-html"
                                              : "api"}
                                        </span>
                                      </div>
                                      <pre className="whitespace-pre-wrap">
                                        {cached?.description || "Khong co noi dung"}
                                      </pre>
                                    </div>
                                  );
                                }

                                return (
                                  <div className="text-muted-foreground">
                                    Mo muc nay de tai noi dung web.
                                  </div>
                                );
                              })()}
                            </div>
                          </details>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {response.totalPages > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm">
              <div className="text-sm text-muted-foreground">
                Trang <strong>{response.page}</strong> / {response.totalPages}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" disabled={response.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  Truoc
                </Button>
                <Button
                  variant="outline"
                  disabled={response.page >= response.totalPages}
                  onClick={() => setPage((current) => Math.min(response.totalPages, current + 1))}
                >
                  Sau
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
