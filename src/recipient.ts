type PositionedText = { str: string; x: number; y: number; width: number; height: number };

/** Read an explicitly labelled name only. Never infer it from an address or OCR. */
export function readRecipient(runs: readonly PositionedText[]): string {
  const lines: PositionedText[][] = [];
  for (const run of [...runs].sort((a, b) => b.y - a.y || a.x - b.x)) {
    if (!run.str.trim()) continue;
    // Carrier labels often vertically center a larger name next to a smaller
    // field label, so their PDF baselines differ despite sharing one visual row.
    let line = lines.find(items => Math.abs(items[0].y - run.y) < 2 ||
      Math.abs(items[0].y + items[0].height / 2 - run.y - run.height / 2) <
        Math.max(2, Math.min(items[0].height, run.height) * 0.35));
    if (!line) { line = []; lines.push(line); }
    line.push(run);
  }
  const candidates = new Set<string>();
  for (const line of lines) {
    let text = '', end = -Infinity;
    for (const run of line.sort((a, b) => a.x - b.x)) {
      if (text && run.x - end > Math.max(12, run.height * 1.5)) text += '  ';
      text += run.str.normalize('NFKC');
      end = run.x + run.width;
    }
    // Some carrier PDFs encode their colon as U+00FF; accept it only here.
    for (const match of text.matchAll(/(?:收件人|收貨人|取件人)(?:姓名)?\s*[:：ÿ]?\s*([^\r\n]+)/g)) {
      const name = match[1].split(/\s{2,}|(?:電話|手機|地址|寄件人|寄件者|物流商|取件門市|收件門市|門市|訂單編號|收件電話)\s*[:：ÿ]?|\d{3}/)[0].trim();
      if (name.length >= 2 && name.length <= 36 && /^[\p{L}\p{M}*＊○●•·.．\- ]+$/u.test(name) && !/[ÿ�]/.test(name)) {
        candidates.add(name);
      }
    }
  }
  // Ambiguous/bitmap/unlabelled names stay visibly unresolved on the picking slip.
  return candidates.size === 1 ? [...candidates][0] : '';
}
