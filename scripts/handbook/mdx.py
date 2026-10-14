#!/usr/bin/env python3
"""Shared MDX component conversion for the print builders (PDF + EPUB).

Single source of truth for the MDX subset authors may use in
src/content/book/<lang>/*.mdx, previously duplicated between
scripts/bin/build-pdf.py and scripts/bin/build-epub.py. Import from here instead
of redefining: common regexes, entry parsers, glossary/quiz/question/
pullquote converters, and the strip-style handlers (CopyText, Toc,
Spoiler, ButtonLink, DownloadLink, TableWrap, SideBySideButtons,
Accordion, ExpandableBox, Slideshow, Bibliography, ColorPanel,
DefinitionTerm, PageRef, SelectList, Math).

Deliberately NOT shared (kept in each builder):
- PDF: figure -> file-URI <img>, CC badge with embedded PNG, WeasyPrint
  CSS, cover-resolution warnings.
- EPUB: figure -> packaged-image href with html.escape, inline CC badge
  markers without images (the print-only title page embeds the badge PNG
  via its own builder method), OPF/nav/XHTML packaging, font embedding.

FOOTNOTE DIVERGENCE (deliberate, keep in sync):
- PDF (print on paper): <Footnote text={"..."} /> renders either as page
  footnotes, chapter footnotes, or book footnotes depending on pdf.notes.
- EPUB (reflowable reader): <Footnote> becomes linked refs plus a footnotes
  section at the end of the chapter.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Callable

EscapeFn = Callable[[str], str]


def _identity(text: str) -> str:
    return text


def glossary_slug(term: str, seen: dict[str, int] | None = None) -> str:
    """Anchor slug for a glossary term (mirrors src/lib/slug.ts, which uses
    github-slugger like Astro's heading ids). No `#` permalink is rendered
    on paper, matching headings: only the `id` is emitted so terms stay
    linkable. `seen` deduplicates within one list ("term", "term-1")."""
    slug = re.sub(r"\s+", "-", re.sub(r"[^\w\s-]", "", term.lower(), flags=re.UNICODE)).strip("-")
    if seen is None:
        return slug
    count = seen.get(slug, 0)
    seen[slug] = count + 1
    return slug if count == 0 else f"{slug}-{count}"


FRONTMATTER_RE = re.compile(r"^---\n.*?\n---\n", re.DOTALL)
FIGURE_RE = re.compile(r'<Figure\b([^>]*)\s*/>|<Figure\b([^>]*)>(.*?)</Figure>', re.DOTALL)
VIDEO_RE = re.compile(r'<Video\b([^>]*)\s*/>|<Video\b([^>]*)>')
BUTTON_RE = re.compile(r'<ButtonLink\b([^>]*)>([^<]+)</ButtonLink>')
DOWNLOAD_RE = re.compile(r'<DownloadLink\b([^>]*)>(.*?)</DownloadLink>', re.DOTALL)
COPY_RE = re.compile(r'<CopyText\s+[^>]*/>')
TOC_RE = re.compile(r'<Toc\s+[^>]*/>')
SPOILER_RE = re.compile(r'<Spoiler\b[^>]*>(.*?)</Spoiler>', re.DOTALL)
CCBADGE_RE = re.compile(r'<CcBadge\s*/>')
OPENER_RE = re.compile(r'^openerImage:\s*"([^"]+)"', re.MULTILINE)
FEATURE_OPEN_RE = re.compile(r'<FeatureBox\b([^>]*)>')
FEATURE_CLOSE_RE = re.compile(r'</FeatureBox>')
PULLQUOTE_RE = re.compile(r'<PullQuote\b([^>]*)>(.*?)</PullQuote>', re.DOTALL)
TABLE_OPEN_RE = re.compile(r'<TableWrap\s*>')
TABLE_CLOSE_RE = re.compile(r'</TableWrap>')
SIDEBYSIDE_RE = re.compile(r'<SideBySideButtons\b[^>]*links=\{\[(.*?)\]\}[^>]*\s*/>', re.DOTALL)
ACCORDION_OPEN_RE = re.compile(r'<Accordion\b([^>]*)>')
ACCORDION_CLOSE_RE = re.compile(r'</Accordion>')
EXPANDABLE_OPEN_RE = re.compile(r'<ExpandableBox\b([^>]*)>')
EXPANDABLE_CLOSE_RE = re.compile(r'</ExpandableBox>')
SLIDESHOW_OPEN_RE = re.compile(r'<Slideshow\b[^>]*>')
SLIDESHOW_CLOSE_RE = re.compile(r'</Slideshow>')
BIBLIOGRAPHY_RE = re.compile(r'<Bibliography\b[^>]*sources=\{\[(.*?)\]\}[^>]*\s*/>', re.DOTALL)
COLOR_OPEN_RE = re.compile(r'<ColorPanel\b[^>]*>')
COLOR_CLOSE_RE = re.compile(r'</ColorPanel>')
DEFINITION_RE = re.compile(r'<DefinitionTerm\b([^>]*)\s*/>')
PAGEREF_RE = re.compile(r'<PageRef\b([^>]*)\s*/>')
SELECT_RE = re.compile(r'<SelectList\b[^>]*options=\{\[(.*?)\]\}[^>]*\s*/>', re.DOTALL)
MATH_RE = re.compile(r'<Math\b([^>]*)\s*/>')
FOOTNOTE_RE = re.compile(r'<Footnote\b([^>]*)\s*/>', re.DOTALL)
# Inline Markdown links with absolute http(s) targets (image `![...]` links
# excluded). The PDF builder turns these into lettered URL footnotes; anything
# else (relative links, anchors) stays untouched.
LINK_RE = re.compile(r'(?<!!)\[([^\]\n]+)\]\((https?://[^)\s]+)(?:\s+"[^"]*")?\)')
GLOSSARY_RE = re.compile(r'<Glossary\s+entries=\{\[(.*?)\]\}\s*/>', re.DOTALL)
QUIZ_RE = re.compile(r'<Quiz\b(.*?)options=\{\[(.*?)\]\}\s*/>', re.DOTALL)
QUESTION_RE = re.compile(r'<Question\b(.*?)options=\{\[(.*?)\]\}(.*?)\s*/?>', re.DOTALL)

ATTR_RE = re.compile(r'([A-Za-z][\w-]*)=(?:"([^"]*)"|\{\s*"([^"]*)"\s*\}|\{\s*(\d+)\s*\})')


def attrs(source: str | None) -> dict[str, str]:
    if not source:
        return {}
    values: dict[str, str] = {}
    for name, quoted, expression, number in ATTR_RE.findall(source):
        values[name] = quoted or expression or number
    return values


def make_glossary_lang_re(langs: tuple[str, ...]) -> re.Pattern[str]:
    """<Glossary lang="xx"/> matcher for the configured site languages."""
    return re.compile(r'<Glossary\s+lang=(?:"|\{\s*")(' + "|".join(langs) + r')(?:"|"\s*\})\s*/>')


# Chapter slugs styled as front matter (mirrors src/data/works.ts).
FRONTMATTER_FILES = {"0-0-cover", "0-1-titlepage", "contents"}


def chapter_lists(work: dict) -> tuple[list[str], list[dict]]:
    """Derive print order + TOC from the single `chapters` list per language.

    Single source of truth (mirrors src/data/works.ts): `files` is every
    chapter in order, `toc` carries each label plus the frontmatter class.
    """
    files = [chapter["file"] for chapter in work["chapters"]]
    toc = [
        {
            "label": chapter["label"],
            "file": chapter["file"],
            **({"class": "frontmatter-entry"} if chapter["file"] in FRONTMATTER_FILES else {}),
        }
        for chapter in work["chapters"]
    ]
    return files, toc


def find_asset_by_basename(filename: str, assets_dir: Path, root: Path) -> Path | None:
    """Repo file backing a content image name (book, site, then public).

    The CMS image picker may store a repo-relative path; match by basename.
    """
    name = filename.rsplit("/", 1)[-1]
    for folder in ("book", "site"):
        candidate = assets_dir / folder / name
        if candidate.exists():
            return candidate
    candidate = root / "public" / "images" / name
    if candidate.exists():
        return candidate
    return None


def front_opener_for_pages(pages_dir: Path, lang: str) -> str:
    """Hero image of the language start page (source of the print cover)."""
    index = pages_dir / lang / "index.mdx"
    if not index.exists():
        return ""
    match = OPENER_RE.search(index.read_text(encoding="utf-8"))
    return match.group(1) if match else ""


def object_entries(source: str) -> list[tuple[str, str]]:
    return re.findall(r'\{\s*term:\s*"([^"]+)",\s*definition:\s*"([^"]+)"\s*\}', source)


def footnote_attrs(source: str, fallback_index: int = 1) -> tuple[str, str, str | None]:
    values = attrs(source)
    number = values.get("number", str(fallback_index))
    note_id = values.get("id") or f"fn-{number}"
    return note_id, number, values.get("text")


def option_entries(source: str) -> list[tuple[str, bool]]:
    return [(label, 'correct: true' in rest) for label, rest in re.findall(r'\{\s*label:\s*"([^"]+)"([^}]*)\}', source)]


# `{ label: "...", href: "..." }` entries (SideBySideButtons links,
# Bibliography sources, SelectList options). Both quote styles are accepted:
# the component showcase uses single quotes, chapter MDX double quotes.
LINK_ENTRY_RE = re.compile(
    r"""\{\s*label:\s*(?:"([^"]+)"|'([^']+)')\s*"""
    r"""(?:,\s*href:\s*(?:"([^"]+)"|'([^']+)'))?[^}]*\}"""
)


