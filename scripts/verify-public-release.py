"""Fail closed if the sharing edition includes private identifiers or data files."""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import json
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("--archive", type=Path, required=True)
parser.add_argument("--exe", type=Path, required=True)
parser.add_argument("--distribution", type=Path, required=True)
args = parser.parse_args()

# This scanner is a local development tool. Neither this list nor private
# verification logs are included in the sharing directory or installer payload.
terms_file = Path(__file__).resolve().parent.parent / '.private-release-terms.json'
terms = json.loads(terms_file.read_text(encoding='utf-8')) if terms_file.exists() else []
needles = {(term.encode(encoding).lower()) for term in terms for encoding in ("utf-8", "utf-16le", "utf-16be")}
forbidden_extensions = {".pdf", ".xlsx", ".xls", ".csv", ".log", ".pdb", ".map", ".db", ".sqlite", ".bak"}
forbidden_parts = {".runtime", ".git", ".env", "shopee-print-ext", "output", "tests"}

def check_bytes(data, label):
    lowered = data.lower()
    if any(needle in lowered for needle in needles):
        raise SystemExit(f"Private identifier found in {label}; public release was rejected.")

archive_bytes = args.archive.read_bytes()
exe_bytes = args.exe.read_bytes()
check_bytes(exe_bytes, "setup executable")
if archive_bytes not in exe_bytes:
    raise SystemExit("The verified ZIP is not embedded verbatim in the setup executable.")
count = 0
license_count = 0
file_hashes = {}
with zipfile.ZipFile(args.archive) as package:
    names = package.namelist()
    if len(names) != len(set(names)):
        raise SystemExit("Duplicate payload entries.")
    manifests = [name for name in names if name.endswith("/package-manifest.json")]
    if len(manifests) != 1:
        raise SystemExit("Expected exactly one manifest.")
    manifest = json.loads(package.read(manifests[0]))
    if manifest["appId"] != "shipping-workbench" or manifest["edition"] != "public":
        raise SystemExit("Unexpected public application identity.")
    prefix = f"ShopeeMeowPrint-{manifest['version']}/"
    outside_payload = {"package-manifest.json", "install.ps1", "安裝.cmd", "使用說明.html"}
    seen_payload = set()
    for entry in package.infolist():
        path = PurePosixPath(entry.filename)
        check_bytes(entry.filename.encode("utf-8"), "archive entry name")
        if not entry.filename.startswith(prefix) or ".." in path.parts or path.suffix.lower() in forbidden_extensions or forbidden_parts.intersection(path.parts):
            raise SystemExit(f"Forbidden public package path: {entry.filename}")
        relative = entry.filename[len(prefix):]
        if not relative.startswith("payload/") and relative not in outside_payload:
            raise SystemExit(f"Unexpected top-level package file: {relative}")
        data = package.read(entry)
        check_bytes(data, entry.filename)
        if relative.startswith("payload/"):
            payload_path = relative[len("payload/"):]
            seen_payload.add(payload_path)
            file_hashes[payload_path] = hashlib.sha256(data).hexdigest()
        if "/licenses/" in entry.filename or entry.filename.endswith("/runtime/LICENSE"):
            license_count += 1
        count += 1
    if seen_payload != {item["path"] for item in manifest["files"]}:
        raise SystemExit("Manifest does not exactly cover the payload.")
    if any(file_hashes[item["path"]] != item["sha256"] for item in manifest["files"]):
        raise SystemExit("Manifest checksum mismatch.")
    if license_count == 0:
        raise SystemExit("Third-party license notices are missing.")
    install = package.read(prefix + "install.ps1").decode("utf-8-sig")
    setup_strings = [
        "'ShippingWorkbench'",
        "DisplayName='蝦皮印單喵'",
        "Publisher=''",
        "Uninstall\\ShippingWorkbench",
    ]
    if not all(text in install for text in setup_strings):
        raise SystemExit("Installer identity was not completely neutralized.")

expected = {args.exe.name, args.exe.name + ".sha256", "使用說明.html", "版本檢查.json"}
companion_guide = "蝦皮印單喵-安裝及使用說明.pdf"
expected.add(companion_guide)
checked_guides = []
for path in args.distribution.iterdir():
    if not path.is_file() or path.name not in expected:
        raise SystemExit("The sharing directory includes an unexpected file.")
    check_bytes(path.name.encode("utf-8"), "distribution file name")
    if path != args.exe:
        check_bytes(path.read_bytes(), path.name)
    if path.name == companion_guide:
        # Only this known companion document is allowed outside the payload.
        # Inspect decompressed text too: raw PDF bytes can hide text in streams.
        from pypdf import PdfReader
        reader = PdfReader(path, strict=True)
        if reader.is_encrypted or reader.attachments or reader.get_fields():
            raise SystemExit("The companion guide contains unexpected hidden or interactive content.")
        if len(reader.pages) != 2:
            raise SystemExit("The companion guide must be the two-page quick guide.")
        content = "\n".join(page.extract_text() or "" for page in reader.pages)
        check_bytes((content + str(reader.metadata)).encode("utf-8"), "companion guide text and metadata")
        checked_guides.append(companion_guide)
digest = hashlib.sha256(exe_bytes).hexdigest()
if args.exe.with_name(args.exe.name + ".sha256").read_text(encoding="ascii").split()[0] != digest:
    raise SystemExit("Executable checksum file does not match.")
report = {
    "app": "蝦皮印單喵",
    "version": manifest["version"],
    "edition": "public",
    "checkedPackageFiles": count,
    "checkedInstalledFiles": len(file_hashes),
    "privateIdentifierMatches": 0,
    "sourceOrderOrCustomerFilesIncluded": False,
    "thirdPartyLicenseFiles": license_count,
    "embeddedPayloadMatches": True,
    "checkedCompanionGuides": checked_guides,
    "sha256": digest,
}
(args.distribution / "版本檢查.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"publicReleaseCheck": "passed", "packageFiles": count, "privateMatches": 0}))
