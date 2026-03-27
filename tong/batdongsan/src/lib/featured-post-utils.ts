import type { FeaturedPost } from "@/lib/local-properties";

export function normalizeFeaturedText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\u0111/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function cleanupFeaturedLine(value: string) {
  return value
    .replace(/^[\s|,*\-â€¢â€“â€”~+.:;!?()[\]{}"'`_=/\\]+/, "")
    .replace(/^[\sðŸ“âœ¨ðŸ’°ðŸ”¥ðŸ¡ðŸ â­]+/u, "")
    .trim();
}

export function getFeaturedContentLines(content: string) {
  return content
    .split(/\n+/)
    .map((line) => cleanupFeaturedLine(line))
    .filter(Boolean);
}

export function getFeaturedPostImages(post: FeaturedPost) {
  return post.imageUrls?.length
    ? post.imageUrls
    : post.imageUrl
      ? [post.imageUrl]
      : [];
}

export function extractFeaturedAddress(post: FeaturedPost) {
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

export function extractFeaturedRoomType(post: FeaturedPost) {
  if (post.roomType?.trim()) {
    return post.roomType.trim();
  }

  const candidates = `${post.title}\n${post.summary}\n${post.content}`;
  const normalized = normalizeFeaturedText(candidates);
  const roomTypePatterns: Array<[RegExp, string]> = [
    [/\b2n1k\b/, "2N1K"],
    [/\b1n1k\b/, "1N1K"],
    [/\bstudio\b/, "Studio"],
    [/\bgac xep\b/, "Gác xép"],
    [/\bgiuong tang\b/, "Giường tầng"],
    [/\bo ghep\b/, "Ở ghép"],
    [/\bchung cu mini\b/, "Chung cư mini"],
    [/\bphong tro\b/, "Phòng trọ"],
  ];

  for (const [pattern, label] of roomTypePatterns) {
    if (pattern.test(normalized)) {
      return label;
    }
  }

  return "Phòng cho thuê";
}

export function extractFeaturedPrice(post: FeaturedPost) {
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
