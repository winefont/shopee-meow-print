"""Build a single offline Windows setup EXE and its allowlisted payload ZIP."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("--node-dir", type=Path, required=True, help="Verified official Windows x64 Node distribution")
parser.add_argument("--public", action="store_true", help="Build the neutral, privacy-checked sharing edition")
args = parser.parse_args()
args.public = True
version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
prefix = "ShopeeMeowPrint"
app_id = "shipping-workbench"
resource_name = "ShopeeMeowPrint.Package.zip"
edition = "public"
node_dir = args.node_dir.resolve()
node_version = subprocess.check_output([str(node_dir / "node.exe"), "--version"], text=True).strip()
compiler = Path(os.environ["SystemRoot"]) / "Microsoft.NET/Framework64/v4.0.30319/csc.exe"
if not compiler.is_file():
    raise SystemExit("The Windows .NET Framework C# compiler is required to build setup.")
stage = Path(tempfile.mkdtemp(prefix=f"package-stage-{edition}-{version}-", dir=ROOT / ".runtime"))
package_root = stage / f"{prefix}-{version}"
payload = package_root / "payload"
payload.mkdir(parents=True)

def neutralize_first_party(text: str) -> str:
    terms_file = ROOT / '.private-release-terms.json'
    terms = json.loads(terms_file.read_text(encoding='utf-8')) if terms_file.exists() else []
    if any(term.casefold() in text.casefold() for term in terms):
        raise SystemExit("Private brand identifier found in first-party source")
    return text


def copy(source: Path, destination: Path, first_party=False):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if first_party and args.public:
        content = neutralize_first_party(source.read_text(encoding="utf-8-sig"))
        destination.write_text(content, encoding="utf-8-sig" if source.suffix == ".ps1" else "utf-8")
    elif source.suffix == ".ps1":
        # Windows PowerShell 5.1 needs a BOM for Traditional Chinese messages.
        destination.write_text(source.read_text(encoding="utf-8-sig"), encoding="utf-8-sig")
    else:
        shutil.copy2(source, destination)

for source in (ROOT / "dist").rglob("*"):
    if source.is_symlink():
        raise SystemExit("Symlinks are not allowed in application assets")
    if source.is_file():
        copy(source, payload / "dist" / source.relative_to(ROOT / "dist"))
for name in ["serve.mjs", "start.ps1", "stop.ps1"]:
    copy(ROOT / "scripts" / name, payload / "scripts" / name, first_party=True)
for name in ["start-tool.cmd", "stop-tool.cmd"]:
    copy(ROOT / name, payload / name, first_party=True)
copy(ROOT / "installer" / "uninstall.ps1", payload / "uninstall.ps1", first_party=True)
guide = ROOT / "installer" / "public-guide.html"
copy(guide, payload / "使用說明.html")
copy(guide, package_root / "使用說明.html")
copy(ROOT / "installer" / "install.cmd", package_root / "安裝.cmd", first_party=True)
copy(ROOT / "installer" / "install.ps1", package_root / "install.ps1", first_party=True)
copy(node_dir / "node.exe", payload / "runtime" / "node.exe")
copy(node_dir / "LICENSE", payload / "runtime" / "LICENSE")

from PIL import Image
Image.open(ROOT / "public" / "icon-512.png").save(payload / "app.ico", sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
# A versioned icon path makes Windows refresh shortcuts without resetting its cache.
copy(payload / "app.ico", payload / f"app-{version}.ico")
# Preserve dependency license notices without shipping node_modules or order files.
for source in (ROOT / "node_modules").rglob("*"):
    if source.is_file() and source.name.lower().split(".")[0] in {"license", "licence", "copying", "notice"}:
        copy(source, payload / "licenses" / source.relative_to(ROOT / "node_modules"))
copy(ROOT / "public" / "fonts" / "OFL.txt", payload / "licenses" / "Noto-Sans-TC-OFL.txt")
files = []
for source in sorted(payload.rglob("*")):
    if source.is_file():
        relative = source.relative_to(payload).as_posix()
        if source.suffix.lower() in {".pdf", ".xlsx", ".xls", ".csv"}:
            raise SystemExit(f"Order/document files must never be packaged: {relative}")
        files.append({"path": relative, "sha256": hashlib.sha256(source.read_bytes()).hexdigest()})
manifest = {"appId":app_id, "edition":edition, "version":version, "nodeVersion":node_version, "files":files}
(package_root / "package-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
release = ROOT / "output" / "installer"
release.mkdir(parents=True, exist_ok=True)
archive = release / f"{prefix}-{version}-Windows-x64.zip"
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zipped:
    for source in sorted(package_root.rglob("*")):
        if source.is_file():
            zipped.write(source, source.relative_to(stage))
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(release / f"{archive.name}.sha256").write_text(f"{digest}  {archive.name}\n", encoding="ascii")
build_constants = stage / "SetupBuild.cs"
assembly_title = "Shopee Meow Print"
assembly_company = ""
build_constants.write_text(
    'using System.Reflection;\n'
    f'[assembly: AssemblyTitle("{assembly_title} Setup")]\n'
    f'[assembly: AssemblyProduct("{assembly_title}")]\n'
    f'[assembly: AssemblyCompany("{assembly_company}")]\n'
    f'[assembly: AssemblyVersion("{version}.0")]\n'
    f'[assembly: AssemblyFileVersion("{version}.0")]\n'
    'internal static class SetupBuild {\n'
    f'    public const string Version = "{version}";\n'
    f'    public const string PackageName = "{package_root.name}";\n'
    f'    public const string PackageSha256 = "{digest}";\n'
    '}\n', encoding="utf-8")
distribution = ROOT / "output" / "share" / version
distribution.mkdir(parents=True, exist_ok=True)
executable = distribution / f"{prefix}-Setup-{version}-Windows-x64.exe"
setup_source = ROOT / "installer" / "Setup.cs"
setup_manifest = ROOT / "installer" / "setup.manifest"
if args.public:
    copy(setup_source, stage / "Setup.cs", first_party=True)
    copy(setup_manifest, stage / "setup.manifest", first_party=True)
    setup_source = stage / "Setup.cs"
    setup_manifest = stage / "setup.manifest"
command = [
    str(compiler), "/nologo", "/target:winexe", "/platform:x64", "/optimize+", "/utf8output",
    f"/out:{executable}", f"/resource:{archive},{resource_name}",
    f"/win32icon:{payload / 'app.ico'}", f"/win32manifest:{setup_manifest}",
    f"/resource:{ROOT / 'public' / 'icon-192.png'},ShopeeMeowPrint.BrandIcon.png",
    "/reference:System.dll", "/reference:System.Core.dll", "/reference:System.Drawing.dll",
    "/reference:System.Windows.Forms.dll", "/reference:System.IO.Compression.dll",
    str(setup_source), str(build_constants),
]
compiled = subprocess.run(command, text=True, capture_output=True, encoding="utf-8")
if compiled.returncode:
    raise SystemExit(compiled.stdout + compiled.stderr)
exe_digest = hashlib.sha256(executable.read_bytes()).hexdigest()
(distribution / f"{executable.name}.sha256").write_text(f"{exe_digest}  {executable.name}\n", encoding="ascii")
if args.public:
    copy(guide, distribution / "使用說明.html")
    # Scan uncompressed payload AND the final executable (including UTF-16
    # Windows version strings) before declaring the public release ready.
    subprocess.run([
        os.sys.executable, str(ROOT / "scripts" / "verify-public-release.py"),
        "--archive", str(archive), "--exe", str(executable),
        "--distribution", str(distribution),
    ], check=True)
report = {
    "version":version, "edition":edition, "node":node_version, "files":len(files), "archive":str(archive),
    "stage":str(stage), "archiveSha256":digest, "executable":str(executable),
    "bytes":executable.stat().st_size, "sha256":exe_digest,
}
(release / f"build-{edition}-{version}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=True))
