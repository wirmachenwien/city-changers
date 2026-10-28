#!/usr/bin/env python3
"""Derive logo variants and icons from logo-lockup.svg (CairoSVG + Pillow).

Run from the repo root: python3 design/scripts/build-brand-assets.py

The editable full-logo master is read-only to this generator.
"""

from __future__ import annotations

import re
from copy import deepcopy
from io import BytesIO
from pathlib import Path
import xml.etree.ElementTree as ET
from asset_library import logo_source, copy_changed

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "src/assets/site"
# Browser/app chrome that needs stable, unhashed URLs stays in public/:
# favicon.*, apple-touch-icon.png, icon-192/512.png and site.webmanifest.
PUBLIC = ROOT / "public"
NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)
PAPER = "#fdfcf9"
INK = "#20221c"
LIGHT_INK = "#f2ede3"
DARK_OUTLINE = "#cbbf9f"  # Approved palette A: original colours, softer edges.


def svg_bytes(root: ET.Element) -> bytes:
    return ET.tostring(root, encoding="utf-8", xml_declaration=True) + b"\n"


def normalize(root: ET.Element) -> ET.Element:
    """Expand Affinity presentation styles; never rewrite geometry/transforms."""
    root = deepcopy(root)
    for element in root.iter():
        for declaration in element.attrib.pop("style", "").split(";"):
            if not declaration.strip():
                continue
            key, value = declaration.split(":", 1)
            value = re.sub(r"rgb\((\d+),(\d+),(\d+)\)",
                           lambda m: "#" + "".join(f"{int(n):02x}" for n in m.groups()), value.strip())
            if key.strip() == "stroke-width":
                value = value.removesuffix("px")
            element.set(key.strip(), value)
    return root


def artwork():
    """Read the sole master; derive the standalone symbol without editing it."""
    lockup = normalize(ET.parse(logo_source()).getroot())
    groups = lockup.findall(f"{{{NS}}}g")
    if lockup.get("viewBox") != "0 0 960 256" or len(groups) != 2 or len(groups[0]) != 9:
        raise ValueError("Review changed logo structure before generating variants")
    if any(e.tag not in {f"{{{NS}}}{tag}" for tag in ("svg", "g", "path", "ellipse", "title")}
           for e in lockup.iter()):
        raise ValueError("Unexpected SVG content in the logo master")
    symbol = deepcopy(lockup)
    symbol.set("viewBox", "0 0 256 256")
    for group in symbol.findall(f"{{{NS}}}g"):
        symbol.remove(group)
    symbol.extend(deepcopy(list(groups[0])))
    return symbol, lockup


def dark_symbol(root: ET.Element) -> ET.Element:
    result = deepcopy(root)
    # Palette A keeps the original green/yellow and dark facial features,
    # with warm outlines/boots rather than the bright wordmark cream.
    boots = result.find(f"{{{NS}}}g")
    if boots is not None:
        boots.set("fill", DARK_OUTLINE)
        for element in boots.iter():
            if element.get("fill") == INK:
                element.set("fill", DARK_OUTLINE)
    for element in result.iter():
        if element.get("stroke") == INK and element.get("id") != "mouth":
            element.set("stroke", DARK_OUTLINE)
    # The leaf's outline is also 6 units; only the smiling mouth stays dark.
    for element in result.iter(f"{{{NS}}}path"):
        if element.get("fill") == "#176b43" and element.get("stroke") == INK:
            element.set("stroke", DARK_OUTLINE)
    return result


