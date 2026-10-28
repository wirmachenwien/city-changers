#!/usr/bin/env python3
"""Render import proofs and record exact asset hashes without a browser."""
from copy import deepcopy
from io import BytesIO
from pathlib import Path
import hashlib
import json
import xml.etree.ElementTree as ET

import cairosvg
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
source = ROOT / "src/assets/site/logo-lockup-new.svg"
digest = hashlib.sha256(source.read_bytes()).hexdigest()
out = ROOT / "design/logo/imports" / digest[:12]
NS = "{http://www.w3.org/2000/svg}"

def render(path, width=1920, height=512):
    return Image.open(BytesIO(cairosvg.svg2png(url=str(path), output_width=width,
                                            output_height=height))).convert("RGBA")

original = render(source)
active = render(ROOT / "src/assets/site/logo-lockup.svg")
assert ImageChops.difference(original, active).getbbox() is None, "Import changed visible artwork"
assert original.tobytes() == active.tobytes(), "Import changed rendered pixels"
original.save(out / "source-proof.png")

proof = Image.new("RGB", (1200, 460))
draw = ImageDraw.Draw(proof)
for row, (name, bg, file) in enumerate([
    ("Light — imported artwork", "#fdfcf9", "logo-lockup.svg"),
    ("Dark — approved palette A", "#161511", "logo-lockup-dark.svg"),
]):
    y = row * 230
    draw.rectangle((0, y, 1200, y + 230), fill=bg)
    draw.text((24, y + 12), name, fill="#cbbf9f")
    art = render(ROOT / "src/assets/site" / file, 960, 256)
    art.thumbnail((760, 190))
    proof.paste(art, (24, y + 32), art)
proof.save(out / "lockup-proof.png")

icons = Image.new("RGB", (800, 240))
draw = ImageDraw.Draw(icons)
for col, (bg, edge) in enumerate([("#fdfcf9", "#20221c"), ("#161511", "#cbbf9f")]):
    x = col * 400
    draw.rectangle((x, 0, x + 400, 240), fill=bg)
    root = ET.parse(ROOT / "public/favicon.svg").getroot()
    root.remove(root.find(NS + "style"))
    for e in root.iter():
        if e.get("class") == "favicon-edge":
            e.set("stroke", edge)
        if e.get("class") == "favicon-boots":
            e.set("fill", edge)
    for dx, size in [(24, 128), (180, 48), (258, 32), (330, 16)]:
        png = cairosvg.svg2png(bytestring=ET.tostring(root), output_width=size, output_height=size)
        art = Image.open(BytesIO(png)).convert("RGBA")
        assert art.getpixel((0, 0))[3] == 0
        icons.paste(art, (x + dx, 110 - size // 2), art)
        draw.text((x + dx, 195), f"{size}px", fill=edge)
icons.save(out / "favicon-proof.png")

assets = {}
for folder in [ROOT / "public", ROOT / "src/assets/site"]:
    for p in sorted(folder.iterdir()):
        if p.is_file() and p.name.startswith(("logo", "favicon", "icon-", "apple-touch", "og-image")):
            assets[str(p.relative_to(ROOT))] = hashlib.sha256(p.read_bytes()).hexdigest()
(out / "asset-hashes.json").write_text(json.dumps(assets, indent=2) + "\n")
print(f"Source and imported lockup are pixel-identical at 1920 × 512. Proofs/hashes: {out.relative_to(ROOT)}")
