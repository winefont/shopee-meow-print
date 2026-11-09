import './style.css';
import { loadPdf, type pdfjs } from './source-pdf';
import { readCombinedBatch } from './combined-pdf';
import { pdfSelectionIssues } from './batch-files';
import { composePdf } from './compose';
import { InputError, type PageGroup } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar"><div class="brand"><img src="./icon-192.png" alt="" width="54" height="54"><div><strong>蝦皮印單喵</strong><span>SHOPEE MEOW PRINT</span></div></div>
    <div class="top-actions"><a class="help-button" href="./help.html" target="_blank" rel="noopener" aria-label="使用說明（另開分頁）"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v15M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1Z"/></svg>使用說明</a></div>
  </header>
  <main>
    <div class="heading"><div><p class="eyebrow">蝦皮出貨 · 100 × 150 mm</p><h1>多份 PDF，喵成一份出貨單。</h1></div><div class="printer"><img class="paw-accent" src="./paw-mascot.png" alt="" width="72" height="72"><div><strong>Xprinter XP-420B</strong><span>10 × 15 公分熱感紙</span></div></div></div>
    <ol class="steps" aria-label="出貨流程"><li class="active" id="step-1"><b>1</b> 匯入檔案</li><li id="step-2"><b>2</b> 確認配對</li><li id="step-3"><b>3</b> 下載列印</li></ol>
    <div class="workspace">
      <aside>
        <section class="card input-card" aria-labelledby="input-title"><div class="section-title"><h2 id="input-title">準備這一批訂單</h2><span>01</span></div>
          <div class="file-zone" id="pdf-zone"><div class="file-top"><span class="file-icon">PDF</span><div><h3 id="pdf-label">出貨文件 PDF</h3><p id="pdf-hint">可一次選擇多份 PDF</p></div><span id="pdf-check" class="file-check"></span></div>
            <input id="pdf-input" type="file" accept=".pdf,application/pdf" multiple aria-label="選擇出貨文件 PDF">
            <label for="pdf-input" class="file-button">選擇 PDF 檔案</label><p class="file-detail" id="pdf-detail">或將檔案拖放到這裡</p>
            <ol id="pdf-files" class="selected-files" aria-label="PDF 合併順序"></ol>
          </div>
          <button id="generate" class="primary full" disabled>產生出貨標籤 <span aria-hidden="true">→</span></button>
          <div class="input-bottom"><button id="clear" class="text-button">清除本批</button></div>
          <p id="progress" class="progress" role="status" aria-live="polite"></p>
          <div id="errors" class="notice error" role="alert" hidden></div>
        </section>
      </aside>
      <section class="card result-card" aria-labelledby="result-title"><div class="section-title"><h2 id="result-title">列印前確認</h2><span>02</span></div>
        <div id="empty-state" class="empty-state"><div class="empty-mascot" aria-hidden="true"><img src="./paw-mascot.png" alt="" width="196" height="196"><span>準備好幫你印單囉</span></div><h3>匯入 PDF，開始準備出貨。</h3></div>
        <div id="result" hidden>
          <div class="stats"><div><span>已配對訂單</span><strong id="order-count">0</strong></div><div><span>列印頁數</span><strong id="page-count">0</strong></div><div><span>商品總件數</span><strong id="quantity-count">0</strong></div></div>
          <div id="warnings" class="notice warning" role="status" hidden></div>
          <div class="preview-heading"><div><strong id="preview-title"></strong><span id="preview-order"></span></div><div class="preview-nav"><button id="previous" class="square" aria-label="上一筆訂單">←</button><button id="next" class="square" aria-label="下一筆訂單">→</button></div></div>
          <div id="preview" class="preview-grid" aria-label="PDF 標籤預覽"></div>
          <div class="download-bar"><a id="download" class="primary" download="合成結果.pdf">下載合成結果.pdf <span aria-hidden="true">↓</span></a><a id="open-pdf" class="secondary" target="_blank" rel="noopener">開啟 PDF／列印 ↗</a></div>
          <details class="order-details"><summary>查看本批訂單與貨號</summary><div class="table-scroll"><table><thead><tr><th>順序 / 訂單</th><th>貨號與規格</th><th class="number">數量</th></tr></thead><tbody id="order-rows"></tbody></table></div></details>
        </div>
      </section>
    </div>
    <footer class="page-footer"><span>蝦皮印單喵 v0.8.1</span><div class="footer-actions"><span id="offline-status" class="status-pill">本機處理</span><button id="install" class="quiet" hidden>安裝到桌面</button></div></footer>
  </main>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