def link_entries(source: str) -> list[tuple[str, str]]:
    """(label, href) pairs from a `{ label, href }` object array."""
    return [
        (label or other_label, href or other_href)
        for label, other_label, href, other_href in LINK_ENTRY_RE.findall(source)
    ]


def links_list_md(source: str) -> str:
    """Print-safe Markdown bullet list for links/sources/options arrays."""
    lines = [
        f"- [{label}]({href})" if href else f"- {label}"
        for label, href in link_entries(source)
    ]
    return "\n\n" + "\n".join(lines) + "\n" if lines else "\n\n"


def details_open_md(attr_source: str | None) -> str:
    """Print opening for Accordion/ExpandableBox: title as bold text, then
    the always-expanded body (paper has no collapse interaction)."""
    title = attrs(attr_source).get("title")
    return f"\n\n**{title}**\n\n" if title else "\n\n"


def math_md(attr_source: str | None) -> str:
    """Print delimiters for <Math source display?>: double backslashes survive
    the Python-Markdown pass as single ones, which the KaTeX post-processor
    (scripts/bin/render-math.mjs) then renders."""
    source = attrs(attr_source).get("source", "")
    if not source:
        return "\n\n"
    if attr_source and re.search(r"(?:^|\s)display(?:\s|/|$)", attr_source):
        return f"\n\n\\\\[{source}\\\\]\n\n"
    return f"\\\\({source}\\\\)"


