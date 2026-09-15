#!/usr/bin/env python3
"""Static site generator for HomeSizer.

No npm, no build toolchain, no framework. Reads JSON out of data/, renders
Jinja2 templates into dist/, copies static/ over the top. Deploy dist/ to
Cloudflare Pages, Netlify or any static host.

    python3 build.py          # build into dist/
    python3 build.py --serve  # build, then serve on localhost:8000
"""
import argparse
import datetime as dt
import html
import json
import shutil
import sys
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).parent
DATA = ROOT / "data"
DIST = ROOT / "dist"


def load_json(path):
    with open(path) as fh:
        return json.load(fh)


def load_all(subdir):
    return [load_json(p) for p in sorted((DATA / subdir).glob("*.json"))]


def render_inputs(calc):
    """Build the calculator's form controls from its JSON config.

    Every engine reads its values off data-* attributes, so adding a field is a
    data change rather than a template change.
    """
    out = []

    for field in calc.get("inputs", []):
        key = field["key"]
        label = html.escape(field["label"])
        ftype = field["type"]

        if ftype == "number":
            unit = html.escape(field.get("unit", ""))
            out.append(
                f'<div class="field"><label for="f-{key}">{label}</label>'
                f'<div class="numwrap"><input type="number" id="f-{key}" name="{key}" '
                f'value="{field["default"]}" min="{field.get("min", 0)}" '
                f'max="{field.get("max", 99999)}" step="{field.get("step", 1)}">'
                f'<span class="unit">{unit}</span></div></div>'
            )

        elif ftype == "select":
            opts = []
            for o in field["options"]:
                # Engines pick up whichever numeric hint the option carries.
                attrs = "".join(
                    f' data-{k}="{v}"' for k, v in o.items()
                    if k not in ("value", "label")
                )
                sel = " selected" if str(o["value"]) == str(field.get("default")) else ""
                opts.append(
                    f'<option value="{html.escape(str(o["value"]))}"{attrs}{sel}>'
                    f'{html.escape(o["label"])}</option>'
                )
            out.append(
                f'<div class="field"><label for="f-{key}">{label}</label>'
                f'<select id="f-{key}" name="{key}">{"".join(opts)}</select></div>'
            )

        elif ftype == "checkbox":
            chk = " checked" if field.get("default") else ""
            out.append(
                f'<div class="field field-check">'
                f'<input type="checkbox" id="f-{key}" name="{key}"{chk}>'
                f'<label for="f-{key}">{label}</label></div>'
            )

    # Generator-style appliance picker: grouped checkboxes carrying watt data.
    for gi, group in enumerate(calc.get("appliance_groups", [])):
        rows = []
        for ii, item in enumerate(group["items"]):
            eid = f"ap-{gi}-{ii}"
            chk = " checked" if item.get("default") else ""
            rows.append(
                f'<div class="appliance"><input type="checkbox" id="{eid}" class="ap" '
                f'data-running="{item["running"]}" data-starting="{item["starting"]}"{chk}>'
                f'<label for="{eid}">{html.escape(item["name"])}'
                f'<span class="watts">{item["running"]:,} W</span></label></div>'
            )
        out.append(
            f'<fieldset class="group"><legend>{html.escape(group["group"])}</legend>'
            f'{"".join(rows)}</fieldset>'
        )

    # Water-heater-style usage counters: how many of each draw in the peak hour.
    if calc.get("usage_items"):
        rows = []
        for ii, item in enumerate(calc["usage_items"]):
            eid = f"use-{ii}"
            rows.append(
                f'<div class="usage"><label for="{eid}">{html.escape(item["name"])}'
                f'<span class="watts">{item["gallons"]} gal each</span></label>'
                f'<input type="number" id="{eid}" class="use" min="0" max="20" step="1" '
                f'value="{item.get("default", 0)}" data-gallons="{item["gallons"]}"></div>'
            )
        out.append(
            f'<fieldset class="group"><legend>Uses in your busiest hour</legend>'
            f'{"".join(rows)}</fieldset>'
        )

    return "\n".join(out)


def faq_schema(faqs):
    return {
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": f["q"],
             "acceptedAnswer": {"@type": "Answer", "text": f["a"]}}
            for f in faqs
        ],
    }


