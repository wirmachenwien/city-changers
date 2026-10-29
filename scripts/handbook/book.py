#!/usr/bin/env python3
"""Shared base for the print builders (scripts/bin/build-pdf.py + scripts/bin/build-epub.py).

Single source of truth for everything the two builders do identically,
previously copy-pasted between them:

- repo paths (ROOT, CONTENT, ASSETS, DATA, GLOSSARY_DATA, PAGES),
- site languages / default language / download stem from handbook.config.ts,
- the <Glossary lang=".."/> matcher for the configured languages,
- glossary.json loading, start-page hero lookup, asset lookup by basename,
- chapter file reading, Markdown rendering with render-time smart quotes,
- the --lang/--out/--all CLI trio plus default-first job ordering,
- the `<slug>-<lang>` download stem.

Deliberately NOT shared (kept in each builder, as with handbook.mdx):
- PDF: figure -> file-URI <img>, CC badge with embedded PNG, WeasyPrint
  CSS, cover-resolution warnings, float:footnote spans.
- EPUB: figure -> packaged-image href with html.escape, CC badge without
  images, OPF/nav/XHTML packaging, font embedding, XHTML void-element
  normalization.

Import from here instead of redefining. Entry scripts live in scripts/bin/
and add scripts/ to sys.path, then `from handbook.book import ...` works
regardless of where Python is invoked from.
"""

from __future__ import annotations

import argparse
import functools
from html import escape
import json
import re
import subprocess
from pathlib import Path
from typing import Callable
from color_registry import load_colors

from handbook.config import load_config
from handbook.mdx import find_asset_by_basename, front_opener_for_pages, make_glossary_lang_re, licence_html
from handbook.typography import smart_quotes_html

ROOT = Path(__file__).resolve().parent.parent.parent
CONTENT = ROOT / "src" / "content" / "book"
ASSETS = ROOT / "src" / "assets"
KATEX_DIST = ROOT / "node_modules" / "katex" / "dist"
KATEX_CSS_PATH = KATEX_DIST / "katex.css"
RENDER_MATH = ROOT / "scripts" / "bin" / "render-math.mjs"
DATA = ROOT / "src" / "data" / "works.json"
PROJECT_DATA = ROOT / "src" / "data" / "project.json"
GLOSSARY_DATA = ROOT / "src" / "data" / "glossary.json"
LOCALES_DATA = ROOT / "src" / "data" / "locales.json"
PAGES = ROOT / "src" / "content" / "pages"

# Site languages, default language and download stem come from
# handbook.config.ts (single source of truth). Loaded eagerly on purpose:
# add_common_arguments() needs LANGS for argparse choices, and Node is a
# hard repo requirement anyway (see handbook.config docstring).
_CONFIG = load_config()
LANGS: tuple[str, ...] = tuple(_CONFIG["languages"])
DEFAULT_LANG: str = _CONFIG["defaultLang"]
SLUG: str = _CONFIG["slug"]

GLOSSARY_LANG_RE = make_glossary_lang_re(LANGS)


@functools.lru_cache(maxsize=None)
def glossary_data() -> dict:
    """Parsed src/data/glossary.json (cached; the file is static per build)."""
    return json.loads(GLOSSARY_DATA.read_text(encoding="utf-8"))


@functools.lru_cache(maxsize=None)
def load_works() -> dict:
    """Full src/data/works.json mapping (one entry per language)."""
    works = json.loads(DATA.read_text(encoding="utf-8"))
    project = json.loads(PROJECT_DATA.read_text(encoding="utf-8"))
    for work in works.values():
        for key, value in project.items():
            work.setdefault(key, value)
    return works


@functools.lru_cache(maxsize=None)
def locales_data() -> dict:
    """Parsed src/data/locales.json (same source used by the web i18n helper)."""
    return json.loads(LOCALES_DATA.read_text(encoding="utf-8"))


def locale_text(lang: str, path: str, fallback: str = "") -> str:
    """Nested locale lookup with default-language, then English fallback."""
    data = locales_data()

    def lookup(candidate: str) -> str | None:
        node = data.get(candidate)
        for part in path.split("."):
            if not isinstance(node, dict) or part not in node:
                return None
            node = node[part]
        return node if isinstance(node, str) else None

    return lookup(lang) or lookup(DEFAULT_LANG) or lookup("en") or fallback


def front_opener(lang: str) -> str:
    """Hero image of the language start page (source of the print cover)."""
    return front_opener_for_pages(PAGES, lang)


