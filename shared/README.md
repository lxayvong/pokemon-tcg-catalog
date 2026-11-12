# Shared catalog and Google Sheets architecture

Desktop: `/index.html`  
Android PWA: `/android/index.html`

**These are different UIs backed by the same product catalog, price updates, and Google Sheets network client.**

## Make a shared change once

| What changes? | Edit here | Both apps automatically use it? |
|---|---|---|
| Canonical products, images, pack counts and catalog construction | `shared/catalog-core.js` | Yes |
| Products built from structured additions | `catalog-additions.js` | Yes |
| Archived TCGplayer snapshot reference dataset | `market-and-packs.js` | Yes |
| Verified newly researched market & first-party retailer price changes | `shared/pricing-refresh.js` | Yes |
| Google Sheets ID / Apps Script deployment URL | `google-sheets-config.js` | Yes |
| Google Sheets JSONP read and safe owner-script CAS write verification | `shared/google-sheets-client.js` | Yes |
| Product schema and match/retailer validation | `catalog-schema.js`, `product-matcher.js` | Yes |
| Deal scoring rules | `deal-advisor.js` and canonical catalog score data | Yes |
| Desktop-specific controls, layout and local-edit recovery | `index.html`, `google-sheets-public.js`, `google-sheets-anonymous-write.js` | No, desktop only |
| Android-specific touch navigation and in-memory edit queue | `android/index.html`, `android/app.js`, `android/app.css` | No, Android only |

## Pricing provenance

The latest dated price observations, precise product matches, and first-party retailer links are documented in [PRICING_SOURCES.md](./PRICING_SOURCES.md).

The price refresh is an **overlay** on the older archived catalog snapshots. It updates verified exact-product variants only. Unknown products retain their previous dated values or remain unverified rather than receiving invented prices. An observation date is never silently promoted to the current day.


## Bulk TCGplayer market-price synchronization

A real source-matched bulk updater has been added for all 141 product identities:

- `shared/catalog-price-map.json` holds all 141 canonical products and their **known** exact TCGplayer product IDs. Currently only 29 entries had authoritative TCGplayer IDs stored, so records without IDs require an unambiguous exact-product-name match. This is not a license to guess.
- `scripts/update_tcgplayer_markets.py --date YYYY-MM-DD` downloads TCGCSV category 3 products and market price rows server-side, checks the actual upstream `last-updated.txt` date, and refuses to apply an earlier price snapshot under a newer date.
- `shared/tcgplayer-market-daily.js` is the resulting **dated market-only overlay** loaded after the manually sourced reference snapshots in both apps. At creation it contains no rows; it does not alter existing quotes or dates until a verified pull succeeds.
- `shared/tcgplayer-market-audit.json` records which products had exact matches, which are unpriced/unmatched, and which would be ambiguous. A successful run never invents values for missing products.
- `.github/workflows/tcg-market-prices.yml` offers a manual GitHub Actions dispatch and a daily UTC schedule **after TCGCSV's normal 20:00 UTC update**. For a one-time Nov 12 pull, supply `market_date=2026-11-12` **only after** the TCGCSV feed itself reports that date.
- This workflow commits to the Git branch using `GITHUB_TOKEN`. **GitHub Pages may not rebuild from a GITHUB_TOKEN-generated push** on branch-based Pages. Verify the deployment method before depending on unattended published updates.
- Product-level `reportedAt` is the *actual verified source observation date*, never the run date alone. A catalog-wide research date must never be represented as proof that 141 products received new market quotes.

## App cache updates

When updating shared assets, bump the query versions in desktop `index.html` and Android `index.html`. Also update `android/service-worker.js`'s `CACHE_NAME` and `SHELL` URLs to force an updated Android app shell. The desktop service worker intentionally leaves product data and pricing network-only.

## Shared wishes and profiles

Google Sheets is the authoritative shared database, with separate `Profiles` and `Wishlists` tabs. Both app UIs call `window.PokemonSheetsClient.query()`; both write through `window.PokemonSheetsClient.writeDocument()` with an expected prior payload (compare-and-swap) and read-back verification.

The Android UI keeps pending edits only in memory, never as a separate browser database. The desktop continues to provide local edit recovery, but the shared Google Sheet remains the authoritative committed record. A failed or pending write must never be presented as a confirmed shared save.

## Regression checklist

1. Both interfaces load 141 unique catalog records; the Android directory contains no independent copied catalog data.
2. Verify pricing refresh entries map to real product IDs and there are no unknown keys.
3. Confirm the same updated market value, source URL and actual dated snapshot in both apps.
4. Confirm anonymous Google Sheets reads work without an account.
5. In each UI, test adding a product after selecting a wish list, reading back the confirmed JSON, then testing notes/quantity/removal.
6. Confirm the default empty wish-list selection cannot add products to Laem.
7. Check the Android PWA update, offline shell, and online-only Sheets read/write behavior.
