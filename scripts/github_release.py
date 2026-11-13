"""Shared immutable GitHub Release transport for brand and audio inventories.

No generation and no implicit network calls. Callers supply their own inventory,
local staging and publication gates. Published attachments are never replaced.
"""
import json
import subprocess


def gh(*args):
    result = subprocess.run(["gh", *args], text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout


def find_release(repository, tag, command=gh, run=subprocess.run):
    result = run(["gh", "api", f"repos/{repository}/releases/tags/{tag}"], text=True, capture_output=True)
    if result.returncode == 0:
        remote = json.loads(result.stdout)
    elif "HTTP 404" in result.stderr:
        pages = json.loads(command("api", f"repos/{repository}/releases?per_page=100", "--paginate", "--slurp"))
        remote = next((release for page in pages for release in page if release["tag_name"] == tag), None)
        if remote is None:
            return None
    else:
        raise RuntimeError(result.stderr)
    pages = json.loads(command("api", f"repos/{repository}/releases/{remote['id']}/assets?per_page=100", "--paginate", "--slurp"))
    remote["assets"] = [asset for page in pages for asset in page]
    return remote


def validate_assets(remote, expected):
    """expected maps attachment names to exact bytes/sha256 records."""
    if remote is None:
        raise ValueError("Release not found")
    assets = {asset["name"]: asset for asset in remote["assets"]}
    if len(assets) != len(remote["assets"]) or set(assets) != set(expected):
        raise ValueError("Release attachment inventory does not match")
    for name, record in expected.items():
        asset = assets[name]
        if asset.get("size") != record["bytes"] or asset.get("digest") != f"sha256:{record['sha256']}":
            raise ValueError(f"Release checksum/size mismatch: {name}")


def publish_release(*, repository, tag, target, title, notes, marker, lookup, validate, stage, command=gh):
    remote = lookup(tag)
    if remote and marker not in (remote.get("body") or ""):
        raise ValueError("Existing release is not managed by this publisher")
    if remote and not remote["draft"]:
        validate(remote)
        return False
    # Validate/stage local attachments before creating a remote draft.
    with stage() as attachments:
        if not remote:
            command("release", "create", tag, "--repo", repository, "--draft", "--latest=false",
                    "--target", target() if callable(target) else target, "--title", title, "--notes", notes + "\n\n" + marker)
        command("release", "upload", tag, "--repo", repository, "--clobber", *attachments)
        validate(lookup(tag))
        command("release", "edit", tag, "--repo", repository, "--draft=false", "--latest=false")
    return True
