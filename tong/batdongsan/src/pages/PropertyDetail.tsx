import { useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Flag,
  Heart,
  MessageCircle,
  Phone,
  Share2,
} from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import useEmblaCarousel from "embla-carousel-react";
import { Button } from "@/components/ui/button";
import { useSiteContact } from "@/context/SiteContactContext";
import { toast } from "@/hooks/use-toast";
import { useFavoritesActions, useIsFavorite } from "@/hooks/useFavorites";
import { truncateSeoText, useSeo } from "@/hooks/useSeo";
import { ADMIN_CONTACT_LABEL, useGetProperty, type Property } from "@/lib/local-properties";
import { goBackOrNavigate } from "@/lib/navigation";

function isHeadingLine(line: string) {
  const cleaned = line.replace(/[+*]/g, "").trim();
  const alphaOnly = cleaned.replace(/[^\p{L}]/gu, "");

  if (!cleaned) return false;
  if (line.includes("+++") || line.includes("***")) return true;
  if (alphaOnly.length < 8) return false;

  return alphaOnly === alphaOnly.toUpperCase();
}

function splitLabelLine(line: string) {
  const match = line.match(/^([^:]{2,36}):\s*(.+)$/);
  if (!match) return null;

  return {
    label: match[1].trim(),
    value: match[2].trim(),
  };
}

function renderDescriptionLine(line: string, key: string) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (/^[-+]\s*/.test(trimmed)) {
    return (
      <div key={key} className="flex items-start gap-3 rounded-xl bg-secondary/40 px-4 py-3">
        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
        <p className="text-[15px] leading-7 text-foreground">{trimmed.replace(/^[-+]\s*/, "")}</p>
      </div>
    );
  }

  if (isHeadingLine(trimmed)) {
    return (
      <div key={key} className="rounded-2xl bg-primary/5 px-5 py-4">
        <p className="text-lg font-extrabold uppercase tracking-[0.04em] text-foreground">
          {trimmed.replace(/[+*]/g, "").trim()}
        </p>
      </div>
    );
  }

  const labeledLine = splitLabelLine(trimmed);
  if (labeledLine) {
    return (
      <p key={key} className="text-[15px] leading-7 text-foreground">
        <span className="font-bold">{labeledLine.label}:</span> {labeledLine.value}
      </p>
    );
  }

  return (
    <p key={key} className="text-[15px] leading-7 text-foreground">
      {trimmed}
    </p>
  );
}

function renderDescriptionText(text: string, keyPrefix: string) {
  return text
    .split("\n")
    .map((line, index) => renderDescriptionLine(line, `${keyPrefix}-${index}`))
    .filter(Boolean);
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textArea);

  if (!copied) {
    throw new Error("copy_failed");
  }
}

