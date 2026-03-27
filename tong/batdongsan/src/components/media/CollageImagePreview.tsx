const DEFAULT_FALLBACK_IMAGE = "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=600&h=400&fit=crop";

function isSvgLikeImage(url: string) {
  const normalized = url.trim().toLowerCase();
  if (!normalized) return false;

  return (
    normalized.startsWith("data:image/svg") ||
    normalized.includes("image/svg+xml") ||
    normalized.includes("http://www.w3.org/2000/svg") ||
    normalized.includes("%3csvg") ||
    normalized.includes("<svg")
  );
}

export function getPreviewImages(images: string[] | undefined, fallbackImages: string[] = [DEFAULT_FALLBACK_IMAGE]) {
  const uniqueImages = Array.from(new Set((images || []).map((image) => image.trim()).filter(Boolean)));
  const usableImages = uniqueImages.filter((image) => !isSvgLikeImage(image));

  if (usableImages.length > 0) return usableImages;
  if (uniqueImages.length > 0) return uniqueImages;
  return fallbackImages.filter(Boolean);
}

function PreviewTile({
  src,
  alt,
  className,
  overlayLabel,
}: {
  src: string;
  alt: string;
  className?: string;
  overlayLabel?: string;
}) {
  return (
    <div className={`relative overflow-hidden ${className || ""}`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      {overlayLabel ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-bold text-white backdrop-blur-[1px]">
          {overlayLabel}
        </div>
      ) : null}
    </div>
  );
}

type CollageImagePreviewProps = {
  images?: string[];
  alt: string;
  fallbackImages?: string[];
  emptyStateClassName?: string;
};

export function CollageImagePreview({
  images,
  alt,
  fallbackImages,
  emptyStateClassName,
}: CollageImagePreviewProps) {
  const previewImages = getPreviewImages(images, fallbackImages);
  const collageImages = previewImages.slice(0, 4);
  const remainingCount = Math.max(previewImages.length - collageImages.length, 0);

  if (collageImages.length === 0) {
    return (
      <div
        className={`absolute inset-0 bg-[linear-gradient(135deg,#f7efe2,#fde7c3_55%,#fff8ee)] ${emptyStateClassName || ""}`}
      />
    );
  }

  if (collageImages.length === 1) {
    return (
      <img
        src={collageImages[0]}
        alt={alt}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
    );
  }

  if (collageImages.length === 2) {
    return (
      <div className="absolute inset-0 grid grid-cols-2 gap-px bg-muted/60">
        {collageImages.map((image, index) => (
          <PreviewTile key={`${image}-${index}`} src={image} alt={`${alt} ${index + 1}`} />
        ))}
      </div>
    );
  }

  if (collageImages.length === 3) {
    return (
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-muted/60">
        <PreviewTile src={collageImages[0]} alt={`${alt} 1`} className="row-span-2" />
        <PreviewTile src={collageImages[1]} alt={`${alt} 2`} />
        <PreviewTile src={collageImages[2]} alt={`${alt} 3`} />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-muted/60">
      {collageImages.map((image, index) => (
        <PreviewTile
          key={`${image}-${index}`}
          src={image}
          alt={`${alt} ${index + 1}`}
          overlayLabel={index === collageImages.length - 1 && remainingCount > 0 ? `+${remainingCount}` : undefined}
        />
      ))}
    </div>
  );
}
