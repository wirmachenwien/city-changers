"""Shared manifest reader: one asset inventory for the site and recipient kit."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
from glob import has_magic

ROOT = Path(__file__).resolve().parents[2]
DESIGN = ROOT / "design"


def manifest():
    return json.loads((DESIGN / "manifest.json").read_text())


def logo_source():
    return ROOT / manifest()["logoSource"]


def selected(group):
    source = ROOT / group["source"]
    found = False
    for pattern in group["include"]:
        paths = sorted(source.glob(pattern))
        if not paths and not has_magic(pattern):
            raise FileNotFoundError(f"No assets match {source / pattern}")
        for path in paths:
            if not path.is_file() or any(p.startswith(".") for p in path.relative_to(source).parts):
                continue
            relative = path.relative_to(source).as_posix()
            found = True
            yield path, group.get("rename", {}).get(relative, relative)
    if not found:
        raise FileNotFoundError(f"Empty asset group: {source}")


def asset_records():
    records = []
    destinations = set()
    for group in manifest()["groups"]:
        for source, name in selected(group):
            destination = (Path(group["destination"]) / name).as_posix()
            if destination in destinations or ".." in Path(destination).parts:
                raise ValueError(f"Unsafe or duplicate destination: {destination}")
            destinations.add(destination)
            records.append({"file": destination, "source": str(source.relative_to(ROOT)),
                            "title": group["title"], "bytes": source.stat().st_size,
                            "sha256": hashlib.sha256(source.read_bytes()).hexdigest()})
    return sorted(records, key=lambda record: record["file"])


def copy_changed(source, target):
    if target.is_file() and source.read_bytes() == target.read_bytes():
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
