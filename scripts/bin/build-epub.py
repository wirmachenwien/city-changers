#!/usr/bin/env python3
"""Build one EPUB per language from the book content collections.

The source of truth matches scripts/bin/build-pdf.py: metadata and reading order
come from src/data/works.json, prose comes from src/content/book/<lang>/*.mdx.
Project-specific MDX components are converted into static, reader-safe XHTML.

Usage:
    python3 scripts/bin/build-epub.py --all
    python3 scripts/bin/build-epub.py --lang de --out dist/downloads
"""

from __future__ import annotations

import argparse
import html
import mimetypes
import posixpath
import re
import shutil
import sys
import tempfile
import uuid
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

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
    katex_font_files,
    load_works,
    markdown_to_html,
    read_chapter_mdx,
    render_math_html,
    resolve_jobs,
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

EPUB_CSS_PATH = ROOT / "src" / "styles" / "epub.css"


def _attr(text: str) -> str:
    """Escape a string for use in an id/href/alt attribute value."""
    return html.escape(text, quote=True)

# Body, UI and headline faces embedded in every EPUB so covers and chapters
# render in Newsreader/Clarity City/Fraunces on any reader. The Fraunces
# files are static instances of the variable font (see src/styles/epub.css
# for the axis values and the one-line instancer commands) — reading systems
# apply font-variation-settings too inconsistently to ship the live file.
EPUB_FONTS = (
    "NewsreaderText-Regular.ttf",
    "NewsreaderText-Italic.ttf",
    "NewsreaderText-Bold.ttf",
    "NewsreaderText-BoldItalic.ttf",
    "ClarityCity-Regular.ttf",
    "ClarityCity-Bold.ttf",
    "FrauncesText-Bold.ttf",
    "FrauncesText-BoldItalic.ttf",
    "FrauncesDisplay-Bold.ttf",
    "FrauncesDisplay-BoldItalic.ttf",
)


def epub_pullquote_html(match: re.Match[str]) -> str:
    """Pull quote keeping an optional citation (cite escaped for XML)."""
    return pullquote_html(match, html.escape)


def media_type(path: Path) -> str:
    guessed, _ = mimetypes.guess_type(path.name)
    if guessed == "image/svg+xml":
        return guessed
    return guessed or "application/octet-stream"


def as_xhtml(body: str) -> str:
    # Python-Markdown emits HTML. Normalize the void elements used in this book
    # so common EPUB validators and readers accept them as XHTML.
    # Slashes inside image URLs are not tag delimiters. Match quoted attributes
    # intact, then normalize both HTML <img> and existing XHTML <img /> tags.
    body = re.sub(
        r'''<img\b((?:"[^"]*"|'[^']*'|[^'">])*)>''',
        lambda m: '<img' + m.group(1).rstrip().removesuffix('/').rstrip() + ' />',
        body,
    )
    body = re.sub(r'<br>', '<br />', body)
    body = re.sub(r'<hr>', '<hr />', body)
    return body


# Chapter slugs styled as front matter + print order live in handbook.mdx
# (mirrors src/data/works.ts); EPUB packaging below is reader-specific.


