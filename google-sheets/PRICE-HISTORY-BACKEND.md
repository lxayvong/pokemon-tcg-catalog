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

One individual product's original launch date is confirmed in `ProductReleaseDates` (Mega Evolution Elite Trainer Box). Thirteen expansion dates are separately sourced in `SetReleaseDates`; many sealed products will have an **unknown original release date** until individually researched.

## Installing the Apps Script backend

1. Open the linked Google Sheet -> **Extensions -> Apps Script**.
2. Create a new script file named `PriceHistory.gs`.
3. Copy the complete content of this repository's [PriceHistory.gs](PriceHistory.gs) into that file.
4. Save. The source file should be added alongside `AnonymousSave.gs`; **do not replace** it.
5. Run `priceRunSelfTests` in the Script editor. It is read-only and tests UP/DOWN/STABLE and unknown-history rules.
6. Optionally run `priceInstallSchema` to verify/create the five tabs (already initialized in the Sheet).
7. **No existing public Web App redeployment is required** to use owner-run functions from the editor. If the catalog later needs a read-only endpoint, design and authorize it separately.

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
