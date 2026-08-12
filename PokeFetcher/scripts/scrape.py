#!/usr/bin/env python3
"""Scrapes pokemongo.fandom.com release-date wiki pages and writes data/releases.json.

Run manually or via .github/workflows/update-data.yml (server-side, so no CORS
issues). The generated JSON is the only thing the static site reads at runtime.
"""
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://pokemongo.fandom.com/api.php"
UA = "Mozilla/5.0 (compatible; PokeFetcherBot/1.0; static-site data refresh)"

FORMS_ROOT = "List of Pokémon forms by release date"
EVENTS_PAGE = "List of Event Pokémon by release date"
SHADOW_PAGE = "List of Shadow Pokémon by release date"

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
    "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}

OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "releases.json"


def api_get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def get_wikitext(title):
    data = api_get({
        "action": "parse",
        "page": title,
        "format": "json",
        "prop": "wikitext",
    })
    return data["parse"]["wikitext"]["*"]


def list_year_subpages(root_title):
    prefix = root_title.replace(" ", "_")
    data = api_get({
        "action": "query",
        "list": "allpages",
        "apprefix": prefix,
        "aplimit": "100",
        "format": "json",
    })
    titles = [p["title"] for p in data["query"]["allpages"]]
    years = []
    for t in titles:
        m = re.match(re.escape(root_title) + r"/(\d{4})$", t)
        if m:
            years.append((int(m.group(1)), t))
    return sorted(years)


def strip_wiki_markup(text):
    text = re.sub(r"<ref[^>/]*/>", "", text)
    text = re.sub(r"<ref[^>]*>.*?</ref>", "", text, flags=re.S)
    text = re.sub(r"\{\{[Nn]th\|(\d+)\}\}", lambda m: ordinal(int(m.group(1))), text)
    text = re.sub(r"\{\{[^{}]*\}\}", "", text)
    text = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", text)
    text = re.sub(r"\[\[([^\]]*)\]\]", r"\1", text)
    text = re.sub(r"'''?", "", text)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


def ordinal(n):
    if 10 <= n % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


HEADING_RE = re.compile(r"^(={2,6})\s*(.*?)\s*\1\s*$", re.M)


def split_sections(wikitext):
    """Yield (heading_text, body) for each top-level '==...==' heading."""
    matches = list(HEADING_RE.finditer(wikitext))
    sections = []
    for i, m in enumerate(matches):
        heading = m.group(2)
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(wikitext)
        sections.append((heading, wikitext[start:end]))
    return sections


def parse_date_from_heading(heading, fallback_year=None):
    clean = re.sub(r"\{\{[Nn]th\|(\d+)\}\}", r"\1", heading)
    clean = clean.strip()
    m = re.match(
        r"([A-Za-z]+)\s+(\d+)(?:st|nd|rd|th)?(?:,\s*(\d{4}))?$", clean
    )
    if not m:
        return None
    month_name, day, year = m.group(1).lower(), int(m.group(2)), m.group(3)
    month = MONTHS.get(month_name)
    if month is None:
        return None
    year = int(year) if year else fallback_year
    if year is None:
        return None
    return f"{year:04d}-{month:02d}-{day:02d}"


def parse_template_args(arg_str):
    parts = arg_str.split("|")
    positional = []
    named = {}
    for part in parts:
        if "=" in part:
            key, _, val = part.partition("=")
            named[key.strip()] = val.strip()
        else:
            positional.append(part.strip())
    return positional, named


def parse_entries_from_block(block, template_names):
    """template_names: list of template names to match, e.g. ["P", "PS"] or ["PC"]."""
    entries = []
    alt = "|".join(re.escape(t) for t in template_names)
    for m in re.finditer(r"\{\{(" + alt + r")\|([^{}]*)\}\}", block):
        template_name, arg_str = m.group(1), m.group(2)
        positional, named = parse_template_args(arg_str)
        entry = {}
        if template_name == "PC":
            entry["name"] = positional[0] if positional else ""
            entry["costume"] = positional[1] if len(positional) > 1 else None
            entry["types"] = []
        else:
            entry["name"] = positional[0] if positional else ""
            types = [p for p in positional[2:] if p and not p.startswith("ci=")]
            entry["types"] = types
            entry["costume"] = None
        form = None
        if named.get("mega") == "t":
            form = "mega"
        elif named.get("gigantamax") == "t":
            form = "gigantamax"
        elif named.get("primal") == "t":
            form = "primal"
        entry["form"] = form
        entry["shadow"] = named.get("shadow") == "t"
        entry["isShiny"] = template_name == "PS" or named.get("s") == "t"
        if entry["name"]:
            entries.append(entry)
    return entries


