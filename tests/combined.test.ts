import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCombinedPage, ensureUniqueOrders, glyphsFromRuns, type TextRun } from '../src/combined-layout';
import { collectFontWidths } from '../src/font-widths';

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
