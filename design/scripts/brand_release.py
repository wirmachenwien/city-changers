"""Content-addressed GitHub release inventory; never generate artwork."""
import hashlib
import importlib.util
import json
import re
from urllib.parse import quote

from asset_library import ROOT, DESIGN, asset_records

REPOSITORY = "wirmachenwien/city-changers"
KIT_NAME = "city-changers-brand-kit.zip"


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
    packaging = ["design/manifest.json", "design/scripts/package-brand-kit.py",
                 "design/scripts/asset_library.py", "design/scripts/brand_release.py",
                 "scripts/color_registry.py", "src/data/colors.generated.json"]
    inputs = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in packaging}
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?", version):
        raise ValueError("Set a semantic package version for readable brand release tags")
    fingerprint = hashlib.sha256(json.dumps({"assets": records, "inputs": inputs, "version": version}, sort_keys=True).encode()).hexdigest()
    tag = f"brand-kit-v{version}-{fingerprint[:12]}"
    base = f"https://github.com/{REPOSITORY}/releases"
    for record in records:
        record["download"] = f"{base}/download/{tag}/{quote(record['releaseAsset'])}"
    return {"fingerprint": fingerprint, "version": version, "tag": tag, "repository": REPOSITORY,
            "url": f"{base}/tag/{tag}", "kit": f"{base}/download/{tag}/{KIT_NAME}", "assets": records}


def check_artwork():
    # Preserve the existing tracked freshness record and its protected inputs.
    load_script("build-design").build(check=True)
