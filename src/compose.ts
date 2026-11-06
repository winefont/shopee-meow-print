import { PDFDocument, StandardFonts, PrintScaling, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { labelFontkit } from './label-font';
import { InputError, type Pair, type PageGroup, type Product } from './types';

export const MM = 72 / 25.4;
export const PAGE_WIDTH = 100 * MM;
export const PAGE_HEIGHT = 150 * MM;
// Leave a small printable border, not a second set of document margins.
const MARGIN = 2.5 * MM;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.35, 0.35, 0.35);
const LIGHT = rgb(0.78, 0.78, 0.78);
const FOOTER_TOP = PAGE_HEIGHT - 24;
const NAME_WIDTH = 51 * MM;
const SPEC_WIDTH = 33.5 * MM;
const QUANTITY_WIDTH = CONTENT_WIDTH - NAME_WIDTH - SPEC_WIDTH;
const TABLE_TOP = MARGIN + 22 + 25 + 32;
const ROWS_TOP = TABLE_TOP + 20;
const TOTAL_HEIGHT = 20;
const ROWS_HEIGHT = FOOTER_TOP - ROWS_TOP - TOTAL_HEIGHT;

type Density = { name: number; nameLine: number; variant: number; variantLine: number; sku: number; skuLine: number; quantity: number };
const DENSITIES: Density[] = [
  { name: 10.5, nameLine: 13, variant: 10.5, variantLine: 13, sku: 10, skuLine: 12, quantity: 14 },
  { name: 10, nameLine: 12, variant: 10, variantLine: 12, sku: 9.5, skuLine: 11.5, quantity: 14 },
  { name: 9.5, nameLine: 11.5, variant: 9.5, variantLine: 11.5, sku: 9.5, skuLine: 11.5, quantity: 14 },
];
type Row = { kind: 'product'; product: Product; name: string[]; variant: string[]; sku: string[]; height: number; density: Density } |
  { kind: 'note'; heading: string; lines: string[]; height: number };

export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  if (width <= 0) throw new Error('Invalid text width');
  const result: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    for (const char of paragraph) {
      if (font.widthOfTextAtSize(char, size) > width) throw new InputError(['有字元超過可列印寬度，請檢查文字。']);
      if (line && font.widthOfTextAtSize(line + char, size) > width) {
        result.push(line); line = char;
      } else line += char;
    }
    result.push(line || ' ');
  }
  return result;
}

function put(page: PDFPage, font: PDFFont, text: string, x: number, top: number, size: number, color = BLACK) {
  page.drawText(text, { x, y: PAGE_HEIGHT - top - size, font, size, color });
}
function line(page: PDFPage, top: number, thickness = 0.5, color = LIGHT) {
  page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - top }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - top }, thickness, color });
}
function footer(page: PDFPage, font: PDFFont, text: string) {
  line(page, PAGE_HEIGHT - 21);
  put(page, font, text, MARGIN, PAGE_HEIGHT - 17, 8, GREY);
}

function frame(page: PDFPage, top: number, height: number, columns = false) {
  page.drawRectangle({ x: MARGIN, y: PAGE_HEIGHT - top - height, width: CONTENT_WIDTH, height,
    borderColor: BLACK, borderWidth: 0.65 });
  if (columns) for (const offset of [NAME_WIDTH, NAME_WIDTH + SPEC_WIDTH]) {
    page.drawLine({ start: { x: MARGIN + offset, y: PAGE_HEIGHT - top },
      end: { x: MARGIN + offset, y: PAGE_HEIGHT - top - height }, thickness: 0.65, color: BLACK });
  }
}

function productRow(product: Product, font: PDFFont, density: Density): Row {
  const name = wrapText(product.name, font, density.name, NAME_WIDTH - 10);
  const variant = wrapText(product.variant || '未提供規格', font, density.variant, SPEC_WIDTH - 10);
  const sku = wrapText(product.sku || '未提供貨號', font, density.sku, SPEC_WIDTH - 10);
  const height = 8 + Math.max(name.length * density.nameLine,
    variant.length * density.variantLine + 3 + sku.length * density.skuLine, density.quantity + 2);
  return { kind: 'product', product, name, variant, sku, height, density };
}

