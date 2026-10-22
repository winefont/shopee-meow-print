import { PDFDocument, StandardFonts, PrintScaling, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { labelFontkit } from './label-font';
import { InputError, type Pair, type PageGroup, type Product } from './types';

export const MM = 72 / 25.4;
export const PAGE_WIDTH = 100 * MM;
export const PAGE_HEIGHT = 150 * MM;
const MARGIN = 4 * MM;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.35, 0.35, 0.35);
const LIGHT = rgb(0.78, 0.78, 0.78);
const FOOTER_TOP = PAGE_HEIGHT - 24;
const ROWS_TOP = 81;
const ROWS_HEIGHT = FOOTER_TOP - ROWS_TOP;

type Density = { name: number; nameLine: number; variant: number; variantLine: number; sku: number; skuLine: number; quantity: number };
const DENSITIES: Density[] = [
  { name: 11.5, nameLine: 14, variant: 10.5, variantLine: 12.5, sku: 12, skuLine: 14, quantity: 25 },
  { name: 10.5, nameLine: 12.5, variant: 9.5, variantLine: 11.5, sku: 11, skuLine: 13, quantity: 23 },
  { name: 9.5, nameLine: 11.5, variant: 9, variantLine: 10.5, sku: 10.5, skuLine: 12.5, quantity: 21 },
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

function productRow(product: Product, font: PDFFont, density: Density): Row {
  const name = wrapText(product.name, font, density.name, CONTENT_WIDTH - 51);
  const variant = wrapText(product.variant || '未提供規格', font, density.variant, CONTENT_WIDTH - 51);
  const sku = wrapText(`貨號 ${product.sku || '未提供貨號'}`, font, density.sku, CONTENT_WIDTH - 12);
  const height = 4 + name.length * density.nameLine + 1 + variant.length * density.variantLine +
    2 + sku.length * density.skuLine + 5;
  return { kind: 'product', product, name, variant, sku, height, density };
}

function pickingRows(pair: Pair, font: PDFFont): Row[] {
  // Prefer the largest readable type that keeps the products on one label.
  // Never truncate names, variants or SKUs to force an arbitrary row count.
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
    if (top + row.height > FOOTER_TOP && current.length) {
      groups.push(current); current = []; top = ROWS_TOP;
    }
    current.push(row); top += row.height;
  }
  if (current.length) groups.push(current);
  return groups;
}

function drawRow(page: PDFPage, row: Row, font: PDFFont, bold: PDFFont, top: number) {
  if (row.kind === 'note') {
    put(page, font, row.heading, MARGIN + 6, top + 4, 9, GREY);
    row.lines.forEach((text, i) => put(page, font, text, MARGIN + 6, top + 17 + i * 12, 9.5));
  } else {
    const x = MARGIN + 12;
    const density = row.density;
    page.drawRectangle({ x: MARGIN, y: PAGE_HEIGHT - top - 14, width: 7, height: 7, borderColor: BLACK, borderWidth: 0.7 });
    row.name.forEach((text, i) => put(page, font, text, x, top + 4 + i * density.nameLine, density.name));
    const variantTop = top + 5 + row.name.length * density.nameLine;
    row.variant.forEach((text, i) => put(page, font, text, x, variantTop + i * density.variantLine, density.variant, GREY));
    const qty = String(row.product.quantity);
    const qtySize = Math.min(density.quantity, 34 / bold.widthOfTextAtSize(qty, 1));
    const qtyX = PAGE_WIDTH - MARGIN - 18 - bold.widthOfTextAtSize(qty, qtySize) / 2;
    put(page, bold, qty, qtyX, top + 4, qtySize);
    const skuTop = variantTop + row.variant.length * density.variantLine + 2;
    row.sku.forEach((text, i) => put(page, font, text, x, skuTop + i * density.skuLine, density.sku));
  }
  line(page, top + row.height - 2);
}

export async function composePdf(sourceBytes: Uint8Array, pairs: Pair[], fontBytes: Uint8Array) {
  const document = await PDFDocument.create();
  document.registerFontkit(labelFontkit);
  // Keep the full static TrueType font to preserve glyphs across PDF readers.
  const font = await document.embedFont(fontBytes, { subset: false });
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const ascii = await document.embedFont(StandardFonts.Helvetica);
  const source = await PDFDocument.load(sourceBytes);
  const supported = new Set(font.getCharacterSet());
  const variableText = pairs.map(({ order }) => [order.id, order.tracking, order.buyerNote, order.sellerNote,
    ...order.products.flatMap((p) => [p.name, p.variant, p.sku])].join('')).join('');
  const missing = [...new Set([...variableText].filter((char) => !/[\r\n\t]/.test(char) && !supported.has(char.codePointAt(0)!)))];
  if (missing.length) throw new InputError([`商品或備註含目前字型不支援的字元：${missing.slice(0, 10).join(' ')}。為避免漏印，請先調整這些字元。`]);
  const groups: PageGroup[] = [];
  const warnings: string[] = [];
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
      x: (PAGE_WIDTH - width) / 2, y: 27 + (maxHeight - height) / 2, width, height,
    });
    footer(label, font, `${number}-1/${groupPageCount}  寄件單`);
    for (const [j, rows] of chunks.entries()) {
      const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pages.push(document.getPageCount() - 1);
      put(page, font, j ? '揀貨單（續）' : '揀貨單', MARGIN, 8, 16);
      const batch = `${number} / ${String(pairs.length).padStart(2, '0')}`;
      put(page, bold, batch, PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(batch, 11), 11, 11);
      line(page, 30, 1, BLACK);
      put(page, font, '訂單編號', MARGIN, 36, 8, GREY);
      put(page, bold, pair.order.id, MARGIN + 43, 34, 12);
      put(page, font, '物流編號', MARGIN, 53, 8, GREY);
      put(page, ascii, pair.order.tracking, MARGIN + 43, 51, 10);
      const total = pair.order.products.reduce((sum, p) => sum + p.quantity, 0);
      put(page, font, `${pair.order.products.length} 項商品 / 共 ${total} 件`, MARGIN, 67, 8.5, GREY);
      put(page, font, '數量', PAGE_WIDTH - MARGIN - 27, 67, 8.5, GREY);
      line(page, 79);
      let top = ROWS_TOP;
      for (const row of rows) { drawRow(page, row, font, bold, top); top += row.height; }
      footer(page, font, `${number}-${j + 2}/${groupPageCount}  揀貨單${j ? '（續）' : ''}  ${pair.order.id}`);
    }
    groups.push({ orderId: pair.order.id, pages, quantity: pair.order.products.reduce((sum, p) => sum + p.quantity, 0) });
  }
  document.setTitle('出貨合成結果');
  document.setCreator('蝦皮印單喵');
  document.setProducer('蝦皮印單喵 / pdf-lib');
  document.setLanguage('zh-TW');
  document.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  return { bytes: await document.save(), groups, warnings, pageCount: document.getPageCount() };
}
