import './style.css';
import { parsePacking } from './packing';
import { matchOrders } from './matching';
import { readShipping, loadPdf, type pdfjs } from './source-pdf';
import { readCombinedBatch } from './combined-pdf';
import { pdfSelectionIssues } from './batch-files';
import { composePdf } from './compose';
import { InputError, type PageGroup } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar"><div class="brand"><img src="./icon.svg" alt="" width="38" height="38"><div><strong>蝦皮印單喵</strong><span>SHOPEE MEOW PRINT</span></div></div>
    <div class="top-actions"><span id="offline-status" class="status-pill">檔案只在本機處理</span><button id="install" class="quiet" hidden>安裝到桌面</button></div>
  </header>
  <main>
    <div class="heading"><div><p class="eyebrow">蝦皮出貨 · 100 × 150 mm</p><h1>多份 PDF，喵成一份出貨單。</h1><p class="intro">匯入一份或多份「寄件單+裝箱單」PDF，寄件、揀貨逐單配好。</p></div><div class="printer"><img class="paw-accent" src="./paw.svg" alt="" width="40" height="40"><div><strong>Xprinter XP-420B</strong><span>10 × 15 公分熱感紙</span></div></div></div>
    <ol class="steps" aria-label="出貨流程"><li class="active" id="step-1"><b>1</b> 匯入檔案</li><li id="step-2"><b>2</b> 確認配對</li><li id="step-3"><b>3</b> 下載列印</li></ol>
    <details class="download-help" open>
      <summary><img src="./paw.svg" alt="" width="22" height="22"> PDF 要去哪裡下載？</summary>
      <div class="help-content"><div><p class="help-route">蝦皮賣家中心 <b>→</b> 我的銷售 <b>→</b> 批次出貨 <b>→</b> 下載出貨文件</p>
      <ol><li>勾選這次要出貨的訂單，開啟「批次下載」。</li><li>選擇 <strong>「寄件單+裝箱單」</strong>，使用<strong>一般列印（A4）</strong>版型。</li><li>按「下載所選文件」，把不同物流的 <strong>一份或多份 PDF</strong> 一起拖到下方。</li></ol>
      <p class="help-note">依檔案清單順序合併，每筆仍是「寄件單 → 揀貨單」。支援 A4 左上角寄件單、下半部商品表；全家與 7-11 已做樣式與模擬 A4 測試，仍待原始 A4 實單驗證。</p></div>
      <div class="download-example" aria-label="蝦皮批次下載選擇示意"><strong>批次下載</strong><span>□ 揀貨單</span><span class="selected-document">☑ 寄件單+裝箱單</span><span>□ 寄件單</span><small>一般列印 · PDF</small><span class="example-button">下載所選文件</span><small>選項示意，以賣家中心實際畫面為準</small></div></div>
    </details>
    <div class="workspace">
      <aside>
        <section class="card input-card" aria-labelledby="input-title"><div class="section-title"><h2 id="input-title">準備這一批訂單</h2><span>01</span></div>
          <label class="mode-label" for="mode">匯入方式</label><select id="mode"><option value="single">PDF 批次匯入（推薦）</option><option value="legacy">PDF＋Excel（備用）</option></select>
          <div class="file-zone" id="pdf-zone"><div class="file-top"><span class="file-icon">PDF</span><div><h3 id="pdf-label">寄件單+裝箱單</h3><p id="pdf-hint">一般列印 A4 · 可一次選多份 PDF</p></div><span id="pdf-check" class="file-check"></span></div>
            <input id="pdf-input" type="file" accept=".pdf,application/pdf" multiple aria-label="選擇寄件單加裝箱單 PDF">
            <label for="pdf-input" class="file-button">選擇 PDF 檔案</label><p class="file-detail" id="pdf-detail">或將檔案拖放到這裡</p>
            <ol id="pdf-files" class="selected-files" aria-label="PDF 合併順序"></ol>
          </div>
          <div id="legacy-fields" hidden><div class="file-zone" id="xlsx-zone"><div class="file-top"><span class="file-icon excel">XLSX</span><div><h3>裝箱單</h3><p>同一批訂單的裝箱單.xlsx</p></div><span id="xlsx-check" class="file-check"></span></div>
            <input id="xlsx-input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="選擇裝箱單 Excel">
            <label for="xlsx-input" class="file-button">選擇 Excel 檔案</label><p class="file-detail" id="xlsx-detail">或將檔案拖放到這裡</p>
          </div>
          </div>
          <button id="generate" class="primary full" disabled>產生出貨標籤 <span aria-hidden="true">→</span></button>
          <div class="input-bottom"><span>依訂單編號與物流編號核對</span><button id="clear" class="text-button">清除本批</button></div>
          <p id="progress" class="progress" role="status" aria-live="polite"></p>
          <div id="errors" class="notice error" role="alert" hidden></div>
        </section>
        <section class="print-card"><h2>第一次測印</h2><dl><div><dt>紙張</dt><dd>100 × 150 mm 或 4 × 6 吋</dd></div><div><dt>縮放</dt><dd>實際大小 / 100%</dd></div><div><dt>列印</dt><dd>每張紙 1 頁、單面</dd></div></dl><p>依實際耗材選紙張，PDF 列印視窗與驅動需一致。4 × 6 吋是 101.6 × 152.4 mm，可用 100% 列印本工具的 100 × 150 mm PDF。先印一組，確認條碼與四邊完整。</p></section>
        <p class="privacy-note">檔案在瀏覽器內解析。訂單不會上傳；清除本批或關閉工具後，不保留匯入資料。</p>
      </aside>
      <section class="card result-card" aria-labelledby="result-title"><div class="section-title"><h2 id="result-title">列印前確認</h2><span>02</span></div>
        <div id="empty-state" class="empty-state"><div class="sample-pair" aria-hidden="true"><div class="sample-label"><span>寄件單</span><i class="barcode"></i><i></i><i></i><b>01-1</b></div><div class="sample-label picking"><span>揀貨單</span><i></i><i></i><div class="sample-qty">× 2</div><b>01-2</b></div></div><h3>一張寄件，一張揀貨。</h3><p>配對後會在這裡顯示真實標籤。<br>同一筆訂單連續排列，拿起一組就能揀貨。</p><span class="support-note">店到店、新竹已驗證。全家、7-11 已做模擬 A4 測試，仍待原始實單驗證；長明細自動續頁。</span></div>
        <div id="result" hidden>
          <div class="stats"><div><span>已配對訂單</span><strong id="order-count">0</strong></div><div><span>列印頁數</span><strong id="page-count">0</strong></div><div><span>商品總件數</span><strong id="quantity-count">0</strong></div></div>
          <div id="warnings" class="notice warning" role="status" hidden></div>
          <div class="preview-heading"><div><strong id="preview-title"></strong><span id="preview-order"></span></div><div class="preview-nav"><button id="previous" class="square" aria-label="上一筆訂單">←</button><button id="next" class="square" aria-label="下一筆訂單">→</button></div></div>
          <div id="preview" class="preview-grid" aria-label="PDF 標籤預覽"></div>
          <p class="preview-caption">預覽為 100 × 150 mm，保留約 2.5 mm 邊界。寄件單等比例放大；方形原單仍會有上下留白。揀貨單採黑框表格，列出收件人、訂單編號與商品；收件人無法可靠讀取時，請看同組寄件單。</p>
          <div class="download-bar"><a id="download" class="primary" download="合成結果.pdf">下載合成結果.pdf <span aria-hidden="true">↓</span></a><a id="open-pdf" class="secondary" target="_blank" rel="noopener">開啟 PDF／列印 ↗</a></div>
          <details class="order-details"><summary>查看本批訂單與貨號</summary><div class="table-scroll"><table><thead><tr><th>順序 / 訂單</th><th>貨號與規格</th><th class="number">數量</th></tr></thead><tbody id="order-rows"></tbody></table></div></details>
        </div>
      </section>
    </div>
    <footer class="page-footer"><span>蝦皮印單喵 v0.6.0 · 純前端處理</span><span>獨立工具，非蝦皮官方產品 · 原始檔不會被修改</span></footer>
  </main>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
