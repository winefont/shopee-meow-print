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
story=[header,p('Shopee Meow Print · 多份 PDF，合併印好寄件單與揀貨單。'),
    box('準備：Windows 10／11 64 位元、Edge 或 Chrome，以及已安裝驅動的標籤印表機。<br/>安裝檔已包含執行環境、PDF 程式庫與中文字型，不必另裝 Node.js。'),
    section('1','安裝一次，之後點貓掌捷徑'),
    steps([f'雙擊 <font size="9">ShopeeMeowPrint-Setup-{VERSION}-Windows-x64.exe</font>，等待安裝完成。不必先解壓縮或執行 CMD。',
        '桌面會建立「蝦皮印單喵」捷徑並開啟工具。以後雙擊捷徑即可使用；右上角「使用說明」另開分頁，不清除本批。']),
    p('本版尚未數位簽章；若 Windows 顯示未知的發行者，請先確認來源。受公司政策阻擋時請洽管理員。','small'),
    section('2','在蝦皮下載出貨文件'),
    box('<b>蝦皮賣家中心 → 我的銷售 → 批次出貨 → 下載出貨文件</b>'),
    steps(['勾選要出貨的訂單，開啟「批次下載」。',
        '可合併的物流選「寄件單+裝箱單／一般列印（A4）」。<br/><b>7-11／全家若分開下載，請同時下載寄件單 PDF 與裝箱單 PDF。</b>',
        '按「下載所選文件」，保留所需的 PDF。請保留直接下載的原始檔，不要掃描、轉圖或重新列印成 PDF。']),
    p('合併檔與 7-11／全家兩份 PDF 可一起匯入，不需手動合檔。依訂單編號配對；裝箱單可放前或放後，以寄件單順序輸出；全家四格按左上、右上、左下、右下拆分。','small'),
    section('3','匯入、核對、下載'),
    steps(['按「選擇 PDF 檔案」，多選或拖入不同物流的 PDF。可繼續加入、用箭頭排序或移除；單檔 30 MB，整批 100 MB／20 份／500 頁。',
        '按「產生出貨標籤」，核對訂單數、件數、頁數、商品、貨號及規格。左右箭頭可切換訂單，並可展開「查看本批訂單與貨號」。',
        '按「下載合成結果.pdf」或「開啟 PDF／列印」。下一批先按「清除本批」，再匯入新檔。']),
    box('支援店到店、新竹合併檔、7-11 分開檔及全家四格寄件單＋裝箱單。全家圖片在本機辨識編號，空白格略過。<br/>缺件、重複、編號衝突或無法解析時整批停止；補齊或移除重複檔後重試。'),
    PageBreak(),p('10 × 15 公分列印','title'),
    p('開啟產生的「合成結果.pdf」，按 Ctrl + P。請列印 PDF，不要列印工具網頁或這份 A4 說明書。'),
]
settings=[('設定項目','請選擇'),('印表機','Xprinter XP-420B 或支援此尺寸的標籤印表機'),('紙張尺寸','依耗材選 100 mm × 150 mm，或 4 × 6 吋（101.6 × 152.4 mm）'),('方向／縮放','直式、實際大小／100%；不要符合頁面或縮小'),('份數／順序','1 份、單面、每張紙 1 頁；保持原順序，不反向'),('先試印','第一筆完整訂單，通常第 1～2 頁；有續頁也一起印')]
t=Table([[p(a,'small'),p(b,'small')] for a,b in settings],colWidths=[96,W-96])
t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),PALE),('GRID',(0,0),(-1,-1),.5,LINE),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
story += [t,Spacer(1,9),box('4 × 6 吋耗材可直接選驅動的「4 x 6」，以 100% 列印本工具的 100 × 150 mm PDF。<br/>使用 100 × 150 mm 耗材但找不到尺寸時，才新增對應紙張。需要完整驅動選項可按 Ctrl + Shift + P。'),
    section('4','同一筆訂單，整組一起拿'),
    box('訂單 A 寄件單 → 訂單 A 揀貨單 → 訂單 B 寄件單 → 訂單 B 揀貨單'),
    p('兩種頁面保留約 2.5 mm 左右邊界。揀貨單採黑框表格，少量商品不放大字體；5 種一般長度商品可放一頁，長文字續頁。寄件單等比例放大，方形原單仍有留白。'),
    p('先試印確認四邊完整、條碼可掃描。若整頁偏小，確認 PDF 視窗及驅動選相同紙張、100%、每張紙 1 頁；跳張時做紙張／間隙校正。'),
    section('5','資料與更新'),
    p('<b>資料欄位：</b>揀貨單只列收件人、訂單編號、品名、規格／貨號、數量及備註，不列金額與訂單條碼。收件人無法可靠讀取時顯示「請見寄件單」，不猜填。未列在原 PDF 的賣家備註不會加入。','small'),
    p('<b>資料與離線：</b>訂單只在本機瀏覽器處理，不上傳。「已備妥離線使用」表示程式及字型已快取；訂單不存入快取。清除或關閉分頁後不保留匯入資料，已下載 PDF 仍留在電腦。','small'),
    p('<b>關閉：</b>先保存 PDF、關閉分頁，再從開始功能表「蝦皮印單喵 → 停止蝦皮印單喵」結束背景服務。下次點桌面捷徑即可重新開啟。','small'),
    p('<b>更新／解除安裝：</b>關閉分頁後執行新版 EXE；舊分享版「出貨工作台」可直接更新。沿用 %LOCALAPPDATA%\\ShippingWorkbench 安裝位置。可從 Windows「已安裝的應用程式」解除安裝。自行加入的檔案會保留。','small'),
    p('<b>分享：</b>提供 EXE 與本說明即可。安裝包未附任何賣家的訂單及客戶資料。程式庫與字型授權保存在安裝目錄 licenses、runtime\\LICENSE。','small'),
    p('<b>無法產生：</b>請依提示重新下載正確文件，不要修改編號強行配對。桌面捷徑優先用 53178～53187；被 Windows 保留時會自動選可用埠並記住。','small'),
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
