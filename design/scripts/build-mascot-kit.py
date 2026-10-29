#!/usr/bin/env python3
"""Build static mascot media in src/assets/mascot using in-memory geometry."""
from __future__ import annotations

from io import BytesIO
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import cairosvg
from PIL import Image, ImageDraw, ImageFont

DESIGN = Path(__file__).resolve().parents[1]
KIT = DESIGN.parent / "src/assets/mascot"
POSES = DESIGN / "assets/mascot/source/poses.json"
STATIC_POSES = DESIGN / "assets/mascot/source/static-poses.json"
SVG = "http://www.w3.org/2000/svg"
NS = "{" + SVG + "}"
ET.register_namespace("", SVG)
INK = "#20221c"
WARM = "#cbbf9f"


def load_poses():
    # Static overrides never change the base poses consumed by the animations.
    return json.loads(POSES.read_text()) | json.loads(STATIC_POSES.read_text())


def node(element):
    return {"tag": element.tag.removeprefix(NS), "attrs": dict(element.attrib)}


def build_rig():
    root = ET.parse(DESIGN.parent / "src/assets/site/logo.svg").getroot()
    children = list(root)
    return {
        "boots": [node(e) for e in root.find(NS + "g")],
        "body": [node(e) for e in children[3:5]],
        "eyes": [node(e) for e in root.findall(NS + "ellipse")],
        "plant": [node(e) for e in children[-2:]],
    }


def element(data, dark=False, **attrs):
    values = dict(data["attrs"])
    if dark:
        for key in ("fill", "stroke"):
            if values.get(key) == INK:
                values[key] = WARM
    values.update({k.replace("_", "-"): str(v) for k, v in attrs.items()})
    return ET.Element(NS + data["tag"], values)


def make_svg(rig, pose, name, dark=False):
    edge = WARM if dark else INK
    root = ET.Element(NS + "svg", {
        "viewBox": "-16 -16 288 288", "fill-rule": "evenodd",
        "clip-rule": "evenodd", "stroke-linecap": "round",
        "role": "img", "aria-labelledby": "title",
    })
    ET.SubElement(root, NS + "title", {"id": "title"}).text = "The Green Fix — " + pose["label"]
    group = ET.SubElement(root, NS + "g", {
        "transform": f"translate(0 {pose['lift']}) rotate({pose['tilt']} 128 220)"
    })
    for index, side in enumerate(("left", "right")):
        boot = ET.SubElement(group, NS + "g", {
            "id": side + "-boot", "transform": f"rotate({pose[side + 'Boot']} {116 if index == 0 else 140} 202)"
        })
        boot.append(element(rig["boots"][index], dark))

    def arm(side):
        attrs = {
            "id": side + "-arm", "d": pose[side + "Arm"],
            "fill": "none", "stroke": edge, "stroke-width": "9",
        }
        if side + "ArmX" in pose:
            attrs["transform"] = f"translate({pose[side + 'ArmX']} 0)"
        return ET.Element(NS + "path", attrs)

    group.append(arm("left"))
    if not pose["frontArm"]:
        group.append(arm("right"))
    for index, item in enumerate(rig["body"]):
        values = {"fill": pose["faceColor"]} if index == 0 and "faceColor" in pose else {}
        group.append(element(item, dark, **values))
    if pose["eyes"] == "happy":
        for d in ("M110,163Q115,153 120,163", "M136,161Q141,151 146,161"):
            ET.SubElement(group, NS + "path", {"d": d, "fill": "none", "stroke": INK, "stroke-width": "5"})
    else:
        for eye in rig["eyes"]:
            values = {"ry": 5} if pose["eyes"] == "thoughtful" else {}
            group.append(element(eye, **values))
    ET.SubElement(group, NS + "path", {
        "id": "mouth", "d": pose["mouth"], "fill": "none", "stroke": INK, "stroke-width": "6",
    })
    for item in rig["plant"]:
        group.append(element(item, dark))
    if pose["frontArm"]:
        group.append(arm("right"))
    if pose.get("ideaRays"):
        ET.SubElement(group, NS + "path", {
            "id": "idea-rays", "d": pose["ideaRays"], "fill": "none",
            "stroke": "#ffd84f", "stroke-width": "4",
        })
    return ET.tostring(root, encoding="utf-8", xml_declaration=True) + b"\n"


def font(size):
    return ImageFont.truetype(str(DESIGN.parent / "src/assets/fonts/ClarityCity-Regular.ttf"), size)


def build():
    rig = build_rig()
    poses = load_poses()
    output = KIT / "static"
    height = 410 + ((len(poses) + 2) // 3) * 540
    board = Image.new("RGB", (1800, height), "#fdfcf9")
    draw = ImageDraw.Draw(board)
    draw.text((76, 54), "THE GREEN FIX / MASCOT KIT", font=font(24), fill="#176b43")
    draw.text((72, 100), "One neighbour. Many ways to help.", font=font(56), fill=INK)
    draw.text((76, 180), "Transparent SVG + 1080 px PNG  ·  Ink and Linen outlines  ·  Same approved mascot", font=font(24), fill=INK)
    for index, (name, pose) in enumerate(poses.items()):
        x, y = 60 + (index % 3) * 570, 255 + (index // 3) * 540
        draw.rounded_rectangle((x, y, x + 550, y + 520), 24, fill="#efeee5")
        for dark in (False, True):
            treatment = "linen" if dark else "ink"
            folder = output / treatment
            folder.mkdir(parents=True, exist_ok=True)
            svg = make_svg(rig, pose, name, dark)
            (folder / f"{name}.svg").write_bytes(svg)
            png = cairosvg.svg2png(bytestring=svg, output_width=1080, output_height=1080)
            (folder / f"{name}.png").write_bytes(png)
            art = Image.open(BytesIO(png)).convert("RGBA")
            if not dark:
                art.thumbnail((375, 375))
                board.paste(art, (x + 80, y + 16), art)
            else:
                draw.rounded_rectangle((x + 412, y + 324, x + 534, y + 446), 16, fill="#161511")
                art.thumbnail((112, 112))
                board.paste(art, (x + 417, y + 329), art)
        draw.text((x + 28, y + 407), f"0{index + 1} / {name.upper()}", font=font(20), fill="#176b43")
        draw.text((x + 28, y + 446), pose["label"], font=font(31), fill=INK)
    draw.text((76, height - 75), "Production logo unchanged. Poses are illustration assets for video and social media.", font=font(24), fill=INK)
    board.save(KIT / "overview.png")
    print(f"Built {len(poses)} poses × 2 treatments (SVG + PNG) and overview in {KIT}")


if __name__ == "__main__":
    build()
