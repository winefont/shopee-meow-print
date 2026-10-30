import { InputError } from './types';

/** Locate the original upper-left label without the full-width A4 separator. */
export function findShippingInk(data: Uint8ClampedArray, width: number, height: number, scale: number) {
  const ink = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return data[i + 3] > 128 && Math.min(data[i], data[i + 1], data[i + 2]) < 235;
  };
  let cutoff = height;
  // The shipping label is in the left half. A thin, full-width rule below it
  // separates the packing slip, rather than being part of the shipping label.
  for (let y = Math.floor(180 * scale); y < height; y++) {
    let first = width, last = -1, count = 0;
    for (let x = 0; x < width; x++) if (ink(x, y)) { first = Math.min(first, x); last = x; count++; }
    if (first < width * 0.08 && last > width * 0.92 && count > width * 0.35) { cutoff = y; break; }
  }
  let left = width, right = -1, top = cutoff, bottom = -1;
  for (let y = 0; y < cutoff; y++) for (let x = 0; x < width; x++) if (ink(x, y)) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const w = (right - left + 1) / scale, h = (bottom - top + 1) / scale;
  if (w < 150 || w > 330 || h < 200 || h > 450 || bottom >= cutoff - 2 || right > width * 0.60) {
    throw new InputError(['無法安全分離 A4 左上角寄件單。請核對是否為每頁一筆的「寄件單+裝箱單」，本批未產生標籤。']);
  }
  return { left, right, top, bottom, cutoff };
}
