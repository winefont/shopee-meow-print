import { InputError, type Order } from './types';
import { readRecipient } from './recipient';

export type TextRun = { str: string; x: number; y: number; width: number; height: number; fontName: string };
export type FontWidths = Map<string, Map<string, number>>;
type Glyph = { text: string; x: number; y: number; width: number; height: number };
const headings = ['#', '主商品貨號', '商品名稱', '商品選項貨號', '商品規格名稱', '數量', '總計'];
const compact = (text: string) => text.replace(/\s+/g, '');

/** Preserve proportional character positions, including runs merged across columns by PDF.js. */
export function glyphsFromRuns(runs: TextRun[], widths: FontWidths): Glyph[] {
  return runs.flatMap(run => {
    if (!run.str.trim() || run.width <= 0 || run.height <= 0) return [];
    const chars = [...run.str];
    const font = widths.get(run.fontName);
    const weights = chars.map(char => font?.get(char));
    if (weights.some(weight => weight === undefined || weight < 0)) {
      throw new InputError(['PDF 字元位置無法可靠讀取。請重新下載「寄件單+裝箱單」，或使用雙檔備用模式。']);
    }
    const sum = weights.reduce<number>((total, width) => total + width!, 0);
    if (!sum) throw new InputError(['PDF 字元寬度異常，未產生標籤。']);
    let x = run.x;
    return chars.map((text, i) => {
      const width = weights[i]! / sum * run.width;
      const glyph = { text, x, y: run.y, width, height: run.height };
      x += width;
      return glyph;
    });
  });
}

function readCell(glyphs: Glyph[], left: number, right: number, top: number, bottom: number, sku = false): string {
  const selected = glyphs.filter(g => g.y <= top + 1 && g.y > bottom + 1 &&
    g.x + g.width / 2 >= left - 1 && g.x + g.width / 2 < right - 1);
  const lines: Glyph[][] = [];
  for (const glyph of selected.sort((a, b) => b.y - a.y || a.x - b.x)) {
    let line = lines.find(row => Math.abs(row[0].y - glyph.y) < 2);
    if (!line) { line = []; lines.push(line); }
    line.push(glyph);
  }
  const values = lines.map(line => {
    let text = '', end = -Infinity;
    for (const glyph of line.sort((a, b) => a.x - b.x)) {
      if (text && glyph.x - end > glyph.height * 0.14 && !text.endsWith(' ') && glyph.text !== ' ') text += ' ';
      text += glyph.text; end = glyph.x + glyph.width;
    }
    return text.trim();
  });
  return values.join(sku ? '' : '\n').trim();
}

function readIdentity(runs: TextRun[], pageNumber: number) {
  const text = compact(runs.map(run => run.str.normalize('NFKC')).join(''));
  const matches = [...text.matchAll(/(?:(蝦皮|寄貨))?訂單編號(?:[（(](單)[）)])?[:：ÿ]?(\d{6}[A-Z0-9]{6,20})/g)];
  const ids = [...new Set(matches.filter(m => m[1] || m[2] || /[A-Z]/.test(m[3])).map(m => m[3]))];
  const tracking = [...new Set([...text.matchAll(/(?:寄件編號|物流編號|物流單號|寄件單號|貨運單號|託運單號|交貨便服務代碼)[:：ÿ]?([A-Z0-9-]{6,50})/g)].map(m => m[1]))];
  if (ids.length !== 1 || tracking.length > 1) {
    throw new InputError([`PDF 第 ${pageNumber} 頁：無法確認唯一的訂單編號，或寄件單與裝箱單的編號不一致。`]);
  }
  // Preserve visual lines and separators here: compacting unrelated PDF items
  // can turn "package 1" followed by a carrier's "834" into "package1834".
  const lines: TextRun[][] = [];
  for (const run of runs) {
    let line = lines.find(items => Math.abs(items[0].y - run.y) < 2);
    if (!line) { line = []; lines.push(line); }
    line.push(run);
  }
  const packages = lines.flatMap(line => [...line.sort((a, b) => a.x - b.x)
    .map(run => run.str.normalize('NFKC')).join(' ').matchAll(/\bpackage\s*(\d+)(?:\s*[/／]\s*(\d+))?/gi)]);
  if (packages.some(m => Number(m[1]) !== 1 || (m[2] && Number(m[2]) !== 1))) {
    throw new InputError([`PDF 第 ${pageNumber} 頁：不支援同一訂單拆成多個包裹，請先分別確認原始出貨文件。`]);
  }
  return { text, id: ids[0], tracking: tracking[0] ?? '' };
}

