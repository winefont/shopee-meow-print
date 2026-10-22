declare module 'fontkit' {
  export const create: Parameters<import('pdf-lib').PDFDocument['registerFontkit']>[0]['create'];
}
