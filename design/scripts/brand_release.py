"""Content-addressed GitHub release inventory; never generate artwork."""
import hashlib
import importlib.util
import json
import re
import sys
from urllib.parse import quote

from asset_library import ROOT, DESIGN, asset_records
from package_format import KIT_FORMAT_VERSION, json_bytes
sys.path.insert(0, str(ROOT / "scripts"))
from github_release import dated_release_tag

REPOSITORY = "wirmachenwien/city-changers"
KIT_NAME = "city-changers-brand-kit.zip"
PACKAGING_INPUTS = ("design/edition.json", "design/manifest.json", "design/scripts/package-brand-kit.py",
                    "design/scripts/asset_library.py", "design/scripts/brand_release.py", "design/scripts/package_format.py",
                    "scripts/color_registry.py", "src/data/colors.generated.json")


def load_script(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), DESIGN / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def inventory():
    records = asset_records()
    names = {KIT_NAME, "brand-release.json"}
    for record in records:
        # Release attachments are flat. Avoid characters GitHub would normalize.
        name = re.sub(r"[^A-Za-z0-9._-]", "-", record["file"].replace("/", "--"))
        if name in names:
            raise ValueError(f"Duplicate release attachment: {name}")
        names.add(name)
        record["releaseAsset"] = name
    inputs = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in PACKAGING_INPUTS}
    edition = json.loads((DESIGN / "edition.json").read_text(encoding="utf-8"))
    fingerprint = hashlib.sha256(json_bytes({"format": KIT_FORMAT_VERSION, "assets": records, "inputs": inputs})).hexdigest()
    tag = dated_release_tag("brand", edition)
    base = f"https://github.com/{REPOSITORY}/releases"
    for record in records:
        record["download"] = f"{base}/download/{tag}/{quote(record['releaseAsset'])}"
    return {"kitFormatVersion": KIT_FORMAT_VERSION, "fingerprint": fingerprint, "edition": edition, "tag": tag, "repository": REPOSITORY,
            "url": f"{base}/tag/{tag}", "kit": f"{base}/download/{tag}/{KIT_NAME}", "assets": records}


def check_artwork():
    # Preserve the existing tracked freshness record and its protected inputs.
    load_script("build-design").build(check=True)
