import { CheckCircle2, MapPin } from "lucide-react";
import { useLocation } from "wouter";
import { CollageImagePreview } from "@/components/media/CollageImagePreview";
import { useSiteContact } from "@/context/SiteContactContext";
import type { FeaturedPost } from "@/lib/local-properties";
import {
  extractFeaturedAddress,
  extractFeaturedPrice,
  extractFeaturedRoomType,
  getFeaturedPostImages,
} from "@/lib/featured-post-utils";

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
  const [, navigate] = useLocation();
  const { contactLink } = useSiteContact();
  const imageUrls = getFeaturedPostImages(post);
  const addressLabel = extractFeaturedAddress(post);
  const roomTypeLabel = extractFeaturedRoomType(post);
  const priceLabel = extractFeaturedPrice(post);
  const actionHref = post.actionUrl || contactLink;

  const handleOpenDetails = () => navigate(`/tin-noi-bat/${post.id}`);

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={handleOpenDetails}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        handleOpenDetails();
      }}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/50 bg-white shadow-sm transition-all duration-300 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
    >
      <div className="relative overflow-hidden" style={{ paddingBottom: "75%" }}>
        <CollageImagePreview
          images={imageUrls}
          alt={`${roomTypeLabel} ${addressLabel}`}
          fallbackImages={[]}
          emptyStateClassName="bg-[linear-gradient(135deg,#fff5e7,#ffe5b7_55%,#fffaf1)]"
        />

        <div className="absolute left-2 top-2 z-10 rounded-full bg-[#c2410c] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white shadow">
          Nổi bật
        </div>

        {imageUrls.length > 1 ? (
          <div className="absolute right-2 top-2 z-10 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-slate-700 shadow">
            {imageUrls.length} ảnh
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="mb-2 min-h-[52px] space-y-1.5">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Loại phòng:</span> {roomTypeLabel}
          </p>
          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
            <CheckCircle2 className="h-2.5 w-2.5" />
            Xác minh
          </span>
        </div>

        <div className="mb-2 flex min-h-[40px] items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="line-clamp-2">
            <span className="font-semibold text-foreground">Địa chỉ:</span> {addressLabel}
          </p>
        </div>

        <p className="mb-3 text-sm font-bold text-red-600">
          Giá: {priceLabel || "Liên hệ để nhận thông tin mới nhất"}
        </p>

        <div className="mt-auto flex flex-col items-stretch gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <span className="text-[11px] text-muted-foreground">
            Cập nhật {formatFeaturedUpdatedDate(post.updatedAt)}
          </span>

          {actionHref ? (
            <a
              href={actionHref}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="w-full shrink-0 rounded-lg border border-red-500 px-2.5 py-2 text-center text-[11px] font-bold text-red-600 transition-colors hover:bg-red-50 min-[420px]:w-auto min-[420px]:py-1.5"
            >
              {post.actionLabel || "Liên hệ ngay"}
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