def title_page_details_html(lang: str, work: dict, image_src: Callable[[str], str]) -> str:
    """Shared PDF/EPUB credits: partner marks, contributors and legal attribution.

    Creator/publisher metadata stays in the catalogue and EPUB package, but
    is not repeated as extra lines on the visual title page. The subtitle
    already names the same organisations, so it remains on the cover only.
    """
    partners = json.loads((ROOT / "src/data/partners.json").read_text(encoding="utf-8"))
    marks = []
    for partner in partners:
        modifier = f' title-page-partner--{partner["mod"]}' if partner.get("mod") else ""
        marks.append(
            f'<li class="title-page-partner{modifier}">'
            f'<a href="{escape(partner["href"], quote=True)}">'
            f'<img src="{escape(image_src(Path(partner["src"]).name), quote=True)}" '
            f'alt="{escape(partner["name"], quote=True)}" '
            f'width="{partner["width"]}" height="{partner["height"]}" /></a></li>'
        )
    contributor = work.get("contributor", "")
    credits = (
        '<p class="title-page-contributors">'
        f'<span class="title-page-label">{escape(locale_text(lang, "metadata.contributor", "Contributors"))}</span>'
        f'<br />{escape(contributor)}</p>'
    ) if contributor else ""
    return (
        '<div class="title-page-details">'
        f'<ul class="title-page-partners">{"".join(marks)}</ul>{credits}'
        '<div class="title-page-licence">'
        f'<img class="title-page-cc" src="{escape(image_src("cc-by-88x31.png"), quote=True)}" '
        'alt="CC BY 4.0" width="88" height="31" />'
        f'<div>{licence_html(lang, escape)}</div></div></div>'
    )


def find_asset(filename: str) -> Path | None:
    """Repo file backing a content image name (book or site assets).

    The CMS image picker may store a repo-relative path; match by basename.
    """
    return find_asset_by_basename(filename, ASSETS)


def read_chapter_mdx(lang: str, slug: str) -> str | None:
    """Raw MDX of a chapter, or None when the source file is missing.

    The caller warns (PDF warns on stderr, EPUB on stdout — preserved).
    """
    path = CONTENT / lang / f"{slug}.mdx"
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def resolve_color_tokens(css: str) -> str:
    """Materialize registry colors for PDF and legacy EPUB CSS engines."""
    palette = load_colors()
    colors = palette["utilities"] | palette["themes"]["print"]

    def replace(match: re.Match[str]) -> str:
        token = match.group(1)
        if token not in colors:
            raise ValueError(f"Unregistered export color token: --{token}")
        return colors[token]

    return re.sub(r"var\(--([a-z][a-z0-9-]*)\)", replace, css)


def markdown_to_html(converted_md: str, lang: str) -> str:
    """Render converted Markdown to HTML with render-time smart quotes.

    Takes Markdown with MDX components already converted to markup (each
    builder's convert step); source keeps straight quotes, output gets
    locale typographic quotes. The Markdown import stays lazy so --help
    works without the dependency installed.
    """
    import markdown  # pip: markdown

    body = markdown.markdown(converted_md, extensions=["extra"])
    return smart_quotes_html(body, lang)


def render_math_html(html: str) -> str:
    """Render TeX delimiters in HTML to static KaTeX markup via Node."""
    try:
        result = subprocess.run(
            ["node", str(RENDER_MATH)],
            input=html,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            cwd=ROOT,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("node is required for static math rendering") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"math rendering failed: {exc.stderr.strip()}") from exc
    return result.stdout


def katex_css(url_prefix: str = "fonts/") -> str:
    """KaTeX stylesheet with font URLs rewritten for the target output."""
    css = KATEX_CSS_PATH.read_text(encoding="utf-8")
    return re.sub(r"url\(fonts/([^)]+)\)", lambda m: f"url({url_prefix}{m.group(1)})", css)


def katex_font_files() -> list[Path]:
    """All KaTeX font assets referenced by its stylesheet."""
    return sorted((KATEX_DIST / "fonts").glob("KaTeX_*"))


def download_stem(lang: str) -> str:
    """Download file stem for a language: `<slug>-<lang>`."""
    return f"{SLUG}-{lang}"


def add_common_arguments(parser: argparse.ArgumentParser, noun: str) -> None:
    """Add the --lang/--out/--all trio shared by both builders."""
    parser.add_argument("--lang", choices=list(LANGS), default=DEFAULT_LANG)
    parser.add_argument(
        "--out",
        default="dist/downloads",
        help="output directory (served from dist/ by the site)",
    )
    parser.add_argument("--all", action="store_true", help=f"build {noun} for {'/'.join(LANGS)}")


def resolve_jobs(args: argparse.Namespace) -> tuple[str, ...]:
    """Languages to build: default language first with --all, else --lang."""
    if args.all:
        return (DEFAULT_LANG, *[lang for lang in LANGS if lang != DEFAULT_LANG])
    return (args.lang,)
