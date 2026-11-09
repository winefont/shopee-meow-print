import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCombinedPage, ensureUniqueOrders, glyphsFromRuns, type TextRun } from '../src/combined-layout';
import { collectFontWidths } from '../src/font-widths';
import { findShippingInk } from '../src/shipping-bounds';
import { pdfSelectionIssues, MAX_BATCH_BYTES, MAX_FILE_BYTES } from '../src/batch-files';

function fixture() {
  const font = new Map<string, number>();
  const runs: TextRun[] = [];
  function add(str: string, x: number, y: number, width?: number) {
    for (const char of str) font.set(char, char.charCodeAt(0) < 128 ? 500 : 1000);
    runs.push({ str, x, y, width: width ?? [...str].reduce((s,c) => s + font.get(c)! / 100, 0), height: 10, fontName: 'test' });
  }
  ['#', '主商品貨號', '商品名稱', '商品選項貨號', '商品規格名稱', '數量', '總計'].forEach((h,i) => add(h, [20,60,140,260,337,465,520][i], 420));
  add('蝦皮訂單編號:261020TEST001',20,700);
  add('寄件編號:TW1234567890A',20,680);
  add('標準配送 門市交寄',20,660);
  add('1',20,390);
  add('測試商品',140,390);
  // One PDF.js item straddles the SKU/variant column boundary.
  add('(D2-4)B-010-01 100',260,390);
  add('片/盒',352,378);
  add('2',465,390);
  add('買家備註:請小心包裝',20,100);
  return { runs, widths: new Map([['test',font]]), add };
}
const parse = (f: ReturnType<typeof fixture>) => parseCombinedPage(f.runs, f.widths, 595.28, 841.89, 1).order;

test('splits a merged SKU/variant run at glyph positions and preserves quantity and note', () => {
  const o = parse(fixture());
  assert.equal(o.id, '261020TEST001');
  assert.deepEqual(o.products, [{ index: 1, name: '測試商品', variant: '100片/盒', sku: '(D2-4)B-010-01', quantity: 2 }]);
  assert.equal(o.buyerNote, '請小心包裝');
  assert.equal(o.sellerNote, '');
});

test('joins wrapped SKUs and keeps five separate product rows', () => {
  const f = fixture();
  f.runs = f.runs.filter(r => r.y !== 390 && r.y !== 378);
  // add() closes over the original array; preserve that reference for this fixture.
  const extras: TextRun[] = [];
  for (let i=0;i<5;i++) {
    const y=390-i*45;
    for (const [str,x,dy] of [[String(i+1),20,0],['商品',140,0],['SKU-',260,0],[String(i+10),260,-12],['L',337,0],['1',465,0]] as const) {
      for (const c of str) f.widths.get('test')!.set(c, c.charCodeAt(0)<128?500:1000);
      extras.push({str,x,y:y+dy,width:[...str].reduce((s,c)=>s+f.widths.get('test')!.get(c)!/100,0),height:10,fontName:'test'});
    }
  }
  f.runs.push(...extras);
  const o=parse(f);
  assert.equal(o.products.length,5);
  assert.deepEqual(o.products.map(p=>p.sku),['SKU-10','SKU-11','SKU-12','SKU-13','SKU-14']);
});

test('fails closed for missing table fields, invalid quantities and skipped rows', () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.runs=f.runs.filter(r=>r.str!=='商品名稱'); },
    (f: ReturnType<typeof fixture>) => { f.runs.find(r=>r.x===465&&r.y===390)!.str='0'; f.widths.get('test')!.set('0',500); },
    (f: ReturnType<typeof fixture>) => { f.runs.find(r=>r.x===20&&r.y===390)!.str='2'; },
    (f: ReturnType<typeof fixture>) => { f.runs=f.runs.filter(r=>!r.str.startsWith('買家備註')); },
  ]) {
    const f=fixture(); mutate(f); assert.throws(()=>parse(f));
  }
  const f=fixture();
  assert.throws(()=>parseCombinedPage(f.runs,f.widths,283,425,1));
});

test('rejects duplicate order or tracking and unknown glyph widths', () => {
  const o=parse(fixture());
  assert.throws(()=>ensureUniqueOrders([o,o]));
  assert.throws(()=>ensureUniqueOrders([o,{...o,id:'261020TEST002'}]));
  const f=fixture(); f.widths.get('test')!.delete('測');
  assert.throws(()=>glyphsFromRuns(f.runs,f.widths));
});

test('collects font widths across saved PDF graphics states', () => {
  const ops={save:1,restore:2,setFont:3,showText:4};
  const widths=collectFontWidths({fnArray:[3,1,3,4,2,4],argsArray:[['a'],[],['b'],[[{unicode:'B',width:620}]],[],[[{unicode:'A',width:500}]]]},ops);
  assert.equal(widths.get('a')!.get('A'),500);
  assert.equal(widths.get('b')!.get('B'),620);
  assert.equal(widths.get('a')!.has('B'),false);
});

