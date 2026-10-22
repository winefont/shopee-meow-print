import type { FontWidths } from './combined-layout';

export function collectFontWidths(operators: { fnArray: number[]; argsArray: any[] }, ops: { save: number; restore: number; setFont: number; showText: number }): FontWidths {
  const widths: FontWidths = new Map();
  let font = '';
  const stack: string[] = [];
  for (let i = 0; i < operators.fnArray.length; i++) {
    const op = operators.fnArray[i], args = operators.argsArray[i];
    if (op === ops.save) stack.push(font);
    if (op === ops.restore) font = stack.pop() ?? font;
    if (op === ops.setFont) font = args[0];
    if (op !== ops.showText || !font) continue;
    if (!widths.has(font)) widths.set(font, new Map());
    for (const glyph of args[0]) {
      if (typeof glyph !== 'object' || !glyph?.unicode || !Number.isFinite(glyph.width)) continue;
      const chars = [...glyph.unicode] as string[];
      for (const char of chars) widths.get(font)!.set(char, glyph.width / chars.length);
    }
    if (!widths.get(font)!.has(' ')) widths.get(font)!.set(' ', 278);
  }
  return widths;
}
