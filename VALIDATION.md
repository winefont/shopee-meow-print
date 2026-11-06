# v0.7.1 branding validation - 2026-11-06

- Replaced the footprint artwork with an image-generated cream/pink paw mascot. Updated app/favicons, PWA maskable artwork, header/help/empty-state visuals, Windows setup artwork, versioned shortcut icons, and guide branding. Parsing, matching, cropping and PDF composition source files are unchanged from v0.7.0.
- All 28 automated tests, TypeScript and production/offline builds passed. The first test attempt failed inside the restricted Windows user-info sandbox before executing tests; the normal local execution passed.
- Local update from v0.7.0 to v0.7.1 completed successfully. The installer removed its own extraction directory. The installed manifest and shortcut are verified separately in a local receipt.
- The production browser displayed v0.7.1 with all four mascot/icon images loaded. Desktop layout was visually inspected; the 390 px responsive check reported 375 px document width and a 339 px input card, with no horizontal overflow. Old open tabs may keep the prior offline worker active until closed.
- No new real-order browser conversion is claimed for this visual-only update: the browser file chooser timed out before selecting files. Existing v0.7.0 real-document verification remains below; synthetic pairing and layout tests were rerun successfully.
- The two-page PDF guide was rendered and visually inspected. The sharing-package scanner inspected 272 package entries and found zero configured private-data matches; the installer payload contains no PDF/Excel order fixtures.
- FamilyMart split-file support is not implemented: standalone shipping identification still requires a 7-Eleven service code. A reusable order-ID pairing layer and earlier simulated combined-page tests do not establish support for the actual FamilyMart download format.
- User-authorized GitHub release preparation includes the verified installer, checksum, two-page PDF guide, standalone HTML guide and public validation summary. Original customer documents and local verification receipts remain excluded.

# v0.7.0 validation - 2026-11-06

- Mixed import now recognizes original combined A4 pages, standalone 7-Eleven A4 shipping labels, and standalone packing tables. The entire selection is paired by exact Shopee order ID and ordered by shipping-page position. Page offsets count every input page, including standalone packing pages.
- The supplied four-file batch contained 8 store-delivery orders, 1 HCT order and 1 7-Eleven order. It produced 10 orders / 20 pages / 15 product rows / 22 units. The separate 7-Eleven documents form one order; filenames and packing-file position do not determine pairing.
- A new package-number guard initially misread content-stream concatenation of HCT's `package 1` and a separate carrier number. It now reads spatial lines with separators. The actual HCT page and a synthetic regression case pass. All 28 automated tests, TypeScript and production/offline builds passed.
- Production browser conversion passed with the packing file first and last. Removing its counterpart and adding a duplicate both blocked the entire batch and cleared the old download link. The browser adapter could not export blob downloads; the retained PDF was saved using the same production conversion/composition functions with a local PDF.js/Canvas adapter, rather than claiming a browser-download test passed.
- Independent pdfplumber extraction matched every product name, specification, SKU and quantity. All 28 source barcode/QR occurrences decoded identically at 203 dpi. Picking slips contain no newly added barcodes. Every output page measures 100 x 150 mm. All pages were rendered; the contact sheet and detailed 7-Eleven shipping/picking pages were visually inspected.
- Public EXE v0.7.0 was compiled with the previously verified official Node runtime and original license. The runtime hash and OpenJS signature were checked. The public package scan passed with 269 archive files and zero configured private-identifier matches; order PDFs and private QA data are excluded. The two-page guide and embedded UI explain separate 7-Eleven downloads.
- The installed v0.5.1 copy was upgraded in place to v0.7.0. A modified old guide was backed up before updating. Installation completed, all 265 installed files matched their manifest, and the updated installed app converted the same four-file batch into 10 orders / 20 pages / 22 units. No new uninstall test was performed; the installer implementation is unchanged from the previously tested release.
- Retained local results: `output/share/0.7.0`, `output/pdf`, and `output/private-qa/mixed-070`. Customer-bearing source PDFs, generated labels, screenshots and private QA data are excluded from Git and release assets. Automated fixtures use synthetic identifiers and products.
- The release privacy audit checked candidate source files and reachable Git history against identifiers extracted from the supplied orders, and scanned the decompressed installer payload and guide text/metadata. No known order identifiers, credential patterns or personal absolute paths were found. The embedded production files matched a fresh build. Release attachments are limited to the installer, its checksum, PDF/HTML guides and the public validation summary.
- The disposable preview process on port 5189 and temporary build/extraction directories were cleaned up. The updated installed application and its local server were retained for normal use. Resource receipts remain local; unrelated applications and older release assets were not changed.

No physical XP-420B print job was sent. Continue to select the actual 4 x 6 stock and actual size / 100% for a first hardware trial. FamilyMart still lacks an original real-order sample.

## Historical v0.6.0 validation - 2026-10-28

