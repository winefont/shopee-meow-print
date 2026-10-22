import * as XLSX from 'xlsx';
import { InputError, type Order, type Product } from './types';

const HEADERS = ['tracking_number', 'order_sn', 'product_info', 'remark_from_buyer', 'seller_note'];
const ORDER_ID = /^\d{6}[A-Z0-9]{6,20}$/;
const MAX_ORDERS = 500;

export function parseProducts(value: string, orderId: string): Product[] {
  const expression = /\[(\d+)\]\s*商品名稱\s*[:：]([\s\S]*?);\s*商品選項名稱\s*[:：]([\s\S]*?);\s*價格\s*[:：]\s*\$\s*([\d,.]+)\s*;\s*數量\s*[:：]\s*(\d+)\s*;\s*商品選項貨號\s*[:：]([\s\S]*?);\s*(?=\[\d+\]\s*商品名稱|$)/g;
  const matches = [...value.matchAll(expression)];
  if (!matches.length || value.replace(expression, '').trim()) {
    throw new InputError([`訂單 ${orderId}：商品資料格式不完整或尚未支援，無法確認每項商品。請重新下載裝箱單。`]);
  }
  const products = matches.map((m): Product => ({
    index: Number(m[1]), name: m[2].trim(), variant: m[3].trim(),
    quantity: Number(m[5]), sku: m[6].trim(),
  }));
  if (products.length > 100 || products.some((p, i) =>
    p.index !== i + 1 || !p.name || !Number.isSafeInteger(p.quantity) || p.quantity < 1 || p.quantity > 100000 ||
    p.name.length > 2000 || p.variant.length > 1000 || p.sku.length > 500)) {
    throw new InputError([`訂單 ${orderId}：商品序號、名稱、數量或欄位長度異常，請檢查原始資料。`]);
  }
  return products;
}

export function parsePacking(bytes: Uint8Array): Order[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: 'array', cellFormula: true, cellHTML: false, nodim: true });
  } catch {
    throw new InputError(['無法讀取 Excel。請使用蝦皮下載的「裝箱單.xlsx」，不要使用加密檔案。']);
  }
  const sheetName = workbook.Sheets.orders ? 'orders' : workbook.SheetNames.length === 1 ? workbook.SheetNames[0] : '';
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new InputError(['找不到 orders 工作表，請選擇蝦皮裝箱單 Excel。']);

  // Shopee's sample falsely declares A1; derive the real range from stored cells.
  const coordinates = Object.keys(sheet).filter((key) => /^[A-Z]+\d+$/.test(key)).map(XLSX.utils.decode_cell);
  if (!coordinates.length || coordinates.length > 50000) throw new InputError(['Excel 沒有資料，或超過第一版支援的大小。']);
  const maxRow = Math.max(...coordinates.map((cell) => cell.r));
  const maxCol = Math.max(...coordinates.map((cell) => cell.c));
  if (maxRow > 5000 || maxCol > 50) throw new InputError(['Excel 範圍異常，請重新下載裝箱單。']);
  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true, blankrows: true });
  const header = (rows[0] ?? []).map((value) => String(value).trim());
  if (HEADERS.some((key) => header.filter((value) => value === key).length !== 1)) {
    throw new InputError(['Excel 欄位不符。需要訂單編號、物流編號、商品資料、買家留言與賣家備註五個原始欄位。']);
  }
  const orders: Order[] = [];
  const issues: string[] = [];
  const seen = new Set<string>();
  const trackingSeen = new Set<string>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((value) => String(value).trim() === '')) continue;
    const values = Object.fromEntries(HEADERS.map((key) => [key, String(row[header.indexOf(key)] ?? '').trim()]));
    if (HEADERS.some((key) => sheet[XLSX.utils.encode_cell({ r, c: header.indexOf(key) })]?.f)) {
      issues.push(`Excel 第 ${r + 1} 列含公式。請使用未修改的蝦皮下載檔。`);
      continue;
    }
    const id = values.order_sn;
    const tracking = values.tracking_number;
    if (!ORDER_ID.test(id)) { issues.push(`Excel 第 ${r + 1} 列的訂單編號無法辨識。`); continue; }
    if (!/^[A-Z0-9-]{6,50}$/.test(tracking)) { issues.push(`訂單 ${id}：物流編號缺漏或格式異常。`); continue; }
    if (seen.has(id)) { issues.push(`訂單 ${id} 重複出現。第一版尚未支援同單拆包裹，請確認裝箱單。`); continue; }
    if (trackingSeen.has(tracking)) { issues.push(`訂單 ${id}：物流編號與其他訂單重複。`); continue; }
    seen.add(id);
    trackingSeen.add(tracking);
    if (values.remark_from_buyer.length > 5000 || values.seller_note.length > 5000) {
      issues.push(`訂單 ${id}：備註過長，請先檢查資料。`);
      continue;
    }
    try {
      orders.push({
        id, tracking, products: parseProducts(values.product_info, id),
        buyerNote: values.remark_from_buyer, sellerNote: values.seller_note,
      });
    } catch (error) {
      issues.push(...(error instanceof InputError ? error.issues : [`訂單 ${id} 商品解析失敗。`]));
    }
  }
  if (issues.length) throw new InputError(issues);
  if (!orders.length) throw new InputError(['Excel 沒有可處理的訂單。']);
  if (orders.length > MAX_ORDERS) throw new InputError([`第一版每批最多 ${MAX_ORDERS} 筆，請分批下載。`]);
  return orders;
}
