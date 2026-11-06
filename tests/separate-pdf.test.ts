import test from 'node:test';
import assert from 'node:assert/strict';
import { incomingPageKind, parseStandalonePackingPage, parseStandaloneShippingPage, type TextRun } from '../src/combined-layout';
import { pairDocumentPages, type DocumentPage } from '../src/pdf-pairing';
import type { Order, SourcePage } from '../src/types';

function packingFixture() {
  const font = new Map<string, number>();
  const runs: TextRun[] = [];
  function add(str: string, x: number, y: number) {
    for (const c of str) font.set(c, c.charCodeAt(0) < 128 ? 500 : 1000);
    runs.push({ str, x, y, width: [...str].reduce((s,c) => s + font.get(c)! / 100, 0), height: 10, fontName: 'test' });
  }
  add('商品列表', 29, 830);
  add('訂單編號(單):261106TEST001 package 1', 350, 815);
  ['#', '主商品貨號', '商品名稱', '商品選項貨號', '商品規格名稱', '數量', '總計']
    .forEach((heading, i) => add(heading, [29, 60, 161, 283, 384, 485, 525][i], 790));
  [['1',29], ['測試收納盒',161], ['TEST-001',283], ['藍色',384], ['2',485], ['100',525]]
    .forEach(([value, x]) => add(String(value), Number(x), 770));
  add('買家備註:', 29, 735);
  return { runs, widths: new Map([['test', font]]), add };
}

function shippingFixture() {
  const f = packingFixture();
  f.runs.splice(0);
  f.add('統⼀超商 交貨便', 35, 790);
  f.add('交貨便服務代碼ÿH12345678901', 40, 650);
  f.add('物流條碼ÿ832001H12345678', 40, 630);
  f.add('寄貨訂單編號ÿ261106TEST001', 40, 610);
  f.add('取件⼈ÿ測*人', 40, 590);
  return f;
}

const order = (id: string, tracking = ''): Order => ({ id, tracking,
  products: [{ index: 1, name: '測試商品', variant: '藍色', sku: 'TEST', quantity: 2 }], buyerNote: '', sellerNote: '' });
const source = (id: string, index: number, tracking = ''): SourcePage => ({ index, orderId: id, tracking,
  fileName: 'test-shipping.pdf', layout: 'seven-eleven', bounds: { left: 20, right: 270, bottom: 450, top: 810 } });

test('classifies tables by their coherent header row, not by filename or incidental label text', () => {
  const f = packingFixture();
  assert.equal(incomingPageKind(f.runs, 842), 'packing');
  for (const run of f.runs) run.y -= 380;
  f.add('數量', 40, 750);
  assert.equal(incomingPageKind(f.runs, 842), 'combined');
  assert.equal(incomingPageKind(shippingFixture().runs, 842), 'shipping');
});

test('reads a standalone top-of-page packing table with exact SKU, variant and quantity', () => {
  const f = packingFixture();
  const parsed = parseStandalonePackingPage(f.runs, f.widths, 595, 842, 1);
  assert.equal(parsed.id, '261106TEST001');
  assert.equal(parsed.tracking, '');
  assert.deepEqual(parsed.products, [{ index: 1, name: '測試收納盒', variant: '藍色', sku: 'TEST-001', quantity: 2 }]);
});

test('reads a standalone 7-Eleven ID and service code without using the different logistics barcode', () => {
  const f = shippingFixture();
  const parsed = parseStandaloneShippingPage(f.runs, 595, 842, 1);
  assert.equal(parsed.orderId, '261106TEST001');
  assert.equal(parsed.tracking, 'H12345678901');
  assert.equal(parsed.recipient, '測*人');
  assert.equal(parsed.layout, 'seven-eleven');
});

test('package 1 does not absorb numeric carrier text from a separate PDF item', () => {
  const f = packingFixture();
  // The supplied HCT page emits its carrier number after the package item in
  // content-stream order, despite having a different visual position.
  f.add('834', 29, 825);
  assert.equal(parseStandalonePackingPage(f.runs, f.widths, 595, 842, 1).id, '261106TEST001');
  f.runs.find(run => run.str.includes('package'))!.str = '訂單編號(單):261106TEST001 package';
  f.add('1', 550, 815);
  assert.equal(parseStandalonePackingPage(f.runs, f.widths, 595, 842, 1).id, '261106TEST001');
});