def crumb_schema(base, trail):
    return {
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": name,
             "item": base + href}
            for i, (name, href) in enumerate(trail)
        ],
    }


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--serve", action="store_true", help="serve dist/ after building")
    args = ap.parse_args()

    site = load_json(DATA / "site.json")
    calcs = load_all("calculators")
    roundups = load_all("roundups")
    base = site["base_url"].rstrip("/")
    year = dt.date.today().year

    env = Environment(
        loader=FileSystemLoader(ROOT / "templates"),
        autoescape=select_autoescape(["html"]),
    )

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()

    by_slug = {c["slug"]: c for c in calcs}
    urls = []

    def page(url, template, **ctx):
        rendered = env.get_template(template).render(
            site=site, page_url=url, year=year, **ctx
        )
        out = DIST / (url.lstrip("/") + "index.html" if url.endswith("/") else url.lstrip("/"))
        write(out, rendered)
        urls.append(url)

    # Home
    page("/", "index.html", calcs=calcs, roundups=roundups)

    # Calculators
    for c in calcs:
        schema = {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "WebApplication",
                    "name": c["h1"],
                    "url": f"{base}/{c['slug']}/",
                    "applicationCategory": "UtilitiesApplication",
                    "operatingSystem": "Any",
                    "offers": {"@type": "Offer", "price": "0",
                               "priceCurrency": "USD"},
                },
                faq_schema(c["faqs"]),
                crumb_schema(base, [("Home", "/"), ("Calculators", "/calculators/"),
                                    (c["nav_label"], f"/{c['slug']}/")]),
            ],
        }
        page(
            f"/{c['slug']}/", "calculator.html",
            calc=c,
            inputs_html=render_inputs(c),
            related=[by_slug[s] for s in c.get("related", []) if s in by_slug],
            schema=json.dumps(schema),
        )

    # Roundups
    for r in roundups:
        schema = {
            "@context": "https://schema.org",
            "@graph": [
                faq_schema(r["faqs"]),
                crumb_schema(base, [("Home", "/"), ("Guides", "/guides/"),
                                    (r["category"], f"/guides/{r['slug']}/")]),
            ],
        }
        page(f"/guides/{r['slug']}/", "roundup.html", r=r, schema=json.dumps(schema))

    # Index pages
    page("/calculators/", "list.html",
         heading="All calculators",
         blurb="Every sizing tool on the site. Each one shows its formula on the page.",
         items=[{"href": f"/{c['slug']}/", "title": c["h1"], "blurb": c["meta_description"]}
                for c in calcs])
    page("/guides/", "list.html",
         heading="Buying guides",
         blurb="Spec tables with the date they were last checked.",
         items=[{"href": f"/guides/{r['slug']}/", "title": r["h1"], "blurb": r["category"]}
                for r in roundups])
    page("/about/", "about.html", schema=json.dumps({
        "@context": "https://schema.org", "@type": "AboutPage",
        "url": f"{base}/about/",
        "publisher": {"@type": "Organization", "name": site["name"], "url": base},
    }))

    # Static assets sit at the root so /style.css and /calc.js resolve.
    for asset in (ROOT / "static").iterdir():
        shutil.copy2(asset, DIST / asset.name)

    # Sitemap + robots
    today = dt.date.today().isoformat()
    entries = "".join(
        f"<url><loc>{base}{u}</loc><lastmod>{today}</lastmod></url>" for u in urls
    )
    write(DIST / "sitemap.xml",
          '<?xml version="1.0" encoding="UTF-8"?>'
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
          f"{entries}</urlset>")
    write(DIST / "robots.txt", f"User-agent: *\nAllow: /\n\nSitemap: {base}/sitemap.xml\n")

    print(f"built {len(urls)} pages into {DIST}")

    unverified = [
        f"{r['slug']}: {p['model']}"
        for r in roundups for p in r["products"] if not p.get("verified")
    ]
    if unverified:
        print(f"\n  {len(unverified)} product rows are unverified and must not go live:",
              file=sys.stderr)
        for u in unverified[:10]:
            print(f"   - {u}", file=sys.stderr)

    if args.serve:
        import http.server, socketserver, functools
        handler = functools.partial(http.server.SimpleHTTPRequestHandler,
                                    directory=str(DIST))
        with socketserver.TCPServer(("", 8000), handler) as httpd:
            print("serving http://localhost:8000 — ctrl-c to stop")
            httpd.serve_forever()


if __name__ == "__main__":
    main()
