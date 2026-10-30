# 蝦皮印單喵 · Shopee Meow Print

將蝦皮的 **「寄件單+裝箱單」PDF** 轉成連續排列的「寄件單、揀貨單」，以 **100 × 150 mm** 熱感紙列印。純前端 PWA，訂單只在本機瀏覽器處理，不上傳、不需要蝦皮帳號或 API 金鑰。本工具為獨立開發，非蝦皮官方產品。

## 使用方式

1. 在 Windows 10／11 64 位元執行 `ShopeeMeowPrint-Setup-0.6.0-Windows-x64.exe`，會建立貓掌圖示的「蝦皮印單喵」桌面捷徑。
2. 蝦皮賣家中心 → **我的銷售 → 批次出貨 → 下載出貨文件**。
3. 勾選訂單，在「批次下載」選 **寄件單+裝箱單 → 一般列印（A4）→ 下載所選文件**。
4. 在「PDF 批次匯入」選擇或拖入一份／多份 PDF，可繼續加入，使用箭頭調整檔案順序或移除檔案，再按「產生出貨標籤」。不同物流可合併，檔案內保持原頁序。操作畫面也有下載說明與勾選示意。
5. 核對訂單、商品、貨號、規格、數量與預覽，下載 `合成結果.pdf`。
6. 列印設定：**依耗材選 100 × 150 mm 或 4 × 6 吋、直式、實際大小 100%、單面、原始頁序**。先試印一筆再印整批。

寄件單等比例放大至可列印範圍、靠上排列，保留約 2.5 mm 邊界；方形原單仍會保留上下空白。揀貨單採黑框表格，僅列收件人、訂單編號、商品名稱、規格／貨號、數量及備註；不含金額、折扣、運費、電話、店名或新加的訂單條碼。少量商品不放大字體。一般長度的五種商品可放在一張揀貨單；長明細和備註會續頁，不省略文字。4 × 6 吋為 101.6 × 152.4 mm，可在這種耗材上以 100% 列印 100 × 150 mm PDF；PDF 列印視窗與驅動請選相同紙張。按 XP-420B 需求設計，紙張進紙、濃度及實機掃描仍需自行試印。

## 支援範圍

- 已驗證蝦皮店到店「標準配送／門市交寄」及新竹貨運，每頁一筆、一般列印 A4 的「寄件單+裝箱單」。
- 全家、7-11 先依相同位置的通用 A4 版型支援：左上角原寄件單、下半部有可讀取的商品表與唯一訂單編號。已用重排後範例做圖面檢查、模擬 A4 裁切與配對；尚未取得原始 A4 實單，首次需核對預覽與試印；不是所有物流版型都保證適用。
- 原始寄件單的文字、向量與圖片按原比例嵌入，不重畫條碼或收件資訊。自動排除裝箱單標題及跨頁寬度的分隔線。
- 收件人僅讀取寄件區明確標示的「收件人／取件人／收貨人」文字。圖片、未標欄名或文字不確定時顯示「請見寄件單」並提醒，不 OCR 猜名。物流編號保留於原寄件單，仍用於內部配對；缺少可讀欄位時依同頁唯一訂單編號配對。
- 依字元位置擷取商品欄位，處理 PDF 文字合併跨欄及貨號換行。
- 單檔最多 30 MB、整批最多 100 MB、20 份 PDF、合計 500 頁。
- 跨檔案檢查重複訂單與已辨識的物流編號；任一檔案有錯時整批停止，不默默漏掉該檔。可移除或修正後重試。
- 不支援整頁掃描圖、旋轉頁、跨頁商品表、同單拆包裹或位置不同的版型。商品表必須有可讀文字；寄件區可以是原始圖片。無法可靠解析時停止產生本批標籤。
- 未列在 PDF 的賣家備註不會加入。需要 Excel 備註時，切換「PDF＋Excel（備用）」，匯入同批的獨立寄件單 PDF 與裝箱單 XLSX。
- 備用 Excel 使用 `orders` 工作表與原始 `tracking_number`、`order_sn`、`product_info`、`remark_from_buyer`、`seller_note` 欄位。

## 安裝、更新與隱私

安裝器包含 Windows x64 Node runtime、程式庫與中文字型，不需另裝 Node.js、Python 或 Docker。印表機驅動需自行安裝。

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
- `src/compose.ts`：100 × 150 mm 排版。
- `src/packing.ts`、`src/matching.ts`：雙檔備用流程。
- `src/main.ts`、`src/style.css`：介面、內嵌說明與手機版。
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

分享檔案在 `output/share/0.6.0/`：EXE、SHA-256、HTML、兩頁 PDF 說明、版本檢查摘要。原始訂單、測試產物、參考外掛及開發記錄不打包；套件與字型授權保留在 `licenses` 和 `runtime/LICENSE`。

可在本機建立 `.private-release-terms.json`（JSON 字串陣列），列出不能出現在發行包的文字；此檔被 Git 忽略。建置器掃描 payload、EXE 及分享目錄。專用建置暫存區和隔離安裝測試目錄記錄在 `output/installer/`，確認後可依記錄清理。

字型使用 Noto Sans TC，OFL 授權隨檔保留。紙張／貓掌標誌為原創向量，沒有包入第三方參考外掛的程式碼。

## 驗證

`npm test` 使用合成資料，檢查欄位分割、數量、重複訂單、五品項排版與續頁。真實 PDF／Excel、截圖、輸出與私有報告均被 Git 排除，勿強制加入。

```powershell
node --import tsx scripts/check-combined-sample.ts "<combined.pdf>"
python scripts/verify-single-output.py "<combined.pdf>" "<result.pdf>" --report-dir output/private-qa
python scripts/verify-multi-output.py --sources "<carrier-a.pdf>" "<carrier-b.pdf>" --output "<result.pdf>" --report-dir output/private-qa/multi
```

後者另需 pdfplumber、zxing-cpp，核對明細、尺寸及 203 dpi 條碼。檢查結果只保留本機。驗收摘要見 `VALIDATION.md`。
