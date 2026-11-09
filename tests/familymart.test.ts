import test from 'node:test';
import assert from 'node:assert/strict';
import { findFamilyMartCells } from '../src/familymart-grid';
import { readFamilyMartIdentity, verifyFamilyMartId, type OcrLine } from '../src/familymart-identity';
import { pairDocumentPages, type DocumentPage } from '../src/pdf-pairing';
import type { Order, SourcePage } from '../src/types';

function raster(slots: number[], guides = true) {
  const width = 595, height = 842, data = new Uint8ClampedArray(width * height * 4).fill(255);
  const dot = (x: number, y: number) => { const i = (y * width + x) * 4; data[i] = data[i+1] = data[i+2] = 0; };
  if (guides) {
    for (let y=30;y<796;y++) if (y%6<3) dot(298,y);
    for (let x=61;x<533;x++) if (x%6<3) dot(x,413);
  }
  for (const slot of slots) {
    const left = slot%2 ? 310 : 70, top=slot>=2 ? 440 : 36;
    for(let x=left;x<=left+220;x++) {dot(x,top);dot(x,top+367);}
    for(let y=top;y<=top+367;y++) {dot(left,y);dot(left+220,y);}
  }
  return {data,width,height,dot};
}
test('FamilyMart crops four cells in row-major order and excludes offset dashed cutting guides',()=>{
  const f=raster([0,1,2,3]); const cells=findFamilyMartCells(f.data,f.width,f.height,1);
  assert.deepEqual(cells.map(c=>c.labelIndex),[0,1,2,3]);
  assert.deepEqual(cells.map(c=>c.ink),[
    {left:70,right:291,top:36,bottom:404},{left:310,right:531,top:36,bottom:404},
    {left:70,right:291,top:440,bottom:808},{left:310,right:531,top:440,bottom:808}]);
});
test('FamilyMart skips only truly blank slots, including holes and pages without guides',()=>{
  for(const guides of [true,false]) {const f=raster([0,3],guides);assert.deepEqual(findFamilyMartCells(f.data,f.width,f.height,1).map(c=>c.labelIndex),[0,3]);}
  const blank=raster([]);assert.throws(()=>findFamilyMartCells(blank.data,blank.width,blank.height,1),/空白/);
  const unknown=raster([0]);unknown.dot(350,50);assert.throws(()=>findFamilyMartCells(unknown.data,unknown.width,unknown.height,1),/右上/);
});
test('FamilyMart rejects content crossing a quadrant boundary rather than clipping it',()=>{
  const f=raster([0],false);for(let x=290;x<340;x++)f.dot(x,300);
  assert.throws(()=>findFamilyMartCells(f.data,f.width,f.height,1),/無法安全分離/);
});
const line=(text:string,x:number,y:number,confidence=90):OcrLine=>({text,confidence,bbox:{x0:x,y0:y,x1:x+200,y1:y+20}});
const fixture=()=>[line('FamilyMart 寄取貨單',50,10),line('訂單編號：123456789012',70,70),
  line('廠商編號：SHP999999999',70,100),line('蝦皮 訂單 編號：',70,130),line('261109TEST0001',70,158)];
test('FamilyMart reads only the explicitly labelled Shopee ID, never the numeric carrier order',()=>{
  assert.equal(readFamilyMartIdentity(fixture()).orderId,'261109TEST0001');
  const logo=fixture();logo[0].text='FamlilyMart 寄取貨單';assert.equal(readFamilyMartIdentity(logo).orderId,'261109TEST0001');
  assert.throws(()=>readFamilyMartIdentity(fixture().filter(l=>!l.text.includes('蝦皮'))),/欄位/);
  assert.throws(()=>readFamilyMartIdentity([...fixture(),line('蝦皮訂單編號:',70,230)]),/欄位/);
  const low=fixture();low[4].confidence=20;assert.throws(()=>readFamilyMartIdentity(low),/不清楚/);
  const other=fixture();other[0].text='Other carrier';assert.throws(()=>readFamilyMartIdentity(other),/全家/);
});
test('FamilyMart confirms the same ID twice and never substitutes O/0, I/1 or nearest packing IDs',()=>{
  assert.equal(verifyFamilyMartId('261109TEST0001','261109TEST0001\n',80),'261109TEST0001');
  assert.throws(()=>verifyFamilyMartId('261109TEST0001','261109TESTOOO1',95),/不一致/);
  assert.throws(()=>verifyFamilyMartId('261109TEST0001','261109TEST0001',30),/不夠清楚/);
});
const id=(n:number)=>`261109TEST000${n}`;
const order=(n:number):Order=>({id:id(n),tracking:'',products:[{index:1,name:`合成測試商品 ${n}`,sku:`TEST-${n}`,variant:'測試',quantity:n}],buyerNote:'',sellerNote:''});
const source=(n:number,index:number,slot:number):SourcePage=>({index,labelIndex:slot,layout:'familymart',orderId:id(n),tracking:'',bounds:{left:20,right:250,top:800,bottom:430}});
test('Four labels share one physical page but pair by ID with reverse packing order, across multiple pages',()=>{
  const pages:DocumentPage[]=[...[5,4,3,2,1].map((n,i)=>({kind:'packing' as const,order:order(n),index:i})),
    ...[4,2,1,3].map(n=>({kind:'shipping' as const,source:source(n,5,n-1)})),
    {kind:'shipping',source:source(5,6,0)},
    {kind:'combined',order:order(6),source:{...source(6,7,0),layout:'general'}}];
  const pairs=pairDocumentPages(pages);
  assert.deepEqual(pairs.map(p=>p.order.id),[1,2,3,4,5,6].map(id));
  assert.deepEqual(pairs.map(p=>p.order.products[0].quantity),[1,2,3,4,5,6]);
  assert.deepEqual(pairs.map(p=>p.source.index),[5,5,5,5,6,7]);
  assert.deepEqual(pairDocumentPages([...pages].reverse()),pairs);
  assert.throws(()=>pairDocumentPages([...pages,{kind:'shipping',source:source(1,8,0)}]),/重複寄件單/);
  assert.throws(()=>pairDocumentPages(pages.filter(p=>p.kind!=='packing'||p.order.id!==id(3))),/缺少裝箱單/);
});
