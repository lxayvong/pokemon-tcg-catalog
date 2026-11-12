#!/usr/bin/env python3
"""Bulk-update Pokémon sealed TCGplayer MARKET prices via TCGCSV.

Usage:
    python scripts/update_tcgplayer_markets.py --date 2026-11-12

The --date requirement is STRICT: the upstream TCGCSV last-updated date must
equal the requested date. All other catalog products remain unchanged/undated.
The app never stamps an unverified quote with a newer observation date.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "shared/catalog-price-map.json"
DESTINATION = ROOT / "shared/tcgplayer-market-daily.js"
REPORT = ROOT / "shared/tcgplayer-market-audit.json"
BASE = "https://tcgcsv.com"
USER_AGENT = "PokemonCatalogPriceSync/1.0 (GitHub lxayvong/pokemon-tcg-catalog)"
REQUEST_SLEEP = .20
ALIASES = {
    "30th Anniversary Celebration": ["30th Celebration", "30th Anniversary", "ME: 30th Celebration"],
    "Pokémon 151": ["151", "Scarlet & Violet 151", "SV: Scarlet & Violet 151", "SV 151"],
    "Mega Evolution": ["ME01", "ME: Mega Evolution"],
    "Prismatic Evolutions": ["SV8.5", "Prismatic Evolutions"],
    "Delta Reign": ["ME06"],
    "Pitch Black": ["ME05"],
    "Phantasmal Flames": ["ME02"],
    "Chaos Rising": ["ME04"],
    "Perfect Order": ["ME03"],
}

def fetch_json(path):
    url = BASE + path
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=35) as res:
        return json.load(res)

def fetch_text(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=35) as res:
        return res.read().decode("utf-8").strip()

def norm(value):
    return re.sub(r"[^a-z0-9]+", " ", str(value).lower().replace("é", "e")).strip()

def market_rows(result):
    return result.get("results", []) if isinstance(result, dict) else []

def is_group_relevant(group, sets):
    label = norm(group.get("name", ""))
    if any(word in label for word in ("miscellaneous cards and products", "miscellaneous", "promotional", "black star promos", "sealed")):
        return True
    return any(any(norm(alias) in label for alias in [name, *ALIASES.get(name, [])] if len(norm(alias))>2) for name in sets)

def is_plausibly_sealed(name):
    name = norm(name)
    if any(token in name for token in ("empty box", "empty tin", "code card", "sleeves", "playmat", "card lot", "single card", "box case", "booster box case", "booster bundle case")):
        return False
    return True

def same_variant(wanted, candidate, group):
    # Conservative fallback: identical complete normalized product name OR
    # the exact set+product name (with optional TCGplayer product prefix).
    set_name = norm(wanted["set"])
    name = norm(wanted["name"])
    cand = norm(candidate.get("name", ""))
    group_name = norm(group.get("name", ""))
    candidates = {name, set_name + " " + name, name + " " + set_name}
    for alias in ALIASES.get(wanted["set"], []):
        candidates.add(norm(alias) + " " + name)
        candidates.add(name + " " + norm(alias))
    # Generic titles such as "Elite Trainer Box" recur in multiple sets.
    # Require the source group to identify the exact set if the title omits it.
    accepted_set_names = [wanted["set"], *ALIASES.get(wanted["set"], [])]
    group_matches_set = any(norm(alias) in group_name for alias in accepted_set_names if len(norm(alias)) > 2)
    title_matches_set = any(norm(alias) in cand for alias in accepted_set_names if len(norm(alias)) > 2)
    if cand in candidates and (group_matches_set or title_matches_set):
        return True
    # Whole-name + set, no arbitrary partial/fuzzy matching.
    for prefix in (set_name, *[norm(x) for x in ALIASES.get(wanted["set"], [])]):
        if cand.startswith(prefix + " ") and cand[len(prefix):].strip() == name:
            return True
    return False

def get_latest_price(prices, product_id):
    choices = [x for x in prices if str(x.get("productId")) == str(product_id) and
               str(x.get("subTypeName", "")).lower() not in ("reverse holofoil", "holofoil", "1st edition")]
    # 1:1 default market price; reject multiple inconsistent market variants.
    vals = set()
    for row in choices:
        value = row.get("marketPrice")
        try:
            n = float(value)
            if n > 0 and n < 1_000_000:
                vals.add(round(n, 2))
        except (TypeError, ValueError):
            pass
    return next(iter(vals)) if len(vals) == 1 else None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True, help="Actual TCGCSV update date YYYY-MM-DD (never relabel prior-day prices).")
    parser.add_argument("--max-groups", type=int, default=0, help="Testing only: cap processed groups.")
    args = parser.parse_args()
    dt.date.fromisoformat(args.date)
    modified = fetch_text("/last-updated.txt")
    found = re.match(r"(\d{4}-\d{2}-\d{2})", modified)
    if not found or found.group(1) != args.date:
        print(f"STOP: TCGCSV upstream timestamp {modified!r} does not equal requested {args.date!r}. No file written.", file=sys.stderr)
        return 2

    mapped = json.loads(CATALOG.read_text(encoding="utf-8"))["products"]
    sets = set(p["set"] for p in mapped)
    groups = fetch_json("/tcgplayer/3/groups").get("results", [])
    candidates = [g for g in groups if is_group_relevant(g, sets)]
    if args.max_groups:
        candidates = candidates[:args.max_groups]

    by_id = {}
    by_name = {}
    for g in candidates:
        gid = int(g["groupId"])
        time.sleep(REQUEST_SLEEP)
        products = market_rows(fetch_json(f"/tcgplayer/3/{gid}/products"))
        time.sleep(REQUEST_SLEEP)
        prices = market_rows(fetch_json(f"/tcgplayer/3/{gid}/prices"))
        pindex = {}
        for row in prices:
            pindex.setdefault(str(row.get("productId")), []).append(row)
        for product in products:
            if not is_plausibly_sealed(product.get("name", "")):
                continue
            pid = str(product["productId"])
            price = get_latest_price(pindex.get(pid, []), pid)
            if price is None:
                continue
            entry = {"productId": pid, "name": product.get("name", ""), "groupName": g.get("name", ""),
                     "groupId": gid, "price": price,
                     "url": product.get("url") or f"https://www.tcgplayer.com/product/{pid}"}
            by_id.setdefault(pid, []).append(entry)
            by_name.setdefault(norm(product.get("name", "")), []).append(entry)
        print(f"Group {gid} {g.get('name')}: {len(products)} products, {len(prices)} prices")

    output = {}
    audit = {"asOf": args.date, "upstreamUpdated": modified, "catalogProducts": len(mapped),
             "groupsScanned": len(candidates), "matched": [], "unmatched": [], "ambiguous": []}
    for wanted in mapped:
        tcg_id = wanted.get("tcgplayerProductId")
        matches = by_id.get(str(tcg_id), []) if tcg_id else []
        method = "exact-TCGplayer-product-ID" if matches else ""
        if not matches:
            # Exact-name + exact product set checks; do not infer based on just pack count.
            possible = set()
            keys = [norm(wanted["name"]), norm(wanted["set"]+" "+wanted["name"])]
            for alias in ALIASES.get(wanted["set"], []):
                keys.append(norm(alias+" "+wanted["name"]))
            candidates_for_product = [rec for key in keys for rec in by_name.get(key, [])]
            matches = [rec for rec in candidates_for_product if same_variant(wanted, rec, {"name": rec["groupName"]})]
            method = "exact-full-product-title"
        unique = {row["productId"]: row for row in matches}
        matches = list(unique.values())
        if not matches:
            audit["unmatched"].append({"id": wanted["id"], "set": wanted["set"], "name": wanted["name"]})
            continue
        if len(matches) > 1:
            audit["ambiguous"].append({"id": wanted["id"], "candidates": matches})
            continue
        item = matches[0]
        output[wanted["id"]] = {
            "amount": item["price"],
            "reportedAt": args.date,
            "checkedAt": args.date,
            "source": "TCGplayer Market Price via TCGCSV daily mirror",
            "sourceUrl": item["url"],
            "tcgplayerProductId": item["productId"],
            "matchMethod": method,
            "upstreamBuild": modified
        }
        audit["matched"].append({"id": wanted["id"], "market": item["price"], "productId": item["productId"], "method": method})
    audit["matchedCount"] = len(output)
    print(f"Found {len(output)}/{len(mapped)} exact matches; unpriced {len(audit['unmatched'])}, ambiguous {len(audit['ambiguous'])}")

    # Always write an evidence log even when coverage is incomplete.
    REPORT.write_text(json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if not output:
        print("STOP: no market-price matches. Retaining prior catalog snapshot.", file=sys.stderr)
        return 3
    new_data = json.dumps(output, ensure_ascii=False, sort_keys=True, indent=2)
    DESTINATION.write_text(
        "/* Auto-generated dated TCGplayer Market Price snapshots via TCGCSV.\n"
        " * Individual exact matches only. No inferred prices or relabeled old dates.\n"
        " * Missing catalog products retain their previous source date.\n"
        " */\n"
        "const TCGPLAYER_DAILY_AS_OF=" + json.dumps(args.date) + ";\n"
        "const TCGPLAYER_DAILY_PRICES=" + new_data + ";\n"
        "for(const [id,quote] of Object.entries(TCGPLAYER_DAILY_PRICES)){\n"
        " const record=productById.get(id); if(!record)continue;\n"
        " record.pricing.market={amount:quote.amount,currency:'USD',reportedAt:quote.reportedAt,\n"
        "  checkedAt:quote.checkedAt,source:quote.source,sourceUrl:quote.sourceUrl,\n"
        "  observedAt:quote.reportedAt,verified:true,matchMethod:quote.matchMethod,\n"
        "  upstreamBuild:quote.upstreamBuild};\n"
        " if(!record.identifiers.tcgplayerProductId)record.identifiers.tcgplayerProductId=quote.tcgplayerProductId;\n"
        "}\n",
        encoding="utf-8"
    )
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
