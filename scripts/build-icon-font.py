"""Builds the bundled Tabler icon font (frontend/src/assets/icons/).

The app used to load all ~5,000 Tabler icons (764 KB) from a CDN, so icons
vanished whenever the CDN was blocked or the phone was offline. This keeps
only the icons the code uses (about 25 KB) inside the app.

Run after adding a new `ti-...` icon anywhere:
    pip install fonttools brotli
    npm pack @tabler/icons-webfont@2.47.0 && tar xzf tabler-icons-webfont-2.47.0.tgz
    python3 scripts/build-icon-font.py package
"""
import os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG = sys.argv[1]
OUT = os.path.join(ROOT, "frontend", "src", "assets", "icons")
SRC = ["frontend/src", "apps/oil-analysis/src", "apps/vibration-analysis/src"]

css = open(os.path.join(PKG, "tabler-icons.css")).read()
cp = {m.group(1): m.group(2) for m in re.finditer(r'\.(ti-[a-z0-9-]+):before \{\s*content: "\\([0-9a-f]+)";', css)}

# every "ti-name" in the code, plus icon="name" / icon: "name" props
# (ModalShell and FormSection add the "ti-" themselves)
found = set()
for base in SRC:
    for d, _, files in os.walk(os.path.join(ROOT, base)):
        for f in files:
            if not f.endswith((".js", ".jsx", ".ts", ".tsx", ".css")):
                continue
            text = open(os.path.join(d, f), encoding="utf-8").read()
            found.update(re.findall(r"\bti-[a-z0-9]+(?:-[a-z0-9]+)*", text))
            found.update("ti-" + n.removeprefix("ti-") for n in re.findall(r"icon(?:=|: ?)[\"'`]([a-z0-9-]+)[\"'`]", text))
use = sorted(n for n in found if n in cp)

subprocess.run(["pyftsubset", os.path.join(PKG, "fonts", "tabler-icons.ttf"), "--unicodes=" + ",".join("U+" + cp[n] for n in use),
                "--flavor=woff2", "--output-file=" + os.path.join(OUT, "tabler-icons-subset.woff2"),
                "--no-hinting", "--drop-tables+=GSUB,GPOS,GDEF", "--layout-features="], check=True)
lines = [
    "/* Tabler Icons 2.47.0 (MIT licence, https://tabler.io) - only the icons this app",
    "   uses, bundled so they show without internet. Made by scripts/build-icon-font.py;",
    "   run it again after using a new icon. */",
    '@font-face { font-family: "tabler-icons"; font-style: normal; font-weight: 400; font-display: block; src: url("./tabler-icons-subset.woff2") format("woff2"); }',
    '.ti { font-family: "tabler-icons" !important; speak: none; font-style: normal; font-weight: normal; font-variant: normal; text-transform: none; line-height: 1; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }',
] + ['.%s:before { content: "\\%s"; }' % (n, cp[n]) for n in use]
open(os.path.join(OUT, "tabler-icons-subset.css"), "w").write("\n".join(lines) + "\n")
print(len(use), "icons")