TABBER_TAB_RE = re.compile(
    r"(Regular|Shiny|Shadow)\s*(?:\(\d+\))?\s*=\s*(.*?)"
    r"(?=\n(?:Regular|Shiny|Shadow)\s*(?:\(\d+\))?\s*=|</tabber>|\Z)",
    re.S,
)


def parse_tabber_entries(block, template_names):
    """Returns (regular_entries, shiny_entries) from a poketab/tabber block.

    template_names: list of template names to accept, e.g. ["P", "PS"].
    Shiny tabs sometimes use {{PS|...}} directly instead of {{P|...|s=t}},
    so both are matched regardless of which tab they appear in.
    """
    tabber_match = re.search(r"<tabber>(.*?)(?:</tabber>|\Z)", block, re.S)
    if not tabber_match:
        return [], []
    tabber_body = tabber_match.group(1)
    regular, shiny = [], []
    for tab_name, tab_body in TABBER_TAB_RE.findall(tabber_body):
        entries = parse_entries_from_block(tab_body, template_names)
        if tab_name == "Shiny":
            for e in entries:
                e["isShiny"] = True
            shiny.extend(entries)
        else:
            regular.extend(entries)
    return regular, shiny


def build_anchor(heading):
    clean = re.sub(r"\{\{[Nn]th\|(\d+)\}\}", lambda m: ordinal(int(m.group(1))), heading)
    return clean.strip().replace(" ", "_")


def build_note(body_before_tabber):
    idx = body_before_tabber.find("{{FormCounter")
    if idx == -1:
        idx = body_before_tabber.find("<div class=\"poketab\">")
    text = body_before_tabber[:idx] if idx != -1 else body_before_tabber
    note = strip_wiki_markup(text)
    note = re.sub(r"\s+", " ", note).strip()
    return note


def scrape_forms():
    """Returns (pokemon_events, shiny_events)."""
    years = list_year_subpages(FORMS_ROOT)
    pokemon_events = []
    shiny_events = []
    for year, title in years:
        wikitext = get_wikitext(title)
        for heading, body in split_sections(wikitext):
            date = parse_date_from_heading(heading, fallback_year=year)
            if not date:
                continue
            regular, shiny = parse_tabber_entries(body, ["P", "PS"])
            note = build_note(body)
            anchor = build_anchor(heading)
            source_url = (
                "https://pokemongo.fandom.com/wiki/"
                + urllib.parse.quote(title.replace(" ", "_"))
                + "#" + urllib.parse.quote(anchor)
            )
            if regular:
                pokemon_events.append({
                    "category": "pokemon",
                    "date": date,
                    "note": note,
                    "sourceUrl": source_url,
                    "entries": regular,
                })
            if shiny:
                shiny_events.append({
                    "category": "shiny",
                    "date": date,
                    "note": note,
                    "sourceUrl": source_url,
                    "entries": shiny,
                })
    return pokemon_events, shiny_events


def scrape_flat_page(title, category, template_names):
    wikitext = get_wikitext(title)
    events = []
    for heading, body in split_sections(wikitext):
        if heading.strip().lower() == "references":
            continue
        date = parse_date_from_heading(heading)
        if not date:
            continue
        regular, shiny = parse_tabber_entries(body, template_names)
        all_entries = regular + shiny
        if not all_entries:
            continue
        note = build_note(body)
        anchor = build_anchor(heading)
        source_url = (
            "https://pokemongo.fandom.com/wiki/"
            + urllib.parse.quote(title.replace(" ", "_"))
            + "#" + urllib.parse.quote(anchor)
        )
        events.append({
            "category": category,
            "date": date,
            "note": note,
            "sourceUrl": source_url,
            "entries": all_entries,
        })
    return events


def main():
    print("Scraping Pokémon forms (pokemon + shiny)...")
    pokemon_events, shiny_events = scrape_forms()
    print(f"  pokemon: {len(pokemon_events)} dates, shiny: {len(shiny_events)} dates")

    print("Scraping Event Pokémon...")
    event_events = scrape_flat_page(EVENTS_PAGE, "events", ["PC"])
    print(f"  events: {len(event_events)} dates")

    print("Scraping Shadow Pokémon...")
    shadow_events = scrape_flat_page(SHADOW_PAGE, "shadow", ["P", "PS"])
    print(f"  shadow: {len(shadow_events)} dates")

    all_events = pokemon_events + shiny_events + event_events + shadow_events
    all_events.sort(key=lambda e: (e["date"], e["category"]))

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_events, f, ensure_ascii=False, indent=2)
    print(f"Wrote {len(all_events)} release entries to {OUT_PATH}")


if __name__ == "__main__":
    main()
