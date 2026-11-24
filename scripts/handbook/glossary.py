"""Safe inline Markdown for glossary definitions in PDF and EPUB."""
import re
from html import escape
from html.parser import HTMLParser


class InlineMarkdown(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.tags = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        allowed = tag in {"strong", "em", "code", "br"}
        suffix = ""
        if tag == "a":
            url = attributes.get("href", "")
            allowed = not re.match(r"^(javascript|data|vbscript):", re.sub(r"[\s\x00-\x20]", "", url), re.I)
            suffix = f' href="{escape(url, quote=True)}"'
            if attributes.get("title"):
                suffix += f' title="{escape(attributes["title"], quote=True)}"'
        if allowed:
            self.parts.append(f"<{tag}{suffix}>" if tag != "br" else "<br />")
        if tag not in {"br", "img", "hr"}:
            self.tags.append((tag, allowed))

    def handle_endtag(self, tag):
        if self.tags and self.tags[-1][0] == tag:
            _, allowed = self.tags.pop()
            if allowed:
                self.parts.append(f"</{tag}>")

    def handle_data(self, data):
        self.parts.append(escape(data, quote=False))


def glossary_markdown(source: str) -> str:
    import markdown

    parser = InlineMarkdown()
    # Disable author HTML handling, letting Markdown's serializer escape raw
    # tags and code contents exactly once. Only generated inline tags survive.
    processor = markdown.Markdown()
    processor.preprocessors.deregister('html_block')
    processor.inlinePatterns.deregister('html')
    parser.feed(processor.convert(source))
    return "".join(parser.parts)
