"""Print visible text and links from an untrusted HTML file. Usage: python -I htmlinfo.py FILE [--links] [--grep REGEX]"""
import sys, re
from html.parser import HTMLParser


class P(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text = []
        self.links = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script", "style", "noscript"):
            self.skip += 1
        for k in ("href", "src", "data-src"):
            v = a.get(k)
            if v:
                self.links.append((tag, v))

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self.skip:
            self.skip -= 1
        if tag in ("p", "div", "tr", "li", "br", "h1", "h2", "h3", "h4", "td", "th", "section"):
            self.text.append("\n")

    def handle_data(self, d):
        if not self.skip:
            s = d.strip()
            if s:
                self.text.append(s + " ")


def main():
    path = sys.argv[1]
    with open(path, encoding="utf-8", errors="replace") as f:
        html = f.read()
    p = P()
    p.feed(html)
    if "--links" in sys.argv:
        seen = set()
        for t, v in p.links:
            if v not in seen:
                seen.add(v)
                print(t, v)
        return
    txt = "".join(p.text)
    txt = re.sub(r"\n\s*\n+", "\n", txt)
    if "--grep" in sys.argv:
        rx = re.compile(sys.argv[sys.argv.index("--grep") + 1], re.I)
        for line in txt.splitlines():
            if rx.search(line):
                print(line)
        return
    print(txt)


main()
