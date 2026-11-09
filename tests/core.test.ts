import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { composePdf, PAGE_HEIGHT, PAGE_WIDTH } from '../src/compose';
import type { Order, SourcePage } from '../src/types';
import { fiveProducts } from './layout-fixtures';

const order = (id = '261020TEST001'): Order => ({
  id, tracking: 'TW1234567890A', products: [{ index: 1, name: '測試商品', variant: '小', quantity: 2, sku: 'TEST-SKU-01' }], buyerNote: '', sellerNote: '',
});
const page = (orderId = '261020TEST001', tracking = 'TW1234567890A', index = 0): SourcePage => ({
  index, orderId, tracking, recipient: '測試收件人', bounds: { left: 0, bottom: 0, right: 210, top: 300 },
});

test('long batches paginate within each order, with exact 100x150 mm pages', async () => {
  const source = await PDFDocument.create();
  source.addPage([210, 300]).drawText('TEST SHIPPING LABEL');
  const bytes = await source.save();
  const font = await readFile(new URL('../public/fonts/NotoSansTC-Regular.ttf', import.meta.url));
  const many = order();
  many.products = Array.from({ length: 6 }, (_, i) => ({ ...many.products[0], index: i + 1, name: `測試商品${i + 1}` }));
  many.buyerNote = '備註內容\n'.repeat(30);
  const result = await composePdf(bytes, [{ order: many, source: page() }], font);
  const output = await PDFDocument.load(result.bytes);
  assert.ok(output.getPageCount() > 2);
  assert.equal(result.groups[0].pages.length, output.getPageCount());
  assert.ok(result.warnings.some((message) => message.includes('連續取用')));
  for (const outputPage of output.getPages()) {
    assert.equal(outputPage.getWidth(), PAGE_WIDTH);
    assert.equal(outputPage.getHeight(), PAGE_HEIGHT);
  }
});

test('five full-length products fit on one picking label with intact 100x150 mm output', async () => {
  const source = await PDFDocument.create();
  source.addPage([210, 300]).drawText('LAYOUT TEST - NOT FOR SHIPPING');
  const font = await readFile(new URL('../public/fonts/NotoSansTC-Regular.ttf', import.meta.url));
  for (const products of [
    fiveProducts,
    fiveProducts.map((product) => ({ ...product, name: fiveProducts[0].name, variant: fiveProducts[0].variant })),
  ]) {
    const result = await composePdf(await source.save(), [{ order: { ...order(), products }, source: page() }], font);
    const output = await PDFDocument.load(result.bytes);
    assert.equal(output.getPageCount(), 2, 'one shipping page followed by exactly one picking page');
    assert.deepEqual(result.groups[0].pages, [0, 1]);
    assert.equal(result.groups[0].quantity, 15);
    assert.equal(result.warnings.length, 0);
    assert.equal(output.getPage(1).getWidth(), PAGE_WIDTH);
    assert.equal(output.getPage(1).getHeight(), PAGE_HEIGHT);
  }
});
