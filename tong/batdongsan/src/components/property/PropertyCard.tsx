import { memo } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, Heart, MapPin, Percent } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { useSiteContact } from "@/context/SiteContactContext";
import { CollageImagePreview, getPreviewImages } from "@/components/media/CollageImagePreview";
import { ADMIN_CONTACT_LABEL, type PropertyPreview } from "@/lib/local-properties";
import { buildPageRestoreKey, rememberPageForRestore } from "@/lib/page-restore";
import { useFavoritesActions, useIsFavorite } from "@/hooks/useFavorites";

interface PropertyCardProps {
  property: PropertyPreview;
  layout?: "grid" | "list";
  showCommission?: boolean;
}

function getCommission(id: number): number {
  return 3 + (id % 6);
}

function getAddressLabel(property: PropertyPreview) {
  return property.address?.trim() || `${property.district}, ${property.province}`;
}

const GRID_CARD_STYLE = {
  contentVisibility: "auto",
  containIntrinsicSize: "392px",
} as const;
const LIST_CARD_STYLE = {
  contentVisibility: "auto",
  containIntrinsicSize: "280px",
} as const;

export const PropertyCard = memo(function PropertyCard({
  property,
  layout = "grid",
  showCommission = false,
}: PropertyCardProps) {
  const [, navigate] = useLocation();
  const { toggle } = useFavoritesActions();
  const liked = useIsFavorite(property.id);
  const { contactLink } = useSiteContact();
  const isVerified = property.isVerified === true;
  const roomType = property.roomType?.trim() || "";
  const mainImage = getPreviewImages(property.images)[0];
  const resolvedContactLink = contactLink || property.contactLink;

  let postedDate = "";
  try {
    postedDate = formatDistanceToNow(new Date(property.postedAt), { addSuffix: true, locale: vi });
  } catch {
    postedDate = "Hôm nay";
  }

  const rememberCurrentPage = () => {
    if (typeof window === "undefined") return;

    const routeKey = buildPageRestoreKey(window.location.pathname, window.location.search);
    rememberPageForRestore(routeKey, { propertyId: property.id });
  };

  const handleOpenDetails = () => {
    rememberCurrentPage();
    navigate(`/property/${property.id}`);
  };

  const handlePreviewLinkClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.stopPropagation();
    rememberCurrentPage();
  };

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    handleOpenDetails();
  };

  if (layout === "list") {
    return (
      <div
        data-property-card-id={property.id}
        role="link"
        tabIndex={0}
        onClick={handleOpenDetails}
        onKeyDown={handleCardKeyDown}
        style={LIST_CARD_STYLE}
        className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-white transition-all duration-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/30 sm:flex-row"
      >
        <div className="relative h-48 w-full shrink-0 overflow-hidden sm:h-auto sm:w-[220px] md:w-[260px]">
          <Link href={`/property/${property.id}`} onClick={handlePreviewLinkClick} className="block h-full">
            <div className="relative h-full" style={{ minHeight: 192 }}>
              <CollageImagePreview images={property.images} alt={property.title} />
            </div>
          </Link>

          {showCommission && (
            <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
              <Percent className="h-2.5 w-2.5" />
              {getCommission(property.id)}% HH
            </div>
          )}

          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggle(property.id);
            }}
            className={`absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full shadow-md transition-all ${
              liked ? "bg-primary text-white" : "bg-white/85 text-muted-foreground hover:text-primary"
            }`}
          >
            <Heart className={`h-4 w-4 ${liked ? "fill-white" : ""}`} />
          </button>
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between p-3 sm:p-4">
          <div className="space-y-2 sm:space-y-3">
            <div className="min-h-[58px] space-y-2">
              {roomType ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Dạng phòng:</span> {roomType}
                </p>
              ) : null}
              {isVerified ? (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" />
                  Xác thực
                </span>
              ) : null}
            </div>

            <div className="flex min-h-[46px] items-start gap-2 text-sm text-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="line-clamp-2 text-muted-foreground">
                <span className="font-semibold text-foreground">Địa chỉ:</span> {getAddressLabel(property)}
              </p>
            </div>

            <p className="text-base font-bold text-red-600">
              Giá: {property.price} {property.priceUnit}
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t border-border/50 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">{postedDate}</p>
            <a
              href={resolvedContactLink}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-lg border border-red-500 px-3 py-2 text-center text-xs font-bold text-red-600 transition-colors hover:bg-red-50 sm:w-auto sm:py-1.5"
            >
              {ADMIN_CONTACT_LABEL}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-property-card-id={property.id}
      role="link"
      tabIndex={0}
      onClick={handleOpenDetails}
      onKeyDown={handleCardKeyDown}
      style={GRID_CARD_STYLE}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/50 bg-white shadow-sm transition-all duration-300 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
    >
      <div className="relative overflow-hidden" style={{ paddingBottom: "75%" }}>
        <Link href={`/property/${property.id}`} onClick={handlePreviewLinkClick} className="absolute inset-0">
          <img
            src={mainImage}
            alt={property.title}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </Link>

        {showCommission && (
          <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
            <Percent className="h-2.5 w-2.5" />
            {getCommission(property.id)}% HH
          </div>
        )}

        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle(property.id);
          }}
          className={`absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full shadow-md transition-all ${
            liked ? "bg-primary text-white" : "bg-white/85 text-muted-foreground hover:bg-white hover:text-primary"
          }`}
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-white" : ""}`} />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="mb-2 min-h-[52px] space-y-1.5">
          {roomType ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Dạng phòng:</span> {roomType}
            </p>
          ) : null}
          {isVerified ? (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Xác thực
            </span>
          ) : null}
        </div>

        <div className="mb-2 flex min-h-[40px] items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="line-clamp-2">
            <span className="font-semibold text-foreground">Địa chỉ:</span> {getAddressLabel(property)}
          </p>
        </div>

        <p className="mb-3 text-sm font-bold text-red-600">
          Giá: {property.price} {property.priceUnit}
        </p>

        <div className="mt-auto flex flex-col items-stretch gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <span className="text-[11px] text-muted-foreground">{postedDate}</span>
          <a
            href={resolvedContactLink}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="w-full shrink-0 rounded-lg border border-red-500 px-2.5 py-2 text-center text-[11px] font-bold text-red-600 transition-colors hover:bg-red-50 min-[420px]:w-auto min-[420px]:py-1.5"
          >
            {ADMIN_CONTACT_LABEL}
          </a>
        </div>
      </div>
    </div>
  );
});
