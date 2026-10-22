from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

project = Path(__file__).resolve().parent.parent
source = project / "vendor" / "fonts"
root = project / "public" / "fonts"
root.mkdir(parents=True, exist_ok=True)
font = TTFont(source / "NotoSansTC-Variable.ttf")
instantiateVariableFont(font, {"wght": 400}, inplace=True)
font.save(root / "NotoSansTC-Regular.ttf")
(root / "OFL.txt").write_bytes((source / "OFL.txt").read_bytes())