def export() -> None:
    import cairosvg
    from PIL import Image

    symbol, lockup = artwork()
    copy_changed(logo_source(), ASSETS / "logo-lockup.svg")
    # Remove dead editor namespaces and keep a fixed, accessible title.
    for root, title in [(symbol, "Toolbox for City Changers — The Green Fix"),
                        (lockup, "Toolbox for City Changers")]:
        root.set("role", "img")
        root.set("aria-labelledby", "title")
        title_element = root.find(f"{{{NS}}}title")
        if title_element is None:
            title_element = ET.Element(f"{{{NS}}}title", {"id": "title"})
            root.insert(0, title_element)
        title_element.text = title

    symbol_dark = dark_symbol(symbol)
    lockup_dark = deepcopy(lockup)
    # Lockup first group contains the mascot; the second preserves imported lettering.
    mascot_group, wordmark_group = lockup_dark.findall(f"{{{NS}}}g")
    mascot_dark = dark_symbol(mascot_group)
    lockup_dark.remove(mascot_group)
    lockup_dark.insert(1, mascot_dark)
    for element in wordmark_group.iter():
        if element.get("fill") == INK:
            element.set("fill", LIGHT_INK)
        style = element.get("style")
        if style:
            element.set("style", style.replace("rgb(32,34,28)", LIGHT_INK))

    small = deepcopy(symbol)
    # Remove fine arms; enlarge expression for 16–32 px, retaining the wrench,
    # shoot and outward-facing boots. Full-size mascot is unchanged.
    for element in list(small):
        if element.get("id") == "arms":
            small.remove(element)
    for element in small.iter(f"{{{NS}}}ellipse"):
        element.set("rx", "5")
    for element in small.iter(f"{{{NS}}}path"):
        if element.get("id") == "mouth":
            element.set("stroke-width", "8")

    exports = {"logo.svg": symbol, "logo-dark.svg": symbol_dark,
               "logo-lockup-dark.svg": lockup_dark,
               "logo-small.svg": small}
    for name, root in exports.items():
        (ASSETS / name).write_bytes(svg_bytes(root))

    def tile(root: ET.Element, padding: int = 12) -> bytes:
        canvas = ET.Element(f"{{{NS}}}svg", {"viewBox": "0 0 256 256"})
        ET.SubElement(canvas, f"{{{NS}}}rect", {"width": "256", "height": "256", "fill": PAPER})
        art = deepcopy(root)
        art.set("x", str(padding))
        art.set("y", str(padding))
        art.set("width", str(256 - 2 * padding))
        art.set("height", str(256 - 2 * padding))
        canvas.append(art)
        return svg_bytes(canvas)

    icon = tile(small, 0)
    # Transparent browser favicon; follow browser chrome rather than the
    # site's manual theme. Keep raster fallbacks neutral-backed below.
    favicon = deepcopy(small)
    style = ET.Element(f"{{{NS}}}style")
    style.text = (
        f".favicon-edge {{ stroke: {INK}; }}\n"
        f".favicon-boots {{ fill: {INK}; }}\n"
        "@media (prefers-color-scheme: dark) {\n"
        f"  .favicon-edge {{ stroke: {DARK_OUTLINE}; }}\n"
        f"  .favicon-boots {{ fill: {DARK_OUTLINE}; }}\n"
        "}"
    )
    favicon.insert(1, style)
    favicon.find(f"{{{NS}}}g").set("class", "favicon-boots")
    for element in favicon.find(f"{{{NS}}}g").iter():
        element.attrib.pop("fill", None)
    for element in favicon.iter(f"{{{NS}}}path"):
        if element.get("stroke") == INK and element.get("id") != "mouth":
            element.set("class", "favicon-edge")
    (PUBLIC / "favicon.svg").write_bytes(svg_bytes(favicon))
    for name, size, art in [("favicon.png", 48, icon),
                            ("apple-touch-icon.png", 180, tile(symbol)),
                            ("icon-192.png", 192, tile(symbol)),
                            ("icon-512.png", 512, tile(symbol))]:
        cairosvg.svg2png(bytestring=art, write_to=str(PUBLIC / name), output_width=size, output_height=size)
    ico = Image.open(BytesIO(cairosvg.svg2png(bytestring=icon, output_width=256, output_height=256)))
    ico.save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    cairosvg.svg2png(bytestring=tile(symbol, 0), write_to=str(ASSETS / "logo.png"), output_width=512, output_height=512)
    # Full title-page lockup with a transparent background.
    cairosvg.svg2png(bytestring=svg_bytes(lockup), write_to=str(ASSETS / "logo-lockup.png"),
                    output_width=2400, output_height=640)

    social = ET.Element(f"{{{NS}}}svg", {"viewBox": "0 0 1200 630"})
    ET.SubElement(social, f"{{{NS}}}rect", {"width": "1200", "height": "630", "fill": PAPER})
    art = deepcopy(lockup)
    art.set("viewBox", "24 0 808 256")  # trim unused canvas, never move the letters
    art.set("x", "90")
    art.set("y", "153")
    art.set("width", "1020")
    art.set("height", "324")
    social.append(art)
    cairosvg.svg2png(bytestring=svg_bytes(social), write_to=str(ASSETS / "og-image.png"), output_width=1200, output_height=630)
    print("Exported Green Fix logos, dark and tiny variants, browser/app icons, print PNG and share image.")


if __name__ == "__main__":
    ASSETS.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    export()