function pickingRows(pair: Pair, font: PDFFont): Row[] {
  // Never grow sparse orders. Compact dense rows only within the readable range.
  let rows: Row[] = [];
  for (const density of DENSITIES) {
    rows = pair.order.products.map((product) => productRow(product, font, density));
    if (rows.reduce((height, row) => height + row.height, 0) <= ROWS_HEIGHT) break;
  }
  for (const [heading, value] of [['買家留言', pair.order.buyerNote], ['賣家備註', pair.order.sellerNote]]) {
    if (!value) continue;
    const lines = wrapText(value.replace(/\t/g, '  '), font, 9.5, CONTENT_WIDTH - 12);
    // Notes may span multiple pages without losing any text.
    for (let i = 0; i < lines.length; i += 10) {
      const part = lines.slice(i, i + 10);
      rows.push({ kind: 'note', heading: i ? `${heading}（續）` : heading, lines: part, height: 22 + part.length * 12 });
    }
  }
  return rows;
}

function paginate(rows: Row[]): Row[][] {
  const groups: Row[][] = [];
  let current: Row[] = [];
  let top = ROWS_TOP;
  for (const row of rows) {
    if (row.height > ROWS_HEIGHT) {
      throw new InputError(['某項商品名稱、規格或貨號太長，無法在可讀字級下完整放入一張標籤。請檢查該筆資料；本批尚未產生 PDF。']);
    }
    if (top + row.height > FOOTER_TOP - TOTAL_HEIGHT && current.length) {
      groups.push(current); current = []; top = ROWS_TOP;
    }
    current.push(row); top += row.height;
  }
  if (current.length) groups.push(current);
  return groups;
}

function drawRow(page: PDFPage, row: Row, font: PDFFont, bold: PDFFont, top: number) {
  frame(page, top, row.height, row.kind === 'product');
  if (row.kind === 'note') {
    put(page, font, row.heading, MARGIN + 6, top + 4, 9, GREY);
    row.lines.forEach((text, i) => put(page, font, text, MARGIN + 6, top + 17 + i * 12, 9.5));
  } else {
    const x = MARGIN + 5;
    const density = row.density;
    row.name.forEach((text, i) => put(page, font, text, x, top + 4 + i * density.nameLine, density.name));
    const variantTop = top + 4;
    const specX = MARGIN + NAME_WIDTH + 5;
    row.variant.forEach((text, i) => put(page, font, text, specX, variantTop + i * density.variantLine, density.variant));
    const qty = String(row.product.quantity);
    const qtySize = Math.min(density.quantity, (QUANTITY_WIDTH - 6) / bold.widthOfTextAtSize(qty, 1));
    const qtyX = PAGE_WIDTH - MARGIN - QUANTITY_WIDTH / 2 - bold.widthOfTextAtSize(qty, qtySize) / 2;
    put(page, bold, qty, qtyX, top + (row.height - qtySize) / 2, qtySize);
    const skuTop = variantTop + row.variant.length * density.variantLine + 3;
    row.sku.forEach((text, i) => put(page, font, text, specX, skuTop + i * density.skuLine, density.sku));
  }
}

