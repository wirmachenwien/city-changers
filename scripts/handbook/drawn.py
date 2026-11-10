"""Drawn PDF/EPUB decoration using the selected web geometry.

Reuse selected SVG artwork and semantic print colors. Size-sensitive PDF paint
uses a layout pass; EPUB media uses intrinsic aspect ratios. Native content,
links and alternative text are retained outside the decorative SVG layers.
"""
import base64
from functools import lru_cache
from html import escape
import json
import mimetypes
import re
import subprocess
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse
from xml.etree import ElementTree

from handbook.book import resolve_color_tokens

ROOT = Path(__file__).resolve().parents[2]
ELEMENTS = ROOT / "design/elements"


def svg_uri(source: str) -> str:
    return f'data:image/svg+xml,{quote(source, safe="")}'


def artwork(filename: str, stroke: str, fill: str | None = None, view: str | None = None) -> str:
    source = (ELEMENTS / filename).read_text(encoding="utf-8")
    source = source.replace("currentColor", resolve_color_tokens(f"var(--{stroke})"))
    if fill:
        source = source.replace('fill="none"', f'fill="{resolve_color_tokens(f"var(--{fill})")}"')
    if view:
        x, y, width, height = map(float, view.split())
        source = re.sub(r'viewBox="[^"]+"', f'width="{width}" height="{height}" viewBox="0 0 {width} {height}"', source, count=1)
        if 'preserveAspectRatio=' not in source:
            source = source.replace('<svg ', '<svg preserveAspectRatio="none" ', 1)
        opening, body = source.split('>', 1)
        source = (opening + '><defs><clipPath id="slice">'
                  f'<rect width="{width}" height="{height}"/></clipPath></defs>'
                  f'<g clip-path="url(#slice)"><g transform="translate({-x} {-y})">'
                  + body.replace('</svg>', '</g></g></svg>'))
    return source


def drawn_css() -> str:
    def image(match: re.Match) -> str:
        filename, query = match.groups()
        options = parse_qs(query)
        source = artwork(filename, options["stroke"][0], options.get("fill", [None])[0],
                         options.get("view", [""])[0].replace(",", " ") or None)
        return f'url("{svg_uri(source)}")'

    css = (ROOT / "src/styles/export-drawn.css").read_text(encoding="utf-8")
    css = re.sub(r'url\("drawn/([\w/-]+\.svg)\?([^"\)]+)"\)', image, css)
    return resolve_color_tokens(css)


def frame_paths(sizes: list[tuple[float, float]]) -> list[str]:
    result = subprocess.run(
        ["node", str(ROOT / "scripts/bin/drawn-paths.mjs")],
        input=json.dumps(sizes), text=True, capture_output=True, check=True,
    )
    return json.loads(result.stdout)


@lru_cache(maxsize=128)
def image_uri(src: str) -> str:
    """Only local, already resolved assets; never fetch remote images."""
    if src.startswith("data:"):
        return src
    parsed = urlparse(src)
    if parsed.scheme not in ("", "file"):
        raise ValueError(f"Expected local figure asset, got {src}")
    path = Path(unquote(parsed.path))
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def media_svg(src: str, width: float, height: float, path: str, framed: bool = False,
              uri: str | None = None) -> str:
    """Draw one figure frame; `uri` lets a builder supply a size-bounded image.

    PDF passes the original local file; EPUB passes its optimized derivative.
    """
    line = resolve_color_tokens("var(--media-line)")
    backing = f'<path d="{path}" fill="{resolve_color_tokens("var(--white)")}"/>' if framed else ""
    inset = 16 if framed else 0
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            f'width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
            f'<defs><clipPath id="frame"><path d="{path}"/></clipPath></defs>{backing}'
            f'<image x="{inset}" y="{inset}" width="{width - inset * 2}" height="{height - inset * 2}" '
            f'xlink:href="{escape(uri or image_uri(src), quote=True)}" clip-path="url(#frame)"/>'
            f'<path d="{path}" fill="none" stroke="{line}" stroke-width="1.5" '
            f'stroke-linecap="round" stroke-linejoin="round"/></svg>')


def table_svg(width: float, height: float, header: float, path: str, rows: tuple[float, ...] = ()) -> str:
    panel, line = (resolve_color_tokens(f"var(--{token})") for token in ("panel", "line"))
    dividers = ''.join(f'<path d="M0 {y}H{width}" stroke="{line}" stroke-width="0.6667"/>' for y in rows)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="0 0 {width} {height}">'
            f'<defs><clipPath id="frame"><path d="{path}"/></clipPath></defs>'
            f'<rect width="{width}" height="{header}" fill="{panel}" clip-path="url(#frame)"/>'
            f'<g clip-path="url(#frame)">{dividers}</g>'
            f'<path d="{path}" fill="none" stroke="{line}" stroke-width="1.5"/></svg>')


