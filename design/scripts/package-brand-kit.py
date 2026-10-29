#!/usr/bin/env python3
"""Collect existing approved exports into a standalone folder and ZIP (stdlib only)."""
from __future__ import annotations

import argparse
import hashlib
import html
import json
from pathlib import Path
import shutil
import sys
import tempfile
import zipfile
from asset_library import asset_records

ROOT = Path(__file__).resolve().parents[2]
DESIGN = ROOT / "design"
sys.path.insert(0, str(ROOT / "scripts"))
from color_registry import load_colors


def asset_map():
    """Explicit allowlist: never ship dependencies, source code or arbitrary files."""
    return {record["file"]: ROOT / record["source"] for record in asset_records()}


def build(output):
    colors = load_colors()["themes"]["light"]
    files = asset_map()
    missing = [str(path.relative_to(ROOT)) for path in files.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError("Missing required assets:\n" + "\n".join(missing))
    output.mkdir(parents=True, exist_ok=True)
    target = output / "city-changers-brand-kit"
    archive = output / "city-changers-brand-kit.zip"
    # Refuse to overwrite unknown folders. Never delete a recipient's additions.
    if target.exists() or archive.exists():
        raise FileExistsError(f"Release already exists in {output}. Choose a fresh --output folder.")
    with tempfile.TemporaryDirectory(prefix=".brand-kit-", dir=output) as temporary:
        kit = Path(temporary) / target.name
        kit.mkdir()
        inventory = []
        for destination, source in sorted(files.items()):
            path = kit / destination
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, path)
            inventory.append({"file": destination, "source": str(source.relative_to(ROOT)),
                              "bytes": path.stat().st_size,
                              "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        text = (kit / "START-HERE.txt").read_text()
        (kit / "START-HERE.html").write_text(
            '<!doctype html><html lang="en"><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>City Changers — Start here</title>'
            '<style>body{max-width:72ch;margin:3rem auto;padding:0 1rem;'
            f'font:18px/1.6 system-ui;color:{colors["ink"]};background:{colors["paper"]}}}'
            'pre{white-space:pre-wrap;font:inherit}</style><main><h1>City Changers brand kit</h1><pre>'
            + html.escape(text) + '</pre></main></html>')
        (kit / "inventory.json").write_text(json.dumps({"assets": inventory}, indent=2) + "\n")
        zip_path = Path(temporary) / archive.name
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zipped:
            for path in sorted(kit.rglob("*")):
                if path.is_file():
                    zipped.write(path, path.relative_to(kit.parent))
        shutil.move(str(kit), target)
        zip_path.replace(archive)
    print(f"Ready to send: {archive}\nFolder: {target}\n{len(files)} assets and documents included.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DESIGN / "handoff",
                        help="Destination parent; use a fresh folder for each release")
    build(parser.parse_args().output.resolve())
