"""Extract product title, variants and nutrition text from a haldirams.com product page (Next.js RSC flight data).
Untrusted HTML is only parsed (json.loads of string literals), never executed.
Usage: python -I haldirams_extract.py PAGE.html [PAGE2.html ...]  -> prints one JSON object per page"""
import sys, json, re, html


def flight(s):
    out = []
    for m in re.finditer(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', s):
        out.append(json.loads(m.group(1)))
    return "".join(out)


def text_chunk(fl, ref):
    # text rows look like  "47:T1a2,<text of 0x1a2 bytes>"
    m = re.search(r'(?<![0-9a-f])' + re.escape(ref) + r':T([0-9a-f]+),', fl)
    if not m:
        return None
    n = int(m.group(1), 16)
    start = m.end()
    b = fl[start:].encode("utf-8")[:n]
    return b.decode("utf-8", errors="replace")


def strip_tags(h):
    h = re.sub(r"<br\s*/?>", "\n", h, flags=re.I)
    h = re.sub(r"</(p|div|li|tr)>", "\n", h, flags=re.I)
    h = re.sub(r"<[^>]+>", "", h)
    return html.unescape(h)


for page in sys.argv[1:]:
    s = open(page, encoding="utf-8").read()
    fl = flight(s)
    rec = {"page": page}
    m = re.search(r'"descriptionHtml":"(\$[0-9a-f]+|[^"]*)"', fl)
    desc = None
    if m:
        v = m.group(1)
        desc = text_chunk(fl, v[1:]) if v.startswith("$") else v
    # fallback: product JSON with inline descriptionHtml
    if not desc:
        m2 = re.search(r'"descriptionHtml":"((?:[^"\\]|\\.)*)"', fl)
        if m2:
            desc = json.loads('"' + m2.group(1) + '"')
    rec["description_text"] = strip_tags(desc) if desc else None
    t = re.search(r'<title>(.*?)</title>', s, re.S)
    rec["title"] = html.unescape(t.group(1).strip()) if t else None
    # product title + variants from the product JSON in flight data
    pm = re.search(r'"product":\{"id":"gid://shopify/Product/\d+".{0,200}?"title":"((?:[^"\\]|\\.)*)"', fl)
    rec["product_title"] = json.loads('"' + pm.group(1) + '"') if pm else None
    variants = []
    for vm in re.finditer(r'"__typename":"ProductVariant".{0,1500}?"title":"((?:[^"\\]|\\.)*)"', fl):
        variants.append(json.loads('"' + vm.group(1) + '"'))
    sel = re.findall(r'"selectedOptions":\[\{"name":"([^"]*)","value":"([^"]*)"\}\]', fl)
    rec["variant_titles"] = sorted(set(variants))
    rec["selected_options"] = sorted(set(f"{a}={b}" for a, b in sel))
    w = re.findall(r'"weight":([0-9.]+),"weightUnit":"([A-Z]+)"', fl)
    rec["weights"] = sorted(set(w))
    print(json.dumps(rec, ensure_ascii=False))
