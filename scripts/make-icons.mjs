// Rasterize the original vector logo for PWA and Windows icon packaging.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFile, writeFile } from 'node:fs/promises';
const logo = await loadImage(await readFile(new URL('../public/icon.svg', import.meta.url)));
for (const size of [192, 512]) {
  const canvas = createCanvas(size, size);
  canvas.getContext('2d').drawImage(logo, 0, 0, size, size);
  await writeFile(new URL(`../public/icon-${size}.png`, import.meta.url), canvas.toBuffer('image/png'));
}