test('pairs mixed document types by order ID and keeps shipping-page order with packing-first offsets', () => {
  const pages: DocumentPage[] = [
    { kind: 'packing', order: order('261106TEST001'), index: 0, fileName: 'packing.pdf' },
    { kind: 'combined', order: order('261106TEST002', 'TW123456'), source: source('261106TEST002', 1, 'TW123456') },
    { kind: 'combined', order: order('261106TEST003'), source: source('261106TEST003', 2) },
    { kind: 'shipping', source: source('261106TEST001', 3, 'H12345678901') },
  ];
  const pairs = pairDocumentPages(pages);
  assert.deepEqual(pairs.map(pair => pair.source.index), [1, 2, 3]);
  assert.deepEqual(pairs.map(pair => pair.order.id), ['261106TEST002', '261106TEST003', '261106TEST001']);
  assert.equal(pairs[2].order.tracking, 'H12345678901');
  assert.equal(pairs[2].source.packingFileName, 'packing.pdf');
  assert.deepEqual(pairDocumentPages([...pages].reverse()), pairs);
});

test('blocks an incomplete batch for either missing counterpart, even if another order is complete', () => {
  const complete: DocumentPage = { kind: 'combined', order: order('261106TEST002'), source: source('261106TEST002', 0) };
  assert.throws(() => pairDocumentPages([complete, { kind: 'shipping', source: source('261106TEST001', 1) }]), /缺少裝箱單/);
  assert.throws(() => pairDocumentPages([complete, { kind: 'packing', order: order('261106TEST001'), index: 1 }]), /缺少寄件單/);
  assert.throws(() => pairDocumentPages([{ kind: 'packing', order: order('261106TEST002'), index: 0 },
    { kind: 'shipping', source: source('261106TEST001', 1) }]), /缺少/);
});

test('blocks duplicate sides, combined-plus-separate duplicates, mismatched IDs and shared tracking', () => {
  const packed: DocumentPage = { kind: 'packing', order: order('261106TEST001'), index: 0 };
  const shipped: DocumentPage = { kind: 'shipping', source: source('261106TEST001', 1) };
  assert.throws(() => pairDocumentPages([packed, packed, shipped]), /重複裝箱單/);
  assert.throws(() => pairDocumentPages([packed, shipped, shipped]), /重複寄件單/);
  assert.throws(() => pairDocumentPages([{ kind: 'combined', order: order('261106TEST001'), source: source('261106TEST001', 0) }, packed]), /重複裝箱單/);
  assert.throws(() => pairDocumentPages([{ kind: 'combined', order: order('261106TEST001'), source: source('261106TEST002', 0) }]), /不一致/);
  assert.throws(() => pairDocumentPages(['261106TEST001','261106TEST002'].map((id,index) => ({
    kind: 'combined', order: order(id, 'SAME12345'), source: source(id, index, 'SAME12345') }))), /重複/);
});

test('rejects corrupt packing tables, ambiguous IDs, multi-package documents and unknown standalone labels', () => {
  const missing = packingFixture();
  missing.runs = missing.runs.filter(run => run.str !== '數量');
  assert.throws(() => parseStandalonePackingPage(missing.runs, missing.widths, 595, 842, 1), /商品表格/);
  const multiple = packingFixture(); multiple.add('訂單編號(單):261106OTHER01 package 1', 29, 815);
  assert.throws(() => parseStandalonePackingPage(multiple.runs, multiple.widths, 595, 842, 1), /不一致/);
  const split = packingFixture(); split.runs.find(run => run.str.includes('package'))!.str = '訂單編號(單):261106TEST001 package 2';
  assert.throws(() => parseStandalonePackingPage(split.runs, split.widths, 595, 842, 1), /多個包裹/);
  const unknown = shippingFixture(); unknown.runs = unknown.runs.filter(run => !run.str.includes('服務代碼'));
  assert.throws(() => parseStandaloneShippingPage(unknown.runs, 595, 842, 1), /不是已支援/);
  assert.throws(() => parseStandaloneShippingPage(shippingFixture().runs, 283, 425, 1), /A4/);
});
