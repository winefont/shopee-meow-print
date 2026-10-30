"""Create a customer-free 100x150 mm print scaling check."""
from pathlib import Path
from io import BytesIO
import json
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, DictionaryObject, BooleanObject
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / 'package.json').read_text('utf-8'))['version']
OUT = ROOT / 'output' / 'pdf' / '列印尺寸測試-100x150mm.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
MM = 72 / 25.4
W, H = 100 * MM, 150 * MM
pdfmetrics.registerFont(TTFont('TC', str(ROOT / 'public/fonts/NotoSansTC-Regular.ttf')))
buffer = BytesIO()
c = canvas.Canvas(buffer, pagesize=(W, H), pageCompression=1)
c.setTitle('100 x 150 mm print size check')
c.setAuthor('')
c.setLineWidth(.3 * MM)
c.rect(2.5 * MM, 2.5 * MM, 95 * MM, 145 * MM)
def centered(text, top, size):
    c.setFont('TC', size)
    c.drawCentredString(W / 2, H - top * MM, text)
centered('列印尺寸測試', 13, 16)
centered('PDF 尺寸 100 × 150 mm', 22, 11)
centered('實際大小 100% · 每張紙 1 頁', 29, 10)
c.setLineWidth(.4 * MM)
c.rect(25 * MM, 55 * MM, 50 * MM, 50 * MM)
centered('寬 50 mm', 41, 10)
centered('50 × 50 mm', 70, 14)
centered('請量方框線的中心', 79, 9)
for text, top in [
    ('列印後請用尺量中央方框。', 110),
    ('寬、高均應為 50 mm。', 117),
    ('若只有 40 mm，代表約 80% 縮放。', 124),
    ('請檢查 PDF 視窗與印表機紙張設定。', 131),
    ('4 × 6 吋紙張也請使用 100% 列印。', 138),
]:
    centered(text, top, 9)
c.showPage()
c.save()
writer = PdfWriter(clone_from=PdfReader(BytesIO(buffer.getvalue())))
writer._root_object[NameObject('/ViewerPreferences')] = DictionaryObject({
    NameObject('/PrintScaling'): NameObject('/None'),
    NameObject('/PickTrayByPDFSize'): BooleanObject(True),
})
writer.write(OUT)
preview = ROOT / 'output' / 'private-qa' / 'layout-051' / 'print-check.png'
preview.parent.mkdir(parents=True, exist_ok=True)
with pdfium.PdfDocument(str(OUT)) as doc:
    doc[0].render(scale=2).to_pil().save(preview)
print(json.dumps({'path': str(OUT), 'pageSizeMm': [100, 150], 'checkSquareMm': 50}))
