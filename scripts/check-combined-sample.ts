import { readFile } from 'node:fs/promises';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseCombinedPage, ensureUniqueOrders } from '../src/combined-layout';
import { collectFontWidths } from '../src/font-widths';
const input = process.argv[2];
if (!input) throw new Error('Usage: check-combined-sample.ts <combined.pdf>');
const task = getDocument({ data: new Uint8Array(await readFile(input)), useSystemFonts: true });
const doc = await task.promise;
const orders = [];
try {
  for (let n = 1; n <= doc.numPages; n++) {
    const p = await doc.getPage(n);
    const viewport = p.getViewport({ scale: 1 });
    const content = await p.getTextContent({ disableNormalization: true });
    const runs = content.items.filter((i: any) => 'str' in i).map((i: any) => ({ str: i.str, x: i.transform[4], y: i.transform[5], width: i.width, height: i.height, fontName: i.fontName }));
    const parsed = parseCombinedPage(runs, collectFontWidths(await p.getOperatorList(), OPS), viewport.width, viewport.height, n);
    orders.push(parsed.order);
    console.log(JSON.stringify({ page: n, products: parsed.order.products, buyerNote: parsed.order.buyerNote, sellerNote: parsed.order.sellerNote }));
  }
  ensureUniqueOrders(orders);
  console.log(JSON.stringify({ orders: orders.length, productRows: orders.reduce((s,o) => s+o.products.length,0), quantity: orders.reduce((s,o) => s+o.products.reduce((t,p)=>t+p.quantity,0),0) }));
} finally { await task.destroy(); }
