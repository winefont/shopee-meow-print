import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  const destination = path.join(dist, 'pdfjs', directory);
  await mkdir(destination, { recursive: true });
  await cp(path.join(root, 'node_modules', 'pdfjs-dist', directory), destination, { recursive: true });
}
async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(filename));
    else if (entry.name !== 'sw.js') result.push(filename);
  }
  return result;
}
const files = (await walk(dist)).sort();
const hash = createHash('sha256');
for (const filename of files) hash.update(path.relative(dist, filename)).update(await readFile(filename));
const version = hash.digest('hex').slice(0, 14);
const urls = ['./', ...files.map((filename) => './' + path.relative(dist, filename).replaceAll('\\', '/'))];
const worker = `
const CACHE_PREFIX = 'shopee-workbench-';
const CACHE = CACHE_PREFIX + ${JSON.stringify(version)};
const BASE = new URL('./', self.location.href);
const URLS = ${JSON.stringify(urls)}.map(path => new URL(path, BASE).href);
const ALLOWED = new Set(URLS);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(URLS.map(url => new Request(url, { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== BASE.origin) return;
  const canonical = url.origin + url.pathname;
  if (event.request.mode === 'navigate' && (url.pathname === BASE.pathname || url.pathname === BASE.pathname + 'index.html')) {
    event.respondWith(caches.open(CACHE).then(async cache =>
      await cache.match(new URL('index.html', BASE).href) || fetch(event.request)));
  } else if (ALLOWED.has(canonical)) {
    event.respondWith(caches.open(CACHE).then(async cache =>
      await cache.match(canonical) || fetch(event.request)));
  }
});
`;
await writeFile(path.join(dist, 'sw.js'), worker);
console.log(`Offline build ${version}: ${files.length} static files. No order files included.`);
