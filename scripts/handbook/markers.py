"""Mirror rehype-drawn-containers' ordered-list marker hints for exports."""
from html.parser import HTMLParser


def marker_hints(source: str) -> str:
    class Markers(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=False)
            self.parts = []
            self.lists = []

        def handle_starttag(self, tag, attrs):
            values = dict(attrs)
            if tag in ("ol", "ul"):
                self.lists.append((tag, values, []))
            elif tag == "li" and self.lists and self.lists[-1][0] == "ol":
                self.lists[-1][2].append((len(self.parts), values))
            self.parts.append(self.get_starttag_text())

        def handle_startendtag(self, tag, attrs):
            self.parts.append(self.get_starttag_text())

        def handle_endtag(self, tag):
            if tag in ("ol", "ul") and self.lists:
                _, attrs, items = self.lists.pop()
                if tag == "ol":
                    def integer(value, fallback):
                        try:
                            return int(value)
                        except (TypeError, ValueError):
                            return fallback
                    step = -1 if "reversed" in attrs else 1
                    number = integer(attrs.get("start"), len(items) if step == -1 else 1)
                    for index, values in items:
                        number = integer(values.get("value"), number)
                        hint = ' data-marker-single=""' if len(str(number)) == 1 else ""
                        self.parts[index] = self.parts[index][:-1] + f' data-marker-number="{number}"{hint}>'
                        number += step
            self.parts.append(f"</{tag}>")

        def handle_data(self, data):
            self.parts.append(data)

        def handle_entityref(self, name):
            self.parts.append(f"&{name};")

        def handle_charref(self, name):
            self.parts.append(f"&#{name};")

        def handle_comment(self, data):
            self.parts.append(f"<!--{data}-->")

    parser = Markers()
    parser.feed(source)
    parser.close()
    return "".join(parser.parts)
