import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { Worker } from 'tesseract.js';
import { createFamilyMartReader } from '../src/familymart-ocr';
import type { OcrLine } from '../src/familymart-identity';

const id = '261109TEST0001';
const line = (text: string, y: number): OcrLine => ({ text, confidence: 90, bbox: { x0: 30, y0: y, x1: 230, y1: y + 20 } });

async function readWith(confirmations: { text: string; confidence: number }[]) {
  const savedDocument = globalThis.document;
  globalThis.document = { createElement: () => createCanvas(1, 1) } as unknown as Document;
  const calls: { image: string; options: unknown }[] = [];
  let terminated = false;
  const worker = {
    async setParameters() {},
    async recognize(image: string, options: unknown) {
      calls.push({ image, options });
      if (calls.length === 1) return { data: { blocks: [{ paragraphs: [{ lines: [
        line('FamilyMart 寄取貨單', 10), line('蝦皮訂單編號：', 70), line(id, 98),
      ] }] }] } };
      const data = confirmations[calls.length - 2];
      assert.ok(data, 'must not keep retrying until an ID passes');
      return { data };
    },
    async terminate() { terminated = true; },
  } as unknown as Worker;
  const reader = createFamilyMartReader(async () => worker);
  const canvas = createCanvas(400, 600);
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, 400, 600);
  // A marker inside the identity box verifies that the retry keeps source pixels.
  context.fillStyle = '#000'; context.fillRect(50, 110, 20, 10);
  let value: Awaited<ReturnType<typeof reader.read>> | undefined, error: unknown;
  try {
    value = await reader.read(canvas as unknown as HTMLCanvasElement, {
      labelIndex: 0, ink: { left: 10, right: 350, top: 10, bottom: 590 },
      region: { left: 0, right: 400, top: 0, bottom: 600 },
    }, 1, () => {});
  } catch (caught) { error = caught; }
  finally {
    await reader.close();
    if (savedDocument === undefined) Reflect.deleteProperty(globalThis, 'document');
    else globalThis.document = savedDocument;
  }
  assert.ok(terminated);
  return { value, error, calls };
}

test('FamilyMart confirms the ID in a separate image with white padding and unchanged source pixels', async () => {
  const result = await readWith([{ text: `${id}\n`, confidence: 83 }]);
  assert.equal(result.error, undefined);
  assert.equal(result.value?.orderId, id);
  assert.equal(result.calls.length, 2);
  assert.equal(result.calls[1].options, undefined, 'confirmation must OCR an isolated image, not a tight rectangle');
  const image = await loadImage(result.calls[1].image);
  assert.equal(image.width, 252);
  assert.equal(image.height, 72);
  const canvas = createCanvas(image.width, image.height), context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  assert.deepEqual([...context.getImageData(0, 0, 1, 1).data], [255, 255, 255, 255]);
  assert.deepEqual([...context.getImageData(50, 42, 1, 1).data], [0, 0, 0, 255]);
});

test('FamilyMart still requires a confident exact match without retrying conflicting readings', async () => {
  const good = await readWith([{ text: id, confidence: 60 }]);
  assert.equal(good.value?.orderId, id);
  assert.equal(good.calls.length, 2);
  for (const confidence of [46, 90]) {
    const mismatch = await readWith([{ text: '261109TESTOOO1', confidence }]);
    assert.match(String(mismatch.error), /不一致/);
    assert.equal(mismatch.calls.length, 2);
    assert.equal(mismatch.value, undefined);
  }
});

test('FamilyMart still rejects low-confidence or empty padded confirmations', async () => {
  for (const confirmation of [{ text: id, confidence: 59 }, { text: '', confidence: 95 }]) {
    const result = await readWith([confirmation]);
    assert.match(String(result.error), /PDF 第 1 頁左上格.*不一致或不夠清楚/);
    assert.equal(result.calls.length, 2);
    assert.equal(result.value, undefined);
  }
});