function buildPropertyInfoText(
  property: Property,
  addressLine: string,
  descriptionBlocks: string[],
  shareLink: string,
) {
  return [
    property.title,
    addressLine ? `Địa chỉ: ${addressLine}` : "",
    `Giá: ${property.price} ${property.priceUnit}`,
    `Mã tin: #${property.id}`,
    ...descriptionBlocks,
    `Link: ${shareLink}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function PropertyDetail() {
  const { id } = useParams();
  const propertyId = parseInt(id || "0", 10);
  const [, navigate] = useLocation();
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const { toggle } = useFavoritesActions();
  const liked = useIsFavorite(propertyId);
  const { contactLink } = useSiteContact();

  const { data: property, isLoading, error } = useGetProperty(propertyId);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [propertyId]);

  const fallbackImages = [
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&h=800&fit=crop",
    "https://images.unsplash.com/photo-1600607687931-cebf66cc4dd3?w=1200&h=800&fit=crop",
    "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200&h=800&fit=crop",
  ];
  const seoAddressLine = property
    ? [property.address, property.ward, property.district, property.province].filter(Boolean).join(", ")
    : "";
  const seoShareLink = typeof window !== "undefined" ? window.location.href : undefined;
  const seoTitle = property
    ? `${seoAddressLine} - ${property.price} ${property.priceUnit} | 80LandTimPhong.vn`
    : isLoading
      ? "Đang tải tin đăng | 80LandTimPhong.vn"
      : "Không tìm thấy tin đăng | 80LandTimPhong.vn";
  const seoDescriptionText = property
    ? truncateSeoText(`Cho thuê ${seoAddressLine}. Giá ${property.price} ${property.priceUnit}. ${property.description}`)
    : isLoading
      ? "Thông tin chi tiết tin đăng đang được tải."
      : "Tin đăng này có thể đã bị xóa hoặc không tồn tại.";

  useSeo({
    title: seoTitle,
    description: seoDescriptionText,
    image: property?.images?.[0] || fallbackImages[0],
    url: seoShareLink,
    type: property ? "article" : "website",
    robots: property || isLoading ? "index,follow" : "noindex,follow",
  });

  if (isLoading) {
    return (
      <div className="mx-auto min-h-screen max-w-7xl px-4 pb-24 pt-6 md:pb-20 md:pt-24">
        <div className="animate-pulse space-y-8">
          <div className="h-8 w-1/4 rounded bg-muted" />
          <div className="h-[280px] w-full rounded-2xl bg-muted sm:h-[500px]" />
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <div className="h-10 w-3/4 rounded bg-muted" />
              <div className="h-6 w-1/2 rounded bg-muted" />
            </div>
            <div className="h-64 rounded-2xl bg-muted lg:col-span-1" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4 pb-24 pt-10 md:pb-20 md:pt-32">
        <div className="max-w-md rounded-2xl border border-border bg-white p-12 text-center shadow-lg">
          <AlertTriangle className="mx-auto mb-6 h-16 w-16 text-destructive opacity-80" />
          <h2 className="mb-4 text-2xl font-display font-bold">Không tìm thấy tin đăng</h2>
          <p className="mb-8 text-muted-foreground">Tin đăng này có thể đã bị xóa hoặc không tồn tại.</p>
          <Link href="/search">
            <Button className="w-full bg-primary">Quay lại tìm kiếm</Button>
          </Link>
        </div>
      </div>
    );
  }

  const images =
    property.images?.length > 0
      ? property.images
      : fallbackImages;

  const detailBlocks = property.timelineItems.reduce<
    Array<
      | { type: "text"; text: string }
      | {
          type: "media";
          items: Array<
            | { kind: "photo"; url: string; thumb: string }
            | { kind: "video"; url: string; thumb: string }
          >;
        }
    >
  >((blocks, item) => {
    if (item.type === "text") {
      const text = item.text.trim();
      if (text) {
        blocks.push({ type: "text", text });
      }
      return blocks;
    }

    const mediaItem =
      item.type === "video"
        ? {
            kind: "video" as const,
            url: item.video.url,
            thumb: item.video.thumb || images[0],
          }
        : {
            kind: "photo" as const,
            url: item.photo.url,
            thumb: item.photo.url,
          };

    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock?.type === "media") {
      lastBlock.items.push(mediaItem);
    } else {
      blocks.push({ type: "media", items: [mediaItem] });
    }

    return blocks;
  }, []);

  const contentBlocks =
    detailBlocks.length > 0
      ? detailBlocks.filter((block) => block.type === "text")
      : [{ type: "text" as const, text: property.description }];

  const addressLine = [property.address, property.ward, property.district, property.province]
    .filter(Boolean)
    .join(", ");
  const resolvedContactLink = contactLink || property.contactLink;
  const shareLink = seoShareLink || "";
  const descriptionBlocks = contentBlocks.reduce<string[]>((allBlocks, block) => {
    if (block.type !== "text") return allBlocks;

    const normalizedText = block.text.trim();
    if (normalizedText) {
      allBlocks.push(normalizedText);
    }

    return allBlocks;
  }, []);
  const propertyInfoToCopy = buildPropertyInfoText(property, addressLine, descriptionBlocks, shareLink);

  const scrollPrev = () => emblaApi && emblaApi.scrollPrev();
  const scrollNext = () => emblaApi && emblaApi.scrollNext();

  const handleCopyPropertyInfo = async () => {
    try {
      await copyTextToClipboard(propertyInfoToCopy);
      toast({
        title: "Đã copy thông tin",
        description: "Bạn có thể gửi ngay thông tin này qua Zalo.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Không thể copy",
        description: "Thử lại giúp mình sau ít giây.",
      });
    }
  };

  const handleShare = async () => {
    try {
      await copyTextToClipboard(shareLink);
      toast({
        title: "Đã copy link phòng",
        description: "Chỉ cần dán link này là chia sẻ được ngay.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Không thể copy link",
        description: "Thử lại giúp mình sau ít giây.",
      });
    }
  };

  const handleGoBack = () => {
    goBackOrNavigate(navigate, "/search?type=cho-thue");
  };

  return (
    <div className="min-h-screen bg-secondary/20 pb-24 pt-4 md:pb-20 md:pt-8">
      <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-3 lg:hidden">
        <div className="rounded-full bg-white/95 px-4 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur">
          Liên hệ chốt phòng
        </div>
        <Button
          asChild
          className="h-12 rounded-full bg-red-600 px-4 text-sm font-bold text-white shadow-xl shadow-red-500/30 transition-all hover:-translate-y-0.5 hover:bg-red-700"
        >
          <a
            href={resolvedContactLink}
            target="_blank"
            rel="noreferrer"
            aria-label={ADMIN_CONTACT_LABEL}
            className="flex items-center gap-2"
          >
            <MessageCircle className="h-5 w-5" />
            {ADMIN_CONTACT_LABEL}
          </a>
        </Button>
        <Button
          asChild
          variant="outline"
          className="h-12 rounded-full border-red-200 bg-white px-4 text-sm font-bold text-red-600 shadow-lg transition-all hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
        >
          <a href="tel:0876480130" aria-label="Gọi hotline" className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Hotline
          </a>
        </Button>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={handleGoBack}
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Quay lại
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="h-10 rounded-full border-border/70 bg-white px-4 font-semibold shadow-sm transition-colors hover:bg-primary/5 hover:text-primary"
            >
              <Share2 className="h-4 w-4" /> Chia sẻ
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggle(propertyId)}
              className={`h-10 rounded-full px-4 font-semibold shadow-sm transition-colors ${
                liked
                  ? "border-primary bg-primary/5 text-primary hover:bg-primary/10"
                  : "border-border/70 bg-white hover:bg-primary/5 hover:text-primary"
              }`}
            >
              <Heart className={`h-4 w-4 ${liked ? "fill-primary" : ""}`} />
              {liked ? "Đã lưu" : "Lưu tin"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 rounded-full px-4 font-semibold text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Flag className="h-4 w-4" /> Báo cáo
            </Button>
          </div>
        </div>

        <div className="group relative mb-8 overflow-hidden rounded-2xl bg-black shadow-xl">
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex h-[260px] sm:h-[400px] md:h-[550px]">
              {images.map((img, index) => (
                <div key={index} className="relative min-w-0 flex-[0_0_100%]">
                  <img
                    src={img}
                    alt={`${property.title} - Ảnh ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/50 to-transparent" />
                </div>
              ))}
            </div>
          </div>

          <button
            className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/30 text-white backdrop-blur-md transition-all hover:bg-white/90 hover:text-black md:left-4 md:h-12 md:w-12 md:opacity-0 md:group-hover:opacity-100"
            onClick={scrollPrev}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/30 text-white backdrop-blur-md transition-all hover:bg-white/90 hover:text-black md:right-4 md:h-12 md:w-12 md:opacity-0 md:group-hover:opacity-100"
            onClick={scrollNext}
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          <div className="absolute left-4 top-4 flex flex-col gap-2 md:left-6 md:top-6">
            {property.isFeatured && (
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-white shadow-lg md:px-4 md:py-1.5 md:text-sm">
                Tin nổi bật
              </span>
            )}
            {property.isVerified && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-white shadow-lg md:px-4 md:py-1.5 md:text-sm">
                <CheckCircle2 className="h-4 w-4" /> Xác thực
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
          <div className="space-y-6 lg:col-span-2 lg:space-y-8">
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm md:p-8">
              <h1 className="mb-4 text-2xl font-display font-bold leading-tight text-foreground md:text-3xl">
                {addressLine}
              </h1>
            </div>

            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm md:p-8">
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="relative inline-block text-xl font-display font-bold after:absolute after:bottom-[-8px] after:left-0 after:h-1 after:w-12 after:rounded-full after:bg-primary">
                  Thông tin mô tả
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyPropertyInfo}
                  className="h-10 rounded-full border-border/70 bg-white px-4 font-semibold shadow-sm transition-colors hover:bg-primary/5 hover:text-primary"
                >
                  <Copy className="h-4 w-4" />
                  Copy thông tin
                </Button>
              </div>

              <div className="space-y-6">
                {contentBlocks.map((block, index) => (
                  <div key={`${property.id}-block-${index}`} className="space-y-4">
                    {block.type === "text" ? (
                      <div className="space-y-3">
                        {renderDescriptionText(block.text, `${property.id}-paragraph-${index}`)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-6 border-t border-border pt-4 text-sm text-muted-foreground">
              <span>
                Mã tin: <strong>#{property.id}</strong>
              </span>
              <span>
                Ngày đăng: <strong>{format(new Date(property.postedAt), "dd/MM/yyyy", { locale: vi })}</strong>
              </span>
              <span>
                Lượt xem: <strong>{property.views}</strong>
              </span>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-[100px] space-y-6">
              <div className="hidden overflow-hidden rounded-3xl border border-red-100 bg-gradient-to-b from-white to-red-50/40 p-6 shadow-lg shadow-red-100/40 lg:block">
                <div className="mb-4 space-y-1">
                  <h3 className="text-lg font-bold text-foreground">Liên hệ chốt phòng</h3>
                  <p className="text-sm text-muted-foreground">Trao đổi trực tiếp qua Zalo để xem phòng.</p>
                </div>

                <div className="space-y-3">
                  <Button
                    asChild
                    className="h-12 w-full rounded-2xl bg-red-600 text-base font-bold text-white shadow-md shadow-red-500/20 transition-all hover:-translate-y-0.5 hover:bg-red-700"
                  >
                    <a
                      href={resolvedContactLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex w-full items-center justify-center gap-2"
                    >
                      <MessageCircle className="h-5 w-5" />
                      {ADMIN_CONTACT_LABEL}
                    </a>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="h-12 w-full rounded-2xl border-red-200 bg-white text-base font-bold text-red-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                  >
                    <a href="tel:0876480130" className="flex w-full items-center justify-center gap-2">
                      <Phone className="h-5 w-5" />
                      Hotline 0876480130
                    </a>
                  </Button>
                </div>

                <p className="mt-4 rounded-2xl bg-white/80 p-3 text-left text-xs text-muted-foreground">
                  Bạn hãy copy phần thông tin phòng muốn xem gửi qua Zalo, chúng tôi sẽ gửi số chủ nhà cho bạn nhanh chóng hơn. Xin cảm ơn.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
