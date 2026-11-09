# 蝦皮印單喵 · Shopee Meow Print

將蝦皮的 **「寄件單+裝箱單」PDF**，以及 **7-11／全家分開下載的寄件單 PDF、裝箱單 PDF**，混合轉成連續排列的「寄件單、揀貨單」，以 **100 × 150 mm** 熱感紙列印。純前端 PWA，訂單只在本機瀏覽器處理，不上傳、不需要蝦皮帳號或 API 金鑰。本工具為獨立開發，非蝦皮官方產品。

## 使用方式

1. 在 Windows 10／11 64 位元執行 `ShopeeMeowPrint-Setup-0.8.1-Windows-x64.exe`，會建立貓掌圖示的「蝦皮印單喵」桌面捷徑。
2. 蝦皮賣家中心 → **我的銷售 → 批次出貨 → 下載出貨文件**。
3. 可合併下載的物流選 **寄件單+裝箱單 → 一般列印（A4）→ 下載所選文件**。7-11／全家若只能分開下載，請同時下載 **寄件單 PDF** 與 **裝箱單 PDF**。
4. 按「選擇 PDF 檔案」把上述 PDF 全部一起選入或拖入，不必先手動合併；可繼續加入、排序或移除，再按「產生出貨標籤」。程式依訂單編號配對，以寄件單出現順序輸出。裝箱單可放在寄件單之前或之後，檔名不影響配對。
5. 核對訂單、商品、貨號、規格、數量與預覽，下載 `合成結果.pdf`。
6. 列印設定：**依耗材選 100 × 150 mm 或 4 × 6 吋、直式、實際大小 100%、單面、原始頁序**。先試印一筆再印整批。

寄件單等比例放大至可列印範圍、靠上排列，保留約 2.5 mm 邊界；方形原單仍會保留上下空白。揀貨單採黑框表格，僅列收件人、訂單編號、商品名稱、規格／貨號、數量及備註；不含金額、折扣、運費、電話、店名或新加的訂單條碼。少量商品不放大字體。一般長度的五種商品可放在一張揀貨單；長明細和備註會續頁，不省略文字。4 × 6 吋為 101.6 × 152.4 mm，可在這種耗材上以 100% 列印 100 × 150 mm PDF；PDF 列印視窗與驅動請選相同紙張。按 XP-420B 需求設計，紙張進紙、濃度及實機掃描仍需自行試印。

主畫面只保留匯入、配對與預覽下載；下載步驟、物流規則、列印設定與資料保存說明集中在右上角「使用說明」。說明另開本機分頁，不會清除本批檔案或結果，完成離線快取後也可使用。說明來源為 `installer/public-guide.html`，開發／建置時自動複製到 `public/help.html`。

## 支援範圍

- 已驗證蝦皮店到店「標準配送／門市交寄」及新竹貨運，每頁一筆、一般列印 A4 的「寄件單+裝箱單」。
- 已驗證 7-11 的原始 A4 獨立寄件單與獨立裝箱單：寄件單含唯一蝦皮訂單編號與交貨便服務代碼，裝箱單在頁首含商品表。支援與店到店、新竹合併檔混用；不以選檔順序、檔名或收件人猜配對。
- 全家原始四格（2×2）A4 圖片寄件單＋裝箱單 PDF：用隨附的本機 OCR 辨識「蝦皮訂單編號」欄位，兩次一致後才按完整編號配對；不猜字、不按物流編號或裝箱單順序配對。依左上、右上、左下、右下輸出，完全空白格略過；任何非空格辨識失敗都停止整批。已驗證一筆實單，四格、多頁與混合物流以合成資料回歸測試；首次仍需試印。
- 原始寄件單的文字、向量與圖片按原比例嵌入，不重畫條碼或收件資訊。自動排除裝箱單標題及跨頁寬度的分隔線。
- 收件人僅讀取寄件區明確標示的「收件人／取件人／收貨人」文字。圖片、未標欄名或文字不確定時顯示「請見寄件單」並提醒，不 OCR 猜名。物流編號保留於原寄件單，仍用於內部配對；缺少可讀欄位時依同頁唯一訂單編號配對。
- 依字元位置擷取商品欄位，處理 PDF 文字合併跨欄及貨號換行。
- 單檔最多 30 MB、整批最多 100 MB、20 份 PDF、合計 500 頁。
- 跨檔案檢查重複寄件單、重複裝箱單與已辨識的物流編號；缺少任一對應文件、編號衝突或任一檔案有錯時整批停止，不默默漏單。補齊或移除重複文件後可重試，舊的下載連結會先清除。
- 除已驗證的全家原始四格圖片 PDF 外，不支援整頁掃描圖、旋轉頁、跨頁商品表、同單拆包裹或位置不同的版型。商品表必須有可讀文字；寄件區可以是原始圖片。無法可靠解析時停止產生本批標籤。
- 未列在 PDF 的賣家備註不會加入；僅支援 PDF 出貨文件。