export async function composePdf(sourceBytes: Uint8Array, pairs: Pair[], fontBytes: Uint8Array) {
  const document = await PDFDocument.create();
  document.registerFontkit(labelFontkit);
  // Keep the full static TrueType font to preserve glyphs across PDF readers.
  const font = await document.embedFont(fontBytes, { subset: false });
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const source = await PDFDocument.load(sourceBytes);
  const supported = new Set(font.getCharacterSet());
  const variableText = pairs.map(({ order, source }) => [order.id, order.tracking, source.recipient || '', order.buyerNote, order.sellerNote,
    ...order.products.flatMap((p) => [p.name, p.variant, p.sku])].join('')).join('');
  const missing = [...new Set([...variableText].filter((char) => !/[\r\n\t]/.test(char) && !supported.has(char.codePointAt(0)!)))];
  if (missing.length) throw new InputError([`商品或備註含目前字型不支援的字元：${missing.slice(0, 10).join(' ')}。為避免漏印，請先調整這些字元。`]);
  const groups: PageGroup[] = [];
  const warnings: string[] = [];
  if (pairs.some(pair => pair.source.layout === 'general')) warnings.push('本批含通用 A4 版型，會保留原寄件單。全家仍僅做樣式與模擬 A4 測試，首次請核對預覽及試印。');
  if (pairs.some(pair => !pair.source.recipient)) warnings.push('部分寄件單的收件人是圖片、未標示欄名或文字無法可靠讀取，揀貨單已標示「請見寄件單」，請核對同組原寄件單。');
  if (pairs.some(pair => !pair.order.tracking)) warnings.push('部分版型沒有可辨識的物流編號，以唯一訂單編號配對，物流資訊保留於原寄件單。');
  for (const [i, pair] of pairs.entries()) {
    const chunks = paginate(pickingRows(pair, font));
    const number = String(i + 1).padStart(2, '0');
    const groupPageCount = chunks.length + 1;
    if (chunks.length > 1) warnings.push(`訂單 ${pair.order.id} 有 ${chunks.length} 張揀貨單，本組共 ${groupPageCount} 張，請連續取用。`);
    if (pair.order.products.some((p) => !p.sku)) warnings.push(`訂單 ${pair.order.id} 有商品未提供貨號，揀貨時請核對品名與規格。`);
    const pages: number[] = [];
    const label = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(document.getPageCount() - 1);
    const embedded = await document.embedPage(source.getPage(pair.source.index), pair.source.bounds);
    const maxHeight = PAGE_HEIGHT - MARGIN - 27;
    const scale = Math.min(CONTENT_WIDTH / embedded.width, maxHeight / embedded.height);
    const width = embedded.width * scale;
    const height = embedded.height * scale;
    label.drawPage(embedded, {
      x: (PAGE_WIDTH - width) / 2, y: PAGE_HEIGHT - MARGIN - height, width, height,
    });
    footer(label, font, `${number}-1/${groupPageCount}  寄件單`);
    for (const [j, rows] of chunks.entries()) {
      const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pages.push(document.getPageCount() - 1);
      frame(page, MARGIN, 22);
      put(page, font, j ? '揀貨單（續）' : '揀貨單', MARGIN + 5, MARGIN + 3, 12);
      const batch = `${number} / ${String(pairs.length).padStart(2, '0')}`;
      put(page, bold, batch, PAGE_WIDTH - MARGIN - 5 - bold.widthOfTextAtSize(batch, 10), MARGIN + 5, 10);
      const orderTop = MARGIN + 22;
      frame(page, orderTop, 25);
      put(page, font, '訂單編號', MARGIN + 5, orderTop + 6, 10);
      const idSize = Math.min(12, (CONTENT_WIDTH - 55) / bold.widthOfTextAtSize(pair.order.id, 1));
      put(page, bold, pair.order.id, MARGIN + 50, orderTop + 5, idSize);
      const recipientTop = orderTop + 25;
      frame(page, recipientTop, 32);
      put(page, font, '收件人', MARGIN + 5, recipientTop + 6, 10);
      const recipient = pair.source.recipient || '請見寄件單';
      wrapText(recipient, font, 10.5, CONTENT_WIDTH - 55).forEach((text, i) =>
        put(page, font, text, MARGIN + 50, recipientTop + 4 + i * 12.5, 10.5));
      frame(page, TABLE_TOP, 20, true);
      put(page, font, '商品名稱', MARGIN + 5, TABLE_TOP + 4, 10);
      put(page, font, '規格／貨號', MARGIN + NAME_WIDTH + 5, TABLE_TOP + 4, 10);
      put(page, font, '數量', PAGE_WIDTH - MARGIN - QUANTITY_WIDTH + 4, TABLE_TOP + 4, 10);
      const total = pair.order.products.reduce((sum, p) => sum + p.quantity, 0);
      let top = ROWS_TOP;
      for (const row of rows) { drawRow(page, row, font, bold, top); top += row.height; }
      frame(page, top, TOTAL_HEIGHT);
      put(page, font, `本訂單 ${pair.order.products.length} 項商品 / 共 ${total} 件${chunks.length > 1 ? `（揀貨單 ${j + 1}/${chunks.length}）` : ''}`,
        MARGIN + 5, top + 4, 9);
      footer(page, font, `${number}-${j + 2}/${groupPageCount}  揀貨單${j ? '（續）' : ''}  ${pair.order.id}`);
    }
    groups.push({ orderId: pair.order.id, pages, quantity: pair.order.products.reduce((sum, p) => sum + p.quantity, 0) });
  }
  document.setTitle('出貨合成結果');
  document.setCreator('蝦皮印單喵');
  document.setProducer('蝦皮印單喵 / pdf-lib');
  document.setLanguage('zh-TW');
  document.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  document.catalog.getOrCreateViewerPreferences().setPickTrayByPDFSize(true);
  return { bytes: await document.save(), groups, warnings, pageCount: document.getPageCount() };
}