def glossary_html(source: str, escape_fn: EscapeFn = _identity) -> str:
    seen: dict[str, int] = {}
    items = ''.join(
        f'<dt id="{glossary_slug(term, seen)}">{escape_fn(term)}</dt><dd>{escape_fn(definition)}</dd>'
        for term, definition in object_entries(source)
    )
    return f'\n\n<dl class="glossary">{items}</dl>\n'


def glossary_lang_html(lang: str, data: dict, escape_fn: EscapeFn = _identity) -> str:
    """Full shared glossary for a language (data = parsed glossary.json)."""
    seen: dict[str, int] = {}
    items = ''.join(
        f'<dt id="{glossary_slug(entry["term"], seen)}">{escape_fn(entry["term"])}</dt><dd>{escape_fn(entry["definition"])}</dd>'
        for entry in data.get(lang, [])
    )
    return f'\n\n<dl class="glossary">{items}</dl>\n'


# Licence sentence for the print-only title page (PDF + EPUB builders).
# Source texts match the Licence sections of the language start pages
# (src/content/pages/<lang>/index.mdx), which the web keeps; print reuses
# them here because the About page that carried them was removed.
LICENCE_TEXT: dict[str, dict[str, str]] = {
    "de": {
        "deed": "https://creativecommons.org/licenses/by/4.0/deed.de",
        "pre": "Sofern nicht anders angegeben, stehen die Inhalte dieses Handbuchs unter der Creative-Commons-Lizenz ",
        "post": " Wir machen Wien, Changing Cities & Prostorož. Sie dürfen geteilt und bearbeitet werden, sofern die Urheber:innen genannt werden.",
    },
    "en": {
        "deed": "https://creativecommons.org/licenses/by/4.0/",
        "pre": "Unless stated otherwise, the contents of this handbook are licensed under the Creative Commons license ",
        "post": " Wir machen Wien, Changing Cities & Prostorož. You may share and adapt the contents as long as you give appropriate credit to the authors.",
    },
    "sl": {
        "deed": "https://creativecommons.org/licenses/by/4.0/",
        "pre": "Če ni navedeno drugače, so vsebine tega priročnika licencirane pod licenco Creative Commons ",
        "post": " Wir machen Wien, Changing Cities & Prostorož. Vsebine lahko delite in prirejate, če navedete avtorje.",
    },
}


def licence_html(lang: str, escape_fn: EscapeFn = _identity) -> str:
    """Licence sentence paragraph. The deed link stays markup so it
    survives escaping of the surrounding prose."""
    entry = LICENCE_TEXT.get(lang, LICENCE_TEXT["en"])
    link = f'<a href="{entry["deed"]}">CC BY 4.0</a>'
    return f"<p>{escape_fn(entry['pre'])}{link}{escape_fn(entry['post'])}</p>"


def pullquote_html(match: re.Match[str], escape_fn: EscapeFn = _identity) -> str:
    """Pull quote keeping an optional citation (dropped nothing on paper)."""
    cite, body = attrs(match.group(1)).get("cite"), match.group(2).strip()
    footer = f"\n<footer>— {escape_fn(cite)}</footer>" if cite else ""
    return f"\n\n<blockquote class=\"pullquote\">\n{body}{footer}\n</blockquote>\n"


