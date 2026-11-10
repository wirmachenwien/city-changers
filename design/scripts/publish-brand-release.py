#!/usr/bin/env python3
"""Publish committed brand exports once per inventory, before Pages deployment."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

from asset_library import ROOT
from brand_release import KIT_NAME, REPOSITORY, check_artwork, inventory, load_script


def gh(*args):
    result = subprocess.run(["gh", *args], text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout


def find_release(tag):
    result = subprocess.run(["gh", "api", f"repos/{REPOSITORY}/releases/tags/{tag}"], text=True, capture_output=True)
    if result.returncode == 0:
        remote = json.loads(result.stdout)
    elif "HTTP 404" in result.stderr:
        # Lookup by tag only finds published releases. Authenticated listing
        # also exposes drafts, including ones whose tag does not exist yet.
        pages = json.loads(gh("api", f"repos/{REPOSITORY}/releases?per_page=100", "--paginate", "--slurp"))
        remote = next((release for page in pages for release in page if release["tag_name"] == tag), None)
        if remote is None:
            return None
    else:
        raise RuntimeError(result.stderr)
    # The kit has over 100 individual files; never trust a truncated list.
    pages = json.loads(gh("api", f"repos/{REPOSITORY}/releases/{remote['id']}/assets?per_page=100", "--paginate", "--slurp"))
    remote["assets"] = [asset for page in pages for asset in page]
    return remote


def validate_release(remote, release):
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
    if assets[KIT_NAME]["size"] == 0:
        raise ValueError("Empty brand kit ZIP")


def publish():
    check_artwork()
    release = inventory()
    tag = release["tag"]
    marker = f"Brand inventory SHA-256: {release['fingerprint']}"
    remote = find_release(tag)
    if remote and marker not in (remote.get("body") or ""):
        raise ValueError("Existing release is not managed by the brand publisher")
    if remote and not remote["draft"]:
        validate_release(remote, release)
        print(f"Brand inputs unchanged; reusing {release['url']}")
        return
    if not remote:
        gh("release", "create", tag, "--repo", REPOSITORY, "--draft", "--latest=false",
           "--target", os.environ["GITHUB_SHA"], "--title", f"City Changers brand kit · {release['fingerprint'][:12]}",
           "--notes", "Approved committed exports; no artwork was regenerated.\n\n"
           "Download the complete ZIP (original folder structure) or individual attachments. "
           "Attachment names include their category and treatment.\n\n" + marker)
    with tempfile.TemporaryDirectory(prefix="brand-github-release-") as temporary:
        output = Path(temporary)
        load_script("package-brand-kit").build(output / "kit")
        attachments = output / "attachments"
        attachments.mkdir()
        shutil.copyfile(output / "kit" / KIT_NAME, attachments / KIT_NAME)
        (attachments / "brand-release.json").write_text(json.dumps(release, indent=2) + "\n")
        for record in release["assets"]:
            shutil.copyfile(ROOT / record["source"], attachments / record["releaseAsset"])
        # Resuming an interrupted draft is safe; published releases are never replaced.
        gh("release", "upload", tag, "--repo", REPOSITORY, "--clobber",
           *[str(path) for path in sorted(attachments.iterdir())])
    validate_release(find_release(tag), release)
    gh("release", "edit", tag, "--repo", REPOSITORY, "--draft=false", "--latest=false")
    print(f"Published {release['url']}")


if __name__ == "__main__":
    publish()
