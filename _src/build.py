"""Собирает страницы сайта из _src/pages и _src/partials в корень папки.

Запуск: python3 _src/build.py

В странице:
  первая строка — <!-- title: ... | desc: ... | nav: ... -->
  <!-- include:header --> и т. п. — вставка файла из _src/partials
"""
from catalog import program_card, program_button
from pathlib import Path
import os, re, time, tempfile

VERSION = time.strftime("%Y%m%d%H%M")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_src")

HEAD = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#f2f4f1">
<link rel="icon" href="assets/img/logo.svg" type="image/svg+xml">
<link rel="preload" href="assets/fonts/onest-variable.ttf" as="font" type="font/ttf" crossorigin>
<script src="assets/js/page-loading.js"></script>
<link rel="stylesheet" href="assets/css/site.css?v={ver}">
</head>
<body>
"""
TAIL = """<script src="assets/js/config.js?v={ver}"></script>
<script src="assets/js/site.js?v={ver}"></script>
<script src="assets/js/calc.js?v={ver}"></script>
<script src="assets/js/apply.js?v={ver}"></script>
</body>
</html>
"""


import html as _html, json as _json


def _data(name):
    with open(os.path.join(SRC, "data", name), encoding="utf8") as f:
        return _json.load(f)


def gen_projects():
    """Project archive cards from _src/data/projects.json."""
    items = _data("projects.json")
    cats = sorted({x["category"] for x in items if x["category"]})
    opts = "".join('<option>%s</option>' % _html.escape(c) for c in cats)
    cards = []
    for x in items:
        text = " ".join(x["text"])
        short = text if len(text) <= 150 else text[:150].rsplit(" ", 1)[0] + "…"
        full = "".join("<p>%s</p>" % _html.escape(t) for t in x["text"])
        cards.append(
            '<article class="pcard" data-cat="%s" data-search="%s">'
            '<button class="pcard__open" type="button" data-open aria-haspopup="dialog">'
            '<span class="pcard__img"><img src="%s" alt="%s" loading="lazy"></span>'
            '<span class="pcard__body"><span class="project__meta">%s</span><span class="pcard__title">%s</span><span class="pcard__text">%s</span></span>'
            '</button><div class="pcard__full" hidden>%s</div></article>'
            % (_html.escape(x["category"]), _html.escape((x["title"] + " " + text + " " + x["category"]).lower()),
               _html.escape(x["photo"]), _html.escape(x["title"]), _html.escape(x["category"]), _html.escape(x["title"]), _html.escape(short), full))
    return ('<div class="archive-tools"><div class="input-wrap archive-search"><input class="input" type="search" placeholder="Поиск по названию или описанию" aria-label="Поиск проектов" data-archive-search></div>'
            '<select class="select archive-cat" aria-label="Отрасль" data-archive-cat><option value="">Все отрасли</option>%s</select></div>'
            '<p class="archive-count" data-archive-count></p><div class="archive" data-archive>%s</div>'
            '<button class="btn btn--secondary archive-more" type="button" data-archive-more>Показать ещё</button>'
            '<p class="archive-empty" data-archive-empty hidden>Ничего не найдено. Измените запрос или отрасль.</p>') % (opts, "".join(cards))


def gen_faq():
    """Full FAQ from _src/data/legal.json (texts of the fund's current FAQ page)."""
    rows = _data("legal.json")["faq"]
    return "".join('<details><summary>%s</summary><div class="doc-text">%s</div></details>' % (_html.escape(q), a) for q, a in rows)


def gen_doc(key, intro=True):
    """A legal document: table of contents and sections, texts as on the fund's current site."""
    d = _data("legal.json")[key]
    toc = "".join('<li><a href="#s%d">%s</a></li>' % (i + 1, _html.escape(t)) for i, (t, _) in enumerate(d["sections"]) if t)
    body = "".join('<section class="doc-section" id="s%d">%s<div class="doc-text">%s</div></section>'
                   % (i + 1, ("<h2>%s</h2>" % _html.escape(t)) if t else "", b) for i, (t, b) in enumerate(d["sections"]))
    return ('<div class="doc"><aside class="doc-toc plate"><span class="eyebrow">Содержание</span><ol>%s</ol></aside>'
            '<article class="doc-body plate">%s%s</article></div>') % (toc, ('<div class="doc-intro doc-text">%s</div>' % d["intro"]) if intro else "", body)


GENERATORS = {"projects_archive": gen_projects, "faq_full": gen_faq,
              "doc_terms": lambda: gen_doc("terms_new"), "doc_privacy": lambda: gen_doc("privacy_new", False),
              "doc_personal": lambda: gen_doc("personal_data_new", False)}


def partial(name):
    if name in GENERATORS:
        return GENERATORS[name]()
    with open(os.path.join(SRC, "partials", name + ".html"), encoding="utf8") as f:
        source = f.read()
    if name == "programs":
        return source.replace("<!-- program-cards -->", "\n".join(map(program_card, _data("programs.json"))))
    if name == "calc":
        return source.replace("<!-- program-buttons -->", "\n".join(map(program_button, _data("programs.json"))))
    return source


def render(page):
    with open(os.path.join(SRC, "pages", page), encoding="utf8") as f:
        text = f.read()
    meta_line, body = text.split("\n", 1)
    meta = dict(part.strip().split(":", 1) for part in meta_line.strip()[4:-3].split("|"))
    meta = {k.strip(): v.strip() for k, v in meta.items()}
    if page == "index.html":
        groups = _data("home.json")
        body = re.sub(r"\{\{home\.([^.{}]+)\.(f\d+)\}\}", lambda m: _html.escape(groups[m[1]][m[2]]["value"]), body)
    body = re.sub(r"<!-- include:(\w+) -->", lambda m: partial(m.group(1)), body)
    nav = meta.get("nav")
    if nav:
        body = body.replace('data-nav="%s"' % nav, 'data-nav="%s" aria-current="page"' % nav)
    html = HEAD.format(title=meta["title"], desc=meta["desc"], ver=VERSION) + body + TAIL.format(ver=VERSION)
    return html


def preview_templates():
    """Use the public site templates for in-memory editor previews."""
    source = Path(SRC, "pages/index.html").read_text(encoding="utf8")
    sections = {}
    for section in re.findall(r"<section\b.*?</section>", source, re.S):
        marker = re.search(r"\{\{home\.([^.{}]+)\.f\d+\}\}", section)
        if marker:
            sections[marker[1]] = re.sub(r"\{\{home\.[^.{}]+\.(f\d+)\}\}", r"{{\1}}", section)
    keys = ["title", "tag", "description", "markup", "duration", "holiday", "pledge", "districts"]
    model = {key: "{{" + key + "}}" for key in keys}
    programs = {key: program_card(dict(model, id=key)) for key in ["main", "lamanho"]}
    templates = {"home": sections, "programs": programs, "icons": partial("sprite")}
    target = Path(ROOT, "assets/admin/preview.json")
    target.parent.mkdir(exist_ok=True)
    target.write_text(_json.dumps(templates, ensure_ascii=False), encoding="utf8")


def build():
    preview_templates()
    for source in sorted(Path(SRC, "pages").glob("*.html")):
        target = Path(ROOT, source.name)
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf8", dir=ROOT, delete=False) as output:
            output.write(render(source.name))
        os.chmod(output.name, 0o644)
        os.replace(output.name, target)
        print("built", source.name)


if __name__ == "__main__":
    build()
