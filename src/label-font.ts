import * as fontkit from 'fontkit';
import type { PDFDocument } from 'pdf-lib';

type Fontkit = Parameters<PDFDocument['registerFontkit']>[0];

// Identifiers must keep their literal glyphs. Noto's Latin shaping can replace
// digits with alternate glyphs that pdf-lib cannot map back consistently.
// These Traditional Chinese / Latin labels use horizontal, one-character glyphs.
export const labelFontkit: Fontkit = {
  create(bytes) {
    const font = fontkit.create(bytes);
    font.layout = (text) => {
      const glyphs = [...text].map((char) => font.glyphForCodePoint(char.codePointAt(0)!));
      let advanceWidth = 0;
      let minX = 0, minY = 0, maxX = 0, maxY = 0;
      const positions = glyphs.map((glyph) => {
        minX = Math.min(minX, advanceWidth + glyph.bbox.minX);
        maxX = Math.max(maxX, advanceWidth + glyph.bbox.maxX);
        minY = Math.min(minY, glyph.bbox.minY);
        maxY = Math.max(maxY, glyph.bbox.maxY);
        advanceWidth += glyph.advanceWidth;
        return { xAdvance: glyph.advanceWidth, yAdvance: 0, xOffset: 0, yOffset: 0 };
      });
      return {
        glyphs, positions, script: 'hani', language: 'zh-Hant', direction: 'ltr',
        features: {}, advanceWidth, advanceHeight: 0,
        bbox: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
      };
    };
    return font;
  },
};
