#!/usr/bin/env python3
"""Prepare release links and small website previews, not a ZIP or originals."""
import json
from pathlib import Path

from asset_library import ROOT, copy_changed
from brand_release import check_artwork, inventory


def prepare():
    check_artwork()
    release = inventory()
    target = ROOT / "public/brand-assets"
    target.mkdir(parents=True, exist_ok=True)
    catalogue = target / "catalog.json"
    previous = json.loads(catalogue.read_text()) if catalogue.exists() else []
    previews = target / "previews"
    previews.mkdir(exist_ok=True)
    cache = ROOT / "design/.cache/brand-previews"
    cache.mkdir(parents=True, exist_ok=True)
    expected = set()
    for record in release["assets"]:
        source = ROOT / record["source"]
        extension = source.suffix.lower()
        if extension not in {".svg", ".png", ".jpg", ".jpeg"}:
            continue
        name = record["releaseAsset"]
        if extension == ".svg":
            copy_changed(source, previews / name)
            record["preview"] = f"/brand-assets/previews/{name}"
            expected.add(name)
        else:
            from PIL import Image, ImageOps
            variants = []
            with Image.open(source) as original:
                original = ImageOps.exif_transpose(original)
                widths = sorted({min(width, original.width) for width in (240, 480, 720)})
                for width in widths:
                    filename = f"{name}-{width}.webp"
                    output = previews / filename
                    stamp = cache / f"{filename}.sha256"
                    key = f"v3:{record['sha256']}"
                    if not output.exists() or not stamp.exists() or stamp.read_text() != key:
                        image = original.resize((width, max(1, round(original.height * width / original.width))), Image.Resampling.LANCZOS)
                        image.save(output, "WEBP", lossless=extension == ".png", quality=80)
                        stamp.write_text(key)
                    variants.append(f"/brand-assets/previews/{filename} {width}w")
                    expected.add(filename)
            record["preview"] = f"/brand-assets/previews/{name}-{min(480, original.width)}.webp"
            record["srcset"] = ", ".join(variants)
    for path in previews.iterdir():
        if path.is_file() and path.name not in expected:
            path.unlink()
    # Migrate only previously catalogued originals, never arbitrary user files.
    for record in previous:
        relative = Path(record["file"])
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("Unsafe generated catalogue entry")
        path = target / "files" / relative
        path.unlink(missing_ok=True)
    (target / "city-changers-brand-kit.zip").unlink(missing_ok=True)
    catalogue.write_text(json.dumps(release["assets"], indent=2) + "\n")
    (target / "release.json").write_text(json.dumps({key: value for key, value in release.items() if key != "assets"}, indent=2) + "\n")
    print(f"Brand website prepared: {len(release['assets'])} release links; previews only on Pages.")


if __name__ == "__main__":
    prepare()