def feature_open_html(title: str | None, escape_fn: EscapeFn = _identity) -> str:
    """Opening <div> for <FeatureBox>, with optional bold title."""
    if title:
        return f'\n\n<div class="feature-box"><p><strong>{escape_fn(title)}</strong></p>\n'
    return '\n\n<div class="feature-box">\n'


def component_link(attrs_source: str, label: str) -> str:
    href = attrs(attrs_source).get("href", "")
    return f"[{label}]({href})" if href else label


def _quiz_wrap(question: str, items: str, answer_line: str) -> str:
    """Print wrapper shared by Quiz (flagged options) and Question (answer index)."""
    return (
        f'\n\n<div class="quiz"><p><strong>Quiz: {question}</strong></p>'
        f'<ol>{items}</ol>'
        f'<p style="transform: rotate(180deg);">{answer_line}</p></div>\n'
    )


def quiz_html(question: str, source: str, answers_label: str) -> str:
    entries = option_entries(source)
    options = ''.join(f'<li>{label}</li>' for label, _ in entries)
    correct = ', '.join(str(i + 1) for i, (_, is_correct) in enumerate(entries) if is_correct)
    return _quiz_wrap(question, options, f"{answers_label}: {correct}")


def question_html(question: str, source: str, answer: str, answers_label: str) -> str:
    """Single-choice Question: plain string options plus a 0-based answer index."""
    options = re.findall(r'"([^"]+)"', source)
    items = ''.join(f'<li>{label}</li>' for label in options)
    return _quiz_wrap(question, items, f"{answers_label}: {int(answer) + 1}")


def strip_static_handlers(text: str) -> str:
    """Handlers identical in PDF and EPUB: Button/Download links, CopyText, Toc, Spoiler, TableWrap,
    plus the collapsible/grouping wrappers (Accordion, ExpandableBox, Slideshow, ColorPanel),
    link-list components (SideBySideButtons, Bibliography, SelectList), inline
    aids (DefinitionTerm, PageRef) and TeX formulas (Math).

    Everything emitted here is plain Markdown (bold titles, bullet lists,
    unwrapped bodies), so downstream link-footnoting (PDF) and rendering
    (EPUB) treat it like author prose. Ordered before Figure/Video handling
    is irrelevant (disjoint tags), but must run before the PDF LINK_RE pass
    so emitted `[label](url)` links become lettered URL notes.
    """
    text = BUTTON_RE.sub(lambda m: component_link(m.group(1), m.group(2)), text)
    text = DOWNLOAD_RE.sub(lambda m: component_link(m.group(1), m.group(2).strip()), text)
    text = SIDEBYSIDE_RE.sub(lambda m: links_list_md(m.group(1)), text)
    text = COPY_RE.sub("", text)
    text = TOC_RE.sub("", text)
    text = SPOILER_RE.sub(lambda m: m.group(1), text)
    text = TABLE_OPEN_RE.sub('\n\n', text)
    text = TABLE_CLOSE_RE.sub('\n\n', text)
    # Collapsible sections print fully expanded with the title kept as bold text.
    text = ACCORDION_OPEN_RE.sub(lambda m: details_open_md(m.group(1)), text)
    text = ACCORDION_CLOSE_RE.sub('\n', text)
    text = EXPANDABLE_OPEN_RE.sub(lambda m: details_open_md(m.group(1)), text)
    text = EXPANDABLE_CLOSE_RE.sub('\n', text)
    # Slideshows print as the plain figure sequence (inner Figures convert later).
    text = SLIDESHOW_OPEN_RE.sub('\n\n', text)
    text = SLIDESHOW_CLOSE_RE.sub('\n', text)
    text = BIBLIOGRAPHY_RE.sub(lambda m: links_list_md(m.group(1)), text)
    text = SELECT_RE.sub(lambda m: links_list_md(m.group(1)), text)
    text = COLOR_OPEN_RE.sub('\n\n<div class="color-panel">\n', text)
    text = COLOR_CLOSE_RE.sub('\n</div>\n', text)
    # Inline definition popups have no hover target on paper: keep term + definition.
    text = DEFINITION_RE.sub(
        lambda m: (
            lambda values: (
                f"{values.get('term', '')} ({values['definition']})"
                if values.get("term") and values.get("definition")
                else values.get("term") or values.get("definition") or ""
            )
        )(attrs(m.group(1))),
        text,
    )
    # Cross-references keep their label; print page numbers don't transfer.
    text = PAGEREF_RE.sub(lambda m: attrs(m.group(1)).get("label", ""), text)
    # TeX formulas become delimiters for the KaTeX post-processor.
    text = MATH_RE.sub(lambda m: math_md(m.group(1)), text)
    return text