test('uses the packing order ID when a carrier label is an image, without guessing tracking', () => {
  const f = fixture();
  f.runs.splice(7, 3);
  f.add('裝箱單', 242, 480);
  f.add('訂單編號 (單): 261020TEST001 package 1', 300, 450);
  const parsed = parseCombinedPage(f.runs, f.widths, 595, 842, 1);
  assert.equal(parsed.order.id, '261020TEST001');
  assert.equal(parsed.order.tracking, '');
  assert.equal(parsed.layout, 'general');
  assert.equal(parsed.shippingBottomY, 498);
  assert.equal(parsed.order.products[0].quantity, 2);
  assert.doesNotThrow(() => ensureUniqueOrders([parsed.order, { ...parsed.order, id: '261020TEST002' }]));
  assert.throws(() => ensureUniqueOrders([parsed.order, parsed.order]));
});

test('generic A4 accepts matching carrier/packing IDs but rejects conflicting or missing IDs', () => {
  const f = fixture();
  f.runs.find(run => run.str === '標準配送 門市交寄')!.str = '全家';
  f.add('訂單編號(單):261020TEST001 package 1', 260, 450);
  assert.equal(parse(f).id, '261020TEST001');
  f.runs[f.runs.length - 1].str = '訂單編號(單):261020TEST999 package 1';
  assert.throws(() => parse(f), /不一致/);
  f.runs = f.runs.filter(run => !run.str.includes('訂單編號'));
  assert.throws(() => parse(f), /訂單編號/);
});

test('crop excludes full-width packing separator and rejects content cut by the boundary', () => {
  const width = 595, height = 360;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const pixel = (x: number, y: number) => { const i = (y * width + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; };
  for (let y = 14; y <= 310; y++) for (let x = 14; x <= 296; x++) {
    if (y === 14 || y === 310 || x === 14 || x === 296) pixel(x, y);
  }
  for (let x = 0; x < width; x++) if (x % 8 < 5) pixel(x, 340);
  assert.deepEqual(findShippingInk(data, width, height, 1), { left: 14, right: 296, top: 14, bottom: 310, cutoff: 340 });
  pixel(20, 339);
  assert.throws(() => findShippingInk(data, width, height, 1), /安全分離/);
  assert.throws(() => findShippingInk(new Uint8ClampedArray(width * height * 4).fill(255), width, height, 1));
});

test('PDF batch input enforces format, file count, total size and individual size limits', () => {
  const pdf = { name: 'carrier.pdf', size: 1024 };
  assert.deepEqual(pdfSelectionIssues([pdf, { ...pdf, name: 'other.PDF' }]), []);
  assert.ok(pdfSelectionIssues(Array(21).fill(pdf)).length);
  assert.ok(pdfSelectionIssues([{ ...pdf, size: MAX_FILE_BYTES + 1 }]).length);
  assert.ok(pdfSelectionIssues(Array(5).fill({ ...pdf, size: MAX_BATCH_BYTES / 4 })).length);
  assert.ok(pdfSelectionIssues([{ ...pdf, name: 'not-a-pdf.xlsx' }]).length);
  assert.ok(pdfSelectionIssues([{ ...pdf, size: 0 }]).length);
});

test('7-11 preserves its service code separately from the logistics barcode and reads the named recipient', () => {
  const f = fixture();
  f.runs.splice(7, 3);
  f.add('統⼀超商 交貨便', 20, 790);
  f.add('交貨便服務代碼ÿG52610123456', 20, 760);
  f.add('物流條碼ÿ833001G526101234', 20, 740);
  f.add('寄貨訂單編號ÿ261020TEST001', 20, 720);
  f.add('取件⼈ÿ測*人', 20, 700);
  f.add('寄件人:其他人', 20, 680);
  f.add('訂單編號(單):261020TEST001 package 1', 300, 450);
  const parsed = parseCombinedPage(f.runs, f.widths, 595, 842, 1);
  assert.equal(parsed.order.tracking, 'G52610123456');
  assert.equal(parsed.order.id, '261020TEST001');
  assert.equal(parsed.recipient, '測*人');
});

test('FamilyMart numeric carrier identifiers do not override the Shopee order ID', () => {
  const f = fixture();
  f.runs.splice(7, 3);
  f.add('全家寄取貨單', 20, 790);
  f.add('訂單編號:16351234567123', 20, 760);
  f.add('蝦皮訂單編號:261020TEST001', 20, 740);
  f.add('訂單編號(單):261020TEST001 package 1', 300, 450);
  const parsed = parseCombinedPage(f.runs, f.widths, 595, 842, 1);
  assert.equal(parsed.order.id, '261020TEST001');
  assert.equal(parsed.order.tracking, '');
  assert.equal(parsed.recipient, '');
  f.add('寄貨訂單編號:261020WRONG99', 20, 720);
  assert.throws(() => parse(f), /不一致/);
});