- Picking slips now use a black-grid table with recipient, order ID, product name, specification/SKU and quantity, plus existing notes and unit totals. They do not add order barcodes, store names, phone numbers, delivery-method or monetary fields. Shipping artwork and its existing codes remain intact. Sparse orders do not receive enlarged type; dense ordinary five-product orders fit on one picking page, while long notes still continue within their order.
- Recipient extraction requires an explicit recipient label and readable text. It supports differently sized text sharing one visual row, including the provided 7-Eleven artwork. Missing, unlabelled, bitmap or ambiguous names display a visible referral to the shipping label. No name OCR is attempted.
- 7-Eleven's service code is distinguished from its logistics barcode. Generic numeric carrier order identifiers do not replace Shopee IDs; conflicting shipping/packing IDs still fail closed.
- TypeScript and production/offline build passed, with 20 automated tests. The production browser converted the retained real PDF + Excel fixture into 2 orders / 4 pages / 6 units. Independent table extraction matched every product name, specification, SKU and quantity.
- The new 7-Eleven and FamilyMart files supplied by the user are already rearranged labels. Original Shopee A4 downloads were unavailable. Private synthetic A4 fixtures combine their real shipping artwork with clearly marked test products; these produced 2 orders / 4 pages / 10 product rows / 30 units. Each picking page contains five products. This verifies the assumed geometry, not every real carrier A4 layout.
- Independent rendering and decoding at 203 dpi matched all 12 barcode/QR occurrences across the real legacy and simulated-carrier results. No new barcode appeared on any picking page. Every output page measures 100 x 150 mm; product text stayed within printable bounds. All output labels and both guide pages were rendered and visually inspected.
- Browser checks passed for multi-file conversion, stale-download clearing, duplicate blocking, and rejection of already rearranged 10 x 15 files in A4 mode. The latter intentionally does not attempt to reconstruct garbled product text from the reference samples.
- Public EXE v0.6.0 passed the privacy/manifest scan (269 package files, no configured private identifiers or order files). Isolated fresh install, bundled Node startup, file hashes, four test shortcuts, update and uninstall passed. Added test user files survived update/uninstall; the pre-existing real installation registry was unchanged.
- Shareable EXE and two-page guide: `output/share/0.6.0`. Private output examples: `output/pdf`. Evidence and simulation fixtures: `output/private-qa/layout-060`. Customer-bearing samples and test PDFs are excluded from Git and the installer.
- Task-owned browser and preview server were closed; port 5188 has no listener. Verified disposable package staging, isolated install data and QA package caches were removed by exact path. Results and cleanup receipts were retained; no existing application, container or printer setting was changed.

No physical printer job or production deployment was performed. Continue using actual size / 100% and the real 4 x 6 inch stock selection on the XP-420B. Carrier support still needs confirmation against the first available original Shopee A4 file.

## Historical v0.5.1 validation - 2026-10-27

- Both label types use 2.5 mm side margins (95 mm content width instead of 92 mm). Shipping artwork is proportionally enlarged and aligned to the top; source crop safety padding is 1.5 mm. Square artwork keeps its aspect ratio and therefore leaves space below.
- Picking-slip typography is unchanged. Independent comparison of all 40 real picking pages confirmed the exact same font sizes as v0.5.0. No new large-font mode for small orders was added. The existing five-product and long-content pagination tests pass.
- TypeScript and the Vite/offline production build passed; all 16 automated tests passed. PDFs request actual-size printing and paper selection by PDF page size, but printer dialogs may override these preferences.
- Real HCT and Shopee input produced 40 orders / 80 pages / 54 product rows / 171 units. Independent extraction matched all names, SKUs, variants, order sequence and quantities; all 115 barcode / QR occurrences decoded identically at 203 dpi. All pages were rendered and inspected, including detailed samples from both carriers.
- Legacy PDF + Excel produced 2 orders / 4 pages / 6 units; all six source barcode / QR occurrences matched at 203 dpi after the crop change.
- Every output page measures 100 x 150 mm. A four-page, two-carrier trial PDF is supplied separately from the public package. The customer-free calibration PDF has independently checked 50 x 50 mm and 95 x 145 mm rectangles; its preview was inspected.
- Public v0.5.1 EXE passed isolated fresh-install, bundled-runtime startup, file-hash, shortcut, update and uninstall checks. The existing installation registry was unchanged; added synthetic user files survived update/uninstall. Public package privacy scan passed with 269 files and zero configured private-identifier matches.
- The updated two-page public guide was rendered and inspected. Release artifacts are in `output/share/0.5.1`, trial/calibration PDFs in `output/pdf`, and private verification receipts in `output/private-qa/layout-051`.