export type IncomingPageKind = 'combined' | 'shipping' | 'packing';

/** Classify by actual table position, never by a filename or neighbouring page. */
export function incomingPageKind(runs: TextRun[], height: number): IncomingPageKind {
  const nameHeaders = runs.filter(run => compact(run.str) === '商品名稱');
  const table = nameHeaders.filter(candidate => headings.every(heading =>
    runs.some(run => compact(run.str) === heading && Math.abs(run.y - candidate.y) <= 3)));
  if (table.length === 1) return table[0].y >= height * 0.65 ? 'packing' : 'combined';
  const tableRuns = runs.filter(run => ['主商品貨號', '商品名稱', '商品選項貨號', '商品規格名稱'].includes(compact(run.str)));
  if (tableRuns.length) return tableRuns.some(run => run.y >= height * 0.65) ? 'packing' : 'combined';
  if (runs.some(run => ['商品列表', '裝箱單'].includes(compact(run.str)))) return 'packing';
  return 'shipping';
}

/** Standalone original A4 7-Eleven labels have a readable Shopee ID and service code. */
export function parseStandaloneShippingPage(runs: TextRun[], width: number, height: number, pageNumber: number) {
  const fail = (message: string): never => { throw new InputError([`PDF 第 ${pageNumber} 頁：${message}`]); };
  if (width < 560 || width > 630 || height < 790 || height > 880) fail('請使用蝦皮直接下載的一般列印 A4 PDF。');
  const identity = readIdentity(runs, pageNumber);
  if (!identity.text.includes('交貨便服務代碼') || !identity.tracking) {
    fail('這份文件沒有商品表，也不是已支援的 7-11 獨立寄件單。請加入原始「寄件單+裝箱單」，或同批的 7-11 寄件單與裝箱單 PDF。');
  }
  return { orderId: identity.id, tracking: identity.tracking,
    recipient: readRecipient(runs.filter(run => run.x < width * 0.6)), layout: 'seven-eleven' as const };
}

