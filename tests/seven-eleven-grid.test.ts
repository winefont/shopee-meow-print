import test from 'node:test';
import assert from 'node:assert/strict';
import { findA4LabelCells } from '../src/familymart-grid';

function raster(slots: number[]) {
  const width = 595, height = 842, data = new Uint8ClampedArray(width * height * 4).fill(255);
  const dot = (x: number, y: number) => { const i = (y * width + x) * 4; data[i] = data[i+1] = data[i+2] = 0; };
  const full = slots.some(slot => slot >= 2);
  for (let y = 28; y < (full ? 780 : 385); y++) if (y % 6 < 3) dot(274, y);
  for (let x = 28; x < 520; x++) if (x % 6 < 3) dot(x, 385);
  for (const slot of slots) {
    const left = slot % 2 ? 283 : 36, top = slot >= 2 ? 406 : 36;
    for (let x = left; x <= left + 229; x++) { dot(x, top); dot(x, top + 340); }
    for (let y = top; y <= top + 340; y++) { dot(left, y); dot(left + 229, y); }
  }
  return { width, height, data, dot };
}

test('7-Eleven separates the off-center grid and short vertical guide for two labels', () => {
  const r = raster([0, 1]);
  const cells = findA4LabelCells(r.data, r.width, r.height, 1, 'seven-eleven');
  assert.deepEqual(cells.map(c => c.labelIndex), [0, 1]);
  assert.deepEqual(cells.map(c => c.ink), [
    { left: 36, right: 266, top: 36, bottom: 377 },
    { left: 283, right: 513, top: 36, bottom: 377 },
  ]);
});

test('7-Eleven retains single and four-cell layouts, and never skips a nonblank unreadable cell', () => {
  for (const slots of [[0], [0, 1, 2, 3], [0, 3]]) {
    const r = raster(slots);
    assert.deepEqual(findA4LabelCells(r.data, r.width, r.height, 1, 'seven-eleven').map(c => c.labelIndex), slots);
  }
  const bad = raster([0, 1]); bad.dot(100, 600);
  assert.throws(() => findA4LabelCells(bad.data, bad.width, bad.height, 1, 'seven-eleven'), /7-11左下格/);
  const crossing = raster([0, 1]);
  for (let x = 260; x < 290; x++) crossing.dot(x, 300);
  assert.throws(() => findA4LabelCells(crossing.data, crossing.width, crossing.height, 1, 'seven-eleven'), /無法安全分離/);
});
