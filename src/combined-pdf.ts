import { loadPdf, pdfjs } from './source-pdf';
import { collectFontWidths } from './font-widths';
import { InputError, type Pair } from './types';
import { incomingPageKind, parseCombinedPage, parseStandalonePackingPage, parseStandaloneShippingPage, type TextRun } from './combined-layout';
import { pairDocumentPages, type DocumentPage } from './pdf-pairing';
import { findShippingInk } from './shipping-bounds';
import { PDFDocument } from 'pdf-lib';
import { pdfSelectionIssues } from './batch-files';

async function readDocumentPages(bytes: Uint8Array, progress: (message: string) => void, pageOffset = 0, fileName?: string): Promise<DocumentPage[]> {
  const task = loadPdf(bytes);
  try {
    let doc: pdfjs.PDFDocumentProxy;
    try { doc = await task.promise; } catch { throw new InputError(['無法開啟 PDF。請使用未加密的蝦皮原始寄件／裝箱文件。']); }
    if (!doc.numPages || doc.numPages > 500) throw new InputError(['每批支援 1～500 頁，請分批下載。']);
    const pages: DocumentPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      progress(`讀取 PDF ${n} / ${doc.numPages} 頁`);
      const page = await doc.getPage(n);
      if (page.rotate !== 0) throw new InputError([`PDF 第 ${n} 頁旋轉方向不符，請使用蝦皮原始下載檔。`]);
      const content = await page.getTextContent({ disableNormalization: true });
      const runs: TextRun[] = content.items.flatMap(item => 'str' in item ? [{
        str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height, fontName: item.fontName,
      }] : []);
      const viewport = page.getViewport({ scale: 1.5 });
      const width = viewport.width / 1.5, height = viewport.height / 1.5;
      const kind = incomingPageKind(runs, height);
      const index = pageOffset + n - 1;
      if (kind === 'packing') {
        const order = parseStandalonePackingPage(runs, collectFontWidths(await page.getOperatorList(), pdfjs.OPS), width, height, n);
        pages.push({ kind, order, index, fileName });
        page.cleanup();
        continue;
      }
      const combined = kind === 'combined'
        ? parseCombinedPage(runs, collectFontWidths(await page.getOperatorList(), pdfjs.OPS), width, height, n) : undefined;
      const identity = combined ? { orderId: combined.order.id, tracking: combined.order.tracking,
        recipient: combined.recipient, layout: combined.layout } : parseStandaloneShippingPage(runs, width, height, n);
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      try {
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new InputError(['無法建立 PDF 預覽，請重新開啟工具。']);
        await page.render({ canvasContext: context, canvas, viewport, background: '#fff' }).promise;
        const limit = Math.min(canvas.height, Math.floor(viewport.convertToViewportPoint(0, combined?.shippingBottomY ?? 0)[1]));
        const { data } = context.getImageData(0, 0, canvas.width, limit);
        let bounds: ReturnType<typeof findShippingInk>;
        try { bounds = findShippingInk(data, canvas.width, limit, 1.5); }
        catch (error) { if (error instanceof InputError) throw new InputError(error.issues.map(issue => `PDF 第 ${n} 頁：${issue}`)); throw error; }
        const { left, right, top, bottom, cutoff } = bounds;
        // The output adds its own printable border. Preserve a small source
        // safety border without shrinking the label twice.
        const pad = 1.5 / 25.4 * 72 * 1.5;
        const a = viewport.convertToPdfPoint(Math.max(0, left - pad), Math.max(0, top - pad));
        const b = viewport.convertToPdfPoint(Math.min(viewport.width, right + 1 + pad), Math.min(cutoff, bottom + 1 + pad));
        const source = { index, ...identity, fileName, bounds: { left: a[0], top: a[1], right: b[0], bottom: b[1] } };
        pages.push(combined ? { kind: 'combined', order: combined.order, source } : { kind: 'shipping', source });
      } finally { canvas.width = canvas.height = 0; page.cleanup(); }
    }
    return pages;
  } finally { await task.destroy(); }
}

export async function readCombined(bytes: Uint8Array, progress: (message: string) => void): Promise<Pair[]> {
  return pairDocumentPages(await readDocumentPages(bytes, progress));
}

export async function readCombinedBatch(files: readonly File[], progress: (message: string) => void) {
  const issues = pdfSelectionIssues(files);
  if (!files.length || issues.length) throw new InputError(issues.length ? issues : ['請先選擇 PDF。']);
  const merged = files.length > 1 ? await PDFDocument.create() : undefined;
  const pages: DocumentPage[] = [];
  let singleBytes: Uint8Array = new Uint8Array();
  let totalPages = 0;
  for (const [fileIndex, file] of files.entries()) {
    const prefix = `檔案 ${fileIndex + 1}/${files.length}「${file.name}」`;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const source = await PDFDocument.load(bytes);
      if (totalPages + source.getPageCount() > 500) throw new InputError(['所有 PDF 合計最多 500 頁（包含獨立裝箱單），請分批處理。']);
      pages.push(...await readDocumentPages(bytes, message => progress(`${prefix}：${message}`), totalPages, file.name));
      totalPages += source.getPageCount();
      if (merged) for (const page of await merged.copyPages(source, source.getPageIndices())) merged.addPage(page);
      else singleBytes = bytes;
    } catch (error) {
      if (error instanceof InputError) throw new InputError(error.issues.map(issue => `${prefix}：${issue}`));
      throw new InputError([`${prefix}：無法讀取，請確認是未加密的蝦皮原始 PDF。本批未產生標籤。`]);
    }
  }
  // A matching packing/shipping page may occur anywhere in the selected files.
  const pairs = pairDocumentPages(pages);
  return { bytes: merged ? await merged.save() : singleBytes, pairs,
    separatedCount: pairs.filter(pair => pair.source.packingFileName !== undefined).length };
}
