export type OptimizeImageDataUrlOptions = {
  maxSize?: number;
  outputType?: "image/jpeg" | "image/webp";
  quality?: number;
};

async function readFileAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("FILE_READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

async function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
    image.src = dataUrl;
  });
}

export async function fileToOptimizedImageDataUrl(
  file: File,
  options: OptimizeImageDataUrlOptions = {},
) {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);
  const maxSize = Math.max(1, options.maxSize ?? Math.max(image.width, image.height));
  const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));
  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return originalDataUrl;
  }

  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL(
    options.outputType || "image/jpeg",
    options.quality ?? 0.82,
  );
}

export function getDataUrlByteSize(dataUrl: string) {
  const match = dataUrl.match(/^data:.*;base64,([A-Za-z0-9+/=]+)$/);

  if (!match) {
    return new Blob([dataUrl]).size;
  }

  const base64 = match[1];
  const paddingLength = (base64.match(/=+$/)?.[0].length ?? 0);
  return Math.floor((base64.length * 3) / 4) - paddingLength;
}
