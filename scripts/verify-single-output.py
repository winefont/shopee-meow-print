"""Compare a supplied combined PDF to its two-label output; keep results local.

Requires pdfplumber, pypdfium2, Pillow and zxing-cpp. Never commit order fixtures.
"""
import argparse, json, re
from pathlib import Path
from collections import Counter
import pdfplumber
import pypdfium2 as pdfium
from PIL import Image, ImageDraw
import zxingcpp

ap=argparse.ArgumentParser()
ap.add_argument('source',type=Path)
ap.add_argument('output',type=Path)
ap.add_argument('--report-dir',type=Path,required=True)
args=ap.parse_args()
args.report_dir.mkdir(parents=True,exist_ok=True)
compact=lambda s: re.sub(r'\s+','',s)
headings=['#','主商品貨號','商品名稱','商品選項貨號','商品規格名稱','數量','總計']
checks=[]
with pdfplumber.open(args.source) as source, pdfplumber.open(args.output) as output, pdfium.PdfDocument(str(args.source)) as sr, pdfium.PdfDocument(str(args.output)) as out:
    assert len(output.pages)==len(source.pages)*2
    contact=Image.new('RGB',(4*220,((len(output.pages)+3)//4)*350),'#e8ece9')
    for i,sp in enumerate(source.pages):
        words=sp.extract_words(x_tolerance=1.2)
        hs=[next(w for w in words if compact(w['text'])==h) for h in headings]
        note=next(w for w in words if w['text'].startswith('買家備註'))
        anchors=sorted([w for w in words if w['text'].isdigit() and abs(w['x0']-hs[0]['x0'])<4 and hs[0]['top']<w['top']<note['top']],key=lambda w:w['top'])
        source_text=sp.extract_text()
        oid=re.search(r'蝦皮訂單編號[:：]\s*(\d{6}[A-Z0-9]+)',source_text)[1]
        tracking=re.search(r'寄件編號[:：]\s*([A-Z0-9]+)',source_text)[1]
        # Remove the large quantity column before concatenating wrapped names.
        picking=compact(output.pages[i*2+1].filter(lambda o: o.get('object_type')!='char' or o.get('size',0)<20).extract_text())
        assert oid in picking and tracking in picking
        units=0
        for j,a in enumerate(anchors):
            lower=(anchors[j+1]['top'] if j+1<len(anchors) else note['top'])-1.5
            def cell(column):
                region=sp.filter(lambda c: c.get('object_type')=='char' and a['top']-1.5<=c['top']<lower and hs[column]['x0']-1 <= (c['x0']+c['x1'])/2 < hs[column+1]['x0']-1)
                return compact(region.extract_text())
            for column in [2,3,4]:
                assert cell(column) and cell(column) in picking, f'Page {i+1} item {j+1} field {column} mismatch'
            units+=int(cell(5))
        assert f'{units}件' in picking, f'Page {i+1} quantity total mismatch'
        before=sr[i].render(scale=203/72).to_pil()
        after=out[i*2].render(scale=203/72).to_pil()
        a=Counter((str(c.format),c.bytes) for c in zxingcpp.read_barcodes(before))
        b=Counter((str(c.format),c.bytes) for c in zxingcpp.read_barcodes(after))
        assert sum(a.values())==3, f'Source page {i+1}: expected two QR and one barcode'
        assert a==b, f'Barcode mismatch on page {i+1}'
        checks.append({'sourcePage':i+1,'productRows':len(anchors),'units':units,'codesMatched':sum(a.values())})
    for i,page in enumerate(out):
        w,h=page.get_size()
        assert abs(w/72*25.4-100)<.01 and abs(h/72*25.4-150)<.01
        rendered=page.render(scale=203/72).to_pil()
        if i in [0,5,11]: rendered.save(args.report_dir/f'label-{i+1}.png')
        rendered.thumbnail((200,300))
        x=(i%4)*220+10; y=(i//4)*350+30
        contact.paste(rendered,(x,y))
        ImageDraw.Draw(contact).text((x,y-20),f'Page {i+1}',fill='black')
    contact.save(args.report_dir/'all-labels.png')
report={'orders':len(checks),'pages':len(checks)*2,'productRows':sum(c['productRows'] for c in checks),'units':sum(c['units'] for c in checks),'codesMatchedAt203dpi':sum(c['codesMatched'] for c in checks),'pageSizeMm':[100,150],'checks':checks}
(args.report_dir/'verification.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
