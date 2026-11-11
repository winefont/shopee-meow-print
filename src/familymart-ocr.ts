import type { Worker } from 'tesseract.js';
import { readFamilyMartIdentity, verifyFamilyMartId } from './familymart-identity';
import { FAMILY_POSITIONS, type FamilyCell } from './familymart-grid';
import { InputError } from './types';

/** One lazily-created local OCR worker per import, always terminated by the batch owner. */
export function createFamilyMartReader(factory?: () => Promise<Worker>) {
  let worker: Worker | undefined;
  async function getWorker() {
    if (!worker) {
      if (factory) worker = await factory();
      else {
        const { createWorker } = await import('tesseract.js');
        const base = new URL(`${import.meta.env.BASE_URL}ocr/`, location.href);
        worker = await createWorker('chi_tra', 1, { workerPath: new URL('worker.min.js', base).href,
          corePath: new URL('core/', base).href, langPath: new URL('lang', base).href,
          workerBlobURL: false, cacheMethod: 'none', gzip: true });
      }
    }
    return worker;
  }
  return {
    async read(canvas: HTMLCanvasElement, cell: FamilyCell, page: number, progress: (s: string) => void) {
      const where = `PDF 第 ${page} 頁${FAMILY_POSITIONS[cell.labelIndex]}格`;
      progress(`${where}：本機辨識蝦皮訂單編號`);
      const crop = document.createElement('canvas');
      try {
        const ocr = await getWorker();
        const box = cell.ink, padding = 12;
        const width = box.right - box.left, height = Math.ceil((box.bottom - box.top) * .39);
        crop.width = width + padding * 2; crop.height = height + padding * 2;
        const ctx = crop.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, crop.width, crop.height);
        ctx.drawImage(canvas, box.left, box.top, width, height, padding, padding, width, height);
        await ocr.setParameters({ tessedit_pageseg_mode: '11' as import('tesseract.js').PSM,
          tessedit_char_whitelist: '', user_defined_dpi: '288' });
        const image = crop.toDataURL('image/png');
        const { data } = await ocr.recognize(image, {}, { text: true, blocks: true });
        const lines = data.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)) ?? [];
        const identity = readFamilyMartIdentity(lines);
        await ocr.setParameters({ tessedit_pageseg_mode: '7' as import('tesseract.js').PSM,
          tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' });
        // A tight rectangle in the full label can add characters or depress confidence.
        // Read the unchanged ID pixels independently, with a source margin and white border.
        const isolated = document.createElement('canvas');
        try {
          const b = identity.value.bbox, border = 24;
          const x = Math.max(0, b.x0 - 2), y = Math.max(0, b.y0 - 2);
          const w = Math.min(crop.width, b.x1 + 2) - x, h = Math.min(crop.height, b.y1 + 2) - y;
          isolated.width = w + border * 2; isolated.height = h + border * 2;
          const context = isolated.getContext('2d')!;
          context.fillStyle = '#fff'; context.fillRect(0, 0, isolated.width, isolated.height);
          context.drawImage(crop, x, y, w, h, border, border, w, h);
          const confirmed = await ocr.recognize(isolated.toDataURL('image/png'));
          return { orderId: verifyFamilyMartId(identity.orderId, confirmed.data.text, confirmed.data.confidence),
            tracking: '', recipient: '', layout: 'familymart' as const, labelIndex: cell.labelIndex };
        } finally { isolated.width = isolated.height = 0; }
      } catch (error) {
        if (error instanceof InputError) throw new InputError(error.issues.map(s => `${where}：${s}`));
        throw new InputError([`${where}：本機辨識無法完成，請重新開啟工具並確認使用完整新版安裝檔。本批未產生標籤。`]);
      } finally { crop.width = crop.height = 0; }
    },
    async close() { if (worker) { await worker.terminate(); worker = undefined; } },
  };
}