No physical print was sent. The photo suggests additional print scaling: the old PDF already had 92 mm-wide picking rules, much wider than they appeared on the stock. This is an inference, not a confirmed driver diagnosis. The newly installed XP-420B initially reported USER paper at about 80 x 130 mm and only 76 mm printable width. A generic DEVMODE change did not survive independent readback, so the original defaults were restored from the saved local backup. The user then selected the driver's 4 x 6 stock (101.6 x 152.4 mm, with 1.3 mm exposed liner on each side) in the preferences UI. The user is handling that dialog; saving the new default remains unverified. The guide now supports selecting either real stock size, with actual-size / 100% printing and one PDF page per sheet. The calibration square must measure 50 x 50 mm on either stock. Hardware feed, printable area and scanner readability still require an XP-420B trial.

## Historical v0.5.0 validation — 2026-10-27

- TypeScript / Vite production build passed; 16 automated tests passed. New cases cover generic carrier layouts, missing and conflicting identifiers, separator/crop boundaries, and batch input limits.
- Actual HCT input: 5 orders / 10 output pages / 7 product rows / 70 units. Actual Shopee store-delivery input: 35 orders / 70 output pages / 47 product rows / 101 units.
- Merged output: 40 orders / 80 pages / 54 product rows / 171 units. Independent extraction matched order sequence, product names, SKUs, variants and quantities; every page measures 100 × 150 mm.
- All 115 source barcode / QR occurrences decoded identically in the output at 203 dpi. All output pages were rendered; the contact sheet and detailed shipping/picking pages were inspected.
- HCT shipping artwork is retained from the original PDF. When its tracking number has no recognizable field label, the picking page says to consult the original shipping label rather than guessing; the order ID remains the matching key.
- Synthetic FamilyMart / 7-Eleven fixtures using the assumed A4 upper-left label and lower packing table produced 2 orders / 4 pages / 5 units with both barcodes preserved. These are layout simulations, not validation of real carrier documents.
- Browser checks passed: individual files, combined files, append/reorder/remove, stale-result clearing, duplicate-order rejection, whole-batch failure on an invalid second file, and mode changes. Legacy PDF + Excel retained 2 orders / 4 pages / 6 units.
- Production-build offline reload and conversion of the real 40-order batch passed. No external requests occurred during conversion; localStorage and sessionStorage remained empty. No horizontal overflow at 390 px.
- Public EXE was tested in an isolated path with Chinese characters and spaces: fresh install, bundled Node startup, installed file hashes, four test shortcuts, update, and uninstall passed. Added user files survived update/uninstall; the pre-existing installation registry was unchanged.
- This Windows host excludes every port in the preferred 53178–53187 range. The installer successfully selected an available port without changing Windows exclusions or stopping other services. The selected port is retained for later launches.
- Public package privacy scan passed (269 package files, zero configured private-identifier matches). Customer/order fixtures and generated label PDFs remain outside Git and the public package.
- The updated two-page PDF guide was rendered and checked. Release artifacts are under `output/share/0.5.0`; private verification receipts are under `output/private-qa/2026-10-27`.

No physical XP-420B print was sent. First print one complete order at actual size / 100% on 100 × 150 mm stock and check feeding, margins and scanner readability. Real FamilyMart and 7-Eleven PDFs still need a first-sample check; unsupported or ambiguous layouts fail instead of silently omitting orders.

## Historical v0.4.0 validation — 2026-10-22

- TypeScript / Vite production build passed.
- 12 automated tests passed: glyph-aware column splitting, wrapped SKU, five rows, malformed quantities, missing headers, duplicates, legacy matching and label pagination.
- A supplied combined PDF produced 7 orders / 14 labels / 10 product rows / 11 units. Source and result are excluded from Git and releases.
- Independent pdfplumber extraction matched names, SKUs, variants and totals on all seven picking pages.
- All pages measure 100 × 150 mm. All 21 source barcode / QR occurrences decoded identically in the output at 203 dpi.
- Rendered all 14 labels and inspected the contact sheet and detailed picking page.
- Edge UI: single-file import/download, unsupported input blocking, mode changes and clearing passed. No horizontal overflow at 390 px.
- Legacy PDF + Excel mode retained 2 orders / 4 pages / 6 units in the local sample.
- Offline reload and conversion passed. No external resource requests or order values in localStorage/sessionStorage.
- Public EXE: fresh install, bundled runtime, port conflict fallback, repeat launch reuse, file hashes, shortcuts, registry, update and uninstall passed. Added synthetic user files survived update/removal.
- Public v0.3.1 to v0.4.0 upgrade passed: retired shortcuts removed, new paw icon linked, user file retained.
- Existing unrelated service retained with the same process and start time.
- Installer and two-page guide use the new name and paw icon. Package privacy scan found no configured private identifiers or order/customer files.

No physical XP-420B print was sent. Verify paper feed, darkness, margins and scanning on the printer before bulk printing. Only the documented store-delivery PDF layout has been validated; other logistics layouts require samples.
