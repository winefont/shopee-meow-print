import { mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../vendor/fonts/', import.meta.url);
await mkdir(root, { recursive: true });
for (const [name, url] of [
  ['NotoSansTC-Variable.ttf', 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf'],
  ['OFL.txt', 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanstc/OFL.txt'],
]) {
  const path = new URL(name, root);
  try { await access(path); continue; } catch {}
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${name}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (name.endsWith('.ttf') && Buffer.from(bytes.subarray(0, 4)).readUInt32BE() !== 0x00010000) throw new Error('Unexpected font data');
  await writeFile(path, bytes);
  console.log(`${fileURLToPath(path)} (${bytes.length} bytes)`);
}