let pdfFiles: File[] = [];
let busy = false;
let outputUrl = '';
let previewDocument: pdfjs.PDFDocumentProxy | undefined;
let previewTask: pdfjs.PDFDocumentLoadingTask | undefined;
let groups: PageGroup[] = [];
let selectedGroup = 0;
let previewVersion = 0;

function showIssues(id: string, messages: string[]) {
  const target = $(id);
  target.hidden = !messages.length;
  target.innerHTML = messages.length ? `<strong>${id === 'errors' ? '請先處理以下問題' : '列印時請注意'}</strong><ul>${messages.map((message) => `<li>${escape(message)}</li>`).join('')}</ul>` : '';
}
function resetResults() {
  previewVersion++;
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl = '';
  if (previewTask) void previewTask.destroy();
  previewTask = undefined;
  previewDocument = undefined;
  groups = [];
  $('result').hidden = true;
  $('empty-state').hidden = false;
  $('preview').replaceChildren();
  $('order-rows').replaceChildren();
  $('download').removeAttribute('href');
  $('open-pdf').removeAttribute('href');
  showIssues('errors', []);
  showIssues('warnings', []);
  $('progress').textContent = '';
  $('step-2').classList.remove('active');
  $('step-3').classList.remove('active');
}
function updateControls() {
  $<HTMLButtonElement>('generate').disabled = busy || !pdfFiles.length;
  $<HTMLButtonElement>('clear').disabled = busy;
  $<HTMLInputElement>('pdf-input').disabled = busy;
  renderFileList();
  $('generate').innerHTML = busy ? '<span class="spinner"></span> 正在配對與排版…' : '產生出貨標籤 <span aria-hidden="true">→</span>';
}
function renderFileList() {
  $('pdf-files').innerHTML = pdfFiles.map((file, index) => `<li><span class="selected-file-name">${index + 1}. ${escape(file.name)}<small>${(file.size / 1024).toFixed(0)} KB</small></span><span class="file-actions"><button type="button" data-file-action="up" data-index="${index}" aria-label="上移第 ${index + 1} 份 PDF" ${busy || index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-file-action="down" data-index="${index}" aria-label="下移第 ${index + 1} 份 PDF" ${busy || index === pdfFiles.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-file-action="remove" data-index="${index}" aria-label="移除第 ${index + 1} 份 PDF" ${busy ? 'disabled' : ''}>×</button></span></li>`).join('');
  $('pdf-detail').textContent = pdfFiles.length ? `已選 ${pdfFiles.length} 份 PDF` : '或將檔案拖放到這裡';
  $('pdf-check').textContent = pdfFiles.length ? '✓' : '';
  $('pdf-zone').classList.toggle('selected', Boolean(pdfFiles.length));
}
function choosePdfs(files: File[]) {
  if (busy || !files.length) return;
  resetResults();
  const proposed = [...pdfFiles, ...files];
  const issues = pdfSelectionIssues(proposed);
  if (issues.length) showIssues('errors', issues);
  else pdfFiles = proposed;
  $<HTMLInputElement>('pdf-input').value = '';
  updateControls();
}
$('pdf-files').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-file-action]');
  if (busy || !button || button.disabled) return;
  const index = Number(button.dataset.index);
  if (button.dataset.fileAction === 'remove') pdfFiles.splice(index, 1);
  else {
    const other = index + (button.dataset.fileAction === 'up' ? -1 : 1);
    [pdfFiles[index], pdfFiles[other]] = [pdfFiles[other], pdfFiles[index]];
  }
  resetResults(); updateControls();
});
const pdfInput = $<HTMLInputElement>('pdf-input');
pdfInput.addEventListener('change', () => choosePdfs(Array.from(pdfInput.files ?? [])));
const pdfZone = $('pdf-zone');
pdfZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (!busy) pdfZone.classList.add('dragging');
});
pdfZone.addEventListener('dragleave', () => pdfZone.classList.remove('dragging'));
pdfZone.addEventListener('drop', (event) => {
  event.preventDefault();
  pdfZone.classList.remove('dragging');
  if (!busy) choosePdfs(Array.from(event.dataTransfer?.files ?? []));
});
$('clear').addEventListener('click', () => {
  if (busy) return;
  pdfFiles = [];
  pdfInput.value = '';
  resetResults();
  updateControls();
});