## 安裝、更新與隱私

安裝器包含 Windows x64 Node runtime、程式庫、中文字型與全家本機辨識模型，不需另裝 Node.js、Python 或 Docker。印表機驅動需自行安裝。

安裝位置 `%LOCALAPPDATA%\ShippingWorkbench`、應用識別 `shipping-workbench` 刻意保留，支援舊分享版「出貨工作台」直接升級。更新會將桌面捷徑改為「蝦皮印單喵」。不需管理員權限，不設定開機啟動。

預設本機埠 53178；占用時先嘗試 53179～53187。如果整段被 Windows 保留或占用，會向系統取得可用埠並記住。桌面捷徑會開啟正確網址，不會停止其他程式。用完關閉分頁，再從開始功能表選「停止蝦皮印單喵」停止背景服務。

更新前先保存 PDF 並關閉工具分頁，再執行新版 EXE。解除安裝只移除仍符合安裝清單雜湊的檔案；自行加入或修改的檔案會保留。

安裝器尚未數位簽章，請確認來源；受組織政策管理的電腦請洽管理員。

離線快取只包含程式及字型，不含訂單。匯入資料在記憶體中，清除本批或關閉分頁後消失；已下載 PDF 留在使用者電腦。各電腦不會同步訂單。

## 開發

需要 Node.js 22.13 以上，建議 Node 24。

```powershell
npm ci
npm test
npm run build
npm run dev
```

開發網址 `http://127.0.0.1:5178`。正式建置可用 `npm start`，或建置後雙擊 `start-tool.cmd`。不要直接開 HTML；PDF worker 和 PWA 需要 HTTP 環境。

主要模組：

- `src/combined-pdf.ts`：PDF 載入、寄件區域邊界與批次驗證。
- `src/combined-layout.ts`、`src/font-widths.ts`：商品欄位及字元位置解析。
- `src/pdf-pairing.ts`：混合文件依訂單編號配對、缺件與重複檢查。
- `src/compose.ts`：100 × 150 mm 排版。
- `src/main.ts`、`src/style.css`：精簡操作介面、獨立使用說明入口與手機版。
- `installer/`：Windows 安裝、移除及分享說明。

## 建置分享版

Windows 需內建 .NET Framework C# 編譯器，及 Python 的 Pillow、ReportLab、pypdf、pypdfium2。準備含 `node.exe` 和原始 `LICENSE` 的官方 Windows x64 Node runtime，先核對簽章及來源。

```powershell
npm ci
node scripts/make-icons.mjs
npm run build
python scripts/build-guide.py
python scripts/build-installer.py --public --node-dir "<verified-node-runtime-directory>"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-public-installer.ps1
```

分享檔案在 `output/share/0.8.1/`：EXE、SHA-256、HTML、兩頁 PDF 說明、版本檢查摘要。原始訂單、測試產物、參考外掛及開發記錄不打包；套件與字型授權保留在 `licenses` 和 `runtime/LICENSE`。

可在本機建立 `.private-release-terms.json`（JSON 字串陣列），列出不能出現在發行包的文字；此檔被 Git 忽略。建置器掃描 payload、EXE 及分享目錄。專用建置暫存區和隔離安裝測試目錄記錄在 `output/installer/`，確認後可依記錄清理。

字型使用 Noto Sans TC，OFL 授權隨檔保留。貓掌圖像由內建 imagegen 產生；沒有包入第三方參考外掛的程式碼。

## 驗證

`npm test` 使用合成資料，檢查欄位分割、數量、重複訂單、五品項排版與續頁。真實 PDF／Excel、截圖、輸出與私有報告均被 Git 排除，勿強制加入。

```powershell
node --import tsx scripts/check-combined-sample.ts "<combined.pdf>"
python scripts/verify-single-output.py "<combined.pdf>" "<result.pdf>" --report-dir output/private-qa
python scripts/verify-multi-output.py --sources "<carrier-a.pdf>" "<carrier-b.pdf>" --output "<result.pdf>" --report-dir output/private-qa/multi
```

後者另需 pdfplumber、zxing-cpp，核對明細、尺寸及 203 dpi 條碼。檢查結果只保留本機。驗收摘要見 `VALIDATION.md`。

## 品牌圖示

奶油白貓掌與粉紅肉球的主圖放在 `assets/branding/`；執行 `node scripts/make-icons.mjs` 產生 PWA、桌面及介面使用的尺寸。圖像由 imagegen 產生，與真實訂單資料無關。
