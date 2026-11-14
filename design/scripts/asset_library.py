"""Shared manifest reader: one asset inventory for the site and recipient kit."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
from glob import has_magic
from package_format import posix_name

ROOT = Path(__file__).resolve().parents[2]
DESIGN = ROOT / "design"


def manifest():
    return json.loads((DESIGN / "manifest.json").read_text(encoding="utf-8"))


def logo_source():
    return ROOT / manifest()["logoSource"]


def selected(group):
    source = ROOT / group["source"]
    found = False
    for pattern in group["include"]:
        paths = sorted(source.glob(pattern, case_sensitive=True), key=lambda path: posix_name(path.relative_to(source)))
        if not paths and not has_magic(pattern):
            raise FileNotFoundError(f"No assets match {source / pattern}")
        for path in paths:
            if not path.is_file() or any(p.startswith(".") for p in path.relative_to(source).parts):
                continue
            relative = posix_name(path.relative_to(source))
            found = True
            yield path, group.get("rename", {}).get(relative, relative)
    if not found:
        raise FileNotFoundError(f"Empty asset group: {source}")


def asset_records():
    records = []
    destinations = set()
    for group in manifest()["groups"]:
        for source, name in selected(group):
            destination = posix_name(Path(group["destination"]) / name)
            if destination in destinations or ".." in Path(destination).parts:
                raise ValueError(f"Unsafe or duplicate destination: {destination}")
            destinations.add(destination)
            records.append({"file": destination, "source": posix_name(source.relative_to(ROOT)),
                            "title": group["title"], "bytes": source.stat().st_size,
                            "sha256": hashlib.sha256(source.read_bytes()).hexdigest()})
    return sorted(records, key=lambda record: record["file"])


def copy_changed(source, target):
    if target.is_file() and source.read_bytes() == target.read_bytes():
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
