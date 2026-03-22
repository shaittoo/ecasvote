/**
 * Robust QR read for paper ballot photos (skew, compression, thumbnails).
 * Tries BarcodeDetector (Chromium) at several scales, then html5-qrcode.
 */

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      resolve(im);
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    im.src = url;
  });
}

type BarcodeDetectorCtor = new (options: {
  formats: string[];
}) => {
  detect: (image: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

async function tryBarcodeDetectorOnCanvas(
  file: File,
  scale: number
): Promise<string | null> {
  if (typeof window === "undefined" || !("BarcodeDetector" in window)) {
    return null;
  }
  try {
    const BD = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor })
      .BarcodeDetector;
    const detector = new BD({ formats: ["qr_code"] });
    const img = await loadImageFromFile(file);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    const codes = await detector.detect(canvas);
    if (codes?.length) {
      const v = codes[0]?.rawValue;
      if (v && v.trim()) return v.trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function tryBarcodeDetectorBitmap(file: File): Promise<string | null> {
  if (typeof window === "undefined" || !("BarcodeDetector" in window)) {
    return null;
  }
  try {
    const BD = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor })
      .BarcodeDetector;
    const detector = new BD({ formats: ["qr_code"] });
    const bmp = await createImageBitmap(file);
    try {
      const codes = await detector.detect(bmp);
      if (codes?.length) {
        const v = codes[0]?.rawValue;
        if (v && v.trim()) return v.trim();
      }
    } finally {
      bmp.close();
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function tryHtml5Qrcode(file: File): Promise<string | null> {
  const hostId = `ecasvote-qr-fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const el = document.createElement("div");
  el.id = hostId;
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "position:fixed;left:-3000px;top:0;width:512px;height:512px;overflow:hidden;opacity:0;pointer-events:none";
  document.body.appendChild(el);
  try {
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode(hostId, false);
    try {
      const text = await scanner.scanFile(file, false);
      return text?.trim() || null;
    } finally {
      scanner.clear();
    }
  } catch {
    return null;
  } finally {
    el.remove();
  }
}

/**
 * Returns raw QR string if any strategy succeeds.
 */
export async function tryDecodeQrTextFromFile(file: File): Promise<string | null> {
  const strategies: Array<() => Promise<string | null>> = [
    () => tryBarcodeDetectorBitmap(file),
    () => tryBarcodeDetectorOnCanvas(file, 1),
    () => tryBarcodeDetectorOnCanvas(file, 1.5),
    () => tryBarcodeDetectorOnCanvas(file, 2),
    () => tryBarcodeDetectorOnCanvas(file, 0.65),
    () => tryHtml5Qrcode(file),
  ];

  for (const run of strategies) {
    const t = await run();
    if (t) return t;
  }
  return null;
}
