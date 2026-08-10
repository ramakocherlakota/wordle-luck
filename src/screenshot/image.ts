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
