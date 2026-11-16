"""Portable brand-package byte contract; no filesystem or platform defaults.

Stored ZIP members deliberately avoid zlib-version-dependent output. This is a
new package format, not permission to replace an existing immutable release.
"""
import json
import zipfile

KIT_FORMAT_VERSION = 1
ZIP_COMPRESSION = zipfile.ZIP_STORED
ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)


def posix_name(path):
    """Case-sensitive archive/inventory names; never sort native Path objects."""
    return path.as_posix()


def text_bytes(text):
    return text.replace("\r\n", "\n").replace("\r", "\n").encode("utf-8")


def json_bytes(value):
    return text_bytes(json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n")


def archive_members(root):
    return sorted((path for path in root.rglob("*") if path.is_file()),
                  key=lambda path: posix_name(path.relative_to(root)))


def zip_member(name):
    member = zipfile.ZipInfo(name, date_time=ZIP_TIMESTAMP)
    member.create_system = 3
    member.external_attr = 0o100644 << 16
    member.compress_type = ZIP_COMPRESSION
    return member
