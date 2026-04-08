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
          {response.data.map((group) => (
            <div key={group.id} className="overflow-hidden rounded-3xl border bg-white shadow-sm">
              <div className="grid gap-0 xl:grid-cols-[240px_1fr]">
                <div className="relative min-h-[220px] bg-[radial-gradient(circle_at_top,_#dff7ea,_#f8fafc_55%,_#e2e8f0)]">
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
