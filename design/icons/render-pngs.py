#!/usr/bin/env python3
"""Render UI icons only. This tool never imports mascot/motion generators."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import cairosvg

ROOT = Path(__file__).resolve().parents[2]
DESIGN = ROOT / "design/icons"
manifest = json.loads((DESIGN / "manifest.json").read_text())
palette = json.loads((ROOT / "src/data/colors.generated.json").read_text())
for icon in manifest["icons"]:
    for theme in ("light", "dark"):
        svg = ET.parse(DESIGN / "drawn" / f'{icon["id"]}.svg').getroot()
        # Raster exports cannot inherit currentColor. Materialize semantic
        # ink for controls, accent for bullets, from the generated registry.
        token = "accent" if icon.get("accent") else "ink"
        svg.set("color", palette["themes"][theme][token])
        target = ROOT / "src/assets/icons/png" / theme / f'{icon["id"]}.png'
        target.parent.mkdir(parents=True, exist_ok=True)
        cairosvg.svg2png(bytestring=ET.tostring(svg), write_to=str(target),
                        output_width=manifest["pngSize"], output_height=manifest["pngSize"])
