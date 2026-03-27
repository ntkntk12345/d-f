import { CheckCircle2, MapPin } from "lucide-react";
import { CollageImagePreview } from "@/components/media/CollageImagePreview";
import { useSiteContact } from "@/context/SiteContactContext";
import type { FeaturedPost } from "@/lib/local-properties";

function normalizeFeaturedText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\u0111/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function cleanupFeaturedLine(value: string) {
  return value.replace(/^[\s|,*\-•–—~+.:;!?()[\]{}"'`_=/\\]+/, "").replace(/^[\s📍✨💰🔥🏡🏠⭐]+/u, "").trim();
}

function getFeaturedContentLines(content: string) {
  return content
    .split(/\n+/)
    .map((line) => cleanupFeaturedLine(line))
    .filter(Boolean);
}

function getFeaturedPostImages(post: FeaturedPost) {
  return post.imageUrls?.length
    ? post.imageUrls
    : post.imageUrl
      ? [post.imageUrl]
      : [];
}

function extractFeaturedAddress(post: FeaturedPost) {
  if (post.address?.trim()) {
    return post.address.trim();
  }

  const lines = getFeaturedContentLines(post.content);
  const addressLine = lines.find((line) => {
    const normalized = normalizeFeaturedText(line);
    return (
      normalized.includes("dia chi") ||
      normalized.includes("vi tri") ||
      /(ngo|ngach|duong|pho|so\s*\d|quan|huyen|my dinh|ha noi|dong da|cau giay|nam tu liem)/.test(normalized)
    );
  });

  return addressLine || cleanupFeaturedLine(post.summary) || post.title;
}

function extractFeaturedRoomType(post: FeaturedPost) {
  if (post.roomType?.trim()) {
    return post.roomType.trim();
  }

  const candidates = `${post.title}\n${post.summary}\n${post.content}`;
  const normalized = normalizeFeaturedText(candidates);
  const roomTypePatterns: Array<[RegExp, string]> = [
    [/\b2n1k\b/, "2N1K"],
    [/\b1n1k\b/, "1N1K"],
    [/\bstudio\b/, "Studio"],
    [/\bgac xep\b/, "Gac xep"],
    [/\bgiuong tang\b/, "Giuong tang"],
    [/\bo ghep\b/, "O ghep"],
    [/\bchung cu mini\b/, "Chung cu mini"],
    [/\bphong tro\b/, "Phong tro"],
  ];

  for (const [pattern, label] of roomTypePatterns) {
    if (pattern.test(normalized)) {
      return label;
    }
  }

  return "Phong cho thue";
}

function extractFeaturedPrice(post: FeaturedPost) {
  if (post.priceLabel?.trim()) {
    return post.priceLabel.trim();
  }

  const lines = getFeaturedContentLines(post.content);
  const priceLine = lines.find((line) => {
    const normalized = normalizeFeaturedText(line);
    return /\d/.test(normalized) && (
      normalized.includes("gia") ||
      normalized.includes("/thang") ||
      normalized.includes("trieu") ||
      /(^|[^a-z])(tr|k)([^a-z]|$)/.test(normalized)
    );
  });

  if (!priceLine) {
    return null;
  }

  return priceLine
    .replace(/^gia\s*phong\s*[:\-]?\s*/i, "")
    .replace(/^gia\s*[:\-]?\s*/i, "")
    .trim();
}

function formatFeaturedUpdatedDate(value: string) {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "--";
  }
}

type FeaturedPostCardProps = {
  post: FeaturedPost;
};

export function FeaturedPostCard({ post }: FeaturedPostCardProps) {
  const { contactLink } = useSiteContact();
  const imageUrls = getFeaturedPostImages(post);
  const addressLabel = extractFeaturedAddress(post);
  const roomTypeLabel = extractFeaturedRoomType(post);
  const priceLabel = extractFeaturedPrice(post);
  const actionHref = post.actionUrl || contactLink;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-white shadow-sm transition-all duration-300 hover:shadow-xl">
      <div className="relative overflow-hidden" style={{ paddingBottom: "75%" }}>
        <CollageImagePreview
          images={imageUrls}
          alt={`${roomTypeLabel} ${addressLabel}`}
          fallbackImages={[]}
          emptyStateClassName="bg-[linear-gradient(135deg,#fff5e7,#ffe5b7_55%,#fffaf1)]"
        />

        <div className="absolute left-2 top-2 z-10 rounded-full bg-[#c2410c] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white shadow">
          Noi bat
        </div>

        {imageUrls.length > 1 ? (
          <div className="absolute right-2 top-2 z-10 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-slate-700 shadow">
            {imageUrls.length} anh
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="mb-2 min-h-[52px] space-y-1.5">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Loai phong:</span> {roomTypeLabel}
          </p>
          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
            <CheckCircle2 className="h-2.5 w-2.5" />
            Xac minh
          </span>
        </div>

        <div className="mb-2 flex min-h-[40px] items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="line-clamp-2">
            <span className="font-semibold text-foreground">Dia chi:</span> {addressLabel}
          </p>
        </div>

        <p className="mb-3 text-sm font-bold text-red-600">
          Gia: {priceLabel || "Lien he de nhan thong tin moi nhat"}
        </p>

        <div className="mt-auto flex flex-col items-stretch gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <span className="text-[11px] text-muted-foreground">
            Cap nhat {formatFeaturedUpdatedDate(post.updatedAt)}
          </span>

          {actionHref ? (
            <a
              href={actionHref}
              target="_blank"
              rel="noreferrer"
              className="w-full shrink-0 rounded-lg border border-red-500 px-2.5 py-2 text-center text-[11px] font-bold text-red-600 transition-colors hover:bg-red-50 min-[420px]:w-auto min-[420px]:py-1.5"
            >
              {post.actionLabel || "Lien he ngay"}
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
