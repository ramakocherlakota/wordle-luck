/**
 * Loading the checked-in screenshots in `test-pix/` as pixels.
 *
 * The app decodes uploads on a canvas, which jsdom does not have, so these tests
 * decode with a pure-JS JPEG decoder instead and hand the pipeline the same
 * `RgbaImage` a canvas would have produced. Everything downstream of decoding —
 * which is all of the code under test — is unchanged.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from 'jpeg-js';
import type { RgbaImage } from '../screenshot/image';

const PIX_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../test-pix',
);

/** Decode `test-pix/<name>.jpg` (path relative to the directory, no suffix). */
export function loadScreenshot(name: string): RgbaImage {
  const { width, height, data } = decode(
    readFileSync(resolve(PIX_ROOT, `${name}.jpg`)),
    { useTArray: true },
  );
  return { width, height, data: new Uint8ClampedArray(data.buffer) };
}
