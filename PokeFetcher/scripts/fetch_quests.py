#!/usr/bin/env python3
"""Fetches field-research quest data for the Rijeka local-map area and writes
data/quests.json, ordered as a greedy nearest-neighbor walking route starting
from the northwesternmost quest.

Run manually or via .github/workflows/update-quests.yml. The generated JSON
is read client-side by quests.html / assets/quests.js. Requires Pillow (for
cropping Pokémon reward sprites — see crop_pokemon_sprite()).
"""
import io
import json
import math
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

AREA_ID = "6ae043c164c5b6dcbed648ea"
API_URL = f"https://coordinates-api.pokemongopro.com/local-map/{AREA_ID}"
UA = "Mozilla/5.0 (compatible; PokeFetcherBot/1.0; static-site data refresh)"

KM_PER_DEG_LAT = 111.32

POKEMON_ICON_URL = (
    "https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/"
    "Images/Pokemon%20-%20256x256/Addressable%20Assets/pm{id}.icon.png"
)
SPRITE_PADDING_FRAC = 0.12  # fraction of the cropped content size added as margin on each side

OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "quests.json"
SPRITES_DIR = Path(__file__).resolve().parent.parent / "data" / "sprites"


def fetch_local_map():
    req = urllib.request.Request(API_URL, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def project(lat, lon, center_lat):
    """Local flat-earth projection to km: x=east-positive, y=north-positive.
    Valid only for small areas like this ~10km-wide geofence."""
    km_per_deg_lon = KM_PER_DEG_LAT * math.cos(math.radians(center_lat))
    return lon * km_per_deg_lon, lat * KM_PER_DEG_LAT


def dist(p1, p2):
    return math.hypot(p1["x"] - p2["x"], p1["y"] - p2["y"])


def pick_start(points):
    # Northwest = max y (north), min x (east) -> maximize (y - x).
    return max(points, key=lambda p: (p["y"] - p["x"], p["quest_id"]))


def order_route(points):
    """Greedy nearest-neighbor walk starting from the northwesternmost point."""
    remaining = list(points)
    start = pick_start(remaining)
    remaining.remove(start)
    route = [start]
    current = start
    while remaining:
        def key(p):
            return (dist(current, p), p["x"], p["y"], p["quest_id"])
        nxt = min(remaining, key=key)
        route.append(nxt)
        remaining.remove(nxt)
        current = nxt
    return route


def crop_to_content(im):
    """Crops an image to its actual (non-transparent) content, padded evenly,
    so the character renders at a consistent visual size next to item icons
    (whose source images already fill their whole canvas). Returns the
    cropped+padded image, or None if the source has no opaque content."""
    im = im.convert("RGBA")
    bbox = im.getbbox()
    if not bbox:
        return None
    content = im.crop(bbox)
    w, h = content.size
    side = max(w, h)
    pad = int(side * SPRITE_PADDING_FRAC)
    canvas_size = side + pad * 2
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    canvas.paste(content, ((canvas_size - w) // 2, (canvas_size - h) // 2), content)
    return canvas


def find_existing_species_sprite(species_name):
    """scripts/scrape.py already downloads a base (non-shiny, no costume/form)
    sprite per released species into data/sprites/<Name>.png. Reuse that file
    instead of fetching a second copy from a different source when present."""
    candidate = SPRITES_DIR / f"{species_name}.png"
    return candidate if candidate.exists() else None


def crop_pokemon_sprite(pokemon_id, species_name):
    """Produces a cropped species icon for a quest reward, preferring the
    sprite scrape.py already downloaded for this species (reusing the same
    local asset instead of a duplicate copy). Falls back to the PokeMiners
    asset mirror for species that have no release-tracker sprite yet. Caches
    the cropped PNG locally; returns the repo-relative path, or None on
    failure.
    """
    local_name = f"quest_reward_pm{pokemon_id}.png"
    local_path = SPRITES_DIR / local_name
    rel_path = f"data/sprites/{local_name}"
    if local_path.exists():
        return rel_path

    existing = find_existing_species_sprite(species_name) if species_name else None
    if existing:
        try:
            im = Image.open(existing)
        except Exception as exc:
            print(f"  warning: failed to read existing sprite {existing}: {exc}")
            im = None
    else:
        im = None

    if im is None:
        url = POKEMON_ICON_URL.format(id=pokemon_id)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
            im = Image.open(io.BytesIO(raw))
        except (urllib.error.URLError, OSError) as exc:
            print(f"  warning: failed to download sprite for pokemon_id={pokemon_id}: {exc}")
            return None

    try:
        canvas = crop_to_content(im)
        if canvas is None:
            return None
        SPRITES_DIR.mkdir(parents=True, exist_ok=True)
        canvas.save(local_path)
    except Exception as exc:
        print(f"  warning: failed to crop sprite for pokemon_id={pokemon_id}: {exc}")
        return None

    return rel_path


def reward_icon(reward, sprite_cache):
    """Item/Mega Energy/Stardust rewards already carry an icon_url from the
    source API. Pokemon rewards don't, so fall back to a locally cropped
    species sprite (see crop_pokemon_sprite) — this won't reflect event
    costumes/forms, but still identifies the species at a glance."""
    if reward.get("icon_url"):
        return reward["icon_url"]
    pokemon_id = reward.get("pokemon_id")
    if reward["kind"] == "Pokemon" and pokemon_id:
        if pokemon_id not in sprite_cache:
            species_name = reward["label"].split(" (")[0]
            sprite_cache[pokemon_id] = crop_pokemon_sprite(pokemon_id, species_name)
        return sprite_cache[pokemon_id]
    return None


def build_quest_record(p, sprite_cache):
    reward = p["rewards"][0]
    return {
        "quest_id": p["quest_id"],
        "pokestop_name": p["pokestop_name"],
        "pokestop_image_url": p.get("image_url"),
        "task": p["task"],
        "reward_label": reward["label"],
        "reward_icon_url": reward_icon(reward, sprite_cache),
        "reward_kind": reward["kind"],
        "lat": p["lat"],
        "lon": p["lon"],
    }


def main():
    print("Fetching Rijeka local-map quest data...")
    data = fetch_local_map()
    quests = data["forts"]["quests"]
    center_lat = data["center"]["lat"]
    print(f"  {len(quests)} quest entries, generated_at={data.get('generated_at')}")

    points = []
    for q in quests:
        x, y = project(q["lat"], q["lon"], center_lat)
        points.append({**q, "x": x, "y": y})

    ordered = order_route(points)
    sprite_cache = {}
    out_quests = [build_quest_record(p, sprite_cache) for p in ordered]

    output = {
        "generated_at": data.get("generated_at"),
        "area_name": data.get("name"),
        "ordering": "nw-start-nearest-neighbor",
        "quests": out_quests,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"Wrote {len(out_quests)} quest entries to {OUT_PATH}")


if __name__ == "__main__":
    main()
