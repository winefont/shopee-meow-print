"""Build the two-page public quick guide, with no customer/order fixtures."""
from pathlib import Path
import json
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image
from pypdf import PdfReader
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
OUT = ROOT / 'output' / 'share' / VERSION / '蝦皮印單喵-安裝及使用說明.pdf'
PREVIEW = ROOT / 'output' / 'guide-preview' / VERSION
OUT.parent.mkdir(parents=True, exist_ok=True)
PREVIEW.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('TC', str(ROOT / 'public/fonts/NotoSansTC-Regular.ttf')))
pdfmetrics.registerFontFamily('TC', normal='TC', bold='TC')
GREEN, INK, PALE, LINE, ORANGE = [colors.HexColor(c) for c in ['#176b53','#163c33','#edf5f0','#d9e6df','#db8d69']]
W = A4[0] - 80
styles = {
    'body': ParagraphStyle('body',fontName='TC',fontSize=10.3,leading=16,wordWrap='CJK',textColor=INK,spaceAfter=5),
    'small': ParagraphStyle('small',fontName='TC',fontSize=9,leading=14,wordWrap='CJK',textColor=INK,spaceAfter=4),
    'title': ParagraphStyle('title',fontName='TC',fontSize=25,leading=32,textColor=INK,spaceAfter=6),
    'section': ParagraphStyle('section',fontName='TC',fontSize=14,leading=22,textColor=GREEN,spaceBefore=10,spaceAfter=6),
}
def p(text,kind='body'): return Paragraph(text,styles[kind])
def section(n,text): return p(f'{n}　{text}','section')
def box(text):
    t=Table([[p(text,'small')]],colWidths=[W])
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),PALE),('BOX',(0,0),(-1,-1),.5,LINE),('LEFTPADDING',(0,0),(-1,-1),11),('RIGHTPADDING',(0,0),(-1,-1),11),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
    return t
def steps(items):
    t=Table([[p(f'{i:02d}','small'),p(s)] for i,s in enumerate(items,1)],colWidths=[28,W-28])
    t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),3)]))
    return t
def footer(c,doc):
    c.saveState(); c.setStrokeColor(LINE); c.line(40,43,A4[0]-40,43)
    c.setFont('TC',8); c.setFillColor(INK)
    c.drawString(40,28,f'蝦皮印單喵 v{VERSION}  |  獨立工具，非蝦皮官方產品')
    c.drawRightString(A4[0]-40,28,f'{doc.page} / 2'); c.restoreState()

