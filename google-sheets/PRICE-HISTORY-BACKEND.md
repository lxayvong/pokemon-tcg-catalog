# Price history backend (v1, November 2026)

This feature is deliberately **backend only**. The website UI and existing anonymous wish-list/profile save script are unchanged.

## Current state

The existing [Pokemon Catalog Shared Data](https://docs.google.com/spreadsheets/d/1v0EfD5ROoQOVUmz6ISodfNU3j37RGefm-53tZtpRIa8/edit) contains five new tabs:

- `MarketPriceHistory`: append-only market benchmark observations.
- `RetailPriceHistory`: retailer list prices and stock status, independently stored.
- `ProductReleaseDates`: confirmed **individual sealed product** launch date, source URL, status.
- `SetReleaseDates`: expansion launch dates, which MUST NOT be substituted for an individual collection/tin/UPC release date.
- `PriceIngestionLog`: batch audit trail.

The baseline import contains **130 original catalog TCGplayer research snapshots** (129 researched Nov 11 2026; one Nov 10). Each row includes `Evidence Type = research-snapshot`, and its original research date. Some URLs are set/search pages rather than exact-product listings; their `Match Confidence` is `catalog-verified`, not `exact`. No historical 7/30/90 day trends are derived from these snapshots. These are not real-time prices, and one-day samples do not prove direction.

The live database now has **48 individually verified product release dates**, sourced from official Pokémon product galleries, expansion product timelines, and press announcements. Thirteen expansion dates are also stored separately in `SetReleaseDates`. Never copy a set date to a distinct sealed-product release record without exact product evidence. The `PriceSummary` tab materializes the combined product-specific date and latest dated historical research reference for **134 products**.

## Installing the Apps Script backend

1. Open the linked Google Sheet -> **Extensions -> Apps Script**.
2. Open the existing `PriceHistory.gs` file (or create it if not yet present).
3. **Replace only the contents of `PriceHistory.gs`** with the latest [PriceHistory.gs](PriceHistory.gs) from GitHub; do not replace `AnonymousSave.gs`.
4. Save. Run `priceRunSelfTests` to verify the trend and date-validation logic.
5. Run `priceRefreshSummary` when you want the `PriceSummary` tab regenerated from the current history and release records. It creates or replaces the summary values, but leaves the source history and release tabs intact.
6. No existing public web-app redeployment is needed for owner-run functions. A later read-only endpoint for UI integration should be designed independently.

Keep write functions private to the script owner. The anonymous `doPost` handler is intentionally **not** extended to accept market-price uploads.

## Manual market observation ingest

When you have a newly confirmed exact sealed-product TCGplayer market price, run this in the Script editor (with your actual verified values):

```javascript
function examplePriceImport_DO_NOT_RUN_WITH_PLACEHOLDERS() {
  return priceIngestBatch([{
    kind: "market",
    productId: "ptcg:mega-evolution:booster-box",
    price: 250.00,                       // EXAMPLE, replace with verified quote
    observedDate: "2026-11-12",          // day independently observed
    source: "TCGplayer",
    sourceUrl: "https://www.tcgplayer.com/product/EXACT_ID",
    matchConfidence: "exact",
    evidenceType: "direct-observation",  // never use for recycled/stale prices
    notes: "Exact sealed-product match confirmed"
  }], "price-manual-example-20261112");
}
```

The example is **not real market data** and is **not automatically imported**. Avoid running it with placeholder prices.

For a sold-out retailer listing, use `kind:"retail"`, `evidenceType:"retailer-listing"`, `retailer:"Target"`, `availability:"out-of-stock"`, and the documented listing price. Retail prices are never substituted for TCGplayer market prices.

## Product release-date ingest

```javascript
priceSaveRelease({
  productId: "ptcg:mega-evolution:elite-trainer-box",
  releaseDate: "2025-09-26",
  sourceUrl: "https://www.pokemon.com/us/pokemon-tcg/product-gallery/mega-evolution-elite-trainer-box",
  notes: "Original retail launch confirmed by official product gallery"
});
```

`priceSaveRelease` updates an individual product's release record by canonical product ID under a lock. `priceSaveSetRelease` updates a set launch record separately. `priceGetRelease(productId,setName)` returns both dates independently and never populates `originalReleaseDate` from the set date.

## Trend logic

`priceGetStats(productId,asOf)` gives:
- `direction7d`, `direction30d`, `direction90d`
- `direction`: `up`, `down`, `stable`, or `insufficient-history`
- `changePct`, the current/prior observations and research/verification coverage

The latest comparison must be within three days of `asOf`. A preceding comparison must be near 7 days (±3), 30 days (±7) or 90 days (±14). `stable` means a change within ±2%; larger increases/decreases are `up`/`down`. Trend comparisons use ONLY `direct-observation` exact-product data, not historic research snapshots or an in-stock/out-of-stock retail listing.

No day has a fabricated value. Missing points yield `insufficient-history`, not a flat line.

## Idempotency & audit

`priceIngestBatch(records,batchId)` validates product ID, HTTPS evidence, numeric USD value, date, source and variant confidence. It locks the entire read/dedup/append sequence and skips records with the same deterministic observation key. It writes the outcome to `PriceIngestionLog`. Batch size is limited to 500 rows.

## Future integration (not yet enabled)

A reliable authorized source adapter can call `priceIngestBatch` from an owner-installed trigger. A read-only endpoint and the UI's chart release date and badges can come later. Do not schedule GitHub research-snapshot reimports as fake price monitoring.

## Latest backend enhancement

- The `PriceSummary` materialized tab contains 134 product records as of Nov 12, 2026.
- 48 exact-product original release dates are verified; some date confirmations differ **significantly** from expansion launches (e.g. Prismatic Evolutions Booster Bundle March 7, 2025 vs. Jan 17, 2025 expansion, and Ascended Heroes Booster Bundle April 24, 2026 vs. Jan 30, 2026 expansion).
- The `PriceSummary` columns are: Product ID, original release date/source, latest dated market research price/date/source/evidence/confidence, directional trends and percent changes at 7/30/90 days, evidence counts, refresh timestamp.
- The `priceRefreshSummary` Apps Script function regenerates this read model from the authoritative `MarketPriceHistory` and `ProductReleaseDates` tabs. It does **not** change historical observations and does not require wish-list or profile changes.
- The current 130 observations are all research snapshots, so all 7/30/90-day directions remain `insufficient-history`. This is deliberate, not a script error.
- Only manually verified or future authorized-provider **exact-match direct observations** count toward direction. Retail out-of-stock listings are kept separate and cannot contaminate market direction.