function parsePackingLayout(runs: TextRun[], widths: FontWidths, width: number, height: number, pageNumber: number, standalone: boolean) {
  const fail = (message: string): never => { throw new InputError([`PDF 第 ${pageNumber} 頁：${message}`]); };
  if (width < 560 || width > 630 || height < 790 || height > 880) fail('請使用「寄件單+裝箱單」的一般列印 A4 PDF。');
  const headers = headings.map(heading => {
    const found = runs.filter(run => compact(run.str) === heading && (standalone || run.y < height * 0.65));
    if (found.length !== 1) fail('找不到完整且唯一的商品表格。請加入原始合併 PDF，或同批的寄件單與裝箱單 PDF；不支援掃描圖或跨頁明細。');
    return found[0];
  });
  if (headers.some((h, i) => Math.abs(h.y - headers[0].y) > 3 || (i > 0 && h.x - headers[i - 1].x < 30))) fail('商品欄位位置異常。');
  const headerY = headers[0].y;
  // Some carriers embed the entire shipping label as an image. Their order ID
  // is still present above the packing table; preserve the label, never invent
  // its tracking number or try to reconstruct its barcode from OCR.
  const headingRuns = runs.filter(run => run.y > headerY + 3);
  const identity = readIdentity(headingRuns, pageNumber);
  const shippingText = identity.text;
  const layout: 'shopee' | 'general' = shippingText.includes('門市交寄') && shippingText.includes('標準配送') ? 'shopee' : 'general';
  if (layout === 'shopee' && !identity.tracking) fail('店到店寄件單缺少物流編號，請重新下載原始 PDF。');
  const packingTitles = headingRuns.filter(run => compact(run.str) === '裝箱單' && run.y < height * 0.65);
  const shippingBottomY = Math.max(headerY + 30, ...packingTitles.map(run => run.y + run.height + 8));
  const recipient = readRecipient(runs.filter(run => run.y > shippingBottomY && run.x < width * 0.6));
  const notes = runs.filter(run => compact(run.str).startsWith('買家備註') && run.y < headerY);
  if (notes.length !== 1) fail('無法確認商品表格結尾，可能有跨頁或不完整明細。');
  const note = notes[0];
  const anchors = runs.filter(run => /^\d+$/.test(run.str.trim()) &&
    Math.abs(run.x - headers[0].x) < 8 && run.y < headerY - 2 && run.y > note.y).sort((a, b) => b.y - a.y);
  if (!anchors.length || anchors.length > 100) fail('商品明細為空或過多。');
  const glyphs = glyphsFromRuns(runs.filter(run => run.y < headerY - 2), widths);
  const products = anchors.map((anchor, index) => {
    if (Number(anchor.str) !== index + 1) fail('商品序號不連續，未產生標籤。');
    const bottom = anchors[index + 1]?.y ?? note.y;
    const cell = (column: number, sku = false) => readCell(glyphs, headers[column].x, headers[column + 1].x, anchor.y, bottom, sku);
    const name = cell(2).replace(/\n/g, '');
    const variant = cell(4).replace(/\n/g, '');
    const sku = cell(3, true) || cell(1, true);
    const quantityText = cell(5);
    if (!/^\d+$/.test(quantityText) || !Number.isSafeInteger(Number(quantityText)) || Number(quantityText) < 1 || Number(quantityText) > 100000 || !name) fail(`第 ${index + 1} 項商品名稱或數量不完整。`);
    if (name.length > 2000 || variant.length > 1000 || sku.length > 500) fail('商品欄位過長。');
    return { index: index + 1, name, variant, sku, quantity: Number(quantityText) };
  });
  const seller = runs.find(run => compact(run.str).startsWith('賣家備註') && run.y < note.y);
  const buyerNote = readCell(glyphs, 0, width, note.y, seller?.y ?? 12).replace(/^買家備註\s*[:：]?\s*/, '');
  const sellerNote = seller ? readCell(glyphs, 0, width, seller.y, 12).replace(/^賣家備註\s*[:：]?\s*/, '') : '';
  if (buyerNote.length > 5000 || sellerNote.length > 5000) fail('備註過長。');
  const order: Order = { id: identity.id, tracking: identity.tracking, products, buyerNote, sellerNote };
  return { order, recipient, headerY, shippingBottomY, layout };
}

export function parseCombinedPage(runs: TextRun[], widths: FontWidths, width: number, height: number, pageNumber: number) {
  return parsePackingLayout(runs, widths, width, height, pageNumber, false);
}

export function parseStandalonePackingPage(runs: TextRun[], widths: FontWidths, width: number, height: number, pageNumber: number) {
  return parsePackingLayout(runs, widths, width, height, pageNumber, true).order;
}

export function ensureUniqueOrders(orders: Order[]) {
  const trackings = orders.map(o => o.tracking).filter(Boolean);
  if (new Set(orders.map(o => o.id)).size !== orders.length || new Set(trackings).size !== trackings.length) {
    throw new InputError(['PDF 含重複訂單或物流編號。可能是重複下載、同單拆包裹或跨頁明細，請分批確認；本批未產生標籤。']);
  }
}
