"""Independently verify locally supplied A4 PDFs against a merged label PDF.

Requires pdfplumber, pypdfium2, Pillow and zxing-cpp. Never ships fixtures.
"""
from pathlib import Path
from collections import Counter
import argparse
import json
import re
import unicodedata
import pdfplumber
import pypdfium2 as pdfium
from PIL import Image, ImageDraw
import zxingcpp

parser = argparse.ArgumentParser()
parser.add_argument('--sources', nargs='+', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--report-dir', type=Path, required=True)
args = parser.parse_args()
args.report_dir.mkdir(parents=True, exist_ok=True)
compact = lambda text: re.sub(r'\s+', '', text or '')
headings = ['#', '主商品貨號', '商品名稱', '商品選項貨號', '商品規格名稱', '數量', '總計']
checks = []
with pdfplumber.open(args.output) as output, pdfium.PdfDocument(str(args.output)) as rendered_output:
    output_index = 0
    for source_file in args.sources:
        with pdfplumber.open(source_file) as source, pdfium.PdfDocument(str(source_file)) as rendered_source:
            for source_index, page in enumerate(source.pages):
                text = compact(unicodedata.normalize('NFKC', page.extract_text() or ''))
                matches = re.findall(r'(?:(蝦皮|寄貨))?訂單編號(?:[（(](單)[）)])?[:：ÿ]?(\d{6}[A-Z0-9]{6,20})', text)
                order_ids = {value for prefix, packing, value in matches if prefix or packing or re.search('[A-Z]', value)}
                assert len(order_ids) == 1
                order_id = next(iter(order_ids))
                # PDF text extractors can include invisible, clipped source
                # contents. Read only our footer font, not the embedded label.
                shipping_text = output.pages[output_index].filter(lambda c: c.get('object_type') != 'char' or ('NotoSansTC' in c.get('fontname', '') and c.get('top', 0) > 400)).extract_text()
                footer = re.search(r'(\d+)-1/(\d+)\s+寄件單', shipping_text)
                assert footer and int(footer[1]) == len(checks) + 1
                group_size = int(footer[2])
                assert group_size >= 2
                picking_pages = output.pages[output_index + 1:output_index + group_size]
                assert all(order_id in compact(p.extract_text()) for p in picking_pages)
                picking = ''.join(compact(p.extract_text()) for p in picking_pages)
                printed_products = []
                for picking_page in picking_pages:
                    for table in picking_page.extract_tables():
                        for row in table:
                            if len(row) == 3 and all(cell is not None for cell in row) and row[2].isdigit():
                                printed_products.append(row)
                words = page.extract_words(x_tolerance=1.2)
                hs = [next(w for w in words if compact(w['text']) == heading and w['top'] > page.height * .35) for heading in headings]
                note = next(w for w in words if w['text'].startswith('買家備註') and w['top'] > hs[0]['top'])
                anchors = sorted([w for w in words if w['text'].isdigit() and abs(w['x0'] - hs[0]['x0']) < 4 and hs[0]['top'] < w['top'] < note['top']], key=lambda w: w['top'])
                units = 0
                assert len(printed_products) == len(anchors), 'Printed product count differs from source'
                for item_index, anchor in enumerate(anchors):
                    lower = (anchors[item_index + 1]['top'] if item_index + 1 < len(anchors) else note['top']) - 1.5
                    def cell(column):
                        chars = page.filter(lambda c: c.get('object_type') == 'char' and anchor['top'] - 1.5 <= c['top'] < lower and hs[column]['x0'] - 1 <= (c['x0'] + c['x1']) / 2 < hs[column + 1]['x0'] - 1)
                        return compact(chars.extract_text())
                    printed = printed_products[item_index]
                    assert compact(printed[0]) == cell(2), f'{source_file.name}: product name mismatch'
                    variant = cell(4) or '未提供規格'
                    sku = cell(3) or cell(1) or '未提供貨號'
                    assert compact(printed[1]) == compact(variant + sku), f'{source_file.name}: variant/SKU mismatch'
                    quantity = cell(5)
                    assert quantity.isdigit() and int(quantity) > 0
                    assert printed[2] == quantity, f'{source_file.name}: quantity mismatch'
                    units += int(quantity)
                assert f'{units}件' in picking
                before = rendered_source[source_index].render(scale=203/72).to_pil()
                after = rendered_output[output_index].render(scale=203/72).to_pil()
                before_codes = Counter((str(code.format), code.bytes) for code in zxingcpp.read_barcodes(before))
                after_codes = Counter((str(code.format), code.bytes) for code in zxingcpp.read_barcodes(after))
                assert before_codes, f'No source barcode decoded on page {source_index + 1}'
                assert before_codes == after_codes, f'Barcode mismatch: {source_file.name} page {source_index + 1}'
                checks.append({'sourceFile': source_file.name, 'sourcePage': source_index + 1, 'outputPage': output_index + 1, 'pages': group_size, 'productRows': len(anchors), 'units': units, 'codesMatched': sum(before_codes.values())})
                output_index += group_size
    assert output_index == len(output.pages)
    contact = Image.new('RGB', (8 * 160, ((len(output.pages) + 7) // 8) * 255), '#e8ece9')
    for index, page in enumerate(rendered_output):
        width, height = page.get_size()
        assert abs(width / 72 * 25.4 - 100) < .01 and abs(height / 72 * 25.4 - 150) < .01
        image = page.render(scale=203/72).to_pil()
        if index in [0, 1, 8, 9, 10, 11, 78, 79]:
            image.save(args.report_dir / f'label-{index + 1}.png')
        image.thumbnail((150, 225))
        x, y = (index % 8) * 160 + 5, (index // 8) * 255 + 25
        contact.paste(image, (x, y))
        ImageDraw.Draw(contact).text((x, y - 18), f'Page {index + 1}', fill='black')
    contact.save(args.report_dir / 'all-labels.png')
report = {'orders': len(checks), 'pages': output_index, 'productRows': sum(c['productRows'] for c in checks), 'units': sum(c['units'] for c in checks), 'codesMatchedAt203dpi': sum(c['codesMatched'] for c in checks), 'pageSizeMm': [100, 150], 'checks': checks}
(args.report_dir / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({key: value for key, value in report.items() if key != 'checks'}))
