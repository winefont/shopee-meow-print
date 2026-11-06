# Paw artwork

Generated with the built-in imagegen tool for Shopee Meow Print. No order documents, customer data, or third-party shipping labels were included in the prompts or references.

- `paw-app-source.png`: cream-white marshmallow paw with four pink toe beans, a smiling heart-shaped center pad, tiny arms hugging a blank parcel label, a dark sage-green rounded tile, and a small warm-yellow sparkle. No lettering or real barcode. Designed to remain recognizable at small app-icon sizes.
- `paw-mascot-source.png`: matching transparent paw mascot without the background tile or sparkle, preserving its friendly expression and blank parcel label.

These are the final visual briefs used for the built-in generation/editing workflow. The former project icon was the starting reference. Generated originals remain in local image-generation history.

Run `node scripts/make-icons.mjs` to resize the source artwork into app icons, a maskable PWA icon, a transparent UI mascot, and the standalone HTML guide's embedded logo. The build script only resizes and formats the masters. The installer derives multi-size ICO files from `public/icon-512.png` and uses a versioned icon path so Windows does not retain an old shortcut icon.
