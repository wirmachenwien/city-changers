#!/usr/bin/env python3
"""Publish committed brand exports once per inventory, before Pages deployment."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import sys
from contextlib import contextmanager

from asset_library import ROOT
from brand_release import KIT_NAME, REPOSITORY, check_artwork, inventory, load_script
sys.path.insert(0, str(ROOT / "scripts"))
from github_release import find_release as shared_find_release
from github_release import publish_release


def gh(*args):
    result = subprocess.run(["gh", *args], text=True, encoding="utf-8", capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout


def find_release(tag):
    return shared_find_release(REPOSITORY, tag, command=gh, run=subprocess.run)


def validate_release(remote, release, kit=None):
    if remote is None:
        raise ValueError("Brand release not found; refusing to publish/deploy")
    assets = {asset["name"]: asset for asset in remote["assets"]}
    expected = {KIT_NAME, "brand-release.json"} | {record["releaseAsset"] for record in release["assets"]}
    if set(assets) != expected:
        raise ValueError("Brand release attachment inventory does not match; refusing to publish/deploy")
    for record in release["assets"]:
        asset = assets[record["releaseAsset"]]
        if asset["size"] != record["bytes"] or asset.get("digest") != f"sha256:{record['sha256']}":
            raise ValueError(f"Brand release checksum mismatch: {record['file']}")
    metadata = (json.dumps(release, indent=2) + "\n").encode()
    if assets["brand-release.json"].get("digest") != "sha256:" + hashlib.sha256(metadata).hexdigest():
        raise ValueError("Brand release metadata checksum mismatch")
    if kit is None or kit["bytes"] <= 0 or assets[KIT_NAME].get("size") != kit["bytes"] or assets[KIT_NAME].get("digest") != f"sha256:{kit['sha256']}":
        raise ValueError("Brand kit ZIP checksum/size mismatch")


def publish():
    check_artwork()
    release = inventory()
    tag = release["tag"]
    marker = f"Brand inventory SHA-256: {release['fingerprint']}"
    kit = None

    @contextmanager
    def stage():
        nonlocal kit
        with tempfile.TemporaryDirectory(prefix="brand-github-release-") as temporary:
            output = Path(temporary)
            load_script("package-brand-kit").build(output / "kit")
            archive = output / "kit" / KIT_NAME
            with archive.open("rb") as stream:
                kit = {"bytes": archive.stat().st_size, "sha256": hashlib.file_digest(stream, "sha256").hexdigest()}
            attachments = output / "attachments"
            attachments.mkdir()
            shutil.copyfile(output / "kit" / KIT_NAME, attachments / KIT_NAME)
            (attachments / "brand-release.json").write_text(json.dumps(release, indent=2) + "\n")
            for record in release["assets"]:
                shutil.copyfile(ROOT / record["source"], attachments / record["releaseAsset"])
            yield [str(path) for path in sorted(attachments.iterdir())]

    created = publish_release(repository=REPOSITORY, tag=tag, target=lambda: os.environ["GITHUB_SHA"],
                              title="City Changers brand",
                              notes="Approved committed exports; no artwork was regenerated.\n\n"
                                    "Download the complete ZIP (original folder structure) or individual attachments. "
                                    "Attachment names include their category and treatment.",
                               marker=marker, lookup=find_release, validate=lambda remote: validate_release(remote, release, kit),
                               stage=stage, command=gh, verify_staged=True)
    print(f"Published {release['url']}" if created else f"Brand inputs unchanged; reusing {release['url']}")


if __name__ == "__main__":
    publish()
