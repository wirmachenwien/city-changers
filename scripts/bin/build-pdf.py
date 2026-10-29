#!/usr/bin/env python3
"""Build one PDF per language from the book content collections.

Reads chapter order and metadata from src/data/works.json and chapter prose
from src/content/book/<lang>/*.mdx, converts the MDX component tags used by
authors (Figure, Video, ButtonLink, CopyText, Toc) into print-safe markup,
and renders A4 PDFs with WeasyPrint (no license keys, no proprietary tools).

Usage:
    python3 scripts/bin/build-pdf.py --all
    python3 scripts/bin/build-pdf.py --lang de --out dist/downloads
    python3 scripts/bin/build-pdf.py --lang sl --html-only
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from html import escape
from pathlib import Path

# Entry point in scripts/bin/: add scripts/ to sys.path so the handbook
# package imports work regardless of where Python is invoked from.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from handbook.book import (
    ASSETS,
    CONTENT,
    DEFAULT_LANG,
    GLOSSARY_LANG_RE,
    ROOT,
    add_common_arguments,
    download_stem,
    find_asset,
    front_opener,
    glossary_data,
    locale_text,
    katex_css,
    load_works,
    markdown_to_html,
    read_chapter_mdx,
    render_math_html,
    resolve_jobs,
    resolve_color_tokens,
    title_page_details_html,
)
from handbook.mdx import (
    CCBADGE_RE,
    FEATURE_CLOSE_RE,
    FEATURE_OPEN_RE,
    FIGURE_RE,
    FOOTNOTE_RE,
    FRONTMATTER_RE,
    GLOSSARY_RE,
    LINK_RE,
    MASCOT_OPEN_RE,
    MASCOT_CLOSE_RE,
    PULLQUOTE_RE,
    QUESTION_RE,
    QUIZ_RE,
    VIDEO_RE,
    attrs,
    chapter_lists,
    feature_open_html,
    footnote_attrs,
    glossary_html,
    glossary_lang_html,
    licence_html,
    mascot_open_html,
    pullquote_html,
    question_html,
    quiz_html,
    strip_static_handlers,
)

PRINT_CSS = ROOT / "src" / "styles" / "print.css"
SETTINGS = ROOT / "src" / "data" / "settings.json"
BOOK_FOOTNOTES: list[tuple[str, str, str]] = []


def pdf_notes_mode() -> str:
    return json.loads(SETTINGS.read_text(encoding="utf-8"))["pdf"]["notes"]


def pdf_page_settings() -> tuple[str, str]:
    page = json.loads(SETTINGS.read_text(encoding="utf-8"))["pdf"]["page"]
    return page["size"], page["margin"]


def link_marker(index: int) -> str:
    """1-based counter to lowercase letters: 1->a ... 26->z, 27->aa, ..."""
    label = ""
    n = index
    while n > 0:
        n, rest = divmod(n - 1, 26)
        label = chr(97 + rest) + label
    return label


def image_uri(filename: str) -> str:
    source = find_asset(filename)
    if source is not None:
        return source.as_uri()
    print(f"warning: image not found: {filename}", file=sys.stderr)
    return filename


# The print cover shows the hero photo full-bleed on an A4 page. Below this
# effective resolution it starts to look soft in print; still build, but say
# so (non-breaking) so a low-resolution hero photo gets noticed.
A4_WIDTH_IN = 210 / 25.4
A4_HEIGHT_IN = 297 / 25.4
MIN_COVER_DPI = 150


def cover_resolution_warning(filename: str) -> str | None:
    """Warn when the cover photo prints below MIN_COVER_DPI on full-bleed A4.

    With `background-size: cover` the effective DPI is limited by the
    tighter axis, i.e. min(width / page-width, height / page-height).
    Returns a warning string, or None when the resolution is fine (or the
    file cannot be measured, e.g. vectors or missing Pillow).
    """
    if not filename:
        return None
    source = find_asset(filename)
    if source is None:
        return None
    try:
        from PIL import Image
    except ImportError:
        return None
    try:
        with Image.open(source) as image:
            width, height = image.size
    except Exception:
        return None
    dpi = min(width / A4_WIDTH_IN, height / A4_HEIGHT_IN)
    if dpi >= MIN_COVER_DPI:
        return None
    need_width = math.ceil(MIN_COVER_DPI * A4_WIDTH_IN)
    need_height = math.ceil(MIN_COVER_DPI * A4_HEIGHT_IN)
    name = filename.rsplit("/", 1)[-1]
    return (
        f"warning: cover image {name} is {width}x{height} px "
        f"(~{dpi:.0f} DPI on full-bleed A4); "
        f"use at least {need_width}x{need_height} px "
        f"({MIN_COVER_DPI} DPI) for crisp print"
    )


def cc_badge_html() -> str:
    src = image_uri("cc-by-88x31.png")
    return (
        '<p class="cc-badge">'
        f'<img src="{src}" alt="CC BY 4.0" width="88" height="31"/> '
        '<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> Wir machen Wien, '
        'Changing Cities &amp; Prostorož</p>'
    )


FONT_RE = re.compile(r'url\("fonts/([^"]+)"\)')


def font_uri(filename: str) -> str:
    """File URI of a self-hosted font so WeasyPrint embeds it in the PDF."""
    candidate = ASSETS / "fonts" / filename
    if candidate.exists():
        return candidate.as_uri()
    print(f"warning: font not found: {filename}", file=sys.stderr)
    return filename


def print_css() -> str:
    """Print stylesheet with logical font paths rewritten to file URIs."""
    css = resolve_color_tokens(PRINT_CSS.read_text(encoding="utf-8"))
    size, margin = pdf_page_settings()
    css = re.sub(
        r"(@page\s*\{\s*)size:\s*[^;]+;\s*margin:\s*[^;]+;",
        lambda match: f"{match.group(1)}size: {size};\n  margin: {margin};",
        css,
        count=1,
    )
    css = FONT_RE.sub(lambda m: f'url("{font_uri(m.group(1))}")', css)
    katex_fonts = (ROOT / "node_modules" / "katex" / "dist" / "fonts").as_uri() + "/"
    return css + "\n" + katex_css(katex_fonts)


def convert_mdx(text: str, lang: str = DEFAULT_LANG) -> str:
    mode = pdf_notes_mode()
    footnotes_title = locale_text(lang, "footnotes.notes", "Notes")
    answers_label = locale_text(lang, "questions.correct-answers", "Correct answers")
    chapter_notes: list[tuple[str, str, str]] = []
    footnote_count = 0
    link_count = 0
    text = FRONTMATTER_RE.sub("", text, count=1)
    text = MASCOT_OPEN_RE.sub(lambda m: mascot_open_html(m.group(1), image_uri), text)
    text = MASCOT_CLOSE_RE.sub('\n\n</div>\n</div>\n\n', text)

    def figure(match: re.Match[str]) -> str:
        values = attrs(match.group(1) or match.group(2))
        src, alt = values.get("src", ""), values.get("alt", "")
        caption = (values.get("caption") or match.group(3) or "").strip()
        caption_html = f"<figcaption>{caption}</figcaption>" if caption else ""
        classes = ["figure"]
        if values.get("size") in {"small", "medium"}:
            classes.append(f'figure--{values["size"]}')
        if values.get("float") in {"left", "right", "center"}:
            classes.append(f'figure--float-{values["float"]}')
        class_attr = f' class="{" ".join(classes)}"'
        return (
            f'<figure{class_attr}><img src="{image_uri(src)}" alt="{alt}"/>{caption_html}</figure>'
        )

    text = FIGURE_RE.sub(figure, text)
    def video(match: re.Match[str]) -> str:
        values = attrs(match.group(1) or match.group(2))
        url = f"https://www.youtube.com/watch?v={values.get('id', '')}"
        # Emit a regular Markdown link so LINK_RE below moves the URL into
        # a lettered link note like every other external link. The emphasis
        # stays inside the link text so the call and note markup appended
        # by LINK_RE end up outside <em> and print upright, not italic.
        return f"\n\n[*Video: {values.get('caption', '')}*]({url})\n"

    text = VIDEO_RE.sub(video, text)
    text = strip_static_handlers(text)
    text = CCBADGE_RE.sub(cc_badge_html(), text)
    text = FEATURE_OPEN_RE.sub(lambda m: feature_open_html(
        attrs(m.group(1)).get("title"), tone=attrs(m.group(1)).get("tone", "default")), text)
    text = FEATURE_CLOSE_RE.sub('\n</div>\n', text)
    text = PULLQUOTE_RE.sub(pullquote_html, text)
    # External links: keep the link text (plus its clickable anchor) and
    # move the URL into a lettered note (a, b, c, ...), following the
    # pdf.notes placement like regular Footnotes instead of printing it
    # inline behind the text. Letters keep link URLs visually apart from
    # the numbered Footnote notes.

    def link_note(match: re.Match[str]) -> str:
        nonlocal link_count
        label, url = match.group(1), match.group(2)
        link_count += 1
        note_id, marker = f"link-{link_count}", link_marker(link_count)
        call = f'<sup class="footnote-call" id="ref-{note_id}">{marker}</sup>'
        if mode == "chapter-footnotes":
            chapter_notes.append((note_id, marker, url))
            return f'[{label}]({url}){call}'
        if mode == "book-footnotes":
            BOOK_FOOTNOTES.append((note_id, marker, url))
            return f'[{label}]({url}){call}'
        return (
            f'[{label}]({url}){call}'
            f'<span class="footnote">'
            f'<span class="footnote-marker">{marker}</span> {url}</span>'
        )

    text = LINK_RE.sub(link_note, text)
    # Footnotes: attach inline notes to page, chapter end, or book end.

    def footnote(match: re.Match[str]) -> str:
        nonlocal footnote_count
        footnote_count += 1
        note_id, number, inline_text = footnote_attrs(match.group(1), footnote_count)
        note_text = inline_text
        if note_text is None:
            print(f"warning: footnote without text: {note_id}", file=sys.stderr)
            return f'<sup class="footnote-call" id="ref-{note_id}">{number}</sup>'
        if mode == "chapter-footnotes":
            chapter_notes.append((note_id, number, note_text))
            return f'<sup class="footnote-call" id="ref-{note_id}">{number}</sup>'
        if mode == "book-footnotes":
            BOOK_FOOTNOTES.append((note_id, number, note_text))
            return f'<sup class="footnote-call" id="ref-{note_id}">{number}</sup>'
        return (
            f'<sup class="footnote-call" id="ref-{note_id}">{number}</sup>'
            f'<span class="footnote">'
            f'<span class="footnote-marker">{number}</span> {note_text}</span>'
        )

    text = FOOTNOTE_RE.sub(footnote, text)
    if chapter_notes:
        # Notes share one list in appearance order, but link URLs carry
        # letter markers and Footnotes numbers, so each marker is printed
        # explicitly (print.css suppresses the default <ol> numbering).
        items = ''.join(
            f'<li id="note-{note_id}"><span class="footnote-marker">{marker}</span> {note_text}</li>'
            for note_id, marker, note_text in chapter_notes
        )
        text += f'\n\n<section class="footnotes"><h2>{footnotes_title}</h2><ol>{items}</ol></section>\n'
    text = GLOSSARY_RE.sub(lambda m: glossary_html(m.group(1)), text)
    text = GLOSSARY_LANG_RE.sub(lambda m: glossary_lang_html(m.group(1), glossary_data()), text)
    text = QUIZ_RE.sub(lambda m: quiz_html(attrs(m.group(1)).get("question", ""), m.group(2), answers_label,
                                         attrs(m.group(1)).get("id", "")), text)
    text = QUESTION_RE.sub(
        lambda m: question_html(
            attrs(m.group(1)).get("question", ""),
            m.group(2),
            attrs(m.group(1) + m.group(3)).get("answer", "0"),
            answers_label,
            attrs(m.group(1) + m.group(3)).get("id", ""),
        ), text
    )
    return text.strip() + "\n"


def chapter_html(slug: str, md_text: str, lang: str = DEFAULT_LANG) -> str:
    body = render_math_html(markdown_to_html(convert_mdx(md_text, lang), lang))
    return f'<section class="chapter" id="file-{slug}">\n{body}\n</section>'


def toc_html(entries: list[dict]) -> str:
    items = "".join(
        f'<li><a href="#file-{e["file"]}">{e["label"]}</a></li>' for e in entries
    )
    return f'<ul class="toc">\n{items}\n</ul>'


def build_document(lang: str) -> str:
    BOOK_FOOTNOTES.clear()
    works = load_works()[lang]
    files, toc = chapter_lists(works)
    title = works["title"]
    # The cover is generated from the start-page hero image + metadata.
    cover_file = front_opener(lang) or works.get("image") or ""
    cover_uri = image_uri(cover_file) if cover_file else ""
    cover_style = f"background-image: url('{cover_uri}')" if cover_uri else ""
    cover_warning = cover_resolution_warning(cover_file)
    if cover_warning:
        print(cover_warning, file=sys.stderr)

    parts = [
        "<!doctype html>",
        f'<html lang="{lang}"><head><meta charset="utf-8">',
        f"<title>{title}</title></head><body>",
    ]
    # The cover and title sheets are virtual: they have no MDX source file
    # (see src/content/book/<lang>/) and are generated here from the book
    # metadata in works.json plus the start-page hero image.
    for slug in files:
        if slug == "0-0-cover":
            style_attr = f' style="{cover_style}"' if cover_style else ""
            parts.append(
                f'<section class="cover-sheet" id="file-0-0-cover"{style_attr}>'
                '<div class="cover-scrim"></div>'
                '<div class="cover-text">'
                f"<h1>{title}</h1><p class=\"cover-sub\">{works.get('subtitle', '')}</p>"
                "</div></section>"
            )
            continue
        if slug == "0-1-titlepage":
            parts.append(
                '<section class="chapter frontmatter-sheet title-page-sheet" id="file-0-1-titlepage">'
                '<h1 class="title-page-heading">'
                f'<img class="handbook-lockup" src="{image_uri("logo-lockup.png")}" alt="{escape(title, quote=True)}" width="960" height="256">'
                '</h1>'
                f'{title_page_details_html(lang, works, image_uri)}</section>'
            )
            continue
        # The contents sheet is virtual too: generated from the catalogue.
        if slug == "contents":
            contents_title = next(
                (entry["label"] for entry in toc if entry["file"] == "contents"),
                "Contents",
            )
            parts.append(
                '<section class="chapter frontmatter-sheet" id="file-contents">'
                f"<h1>{contents_title}</h1>"
                f"{toc_html(toc)}</section>"
            )
            continue
        md_text = read_chapter_mdx(lang, slug)
        if md_text is None:
            print(f"warning: missing chapter {CONTENT / lang / f'{slug}.mdx'}", file=sys.stderr)
            continue
        parts.append(chapter_html(slug, md_text, lang))
    if pdf_notes_mode() == "book-footnotes" and BOOK_FOOTNOTES:
        items = ''.join(
            f'<li id="note-{note_id}"><span class="footnote-marker">{marker}</span> {note_text}</li>'
            for note_id, marker, note_text in BOOK_FOOTNOTES
        )
        footnotes_title = locale_text(lang, "footnotes.notes", "Notes")
        parts.append(f'<section class="chapter footnotes" id="book-footnotes"><h1>{footnotes_title}</h1><ol>{items}</ol></section>')
    parts.append("</body></html>")
    parts.insert(
        2,
        f"<!-- pdf, {lang} --><style>{print_css()}</style>",
    )
    return "\n".join(parts)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build handbook PDFs with WeasyPrint.")
    add_common_arguments(parser, "PDFs")
    parser.add_argument("--html-only", action="store_true", help="skip WeasyPrint, emit HTML")
    args = parser.parse_args()

    jobs = resolve_jobs(args)
    out_dir = ROOT / args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    for lang in jobs:
        html = build_document(lang)
        stem = download_stem(lang)
        html_path = out_dir / f"{stem}.html"
        html_path.write_text(html, encoding="utf-8")
        print(f"wrote {html_path}")
        if args.html_only:
            continue
        try:
            from weasyprint import HTML  # pip: weasyprint>=60
        except ImportError:
            print("error: weasyprint is not installed (pip install -r requirements.txt)",
                  file=sys.stderr)
            return 1
        pdf_path = out_dir / f"{stem}.pdf"
        HTML(string=html).write_pdf(str(pdf_path))
        print(f"wrote {pdf_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