async function renderGroup(index: number) {
  const version = ++previewVersion;
  if (!previewDocument || !groups[index]) return;
  selectedGroup = index;
  const group = groups[index];
  $('preview-title').textContent = `第 ${index + 1} / ${groups.length} 筆訂單`;
  $('preview-order').textContent = group.orderId;
  $<HTMLButtonElement>('previous').disabled = index === 0;
  $<HTMLButtonElement>('next').disabled = index === groups.length - 1;
  $('preview').replaceChildren();
  for (const [i, pageIndex] of group.pages.entries()) {
    if (version !== previewVersion || !previewDocument) return;
    const figure = document.createElement('figure');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', `${group.orderId} ${i ? '揀貨單' : '寄件單'}`);
    const caption = document.createElement('figcaption');
    caption.textContent = `${String(index + 1).padStart(2, '0')}-${i + 1}　${i ? i > 1 ? '揀貨單（續）' : '揀貨單' : '寄件單'}`;
    figure.append(canvas, caption);
    $('preview').append(figure);
    const page = await previewDocument.getPage(pageIndex + 1);
    if (version !== previewVersion) return;
    const viewport = page.getViewport({ scale: 1.6 });
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d')!, canvas, viewport, background: '#fff' }).promise;
    page.cleanup();
  }
}
$('previous').addEventListener('click', () => void renderGroup(selectedGroup - 1).catch(handlePreviewError));
$('next').addEventListener('click', () => void renderGroup(selectedGroup + 1).catch(handlePreviewError));
function handlePreviewError() {
  if (outputUrl) showIssues('warnings', ['預覽暫時無法顯示，請使用「開啟 PDF／列印」檢查結果。']);
}

$('generate').addEventListener('click', async () => {
  if (busy || !pdfFiles.length) return;
  resetResults();
  busy = true; updateControls();
  try {
    const reportProgress = (message: string) => $('progress').textContent = message;
    const { bytes: shipping, pairs } = await readCombinedBatch(pdfFiles, reportProgress);
    $('step-2').classList.add('active');
    $('progress').textContent = '訂單已核對，正在產生中文揀貨單…';
    const response = await fetch(`${import.meta.env.BASE_URL}fonts/NotoSansTC-Regular.ttf`);
    if (!response.ok) throw new Error('font');
    const result = await composePdf(shipping, pairs, new Uint8Array(await response.arrayBuffer()));
    outputUrl = URL.createObjectURL(new Blob([new Uint8Array(result.bytes).buffer], { type: 'application/pdf' }));
    $<HTMLAnchorElement>('download').href = outputUrl;
    $<HTMLAnchorElement>('open-pdf').href = outputUrl;
    groups = result.groups;
    $('order-count').textContent = String(pairs.length);
    $('page-count').textContent = String(result.pageCount);
    $('quantity-count').textContent = String(groups.reduce((sum, group) => sum + group.quantity, 0));
    showIssues('warnings', result.warnings);
    $('order-rows').innerHTML = pairs.map(({ order }, index) => order.products.map((product, i) => `<tr><td>${i === 0 ? `<small>${String(index + 1).padStart(2, '0')}</small><span class="order-id">${escape(order.id)}</span>` : ''}</td><td><strong>${escape(product.sku || '未提供貨號')}</strong><span>${escape(product.variant || product.name)}</span></td><td class="number">${product.quantity}</td></tr>`).join('')).join('');
    $('result').hidden = false; $('empty-state').hidden = true;
    $('step-3').classList.add('active');
    $('progress').textContent = `完成：${pairs.length} 筆訂單、${result.pageCount} 頁。請先核對預覽再列印。`;
    try {
      previewTask = loadPdf(result.bytes);
      previewDocument = await previewTask.promise;
      await renderGroup(0);
    } catch { handlePreviewError(); }
  } catch (error) {
    resetResults();
    showIssues('errors', error instanceof InputError ? error.issues : ['檔案處理未完成。請重新選取檔案；若仍失敗，請保留原始檔供檢查。']);
    // Avoid writing customer identifiers or file contents to diagnostic logs.
    console.error('Batch conversion failed', error instanceof InputError ? error.name : error instanceof Error ? error.message : 'unknown');
  } finally { busy = false; updateControls(); }
});

updateControls();
let installPrompt: (Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }) | undefined;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); installPrompt = event as typeof installPrompt;
  $('install').hidden = false;
});
$('install').addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = undefined; $('install').hidden = true;
});
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then(async () => {
    await navigator.serviceWorker.ready;
    $('offline-status').textContent = '已備妥離線使用';
    $('offline-status').classList.add('ready');
  }).catch(() => { $('offline-status').textContent = '本機處理 · 離線快取未完成'; });
}
