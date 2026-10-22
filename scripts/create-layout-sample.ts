import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { composePdf } from '../src/compose';
import { fiveProducts } from '../tests/layout-fixtures';

const source = await PDFDocument.create();
const label = source.addPage([210, 300]);
label.drawText('LAYOUT TEST', { x: 12, y: 250, size: 20 });
label.drawText('NOT FOR SHIPPING', { x: 12, y: 220, size: 15 });
label.drawText('Five products on the next page', { x: 12, y: 190, size: 11 });
const font = await readFile(new URL('../public/fonts/NotoSansTC-Regular.ttf', import.meta.url));
const id = '261020DEMO0001';
const result = await composePdf(await source.save(), [{
  order: { id, tracking: 'TW000000000000A', products: fiveProducts, buyerNote: '', sellerNote: '' },
  source: { index: 0, orderId: id, tracking: 'TW000000000000A', bounds: { left: 0, bottom: 0, right: 210, top: 300 } },
}], font);
if (result.pageCount !== 2) throw new Error('Five-product sample must have two pages');
await mkdir(new URL('../output/pdf/', import.meta.url), { recursive: true });
await writeFile(new URL('../output/pdf/五項商品排版測試.pdf', import.meta.url), result.bytes);
console.log(JSON.stringify({ pages: result.pageCount, products: fiveProducts.length, quantity: result.groups[0].quantity }));
