import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { InputError, type SourcePage } from './types';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export { pdfjs };

export function loadPdf(bytes: Uint8Array) {
  return pdfjs.getDocument({
    data: bytes.slice(),
    cMapUrl: new URL(`${import.meta.env.BASE_URL}pdfjs/cmaps/`, location.href).href,
    cMapPacked: true,
    standardFontDataUrl: new URL(`${import.meta.env.BASE_URL}pdfjs/standard_fonts/`, location.href).href,
    wasmUrl: new URL(`${import.meta.env.BASE_URL}pdfjs/wasm/`, location.href).href,
  });
}

export async function readShipping(bytes: Uint8Array, progress: (message: string) => void): Promise<SourcePage[]> {
  const task = loadPdf(bytes);
  let doc: pdfjs.PDFDocumentProxy;
  try { doc = await task.promise; } catch {
    await task.destroy();
    throw new InputError(['無法開啟寄件單 PDF，請確認檔案沒有密碼且可以正常開啟。']);
  }
  try {
    if (!doc.numPages || doc.numPages > 500) throw new InputError(['第一版支援每批 1～500 張寄件單。']);
    const pages: SourcePage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      progress(`讀取寄件單 ${n} / ${doc.numPages}`);
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items.map((item) => 'str' in item ? item.str : '').join('').replace(/\s+/g, '');
      const ids = [...new Set([...text.matchAll(/(?:蝦皮)?訂單編號[:：]?(\d{6}[A-Z0-9]{6,20})/g)].map((m) => m[1]))];
      const trackings = [...new Set([...text.matchAll(/(?:寄件編號|物流編號|寄件單號)[:：]?([A-Z0-9-]{6,50})/g)].map((m) => m[1]))];
      if (ids.length !== 1 || trackings.length !== 1) {
        throw new InputError([`寄件單第 ${n} 頁：無法確認唯一的訂單／物流編號。請使用蝦皮直接下載、每頁一單的 PDF；第一版尚不支援掃描圖檔或多單拼版。`]);
      }
      const viewport = page.getViewport({ scale: 2 });
      const widthMm = viewport.width / 2 * 25.4 / 72;
      const heightMm = viewport.height / 2 * 25.4 / 72;
      if (page.rotate !== 0 || widthMm < 90 || widthMm > 115 || heightMm < 135 || heightMm > 165 ||
          !text.includes('門市交寄') || !text.includes('標準配送')) {
        throw new InputError([`寄件單第 ${n} 頁：版型尚未驗證。第一版支援目前提供的蝦皮店到店「標準配送／門市交寄」單張版型。`]);
      }

      // Measure visible ink only, then embed the original PDF region, not this raster.
      // Include all visible marks and a safety border; do not identify/cut barcodes.
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      await page.render({ canvasContext: context, canvas, viewport, background: '#ffffff' }).promise;
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if (data[i + 3] > 128 && Math.min(data[i], data[i + 1], data[i + 2]) < 245) {
            left = Math.min(left, x); right = Math.max(right, x);
            top = Math.min(top, y); bottom = Math.max(bottom, y);
          }
        }
      }
      if (right < left || bottom < top) throw new InputError([`寄件單第 ${n} 頁是空白頁。`]);
      const padding = Math.ceil(3 / 25.4 * 72 * 2);
      const p1 = viewport.convertToPdfPoint(Math.max(0, left - padding), Math.max(0, top - padding));
      const p2 = viewport.convertToPdfPoint(Math.min(viewport.width, right + 1 + padding), Math.min(viewport.height, bottom + 1 + padding));
      pages.push({
        index: n - 1, orderId: ids[0], tracking: trackings[0],
        bounds: { left: Math.min(p1[0], p2[0]), bottom: Math.min(p1[1], p2[1]), right: Math.max(p1[0], p2[0]), top: Math.max(p1[1], p2[1]) },
      });
      canvas.width = canvas.height = 0;
      page.cleanup();
    }
    return pages;
  } finally { await task.destroy(); }
}