header=Table([[Image(str(ROOT/'public/icon-192.png'),width=43,height=43),p('蝦皮印單喵','title')]],colWidths=[56,W-56])
header.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),0)]))
story=[header,p('Shopee Meow Print · 一份 PDF，連續印好寄件單與揀貨單。'),
    box('準備：Windows 10／11 64 位元、Edge 或 Chrome，以及已安裝驅動的標籤印表機。<br/>安裝檔已包含執行環境、PDF／Excel 程式庫與中文字型，不必另裝 Node.js。'),
    section('1','安裝一次，之後點貓掌捷徑'),
    steps([f'雙擊 <font size="9">ShopeeMeowPrint-Setup-{VERSION}-Windows-x64.exe</font>，等待安裝完成。不必先解壓縮或執行 CMD。',
        '桌面會建立「蝦皮印單喵」捷徑並開啟工具。以後雙擊捷徑即可使用。']),
    p('本版尚未數位簽章；若 Windows 顯示未知的發行者，請先確認來源。受公司政策阻擋時請洽管理員。','small'),
    section('2','在蝦皮下載一份「寄件單+裝箱單」'),
    box('<b>蝦皮賣家中心 → 我的銷售 → 批次出貨 → 下載出貨文件</b>'),
    steps(['勾選要出貨的訂單，開啟「批次下載」。',
        '勾選「寄件單+裝箱單」，選「一般列印」（A4）。<br/>不要選單獨的寄件單、揀貨單或裝箱單。',
        '按「下載所選文件」，取得一份 PDF。請保留直接下載的原始檔，不要掃描、轉圖或重新列印成 PDF。']),
    p('程式操作畫面內也有「PDF 要去哪裡下載？」說明及勾選示意，可隨時展開查看。','small'),
    section('3','匯入、核對、下載'),
    steps(['保留「單一 PDF（推薦）」模式，按「選擇 PDF 檔案」或將檔案拖入欄位。單檔最多 30 MB、每批最多 500 頁。',
        '按「產生出貨標籤」，核對訂單數、件數、頁數、商品、貨號及規格。左右箭頭可切換訂單，並可展開「查看本批訂單與貨號」。',
        '按「下載合成結果.pdf」或「開啟 PDF／列印」。下一批先按「清除本批」，再匯入新檔。']),
    box('目前已驗證：蝦皮店到店「標準配送／門市交寄」、一般列印 A4、每頁一筆的文字 PDF。<br/>其他物流、跨頁商品表、重複訂單或拆包裹會停止產生，請依畫面提示檢查。'),
    PageBreak(),p('10 × 15 公分列印','title'),
    p('開啟產生的「合成結果.pdf」，按 Ctrl + P。請列印 PDF，不要列印工具網頁或這份 A4 說明書。'),
]
settings=[('設定項目','請選擇'),('印表機','Xprinter XP-420B 或支援此尺寸的標籤印表機'),('紙張尺寸','寬 100 mm × 高 150 mm（10 × 15 公分）'),('方向／縮放','直式、實際大小／100%；不要符合頁面或縮小'),('份數／順序','1 份、單面、每張紙 1 頁；保持原順序，不反向'),('先試印','第一筆完整訂單，通常第 1～2 頁；有續頁也一起印')]
t=Table([[p(a,'small'),p(b,'small')] for a,b in settings],colWidths=[96,W-96])
t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),PALE),('GRID',(0,0),(-1,-1),.5,LINE),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
story += [t,Spacer(1,9),box('找不到尺寸時，到 Windows 印表機「列印喜好設定／內容」新增 100 × 150 mm，再重新開啟列印視窗。需要完整驅動選項時，可按 Ctrl + Shift + P。<br/>4 × 6 英吋是 101.6 × 152.4 mm，與 100 × 150 mm 不完全相同。'),
    section('4','同一筆訂單，整組一起拿'),
    box('訂單 A 寄件單 → 訂單 A 揀貨單 → 訂單 B 寄件單 → 訂單 B 揀貨單'),
    p('一般長度的 5 種商品可放在一張揀貨單；品名、規格或備註太長會續頁，不省略內容。續頁接在同筆訂單後面，請整組一起取用。'),
    p('先試印確認：四邊完整、貨號與數量可讀、條碼及 QR Code 可掃描、沒有跳張。確認後再印整批；跳張時依印表機手冊做紙張／間隙校正。'),
    section('5','備用模式、資料與更新'),
    p('<b>賣家備註：</b>單一 PDF 只列印原檔已有的內容，未提供的賣家備註不會加入。需要 Excel 的備註時，切換「PDF＋Excel（備用）」，選入同批的獨立寄件單 PDF 與裝箱單 XLSX。切換模式會清除本批內容。','small'),
    p('<b>資料與離線：</b>訂單只在本機瀏覽器處理，不上傳。「已備妥離線使用」表示程式及字型已快取；訂單不存入快取。清除或關閉分頁後不保留匯入資料，已下載 PDF 仍留在電腦。','small'),
    p('<b>關閉：</b>先保存 PDF、關閉分頁，再從開始功能表「蝦皮印單喵 → 停止蝦皮印單喵」結束背景服務。下次點桌面捷徑即可重新開啟。','small'),
    p('<b>更新／解除安裝：</b>關閉分頁後執行新版 EXE；舊分享版「出貨工作台」可直接更新。沿用 %LOCALAPPDATA%\\ShippingWorkbench 安裝位置。可從 Windows「已安裝的應用程式」解除安裝。自行加入的檔案會保留。','small'),
    p('<b>分享：</b>提供 EXE 與本說明即可。安裝包未附任何賣家的訂單及客戶資料。程式庫與字型授權保存在安裝目錄 licenses、runtime\\LICENSE。','small'),
    p('<b>無法產生：</b>請依提示重新下載正確文件，不要修改訂單或物流編號強行配對。桌面捷徑會自動使用可用本機埠（53178～53187）。','small'),
]
doc=SimpleDocTemplate(str(OUT),pagesize=A4,rightMargin=40,leftMargin=40,topMargin=32,bottomMargin=57,title='蝦皮印單喵 - 安裝及使用說明',author='',creator='Shopee Meow Print',pageCompression=1)
doc.build(story,onFirstPage=footer,onLaterPages=footer)
reader=PdfReader(OUT)
assert len(reader.pages)==2, f'Expected 2 pages, got {len(reader.pages)}'
text='\n'.join(page.extract_text() for page in reader.pages)
for token in ['我的銷售','批次出貨','下載出貨文件','寄件單+裝箱單','一般列印','產生出貨標籤','100 mm','150 mm','100%','XP-420B']:
    assert token in text, token
with pdfium.PdfDocument(str(OUT)) as pdf:
    for i,page in enumerate(pdf): page.render(scale=1.5).to_pil().save(PREVIEW / f'page-{i+1}.png')
print(json.dumps({'pages':len(reader.pages),'bytes':OUT.stat().st_size,'path':str(OUT)},ensure_ascii=True))
