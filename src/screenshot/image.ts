/**
 * Image decoding and resampling.
 *
 * `RgbaImage` is deliberately a plain structural type rather than the DOM's
 * `ImageData`: every step after decoding is a pure function over pixels, so the
 * whole pipeline stays testable under jsdom (which has no canvas) by handing it
 * hand-built buffers.
 */

export interface RgbaImage {
  width: number;
  height: number;
  /** Row-major RGBA, 4 bytes per pixel — same layout as `ImageData.data`. */
  data: Uint8ClampedArray;
}

/**
 * Cap on the decoded size. A phone screenshot can be 1284×2778 and a desktop
 * one larger still; beyond this the extra pixels cost memory without making
 * either tile detection or letter shapes any clearer.
 */
const MAX_DECODE_DIM = 2400;

/** Read one pixel as `[r, g, b, a]`. Out-of-bounds reads return transparent. */
export function pixelAt(
  img: RgbaImage,
  x: number,
  y: number,
): [number, number, number, number] {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return [0, 0, 0, 0];
  const i = (y * img.width + x) * 4;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, img.data[i + 3]!];
}

/**
 * Shrink by an integer factor with box averaging, so the result is at most
 * `maxDim` on its long side. Averaging also smooths away JPEG ringing before
 * tile detection. Returns the factor so boxes found here can be mapped back to
 * full-resolution coordinates.
 */
export function downscale(
  img: RgbaImage,
  maxDim: number,
): { image: RgbaImage; factor: number } {
  const factor = Math.ceil(Math.max(img.width, img.height) / maxDim);
  if (factor <= 1) return { image: img, factor: 1 };

  const width = Math.floor(img.width / factor);
  const height = Math.floor(img.height / factor);
  const data = new Uint8ClampedArray(width * height * 4);
  const perBlock = factor * factor;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < factor; dy++) {
        const row = (y * factor + dy) * img.width;
        for (let dx = 0; dx < factor; dx++) {
          const i = (row + x * factor + dx) * 4;
          r += img.data[i]!;
          g += img.data[i + 1]!;
          b += img.data[i + 2]!;
          a += img.data[i + 3]!;
        }
      }
      const o = (y * width + x) * 4;
      data[o] = r / perBlock;
      data[o + 1] = g / perBlock;
      data[o + 2] = b / perBlock;
      data[o + 3] = a / perBlock;
    }
  }

  return { image: { width, height, data }, factor };
}

/**
 * Downscale to at most `maxDim`, then run a 3×3 median filter.
 *
 * A median rather than a blur, because the point is the *edges*. Averaging
 * spreads a tile's border into a band of in-between colours, and region growing
 * then peels that band off as a separate sliver, leaving the tile itself
 * looking like a partly-filled box — which is exactly how real screenshots were
 * losing tiles. A median snaps each pixel to one side of the edge or the other
 * while leaving flat areas untouched, and it still removes the speckle that
 * would otherwise break a JPEG-compressed tile apart.
 *
 * Returns the downscale factor so boxes found here map back to full-resolution
 * coordinates.
 */
export function denoise(
  img: RgbaImage,
  maxDim: number,
): { image: RgbaImage; factor: number } {
  const { image, factor } = downscale(img, maxDim);
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    const up = (y > 0 ? y - 1 : 0) * width;
    const mid = y * width;
    const down = (y + 1 < height ? y + 1 : height - 1) * width;
    for (let x = 0; x < width; x++) {
      const left = x > 0 ? x - 1 : 0;
      const right = x + 1 < width ? x + 1 : width - 1;
      const o = (mid + x) * 4;
      for (let c = 0; c < 3; c++) {
        out[o + c] = median9(
          data[(up + left) * 4 + c]!,
          data[(up + x) * 4 + c]!,
          data[(up + right) * 4 + c]!,
          data[(mid + left) * 4 + c]!,
          data[o + c]!,
          data[(mid + right) * 4 + c]!,
          data[(down + left) * 4 + c]!,
          data[(down + x) * 4 + c]!,
          data[(down + right) * 4 + c]!,
        );
      }
      out[o + 3] = data[o + 3]!;
    }
  }

  return { image: { width, height, data: out }, factor };
}

/**
 * Median of nine values via a fixed sorting network — 19 compare-exchanges,
 * no branching on data and no array to index. Sorting a scratch array instead
 * made the filter the slowest step in the whole parse by a wide margin.
 */
function median9(
  p1: number,
  p2: number,
  p3: number,
  p4: number,
  p5: number,
  p6: number,
  p7: number,
  p8: number,
  p9: number,
): number {
  let t: number;
  // prettier-ignore
  {
    t = Math.min(p2, p3); p3 = Math.max(p2, p3); p2 = t;
    t = Math.min(p5, p6); p6 = Math.max(p5, p6); p5 = t;
    t = Math.min(p8, p9); p9 = Math.max(p8, p9); p8 = t;
    t = Math.min(p1, p2); p2 = Math.max(p1, p2); p1 = t;
    t = Math.min(p4, p5); p5 = Math.max(p4, p5); p4 = t;
    t = Math.min(p7, p8); p8 = Math.max(p7, p8); p7 = t;
    t = Math.min(p2, p3); p3 = Math.max(p2, p3); p2 = t;
    t = Math.min(p5, p6); p6 = Math.max(p5, p6); p5 = t;
    t = Math.min(p8, p9); p9 = Math.max(p8, p9); p8 = t;
    p4 = Math.max(p1, p4);
    p6 = Math.min(p6, p9);
    t = Math.min(p5, p8); p8 = Math.max(p5, p8); p5 = t;
    p7 = Math.max(p4, p7);
    p5 = Math.min(p5, p8);
    t = Math.min(p3, p6); p6 = Math.max(p3, p6); p3 = t;
    p5 = Math.max(p3, p5);
    p5 = Math.min(p5, p7);
    p5 = Math.min(p5, p6);
  }
  return p5;
}

/** Decode an uploaded image file to pixels, downscaling very large sources. */
export async function decodeImageFile(file: Blob): Promise<RgbaImage> {
  const source = await loadBitmap(file);
  const scale = Math.min(
    1,
    MAX_DECODE_DIM / Math.max(source.width, source.height),
  );
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not read the image (no canvas support).');
  ctx.drawImage(source, 0, 0, width, height);
  if ('close' in source) source.close();

  const { data } = ctx.getImageData(0, 0, width, height);
  return { width, height, data };
}

/** `createImageBitmap` where available, else an `<img>` + object URL. */
async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error('That file is not a readable image.'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
