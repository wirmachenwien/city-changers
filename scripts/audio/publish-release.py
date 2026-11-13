#!/usr/bin/env python3
"""Publish or verify a prepared audio edition; never generate narration.

Like brand-kit releases: content-addressed, checksum-verified, resumable drafts,
never overwrite a publication or replace the latest software release.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from github_release import gh, find_release, validate_assets, publish_release

METADATA = "audio-release.json"


def checked(*args):
    result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout.strip()


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def require_committed():
    # A release must describe a committed edition, not an unreviewed local run.
    paths = ["audio", "public/audio", "scripts/audio", "src/content/book", "src/content/pages",
             "src/data/glossary.json", "src/data/works.json", "src/data/project.json", "handbook.config.ts", "package.json", "package-lock.json"]
    checked("git", "ls-files", "--error-unmatch", "audio/release.json", "audio/published.json")
    if checked("git", "status", "--porcelain", "--untracked-files=all", "--", *paths):
        raise ValueError("Commit the reviewed audio inputs, inventory and website artifacts before publishing/verifying a release")
    return checked("git", "rev-parse", "HEAD")


def range_check(asset):
    # Browser cue fetches stay same-origin: CORS is not required for media src.
    for start in (0, asset["bytes"] // 2):
        request = Request(asset["download"], headers={"Range": f"bytes={start}-{start}", "Accept-Encoding": "identity"})
        with urlopen(request, timeout=45) as response:
            if response.status != 206 or response.headers.get("Content-Range") != f"bytes {start}-{start}/{asset['bytes']}" or len(response.read(2)) != 1:
                raise ValueError(f"Audio byte-range delivery failed: {asset['releaseAsset']}")


def run(*, publish=False, verify=False, allow_missing=False):
    # Offline validation is always first. No GH access when no edition exists.
    args = ["node", "scripts/audio/check-release.mjs"]
    if allow_missing:
        args.append("--allow-missing")
    print(checked(*args))
    inventory_file = ROOT / "audio/release.json"
    if not inventory_file.exists():
        return
    release = json.loads(inventory_file.read_text())
    if not (publish or verify):
        for asset in release["assets"]:
            source = ROOT / "public/audio" / asset["file"]
            if not source.is_file() or source.stat().st_size != asset["bytes"] or digest(source) != asset["sha256"]:
                raise ValueError(f"Missing/corrupt public audio artifact: {asset['file']}; run npm run audio:prepare")
        print(f"All {len(release['assets'])} local attachments verified. No upload performed.")
        return
    target = require_committed()
    repository, tag = release["repository"], release["tag"]
    metadata_bytes = inventory_file.read_bytes()
    expected = {a["releaseAsset"]: a for a in release["assets"]}
    expected[METADATA] = {"bytes": len(metadata_bytes), "sha256": hashlib.sha256(metadata_bytes).hexdigest()}
    marker = f"Audio inventory SHA-256: {release['fingerprint']}"

    def lookup(tag):
        return find_release(repository, tag)

    def validate(remote):
        if remote is None or marker not in (remote.get("body") or ""):
            raise ValueError("Matching managed audio release not found")
        validate_assets(remote, expected)

    @contextmanager
    def stage():
        with tempfile.TemporaryDirectory(prefix="city-changers-audio-") as temporary:
            directory = Path(temporary)
            for asset in release["assets"]:
                source = ROOT / "public/audio" / asset["file"]
                if not source.is_file() or source.stat().st_size != asset["bytes"] or digest(source) != asset["sha256"]:
                    raise ValueError(f"Missing/corrupt public artifact: {asset['file']}; run npm run audio:prepare locally")
                shutil.copyfile(source, directory / asset["releaseAsset"])
            (directory / METADATA).write_bytes(metadata_bytes)
            yield [str(path) for path in sorted(directory.iterdir())]

    if publish:
        created = publish_release(repository=repository, tag=tag, target=target,
                                  title=f"City Changers audio · {release['fingerprint'][:12]}",
                                  notes="Complete audio edition: chapter MP3s, language M4Bs, timing cues and public inventory. Publication uses prepared media; this command does not generate narration.",
                                  marker=marker, lookup=lookup, validate=validate, stage=stage)
        print("Published audio release." if created else "Unchanged audio; verified existing release without uploads.")
    remote = lookup(tag)
    validate(remote)
    if remote.get("draft") or remote.get("prerelease"):
        raise ValueError("Audio release must be published, not a draft/prerelease")
    with ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(range_check, [a for a in release["assets"] if a["kind"] == "mp3"]))
    print(f"Audio release checksums and MP3 byte-range delivery valid: {release['url']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--publish", action="store_true", help="Upload/resume an immutable release from committed local outputs")
    modes.add_argument("--verify", action="store_true", help="Verify an existing public release and MP3 range support; no uploads")
    parser.add_argument("--allow-missing", action="store_true", help="Allow a checkout without an audio edition (deployment gate)")
    args = parser.parse_args()
    try:
        run(publish=args.publish, verify=args.verify, allow_missing=args.allow_missing)
    except (ValueError, RuntimeError, OSError) as error:
        parser.exit(1, f"Audio release: {error}\n")


if __name__ == "__main__":
    main()
