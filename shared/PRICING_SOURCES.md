# Pokémon sealed-product pricing refresh

**Research date: November 12, 2026 (America/Chicago).** Prices are historical snapshots, not live API quotes. The `reportedAt` field denotes the actual published market-price observation date, not a newly invented price date. Every price below updates both desktop and Android through `shared/pricing-refresh.js`.

## Dated TCGplayer market snapshots

Market prices below were published by Catch'em as TCGplayer market observations. Those observations are third-party reproductions, not first-party live TCGplayer API responses. Exact sealed-product names and variants are matched to canonical catalog records.

| Set | Product | Market price | Actual price date | Source |
|---|---|---:|---|---|
| 30th Anniversary Celebration | Elite Trainer Box | $109.51 | Nov 12, 2026 | https://catchemtcg.com/p/tcgcsv-704143 |
| 30th Anniversary Celebration | Pokémon Center ETB | $255.37 | Nov 12, 2026 | https://catchemtcg.com/board |
| 30th Anniversary Celebration | Sylveon ex Box | $45.22 | Nov 12, 2026 | https://catchemtcg.com/board |
| 30th Anniversary Celebration | Battle Deck: Espeon ex | $28.88 | Nov 12, 2026 | https://catchemtcg.com/board |
| 30th Anniversary Celebration | Battle Deck: Umbreon ex | $27.75 | Nov 12, 2026 | https://catchemtcg.com/board |
| 30th Anniversary Celebration | Binder Collection | $95.06 | Nov 12, 2026 | https://catchemtcg.com/board |
| 30th Anniversary Celebration | Booster Bundle | $66.39 | Nov 10, 2026 | https://catchemtcg.com/rip |
| Phantasmal Flames | Elite Trainer Box | $137.81 | Nov 12, 2026 | https://catchemtcg.com/board |
| Phantasmal Flames | Booster Bundle | $73.27 | Nov 12, 2026 | https://catchemtcg.com/board |
| Phantasmal Flames | Pokémon Center ETB | $269.09 | Nov 12, 2026 | https://catchemtcg.com/board |
| Mega Evolution | Booster Box | $299.40 | Nov 10, 2026 | https://catchemtcg.com/rip |

## First-party listed retailer prices

The price is the merchant's listed price, **not** confirmation that inventory is available. Marketplace reseller offers are excluded. These exact-product listings were reviewed Nov 12, 2026.

| Product | Merchant | First-party price | Listing | Availability context |
|---|---|---:|---|---|
| 30th Anniversary Celebration Booster Bundle | Best Buy | $26.94 | https://www.bestbuy.com/product/pokemon-tcg-30th-celebration-booster-bundle/6685573 | In store only |
| 30th Anniversary Celebration Elite Trainer Box | Target | $69.99 | https://www.target.com/p/-/A-1010892076 | Listed out of stock |
| 30th Anniversary Celebration Poster Collection | Target | $19.99 | https://www.target.com/p/-/A-1010892067 | Listed out of stock |
| Phantasmal Flames Elite Trainer Box | Best Buy | $49.99 | https://www.bestbuy.com/product/-/6645345 | In store only |
| Phantasmal Flames Elite Trainer Box | Target | $59.99 | https://www.target.com/p/-/A-94860231 | Listed out of stock |
| Phantasmal Flames Booster Bundle | Best Buy | $26.94 | https://www.bestbuy.com/product/PassiveCollectibles/6645343 | In store only |

## Coverage and caveats

- Exactly 11 market values and six retailer product listings were newly refreshed. The other records retain their previously dated prices, nulls, and unverified labels. **Do not change an old price's observation date simply because the catalog is redeployed.**
- Each retailer offer is matched to a named first-party product page with verified manufacturer or retailer SKU where available.
- Market snapshot prices and posted retail prices have different meanings. A retailer's MSRP-like product price must not be substituted for the TCGplayer market price.
- More frequent fully automated market updates would require a compliant, authorized source/API or scheduled owner-side data pipeline; the current website does not promise real-time updates.
- Catalog scores and purchase signals are subjective heuristics, not investment advice.
