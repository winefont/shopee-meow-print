# v0.4.0 validation — 2026-10-22

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
