import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  MapPin,
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
import { truncateSeoText, useSeo } from "@/hooks/useSeo";
import { goBackOrNavigate } from "@/lib/navigation";
import { useGetFeaturedPost } from "@/lib/local-properties";
import {
  extractFeaturedAddress,
  extractFeaturedPrice,
  extractFeaturedRoomType,
  getFeaturedContentLines,
  getFeaturedPostImages,
} from "@/lib/featured-post-utils";

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

export function FeaturedPostDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const { contactLink } = useSiteContact();
  const { data: post, isLoading, error } = useGetFeaturedPost(id);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  const images = post ? getFeaturedPostImages(post) : [];
  const addressLabel = post ? extractFeaturedAddress(post) : "";
  const roomTypeLabel = post ? extractFeaturedRoomType(post) : "";
  const priceLabel = post ? extractFeaturedPrice(post) : null;
  const resolvedContactLink = post?.actionUrl || contactLink;
  const shareLink = typeof window !== "undefined" ? window.location.href : "";
  const descriptionText = post ? getFeaturedContentLines(post.content).join("\n") : "";
  const infoToCopy = [
    post?.title || "",
    roomTypeLabel ? `Loại phòng: ${roomTypeLabel}` : "",
    addressLabel ? `Địa chỉ: ${addressLabel}` : "",
    priceLabel ? `Giá: ${priceLabel}` : "",
    descriptionText,
    shareLink ? `Link: ${shareLink}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  useSeo({
    title: post
      ? `${roomTypeLabel} - ${addressLabel} | 80LandTimPhong.vn`
      : isLoading
        ? "Đang tải bài viết nổi bật | 80LandTimPhong.vn"
        : "Không tìm thấy bài viết nổi bật | 80LandTimPhong.vn",
    description: post
      ? truncateSeoText(`${priceLabel || "Giá liên hệ"}. ${descriptionText}`)
      : "Bài viết nổi bật không tồn tại hoặc đã bị gỡ.",
    image: images[0] || "/opengraph.jpg",
    url: shareLink || undefined,
    type: post ? "article" : "website",
    robots: post || isLoading ? "index,follow" : "noindex,follow",
  });

  const handleGoBack = () => {
    goBackOrNavigate(navigate, "/");
  };

  const handleShare = async () => {
    try {
      await copyTextToClipboard(shareLink);
      toast({
        title: "Đã copy link bài viết",
        description: "Bạn có thể gửi link này ngay qua Zalo.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Không thể copy link",
        description: "Thử lại giúp mình sau ít giây.",
      });
    }
  };

  const handleCopyInfo = async () => {
    try {
      await copyTextToClipboard(infoToCopy);
      toast({
        title: "Đã copy thông tin",
        description: "Bạn có thể gửi nội dung này để chốt lịch xem phòng.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Không thể copy",
        description: "Thử lại giúp mình sau ít giây.",
      });
    }
  };

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

  if (error || !post) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4 pb-24 pt-10 md:pb-20 md:pt-32">
        <div className="max-w-md rounded-2xl border border-border bg-white p-12 text-center shadow-lg">
          <AlertTriangle className="mx-auto mb-6 h-16 w-16 text-destructive opacity-80" />
          <h2 className="mb-4 text-2xl font-display font-bold">Không tìm thấy bài viết</h2>
          <p className="mb-8 text-muted-foreground">Bài viết nổi bật này có thể đã bị xóa hoặc không tồn tại.</p>
          <Button className="w-full bg-primary" onClick={handleGoBack}>Quay lại trang chủ</Button>
        </div>
      </div>
    );
  }

  const scrollPrev = () => emblaApi && emblaApi.scrollPrev();
  const scrollNext = () => emblaApi && emblaApi.scrollNext();

  return (
    <div className="min-h-screen bg-secondary/20 pb-24 pt-4 md:pb-20 md:pt-8">
      <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-3 lg:hidden">
        <div className="rounded-full bg-white/95 px-4 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur">
          Liên hệ chốt phòng
        </div>
        {resolvedContactLink ? (
          <Button
            asChild
            className="h-12 rounded-full bg-red-600 px-4 text-sm font-bold text-white shadow-xl shadow-red-500/30 transition-all hover:-translate-y-0.5 hover:bg-red-700"
          >
            <a
              href={resolvedContactLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2"
            >
              <MessageCircle className="h-5 w-5" />
              {post.actionLabel || "Liên hệ ngay"}
            </a>
          </Button>
        ) : null}
        <Button
          asChild
          variant="outline"
          className="h-12 rounded-full border-red-200 bg-white px-4 text-sm font-bold text-red-600 shadow-lg transition-all hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
        >
          <a href="tel:0876480130" className="flex items-center gap-2">
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
              onClick={handleCopyInfo}
              className="h-10 rounded-full border-border/70 bg-white px-4 font-semibold shadow-sm transition-colors hover:bg-primary/5 hover:text-primary"
            >
              <Copy className="h-4 w-4" /> Copy thông tin
            </Button>
          </div>
        </div>

        <div className="group relative mb-8 overflow-hidden rounded-2xl bg-black shadow-xl">
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex h-[260px] sm:h-[400px] md:h-[550px]">
              {images.length > 0 ? images.map((imageUrl, index) => (
                <div key={imageUrl || index} className="relative min-w-0 flex-[0_0_100%]">
                  <img
                    src={imageUrl}
                    alt={`${post.title} - Ảnh ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/50 to-transparent" />
                </div>
              )) : (
                <div className="flex min-w-0 flex-[0_0_100%] items-center justify-center bg-[linear-gradient(135deg,#fff5e7,#ffe5b7_55%,#fffaf1)] text-slate-600">
                  Không có ảnh
                </div>
              )}
            </div>
          </div>

          {images.length > 1 ? (
            <>
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
            </>
          ) : null}

          <div className="absolute left-4 top-4 flex flex-col gap-2 md:left-6 md:top-6">
            <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-white shadow-lg md:px-4 md:py-1.5 md:text-sm">
              Tin nổi bật
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-white shadow-lg md:px-4 md:py-1.5 md:text-sm">
              <CheckCircle2 className="h-4 w-4" /> Xác minh
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
          <div className="space-y-6 lg:col-span-2 lg:space-y-8">
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm md:p-8">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  {roomTypeLabel}
                </span>
                {priceLabel ? (
                  <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600">
                    {priceLabel}
                  </span>
                ) : null}
              </div>
              <h1 className="mb-4 text-2xl font-display font-bold leading-tight text-foreground md:text-3xl">
                {addressLabel}
              </h1>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>{addressLabel}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm md:p-8">
              <h3 className="relative mb-6 inline-block text-xl font-display font-bold after:absolute after:bottom-[-8px] after:left-0 after:h-1 after:w-12 after:rounded-full after:bg-primary">
                Thông tin mô tả
              </h3>
              <div className="space-y-3">
                {renderDescriptionText(descriptionText || post.content, post.id)}
              </div>
            </div>

            <div className="flex flex-wrap gap-6 border-t border-border pt-4 text-sm text-muted-foreground">
              <span>
                Mã bài: <strong>{post.id}</strong>
              </span>
              <span>
                Ngày tạo: <strong>{format(new Date(post.createdAt), "dd/MM/yyyy", { locale: vi })}</strong>
              </span>
              <span>
                Cập nhật: <strong>{format(new Date(post.updatedAt), "dd/MM/yyyy", { locale: vi })}</strong>
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
                  {resolvedContactLink ? (
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
                        {post.actionLabel || "Liên hệ ngay"}
                      </a>
                    </Button>
                  ) : null}
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
                  Bạn hãy copy phần thông tin bài viết gửi qua Zalo, chúng tôi sẽ hỗ trợ chốt lịch xem nhanh hơn.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
