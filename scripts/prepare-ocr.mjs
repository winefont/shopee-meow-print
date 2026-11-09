import { cp, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
// Bundle every OCR runtime/model locally; importing order data never uses a CDN.
const ocr = path.join(root, 'public', 'ocr');
await mkdir(path.join(ocr, 'core'), { recursive: true });
await mkdir(path.join(ocr, 'lang'), { recursive: true });
await cp(path.join(root, 'node_modules/tesseract.js/dist/worker.min.js'), path.join(ocr, 'worker.min.js'));
for (const name of await readdir(path.join(root, 'node_modules/tesseract.js-core'))) {
  if (name.endsWith('.wasm.js') || name.endsWith('.wasm')) await cp(path.join(root, 'node_modules/tesseract.js-core', name), path.join(ocr, 'core', name));
}
await cp(path.join(root, 'node_modules/@tesseract.js-data/chi_tra/4.0.0_best_int/chi_tra.traineddata.gz'), path.join(ocr, 'lang/chi_tra.traineddata.gz'));
await writeFile(path.join(ocr, 'NOTICE.txt'), 'OCR: Tesseract.js 7.0.0 and Tesseract.js-core 7.0.0 (Apache-2.0).\nTraditional Chinese model: @tesseract.js-data/chi_tra 1.0.0, 4.0.0_best_int, from https://github.com/naptha/tessdata (package license: MIT).\nUpstream Tesseract trained data: https://github.com/tesseract-ocr/tessdata (Apache-2.0).\nAll inference runs locally; no orders are sent to these projects.\n');
