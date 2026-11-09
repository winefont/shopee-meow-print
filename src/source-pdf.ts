import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

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