class EpubBook:
    def __init__(self, lang: str, works: dict, out_path: Path):
        self.lang = lang
        self.works = works
        self.out_path = out_path
        self.uid = works.get("identifier") or f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_URL, download_stem(lang))}"
        self.images: dict[str, str] = {}
        self.fonts: dict[str, str] = {}
        self.chapters: list[dict[str, str]] = []
        self.cover_image: str | None = None

    def add_image(self, filename: str) -> str:
        source = find_asset(filename)
        if source is None:
            print(f"warning: image not found: {filename}")
            return filename
        key = source.resolve().as_posix()
        if key not in self.images:
            name = f"mascot-{source.name}" if source.parent == ASSETS / "mascot/static/ink" else source.name
            self.images[key] = f"images/{name}"
        return self.images[key]

    def add_font(self, filename: str) -> str:
        source = ASSETS / "fonts" / filename
        if not source.exists():
            print(f"warning: font not found: {filename}")
            return filename
        key = source.resolve().as_posix()
        if key not in self.fonts:
            self.fonts[key] = f"fonts/{source.name}"
        return self.fonts[key]

    def add_katex_font(self, source: Path) -> str:
        key = source.resolve().as_posix()
        if key not in self.fonts:
            self.fonts[key] = f"fonts/{source.name}"
        return self.fonts[key]

    def convert_mdx(self, text: str) -> str:
        text = FRONTMATTER_RE.sub("", text, count=1)
        text = MASCOT_OPEN_RE.sub(lambda m: mascot_open_html(m.group(1), self.add_image), text)
        text = MASCOT_CLOSE_RE.sub('\n\n</div>\n</div>\n\n', text)
        answers_label = locale_text(self.lang, "questions.correct-answers", "Correct answers")

        def figure(match: re.Match[str]) -> str:
            values = attrs(match.group(1) or match.group(2))
            src, alt = values.get("src", ""), values.get("alt", "")
            caption = (values.get("caption") or match.group(3) or "").strip()
            href = html.escape(self.add_image(src), quote=True)
            alt_text = html.escape(alt, quote=True)
            caption_html = f"<figcaption>{html.escape(caption)}</figcaption>" if caption else ""
            classes = ["figure"]
            if values.get("size") in {"small", "medium"}:
                classes.append(f'figure--{values["size"]}')
            if values.get("float") in {"left", "right", "center"}:
                classes.append(f'figure--float-{values["float"]}')
            class_attr = html.escape(" ".join(classes), quote=True)
            return f'<figure class="{class_attr}"><img src="{href}" alt="{alt_text}" />{caption_html}</figure>'

        text = FIGURE_RE.sub(figure, text)
        def video(match: re.Match[str]) -> str:
            values = attrs(match.group(1) or match.group(2))
            caption = values.get("caption", "")
            video_id = values.get("id", "")
            return f'\n\n*Video: [{caption}](https://www.youtube.com/watch?v={video_id})*\n'

        text = VIDEO_RE.sub(video, text)
        text = strip_static_handlers(text)
        text = CCBADGE_RE.sub(
            '<p><a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> Wir machen Wien, Changing Cities &amp; Prostorož</p>',
            text,
        )
        text = FEATURE_OPEN_RE.sub(lambda m: feature_open_html(attrs(m.group(1)).get("title"), html.escape), text)
        text = FEATURE_CLOSE_RE.sub('\n</div>\n', text)
        text = PULLQUOTE_RE.sub(epub_pullquote_html, text)
        # Footnotes: linked markers plus a chapter footnotes section.
        chapter_notes: list[tuple[str, str, str]] = []

        def footnote(match: re.Match[str]) -> str:
            note_id, number, inline_text = footnote_attrs(match.group(1), len(chapter_notes) + 1)
            if inline_text is not None:
                chapter_notes.append((note_id, number, inline_text))
            return f'<a href="#note-{_attr(note_id)}"><sup id="ref-{_attr(note_id)}">{number}</sup></a>'

        text = FOOTNOTE_RE.sub(footnote, text)
        if chapter_notes:
            # Same icon as Icon.astro `back` (feather corner-up-left). Inline SVG
            # avoids the emoji presentation iOS gives the raw ↩ character.
            back_label = html.escape(
                locale_text(self.lang, "footnotes.back-to-text", "Back to text"), quote=True
            )
            back_icon = (
                '<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
                'aria-hidden="true" focusable="false" fill="none" stroke="currentColor" '
                'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
                '<polyline points="9 14 4 9 9 4" />'
                '<path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>'
            )
            items = ''.join(
                f'<li id="note-{_attr(note_id)}">{_attr(note_text)} '
                f'<a class="footnote-back" href="#ref-{_attr(note_id)}" aria-label="{back_label}">{back_icon}</a></li>'
                for note_id, _, note_text in chapter_notes
            )
            text += f'\n\n<section class="footnotes"><ol>{items}</ol></section>\n'
        text = GLOSSARY_RE.sub(lambda m: glossary_html(m.group(1), html.escape), text)
        text = GLOSSARY_LANG_RE.sub(lambda m: glossary_lang_html(m.group(1), glossary_data(), html.escape), text)
        text = QUIZ_RE.sub(lambda m: quiz_html(attrs(m.group(1)).get("question", ""), m.group(2), answers_label), text)
        text = QUESTION_RE.sub(
            lambda m: question_html(
                attrs(m.group(1)).get("question", ""),
                m.group(2),
                attrs(m.group(1) + m.group(3)).get("answer", "0"),
                answers_label,
            ), text
        )
        return text.strip() + "\n"

    def render_markdown(self, md_text: str) -> str:
        # Render-time typographic quotes (source keeps straight quotes).
        return as_xhtml(render_math_html(markdown_to_html(self.convert_mdx(md_text), self.lang)))

    def cc_badge_html(self) -> str:
        """CC badge with packaged image for the print-only title page
        (inline <CcBadge/> markers stay text-only per the deliberate
        PDF/EPUB divergence noted in handbook/mdx.py)."""
        href = html.escape(self.add_image("cc-by-88x31.png"), quote=True)
        return (
            f'<p><img src="{href}" alt="CC BY 4.0" /> '
            '<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> Wir machen Wien, '
            "Changing Cities &amp; Prostorož</p>"
        )

    def add_chapter(self, slug: str, title: str, body: str) -> None:
        filename = f"{slug}.xhtml"
        self.chapters.append({"slug": slug, "title": title, "filename": filename, "body": body})

    def build_chapters(self) -> None:
        files, toc = chapter_lists(self.works)
        labels = {entry["file"]: entry["label"] for entry in toc}

        for filename in EPUB_FONTS:
            self.add_font(filename)
        for font_path in katex_font_files():
            self.add_katex_font(font_path)

        cover_name = front_opener(self.lang) or self.works.get("image") or ""
        self.cover_image = self.add_image(cover_name) if cover_name else ""
        lockup = self.add_image("logo-lockup.png")
        title_heading = (
            '<h1 class="title-page-heading">'
            f'<img class="handbook-lockup" src="{_attr(lockup)}" alt="{_attr(self.works["title"])}" width="960" height="256" />'
            '</h1>'
        )

        for slug in files:
            title = labels.get(slug, self.works["title"])
            # The cover and title sheets are virtual: they have no MDX
            # source file (see src/content/book/<lang>/) and are generated
            # here from the works.json metadata plus the hero image.
            if slug == "0-0-cover":
                cover_img = (
                    f'<img class="cover-bg" src="{html.escape(self.cover_image, quote=True)}" alt="" />'
                    if self.cover_image
                    else ""
                )
                body = (
                    '<section class="cover-full">'
                    f"{cover_img}"
                    '<div class="cover-scrim"></div>'
                    '<div class="cover-text">'
                    f"<h1>{html.escape(self.works['title'])}</h1>"
                    f"<p class=\"cover-sub\">{html.escape(self.works.get('subtitle', ''))}</p>"
                    "</div></section>"
                )
                self.add_chapter(slug, title, body)
                continue
            if slug == "0-1-titlepage":
                body = (
                    f'<section class="title-page-sheet">{title_heading}'
                    f'{title_page_details_html(self.lang, self.works, self.add_image)}</section>'
                )
                self.add_chapter(slug, title, body)
                continue
            # The contents sheet is virtual too: generated from the catalogue.
            if slug == "contents":
                items = "".join(
                    f'<li><a href="{entry["file"]}.xhtml">{html.escape(entry["label"])}</a></li>'
                    for entry in toc
                )
                body = f'<section><h1>{html.escape(title)}</h1><ol>{items}</ol></section>'
                self.add_chapter(slug, title, body)
                continue
            path = CONTENT / self.lang / f"{slug}.mdx"
            md_text = read_chapter_mdx(self.lang, slug)
            if md_text is None:
                print(f"warning: missing chapter {path}")
                continue
            body = f'<section>{self.render_markdown(md_text)}</section>'
            self.add_chapter(slug, title, body)

    def xhtml_document(self, title: str, body: str) -> str:
        return "\n".join(
            [
                '<?xml version="1.0" encoding="utf-8"?>',
                '<!DOCTYPE html>',
                f'<html xmlns="http://www.w3.org/1999/xhtml" lang="{self.lang}" xml:lang="{self.lang}">',
                "<head>",
                f"<title>{xml_escape(title)}</title>",
                '<link rel="stylesheet" type="text/css" href="styles/epub.css" />',
                "</head>",
                f"<body>{body}</body>",
                "</html>",
            ]
        )

    def nav_document(self) -> str:
        items = "\n".join(
            f'<li><a href="{chapter["filename"]}">{xml_escape(chapter["title"])}</a></li>'
            for chapter in self.chapters
        )
        body = f'<nav epub:type="toc" id="toc"><h1>{xml_escape(self.works["title"])}</h1><ol>{items}</ol></nav>'
        return "\n".join(
            [
                '<?xml version="1.0" encoding="utf-8"?>',
                '<!DOCTYPE html>',
                f'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="{self.lang}" xml:lang="{self.lang}">',
                "<head>",
                f"<title>{xml_escape(self.works['title'])}</title>",
                "</head>",
                f"<body>{body}</body>",
                "</html>",
            ]
        )

    def opf_document(self) -> str:
        image_items = []
        for index, href in enumerate(self.images.values(), start=1):
            source_name = posixpath.basename(href)
            source = find_asset(source_name)
            properties = ' properties="cover-image"' if href == self.cover_image else ""
            image_items.append(
                f'<item id="image-{index}" href="{xml_escape(href)}" media-type="{media_type(source or Path(source_name))}"{properties}/>'
            )

        chapter_items = "\n".join(
            f'<item id="chapter-{index}" href="{xml_escape(chapter["filename"])}" media-type="application/xhtml+xml"/>'
            for index, chapter in enumerate(self.chapters, start=1)
        )
        font_items = "\n".join(
            f'<item id="font-{index}" href="{xml_escape(href)}" media-type="{media_type(Path(href))}"/>'
            for index, href in enumerate(self.fonts.values(), start=1)
        )
        spine_items = "\n".join(
            f'<itemref idref="chapter-{index}"/>' for index, _ in enumerate(self.chapters, start=1)
        )
        subject = self.works.get("subject", "")
        subjects = "\n".join(
            f"<dc:subject>{xml_escape(part.strip())}</dc:subject>"
            for part in subject.split(";")
            if part.strip()
        )
        return "\n".join(
            [
                '<?xml version="1.0" encoding="utf-8"?>',
                '<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0">',
                '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">',
                f'<dc:identifier id="book-id">{xml_escape(self.uid)}</dc:identifier>',
                f'<dc:title>{xml_escape(self.works["title"])}</dc:title>',
                f'<dc:language>{xml_escape(self.works.get("language", self.lang))}</dc:language>',
                f'<dc:creator>{xml_escape(self.works.get("creator", ""))}</dc:creator>',
                f'<dc:publisher>{xml_escape(self.works.get("publisher", ""))}</dc:publisher>',
                f'<dc:description>{xml_escape(self.works.get("description", ""))}</dc:description>',
                f'<dc:rights>{xml_escape(self.works.get("rights", ""))}</dc:rights>',
                subjects,
                f'<meta property="dcterms:modified">{xml_escape(self.works.get("modified", self.works.get("date", "2026-09-03")))}T00:00:00Z</meta>',
                "</metadata>",
                "<manifest>",
                '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
                '<item id="style" href="styles/epub.css" media-type="text/css"/>',
                chapter_items,
                "\n".join(image_items),
                font_items,
                "</manifest>",
                "<spine>",
                spine_items,
                "</spine>",
                "</package>",
            ]
        )

    def write(self) -> None:
        self.build_chapters()
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            oebps = base / "OEBPS"
            meta_inf = base / "META-INF"
            (oebps / "styles").mkdir(parents=True)
            (oebps / "images").mkdir(parents=True)
            (oebps / "fonts").mkdir(parents=True)
            meta_inf.mkdir()

            (base / "mimetype").write_text("application/epub+zip", encoding="ascii")
            (meta_inf / "container.xml").write_text(
                '<?xml version="1.0" encoding="utf-8"?>\n'
                '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
                '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>'
                '</rootfiles></container>\n',
                encoding="utf-8",
            )
            css = EPUB_CSS_PATH.read_text(encoding="utf-8") + "\n" + katex_css("../fonts/")
            (oebps / "styles" / "epub.css").write_text(css, encoding="utf-8")
            (oebps / "nav.xhtml").write_text(self.nav_document(), encoding="utf-8")
            (oebps / "content.opf").write_text(self.opf_document(), encoding="utf-8")

            for chapter in self.chapters:
                (oebps / chapter["filename"]).write_text(
                    self.xhtml_document(chapter["title"], chapter["body"]), encoding="utf-8"
                )
            for source_key, href in self.images.items():
                shutil.copyfile(source_key, oebps / href)
            for source_key, href in self.fonts.items():
                shutil.copyfile(source_key, oebps / href)

            self.out_path.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(self.out_path, "w") as epub:
                epub.write(base / "mimetype", "mimetype", compress_type=zipfile.ZIP_STORED)
                for path in sorted(base.rglob("*")):
                    if path.is_file() and path.name != "mimetype":
                        epub.write(path, path.relative_to(base).as_posix(), compress_type=zipfile.ZIP_DEFLATED)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build handbook EPUBs.")
    add_common_arguments(parser, "EPUBs")
    args = parser.parse_args()

    works_data = load_works()
    jobs = resolve_jobs(args)
    out_dir = ROOT / args.out
    for lang in jobs:
        stem = download_stem(lang)
        out_path = out_dir / f"{stem}.epub"
        EpubBook(lang, works_data[lang], out_path).write()
        print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
