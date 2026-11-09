import { InputError } from './types';

export type OcrLine = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
const compact = (s: string) => s.normalize('NFKC').replace(/\s+/g, '');
const ID = /^\d{6}[A-Z0-9]{6,20}$/;

/** Find the explicitly labelled Shopee field, never the carrier's numeric order number. */
export function readFamilyMartIdentity(lines: readonly OcrLine[]) {
  const fail = (s: string): never => { throw new InputError([s]); };
  // The logo's lowercase i can be read as l/1. This tolerance applies ONLY to the logo, never an ID.
  if (!lines.some(line => /Fam[il1]{1,3}yMart/i.test(compact(line.text))) || !lines.some(line => compact(line.text).includes('寄取貨單'))) {
    fail('無法確認這是全家原始寄件單，請使用蝦皮下載的四格 A4 PDF。');
  }
  const fields = lines.filter(line => compact(line.text).replace(/[:：]$/, '') === '蝦皮訂單編號');
  if (fields.length !== 1 || fields[0].confidence < 60) fail('無法清楚辨識「蝦皮訂單編號」欄位，本批未產生標籤。');
  const field = fields[0], h = field.bbox.y1 - field.bbox.y0;
  const values = lines.filter(line => line.bbox.y0 >= field.bbox.y1 && line.bbox.y0 - field.bbox.y1 < h * 1.5 &&
    Math.abs(line.bbox.x0 - field.bbox.x0) < h * .7 && ID.test(compact(line.text)));
  if (values.length !== 1 || values[0].confidence < 70) fail('全家蝦皮訂單編號辨識不清楚，請重新下載清晰原始檔；不會自動猜測或更改編號。');
  return { orderId: compact(values[0].text), value: values[0] };
}

export function verifyFamilyMartId(first: string, second: string, confidence: number) {
  const value = compact(second);
  if (!ID.test(value) || confidence < 60 || value !== first) {
    throw new InputError(['全家蝦皮訂單編號的兩次辨識結果不一致或不夠清楚，本批未產生標籤。請重新下載原始檔。']);
  }
  return value;
}
