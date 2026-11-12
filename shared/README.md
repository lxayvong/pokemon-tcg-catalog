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