def bracket_svg(height: float, warm: bool = False) -> str:
    name, native = ("bracket-short", 56) if height < 80 else ("bracket-medium", 104) if height < 136 else ("bracket", 160)
    source = artwork(f"lines/{name}.svg", "warm" if warm else "accent")
    path = re.search(r'<path[^>]+>', source)[0].replace('<path ', '<path vector-effect="non-scaling-stroke" ')
    stroke = resolve_color_tokens(f'var(--{"warm" if warm else "accent"})')
    slices = [(0, 24, 0, 24), (24, height - 48, 24, native - 48), (height - 24, 24, native - 24, 24)]
    layers = ''.join(f'<svg y="{y}" width="32" height="{h}" viewBox="0 {start} 32 {length}" preserveAspectRatio="none">{path}</svg>'
                     for y, h, start, length in slices)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="{height}" viewBox="0 0 32 {height}" '
            f'fill="none" stroke="{stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">{layers}</svg>')


def pdf_document(source: str):
    """Measure once, then paint actual-size SVGs without changing the layout.

    WeasyPrint has no CSS clip-path/masks for HTML content. Local images can be
    clipped inside SVG; table paint lives behind native, selectable table text.
    Page-split tables keep the conservative reflowable fallback.
    """
    from weasyprint import HTML

    html = HTML(string=source)
    parents = {child: parent for parent in html.etree_element.iter() for child in parent}
    measured = html.render()
    candidates = {}
    brackets = []
    for page in measured.pages:
        for box in page._page_box.descendants():
            element = box.element
            if element is None:
                continue
            if ("feature-box" in element.get("class", "").split()
                    and box.__class__.__name__ == "BlockBox" and box.element_tag == "div"):
                brackets.append((element, box.border_height()))
            is_table = box.__class__.__name__ == "TableBox"
            is_image = (box.__class__.__name__.endswith("ReplacedBox") and element.tag == "img"
                        and "figure" in parents.get(element, ElementTree.Element("div")).get("class", "").split())
            if is_table or is_image:
                candidates.setdefault(element, []).append((box, is_table))
    items = [(element, fragments[0]) for element, fragments in candidates.items() if len(fragments) == 1]
    if not items and not brackets:
        return measured, source
    sizes = [(box.border_width(), box.border_height()) for _, (box, _) in items]
    paths = frame_paths(sizes) if sizes else []
    rules = []
    for index, (element, height) in enumerate(brackets):
        element.set("data-drawn-bracket", str(index))
        svg = bracket_svg(max(48, height), element.get("data-tone") == "warm")
        rules.append(f'.feature-box[data-drawn-bracket="{index}"]::before {{top:0;bottom:0;background-image:url("{svg_uri(svg)}");background-size:100% 100%;}}')
        rules.append(f'.feature-box[data-drawn-bracket="{index}"]::after {{display:none;}}')
    head = html.etree_element.find("head")
    if head is not None:
        ElementTree.SubElement(head, "style").text = '\n'.join(rules)
    for (element, (box, is_table)), (width, height), path in zip(items, sizes, paths):
        if width < 8 or height < 8:
            continue
        if is_table:
            header = next((child.position_y + child.height - box.border_box_y()
                           for child in box.children if child.element_tag == "thead"), 0)
            rows = [row.position_y + row.height - box.border_box_y()
                    for group in box.children for row in group.children
                    if row.__class__.__name__ == "TableRowBox"]
            svg = table_svg(width, height, header, path, tuple(rows[:-1]))
            element.set("data-drawn-table", "")
            style = (f'border-image:none;border-color:transparent;border-radius:0;'
                     f'background:url("{svg_uri(svg)}") border-box 0 0 / 100% 100% no-repeat;')
        else:
            src = element.get("src", "")
            if src == "..." or not (src.startswith("file:") or Path(src).is_file()):
                continue
            framed = "figure--framed" in parents[element].get("class", "").split()
            # The outer SVG replaces padding too; retain the measured footprint.
            svg = media_svg(src, width, height, path, framed)
            element.set("src", svg_uri(svg))
            style = f"width:{width}px;height:{height}px;padding:0;border:0;"
        element.set("style", element.get("style", "") + ";" + style)
    final_source = "<!doctype html>\n" + ElementTree.tostring(html.etree_element, encoding="unicode", method="html")
    # Reparse so the second render cannot reuse stale image/style caches.
    return HTML(string=final_source).render(), final_source
