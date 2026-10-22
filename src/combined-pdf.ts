import { loadPdf, pdfjs } from './source-pdf';
import { collectFontWidths } from './font-widths';
import { InputError, type Pair } from './types';
import { parseCombinedPage, ensureUniqueOrders, type TextRun } from './combined-layout';

export async function readCombined(bytes: Uint8Array, progress: (message: string) => void): Promise<Pair[]> {
  const task = loadPdf(bytes);
  try {
    let doc: pdfjs.PDFDocumentProxy;
    try { doc = await task.promise; } catch { throw new InputError(['無法開啟 PDF。請使用未加密的「寄件單+裝箱單」下載檔。']); }
    if (!doc.numPages || doc.numPages > 500) throw new InputError(['每批支援 1～500 頁，請分批下載。']);
    const pairs: Pair[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      progress(`讀取單一 PDF ${n} / ${doc.numPages}`);
      const page = await doc.getPage(n);
      if (page.rotate !== 0) throw new InputError([`PDF 第 ${n} 頁旋轉方向不符，請使用蝦皮原始下載檔。`]);
      const content = await page.getTextContent({ disableNormalization: true });
      const operators = await page.getOperatorList();
      const runs: TextRun[] = content.items.flatMap(item => 'str' in item ? [{
        str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height, fontName: item.fontName,
      }] : []);
      const viewport = page.getViewport({ scale: 1.5 });
      const { order, headerY } = parseCombinedPage(runs, collectFontWidths(operators, pdfjs.OPS), viewport.width / 1.5, viewport.height / 1.5, n);
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      try {
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        await page.render({ canvasContext: context, canvas, viewport, background: '#fff' }).promise;
        const cutoff = Math.floor(viewport.convertToViewportPoint(0, headerY + 30)[1]);
        const { data } = context.getImageData(0, 0, canvas.width, cutoff);
        let left = canvas.width, right = -1, top = cutoff, bottom = -1;
        for (let y = 0; y < cutoff; y++) for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if (data[i + 3] > 128 && Math.min(data[i], data[i + 1], data[i + 2]) < 235) {
            left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
          }
        }
        const w = (right - left) / 1.5, h = (bottom - top) / 1.5;
        if (w < 150 || w > 330 || h < 220 || h > 450 || bottom >= cutoff - 2) throw new InputError([`PDF 第 ${n} 頁：無法安全分離寄件單，未裁切或產生標籤。`]);
        const pad = 3 / 25.4 * 72 * 1.5;
        const a = viewport.convertToPdfPoint(Math.max(0, left - pad), Math.max(0, top - pad));
        const b = viewport.convertToPdfPoint(Math.min(viewport.width, right + 1 + pad), Math.min(cutoff, bottom + 1 + pad));
        pairs.push({ order, source: { index: n - 1, orderId: order.id, tracking: order.tracking,
          bounds: { left: a[0], top: a[1], right: b[0], bottom: b[1] } } });
      } finally { canvas.width = canvas.height = 0; page.cleanup(); }
    }
    ensureUniqueOrders(pairs.map(pair => pair.order));
    return pairs;
  } finally { await task.destroy(); }
}
