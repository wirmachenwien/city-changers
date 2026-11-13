"""Shared immutable GitHub Release transport for brand and audio inventories.

No generation and no implicit network calls. Callers supply their own inventory,
local staging and publication gates. Published attachments are never replaced.
"""
import json
import subprocess
import hashlib
import os
from contextlib import contextmanager
from pathlib import Path
from datetime import date


def dated_release_tag(kind, edition):
    """A committed date and ordinal, not wall-clock time or a digest tag."""
    day = edition.get("date")
    revision = edition.get("revision", 0)
    if kind not in {"audio", "brand"} or not isinstance(day, str) or type(revision) is not int or revision < 0 or revision > 9007199254740991:
        raise ValueError("Set a valid edition date (YYYY-MM-DD) and nonnegative integer revision")
    if date.fromisoformat(day).isoformat() != day:
        raise ValueError("Set an edition date in YYYY-MM-DD format")
    suffix = ""
    while revision:
        revision, digit = divmod(revision - 1, 26)
        suffix = chr(97 + digit) + suffix
    return f"{kind}-{day}{suffix}"


@contextmanager
def publication_lock(repository, tag):
    """One OS-backed lock per user/repository/tag, shared across checkouts.

    Keep the lock file: unlinking it can let waiters lock different inodes.
    The OS releases the lock on exit/crash, so no stale-lock deletion is needed.
    """
    directory = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "city-changers/release-locks"
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    key = hashlib.sha256(f"{repository}\n{tag}".encode("utf-8")).hexdigest()
    with os.fdopen(os.open(directory / f"{key}.lock", os.O_RDWR | os.O_CREAT, 0o600), "r+b") as lock:
        if os.name == "nt":
            import msvcrt
            if lock.seek(0, os.SEEK_END) == 0:
                lock.write(b"\0")
                lock.flush()
            lock.seek(0)
            acquire = lambda: msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            release = lambda: (lock.seek(0), msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1))
        else:
            import fcntl
            acquire = lambda: fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            release = lambda: fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        try:
            acquire()
        except OSError as error:
            raise RuntimeError(f"Another publisher is active for {repository} / {tag}; retry after it exits") from error
        try:
            yield
        finally:
            release()


def gh(*args):
    result = subprocess.run(["gh", *args], text=True, encoding="utf-8", capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout


def find_release(repository, tag, command=gh, run=subprocess.run):
    result = run(["gh", "api", f"repos/{repository}/releases/tags/{tag}"], text=True, encoding="utf-8", capture_output=True)
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
    with publication_lock(repository, tag):
        return _publish_release(repository=repository, tag=tag, target=target, title=title, notes=notes,
                                marker=marker, lookup=lookup, validate=validate, stage=stage, command=command)


def _publish_release(*, repository, tag, target, title, notes, marker, lookup, validate, stage, command):
    remote = lookup(tag)
    if remote and marker not in (remote.get("body") or ""):
        raise ValueError("Existing release is not managed by this publisher")
    if remote and not remote["draft"]:
        validate(remote)
        return False
    # Validate/stage local attachments before creating a remote draft.
    with stage() as attachments:
        expected = {}
        for filename in attachments:
            file = Path(filename)
            if file.name in expected:
                raise ValueError(f"Duplicate staged attachment: {file.name}")
            with file.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            expected[file.name] = {"bytes": file.stat().st_size, "sha256": digest}
        # Another machine can publish during staging; local locks alone cannot
        # coordinate it. Never delete/replace assets, even on a resumed draft.
        remote = lookup(tag)
        if remote and marker not in (remote.get("body") or ""):
            raise ValueError("Existing release is not managed by this publisher")
        if remote and not remote["draft"]:
            validate(remote)
            return False
        if not remote:
            command("release", "create", tag, "--repo", repository, "--draft", "--latest=false",
                    "--target", target() if callable(target) else target, "--title", title, "--notes", notes + "\n\n" + marker)
        existing = (remote or {}).get("assets", [])
        names = {asset["name"] for asset in existing}
        if len(names) != len(existing) or not names <= expected.keys():
            raise ValueError("Draft contains unexpected or duplicate attachments; no files replaced")
        validate_assets({"assets": existing}, {name: expected[name] for name in names})
        missing = [file for file in attachments if Path(file).name not in names]
        try:
            if missing:
                command("release", "upload", tag, "--repo", repository, *missing)
        except RuntimeError:
            # A concurrent publisher on another machine may have finished.
            # Reuse only its exact complete publication; otherwise fail closed.
            latest = lookup(tag)
            if latest and not latest["draft"] and marker in (latest.get("body") or ""):
                validate(latest)
                return False
            raise
        verified = lookup(tag)
        validate(verified)
        if not verified["draft"]:
            return False
        command("release", "edit", tag, "--repo", repository, "--draft=false", "--latest=false")
    return True
