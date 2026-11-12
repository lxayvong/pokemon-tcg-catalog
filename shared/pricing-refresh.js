/* Sources researched Nov 12, 2026.
   A market "reportedAt" is the actual published price-data date, NOT today's browsing date.
   Retail offers are documented first-party listed prices; availability is not real-time.
   No marketplace seller listings are included. Other products retain dated historical snapshots. */
const PRICING_REFRESH_DATE="2026-11-12";
const PRICE_RESEARCH_MARKET=[
 [
  "30th Anniversary Celebration",
  "Elite Trainer Box",
  109.51,
  "2026-11-12",
  "https://catchemtcg.com/p/tcgcsv-704143"
 ],
 [
  "30th Anniversary Celebration",
  "Pokémon Center ETB",
  255.37,
  "2026-11-12",
  "https://catchemtcg.com/board"
 ],
 [
  "30th Anniversary Celebration",
  "Sylveon ex Box",
  45.22,
  "2026-11-12",
  "https://catchemtcg.com/board"
 ],
 [
  "30th Anniversary Celebration",
  "Battle Deck: Espeon ex",
  28.88,
  "2026-11-12",
  "https://catchemtcg.com/board"
 ],
 [
  "30th Anniversary Celebration",
  "Battle Deck: Umbreon ex",
  27.75,
  "2026-11-12",
  "https://catchemtcg.com/board"
 ],
 [
  "30th Anniversary Celebration",
  "Binder Collection",
  95.06,
  "2026-11-12",
  "https://catchemtcg.com/board"
 ],
 [
  "30th Anniversary Celebration",
  "Booster Bundle",
  66.39,
  "2026-11-10",
  "https://catchemtcg.com/rip"
 ],
 [
  "Phantasmal Flames",
  "Elite Trainer Box",
  137.81,
  "2026-11-12",
  "https://catchemtcg.com/board"
 ],
 [
  "Phantasmal Flames",
  "Booster Bundle",
  73.27,
  "2026-11-12",
  "https://catchemtcg.com/board"
 ],
 [
  "Phantasmal Flames",
  "Pokémon Center ETB",
  269.09,
  "2026-11-12",
  "https://catchemtcg.com/board"
 ],
 [
  "Mega Evolution",
  "Booster Box",
  299.4,
  "2026-11-10",
  "https://catchemtcg.com/rip"
 ]
];
const PRICE_RESEARCH_RETAIL=[
 [
  "30th Anniversary Celebration",
  "Booster Bundle",
  "Best Buy",
  26.94,
  "https://www.bestbuy.com/product/pokemon-tcg-30th-celebration-booster-bundle/6685573",
  "6685573",
  "10-10451-115",
  "in-store-only"
 ],
 [
  "30th Anniversary Celebration",
  "Elite Trainer Box",
  "Target",
  69.99,
  "https://www.target.com/p/-/A-1010892076",
  "1010892076",
  "",
  "out-of-stock"
 ],
 [
  "30th Anniversary Celebration",
  "Poster Collection",
  "Target",
  19.99,
  "https://www.target.com/p/-/A-1010892067",
  "1010892067",
  "",
  "out-of-stock"
 ],
 [
  "Phantasmal Flames",
  "Elite Trainer Box",
  "Best Buy",
  49.99,
  "https://www.bestbuy.com/product/-/6645345",
  "6645345",
  "10-10186-101",
  "in-store-only"
 ],
 [
  "Phantasmal Flames",
  "Elite Trainer Box",
  "Target",
  59.99,
  "https://www.target.com/p/-/A-94860231",
  "94860231",
  "",
  "out-of-stock"
 ],
 [
  "Phantasmal Flames",
  "Booster Bundle",
  "Best Buy",
  26.94,
  "https://www.bestbuy.com/product/PassiveCollectibles/6645343",
  "6645343",
  "10-10191-109",
  "in-store-only"
 ]
];
const PRICING_REFRESH_STATS={markets:0,retailerOffers:0,missing:[]};
for(const [set,name,amount,reportedAt,sourceUrl] of PRICE_RESEARCH_MARKET){
 const record=productById.get(canonicalId(set,name));
 if(!record){PRICING_REFRESH_STATS.missing.push("Market: "+set+" | "+name);continue;}
 record.pricing.market={amount,currency:"USD",source:"TCGplayer market via dated Catch'em tracker",
 sourceUrl,reportedAt,observedAt:reportedAt,verified:true,
 checkedAt:PRICING_REFRESH_DATE,confidence:"third-party TCGplayer market mirror"};
 PRICING_REFRESH_STATS.markets++;
}
for(const [set,name,retailer,amount,url,sku,manufacturerSku,availability] of PRICE_RESEARCH_RETAIL){
 const record=productById.get(canonicalId(set,name));
 if(!record){PRICING_REFRESH_STATS.missing.push("Retail: "+set+" | "+name);continue;}
 // Replace stale prices from the SAME retailer for the exact product.
 record.offers=record.offers.filter(offer=>offer.retailer!==retailer);
 record.identifiers.retailerSkus[retailer]=sku;
 if(manufacturerSku)record.identifiers.manufacturerSku=manufacturerSku;
 addRetailerOffer(record,{retailer,retailerSku:sku,amount,url,availability,
 observedAt:PRICING_REFRESH_DATE,matchMethod:"retailerSku"});
 PRICING_REFRESH_STATS.retailerOffers++;
}