let importMode: 'single' | 'legacy' = 'single';
let shippingFiles: File[] = [];
let packingFile: File | undefined;
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
  $<HTMLButtonElement>('generate').disabled = busy || !shippingFiles.length || (importMode === 'legacy' && !packingFile);
  $<HTMLButtonElement>('clear').disabled = busy;
  $<HTMLSelectElement>('mode').disabled = busy;
  for (const kind of ['pdf', 'xlsx']) $<HTMLInputElement>(`${kind}-input`).disabled = busy;
  renderFileList();
  $('generate').innerHTML = busy ? '<span class="spinner"></span> 正在配對與排版…' : '產生出貨標籤 <span aria-hidden="true">→</span>';
}
function renderFileList() {
  $('pdf-files').innerHTML = shippingFiles.map((file, index) => `<li><span class="selected-file-name">${index + 1}. ${escape(file.name)}<small>${(file.size / 1024).toFixed(0)} KB</small></span><span class="file-actions"><button type="button" data-file-action="up" data-index="${index}" aria-label="上移第 ${index + 1} 份 PDF" ${busy || index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-file-action="down" data-index="${index}" aria-label="下移第 ${index + 1} 份 PDF" ${busy || index === shippingFiles.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-file-action="remove" data-index="${index}" aria-label="移除第 ${index + 1} 份 PDF" ${busy ? 'disabled' : ''}>×</button></span></li>`).join('');
  $('pdf-detail').textContent = importMode === 'legacy'
    ? shippingFiles.length ? '已選擇一份寄件單 PDF' : '選擇或拖入一份寄件單 PDF · 最多 30 MB'
    : shippingFiles.length ? `${shippingFiles.length} 份 PDF · 依清單順序合併，可繼續加入` : '可多選或拖入多份 PDF · 單檔 30 MB／整批 100 MB／最多 20 份、500 頁';
  $('pdf-check').textContent = shippingFiles.length ? '✓' : '';
  $('pdf-zone').classList.toggle('selected', Boolean(shippingFiles.length));
}
function choosePdfs(files: File[]) {
  if (busy || !files.length) return;
  resetResults();
  const proposed = importMode === 'legacy' ? files : [...shippingFiles, ...files];
  const issues = pdfSelectionIssues(proposed, importMode === 'legacy');
  if (issues.length) showIssues('errors', issues);
  else shippingFiles = proposed;
  $<HTMLInputElement>('pdf-input').value = '';
  updateControls();
}
$('pdf-files').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-file-action]');
  if (busy || !button || button.disabled) return;
  const index = Number(button.dataset.index);
  if (button.dataset.fileAction === 'remove') shippingFiles.splice(index, 1);
  else {
    const other = index + (button.dataset.fileAction === 'up' ? -1 : 1);
    [shippingFiles[index], shippingFiles[other]] = [shippingFiles[other], shippingFiles[index]];
  }
  resetResults(); updateControls();
});
function choosePacking(file?: File) {
  if (busy) return;
  resetResults();
  const valid = file && file.name.toLowerCase().endsWith('.xlsx') && file.size > 0 && file.size <= 30 * 1024 * 1024;
  if (!valid) {
    packingFile = undefined;
    if (file) showIssues('errors', ['請選擇有效的 .xlsx 檔案，單檔大小最多 30 MB。']);
    $<HTMLInputElement>('xlsx-input').value = '';
  } else packingFile = file;
  $('xlsx-detail').textContent = valid ? `${file!.name} · ${(file!.size / 1024).toFixed(0)} KB` : '或將檔案拖放到這裡';
  $('xlsx-check').textContent = valid ? '✓' : '';
  $('xlsx-zone').classList.toggle('selected', Boolean(valid));
  updateControls();
}
for (const kind of ['pdf', 'xlsx'] as const) {
  const input = $<HTMLInputElement>(`${kind}-input`);
  input.addEventListener('change', () => kind === 'pdf' ? choosePdfs(Array.from(input.files ?? [])) : choosePacking(input.files?.[0]));
  const zone = $(`${kind}-zone`);
  zone.addEventListener('dragover', (event) => { event.preventDefault(); if (!busy) zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', (event) => {
    event.preventDefault(); zone.classList.remove('dragging');
    if (busy) return;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (kind === 'pdf') choosePdfs(files);
    else if (files.length === 1) choosePacking(files[0]);
    else { resetResults(); showIssues('errors', ['Excel 區域請放入一個裝箱單檔案。']); }
  });
}
$('mode').addEventListener('change', () => {
  if (busy) return;
  importMode = $<HTMLSelectElement>('mode').value === 'legacy' ? 'legacy' : 'single';
  $('legacy-fields').hidden = importMode === 'single';
  $('pdf-label').textContent = importMode === 'single' ? '寄件單+裝箱單' : '寄件單';
  $('pdf-hint').textContent = importMode === 'single' ? '一般列印 A4 · 可一次選多份 PDF' : '原本每頁一張的寄件單 PDF（僅一份）';
  $<HTMLInputElement>('pdf-input').multiple = importMode === 'single';
  $<HTMLInputElement>('pdf-input').setAttribute('aria-label', importMode === 'single' ? '選擇寄件單加裝箱單 PDF' : '選擇寄件單 PDF');
  clearFiles();
});
function clearFiles() {
  shippingFiles = [];
  for (const kind of ['pdf', 'xlsx']) $<HTMLInputElement>(`${kind}-input`).value = '';
  choosePacking();
}
$('clear').addEventListener('click', () => {
  if (busy) return;
  clearFiles();
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
  if (busy || !shippingFiles.length || (importMode === 'legacy' && !packingFile)) return;
  resetResults();
  busy = true; updateControls();
  try {
    const reportProgress = (message: string) => $('progress').textContent = message;
    let shipping: Uint8Array, pairs;
    if (importMode === 'single') {
      const batch = await readCombinedBatch(shippingFiles, reportProgress);
      shipping = batch.bytes; pairs = batch.pairs;
    } else {
      shipping = new Uint8Array(await shippingFiles[0].arrayBuffer());
      pairs = matchOrders(parsePacking(new Uint8Array(await packingFile!.arrayBuffer())), await readShipping(shipping, reportProgress));
    }
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
    showIssues('warnings', importMode === 'single' ? [...result.warnings, '只列印 PDF 已有的內容；PDF 未列出的賣家備註不會加入。'] : result.warnings);
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
