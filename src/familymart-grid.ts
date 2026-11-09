import { InputError } from './types';

export const FAMILY_POSITIONS = ['左上', '右上', '左下', '右下'] as const;
export type PixelBox = { left: number; top: number; right: number; bottom: number };
export type FamilyCell = { labelIndex: number; ink: PixelBox; region: PixelBox };

/** Separate only the long dashed cutting guides near the middle of an A4 sheet. */
export function findFamilyMartCells(data: Uint8ClampedArray, width: number, height: number, scale: number): FamilyCell[] {
  const ink = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return data[i + 3] > 128 && Math.min(data[i], data[i + 1], data[i + 2]) < 235;
  };
  function divider(vertical: boolean) {
    const cross = vertical ? width : height, length = vertical ? height : width;
    const candidates: number[] = [];
    for (let pos = Math.floor(cross / 2 - 20 * scale); pos <= cross / 2 + 20 * scale; pos++) {
      let first = length, last = -1, count = 0, segments = 0, run = 0, longest = 0;
      for (let i = 0; i < length; i++) {
        if (ink(vertical ? pos : i, vertical ? i : pos)) {
          first = Math.min(first, i); last = i; count++; if (!run) segments++; run++; longest = Math.max(longest, run);
        } else run = 0;
      }
      if (last - first > length * .65 && count > length * .18 && count < length * .7 && segments >= 25 && longest < 12 * scale) candidates.push(pos);
    }
    if (!candidates.length) return { start: Math.floor(cross / 2), end: Math.floor(cross / 2) };
    if (candidates.at(-1)! - candidates[0] > 3 * scale) throw new InputError(['全家四格裁切線不明確，請重新下載原始 A4 寄件單。']);
    return { start: Math.max(0, candidates[0] - 2), end: Math.min(cross, candidates.at(-1)! + 3) };
  }
  const x = divider(true), y = divider(false);
  const cells: FamilyCell[] = [];
  for (let slot = 0; slot < 4; slot++) {
    const region = { left: slot % 2 ? x.end : 0, right: slot % 2 ? width : x.start,
      top: slot >= 2 ? y.end : 0, bottom: slot >= 2 ? height : y.start };
    const box = { left: region.right, right: -1, top: region.bottom, bottom: -1 };
    for (let py = region.top; py < region.bottom; py++) for (let px = region.left; px < region.right; px++) if (ink(px, py)) {
      box.left = Math.min(box.left, px); box.right = Math.max(box.right, px);
      box.top = Math.min(box.top, py); box.bottom = Math.max(box.bottom, py);
    }
    // Only completely blank quadrants are skipped; an unreadable printed label is an error.
    if (box.right < 0) continue;
    box.right++; box.bottom++;
    const w = (box.right - box.left) / scale, h = (box.bottom - box.top) / scale;
    if (w < 150 || w > 290 || h < 220 || h > 420 || box.left <= region.left + 1 || box.right >= region.right - 1 || box.top <= region.top + 1 || box.bottom >= region.bottom - 1) {
      throw new InputError([`全家${FAMILY_POSITIONS[slot]}格無法安全分離完整寄件單；本批未產生標籤。`]);
    }
    cells.push({ labelIndex: slot, ink: box, region });
  }
  if (!cells.length) throw new InputError(['全家寄件單頁面是空白的。']);
  return cells;
}
