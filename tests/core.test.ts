import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import { PDFDocument } from 'pdf-lib';
import { parsePacking, parseProducts } from '../src/packing';
import { matchOrders } from '../src/matching';
import { composePdf, PAGE_HEIGHT, PAGE_WIDTH } from '../src/compose';
import type { Order, SourcePage } from '../src/types';
import { fiveProducts } from './layout-fixtures';

const productText = '[1] 商品名稱:測試商品; 商品選項名稱:小; 價格: $ 180; 數量: 2; 商品選項貨號: (D2-2)SL-30-15M; ';
const order = (id = '261020TEST001'): Order => ({
  id, tracking: 'TW1234567890A', products: parseProducts(productText, id), buyerNote: '', sellerNote: '',
});
const page = (orderId = '261020TEST001', tracking = 'TW1234567890A', index = 0): SourcePage => ({
  index, orderId, tracking, recipient: '測試收件人', bounds: { left: 0, bottom: 0, right: 210, top: 300 },
});

test('parses synthetic packing workbook without private fixtures', async () => {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['tracking_number', 'order_sn', 'product_info', 'remark_from_buyer', 'seller_note'],
    ['TW1234567890A', '261020TEST001', productText, '', ''],
    ['TW1234567890B', '261020TEST002', productText.replace('數量: 2', '數量: 4'), '', ''],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'orders');
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const orders = parsePacking(bytes);
  assert.equal(orders.length, 2);
  assert.deepEqual(orders.map(o => o.products[0].quantity), [2, 4]);

});
test('parses all product blocks without truncating semicolons inside names', () => {
  const second = productText.replace('[1]', '[2]').replace('測試商品', '另一件; 商品').replace('數量: 2', '數量: 3');
  const products = parseProducts(productText + second, '261020TEST001');
  assert.equal(products.length, 2);
  assert.equal(products[1].name, '另一件; 商品');
  assert.equal(products[1].quantity, 3);
});
test('rejects partially parsed items and invalid quantities', () => {
  assert.throws(() => parseProducts(productText + '[2] 不完整商品', '261020TEST001'));
  assert.throws(() => parseProducts(productText.replace('數量: 2', '數量: 0'), '261020TEST001'));
  assert.throws(() => parseProducts(productText.replace('數量: 2', '數量: 1.5'), '261020TEST001'));
});
test('matches by order and tracking, preserving PDF order', () => {
  const a = order(), b = { ...order('261020TEST002'), tracking: 'TW1234567890B' };
  const pairs = matchOrders([a, b], [page(b.id, b.tracking, 0), page(a.id, a.tracking, 1)]);
  assert.deepEqual(pairs.map((pair) => pair.order.id), [b.id, a.id]);
});
test('rejects missing, duplicate and conflicting orders', () => {
  assert.throws(() => matchOrders([order()], [page('261020TEST002')]));
  assert.throws(() => matchOrders([order()], [page(), page()]));
  assert.throws(() => matchOrders([order()], [page(undefined, 'TW9999999999A')]));
  assert.throws(() => matchOrders([order(), order('261020TEST002')], [page()]));
  assert.throws(() => matchOrders([order(), order()], [page()]));
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
