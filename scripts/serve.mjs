import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, stat, realpath, mkdir, writeFile, unlink } from 'node:fs/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const portArgument = process.argv.indexOf('--port');
const port = portArgument >= 0 ? Number(process.argv[portArgument + 1]) : 53178;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
await stat(path.join(dist, 'index.html'));
const appId = 'shipping-workbench';
const metadata = { appId, pid: process.pid, port, root, executable: process.execPath, purpose: 'Local static PWA for shipping labels', startedAt: new Date().toISOString() };
const runtime = path.join(root, '.runtime');
const marker = path.join(runtime, 'server.json');
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.otf': 'font/otf', '.ttf': 'font/ttf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8',
};
const server = http.createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cache-Control', 'no-cache');
  if (!['GET', 'HEAD'].includes(request.method ?? '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return;
  }
  try {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    if (url.pathname === '/__health') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(request.method === 'HEAD' ? '' : JSON.stringify(metadata));
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const candidate = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!candidate.startsWith(dist + path.sep)) { response.writeHead(403).end(); return; }
    const filename = await realpath(candidate);
    if (!filename.startsWith(dist + path.sep) || !(await stat(filename)).isFile()) { response.writeHead(403).end(); return; }
    const type = contentTypes[path.extname(filename).toLowerCase()] ||
      (/^LICENSE(?:_|$)/.test(path.basename(filename)) ? 'text/plain; charset=utf-8' : undefined);
    if (!type) { response.writeHead(404).end(); return; }
    const bytes = await readFile(filename);
    response.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch { response.writeHead(404).end('Not found'); }
});
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', async () => {
  await mkdir(runtime, { recursive: true });
  await writeFile(marker, JSON.stringify(metadata, null, 2));
  console.log(`${appId} http://127.0.0.1:${port} PID=${process.pid}`);
});
async function stop() {
  server.close();
  try {
    const current = JSON.parse(await readFile(marker, 'utf8'));
    if (current.pid === process.pid) await unlink(marker);
  } catch {}
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
