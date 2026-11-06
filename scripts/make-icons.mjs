// Derive app-sized PNGs from the image-generated brand masters.
// This script only resizes/formats artwork; it never generates or reads orders.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFile, writeFile } from 'node:fs/promises';
const logo = await loadImage(await readFile(new URL('../assets/branding/paw-app-source.png', import.meta.url)));
const mascot = await loadImage(await readFile(new URL('../assets/branding/paw-mascot-source.png', import.meta.url)));
async function raster(image, file, size, maskable = false) {
  const canvas = createCanvas(size, size), context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  if (maskable) { context.fillStyle = '#235044'; context.fillRect(0, 0, size, size); }
  const inset = maskable ? size * .1 : 0;
  context.drawImage(image, inset, inset, size - inset * 2, size - inset * 2);
  const bytes = canvas.toBuffer('image/png');
  await writeFile(new URL('../public/' + file, import.meta.url), bytes);
  return bytes;
}
for (const size of [32, 192, 512]) await raster(logo, `icon-${size}.png`, size);
await raster(logo, 'icon-maskable-512.png', 512, true);
await raster(mascot, 'paw-mascot.png', 512);
const guideIcon = await raster(logo, 'icon-guide.png', 96);
const guideUrl = new URL('../installer/public-guide.html', import.meta.url);
const guide = await readFile(guideUrl, 'utf8');
const mark = /<svg class="paw"[\s\S]*?<\/svg>|<img class="paw"[^>]*data-brand-icon[^>]*>/;
if (!mark.test(guide)) throw new Error('Standalone guide brand mark is missing');
await writeFile(guideUrl, guide.replace(mark, `<img class="paw" data-brand-icon src="data:image/png;base64,${guideIcon.toString('base64')}" alt="" width="36" height="36">`));
console.log('Updated app icons, maskable icon, mascot and self-contained guide branding.');
