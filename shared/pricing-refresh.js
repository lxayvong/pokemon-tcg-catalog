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
,
 ["Delta Reign","Booster Box",193.62,"2026-11-12","https://catchemtcg.com/board"],
 ["Delta Reign","Booster Bundle",42.65,"2026-11-12","https://catchemtcg.com/board"],
 ["Delta Reign","Elite Trainer Box",82.66,"2026-11-12","https://catchemtcg.com/board"],
 ["Delta Reign","Pokémon Center ETB",154.93,"2026-11-12","https://catchemtcg.com/board"],
 ["Prismatic Evolutions","Pokémon Center ETB",379.21,"2026-11-12","https://catchemtcg.com/board"],
 ["Mega Evolution","Pokémon Center ETB (Mega Gardevoir)",170.4,"2026-11-12","https://catchemtcg.com/board"],
 ["Mega Evolution","Pokémon Center ETB (Mega Lucario)",190.91,"2026-11-12","https://catchemtcg.com/board"],
 ["Mega Evolution","Elite Trainer Box (Mega Gardevoir)",107.9,"2026-11-12","https://catchemtcg.com/board"],
 ["Mega Evolution","Elite Trainer Box (Mega Lucario)",113.27,"2026-11-12","https://catchemtcg.com/board"],
 ["Surging Sparks","Pokémon Center ETB",243.14,"2026-11-12","https://catchemtcg.com/board"],
 ["Chaos Rising","Pokémon Center ETB",116.85,"2026-11-12","https://catchemtcg.com/board"],
 ["Ascended Heroes","Pokémon Center ETB",318.79,"2026-11-12","https://catchemtcg.com/board"],
 ["Pokémon 151","Zapdos ex Collection",108.15,"2026-11-12","https://catchemtcg.com/board"],
 ["30th Anniversary Celebration","UPC Night",381.27,"2026-11-12","https://catchemtcg.com/board"]];
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
,
 ["30th Anniversary Celebration","Binder Collection","GameStop",69.99,"https://www.gamestop.com/toys-games/trading-cards/pokemon-tcg-30th-celebration?prefn1=bvConsolidatedRating&prefv1=4%26up","","","coming-soon"],
 ["30th Anniversary Celebration","Binder Collection","Best Buy",31.99,"https://www.bestbuy.com/product/pokemon-trading-card-game-30th-celebration-binder-collection/6685568","6685568","10-10450-108","coming-soon"],
 ["30th Anniversary Celebration","Elite Trainer Box","Best Buy",49.99,"https://www.bestbuy.com/product/pokemon/6685559","6685559","10-10447-110","in-store-only"],
 ["Phantasmal Flames","Booster Box","Best Buy",160.99,"https://www.bestbuy.com/product/pokemon-trading-card-game-mega-evolution-phantasmal-flames-booster-box-36-packs/6645341","6645341","10-10190-119","in-store-only"],
 ["Delta Reign","Booster Box","Best Buy",160.99,"https://www.bestbuy.com/product/pokemon/6689677","6689677","10-10446-120","coming-soon"]];
const PRICING_REFRESH_STATS={markets:0,unverifiedMarketReferences:0,retailerOffers:0,missing:[]};
for(const [set,name,amount,reportedAt,sourceUrl] of PRICE_RESEARCH_MARKET){
 const record=productById.get(canonicalId(set,name));
 if(!record){PRICING_REFRESH_STATS.missing.push("Market: "+set+" | "+name);continue;}
 // A set-wide dashboard or landing page does not verify an exact product's market price.
 // Preserve as unverified research, and do not overwrite a better exact-product source.
 if(!/^https:\/\/catchemtcg\.com\/p\/tcgcsv-\d+(?:[/?#]|$)/.test(sourceUrl)){
  record.pricing.unverifiedMarketReference={amount,currency:"USD",source:"Dated Catch'em tracker research, exact-product URL absent",sourceUrl,reportedAt,verified:false,
   reason:"Generic tracker URL cannot substantiate the specific product"};
  PRICING_REFRESH_STATS.unverifiedMarketReferences++;
  continue;
 }
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
 if(sku)record.identifiers.retailerSkus[retailer]=sku;
 if(manufacturerSku)record.identifiers.manufacturerSku=manufacturerSku;
 addRetailerOffer(record,{retailer,retailerSku:sku,amount,url,availability,
 observedAt:PRICING_REFRESH_DATE,matchMethod:sku?"retailerSku":"manual-verified"});
 PRICING_REFRESH_STATS.retailerOffers++;
}


/* US MSRPs documented in TCGplayer seller product breakdowns.
 * Leave all other unknown MSRP cells null rather than imputing by format. */
const RESEARCHED_OFFICIAL_MSRPS=[
 ["Mega Evolution","Booster Bundle",26.94,"https://seller.tcgplayer.com/blog/mega-evolution-quick-facts"],
 ["Mega Evolution","Build & Battle Box",21.99,"https://seller.tcgplayer.com/blog/mega-evolution-quick-facts"],
 ["Ascended Heroes","Elite Trainer Box",49.99,"https://seller.tcgplayer.com/blog/ascended-heroes-quick-facts"],
 ["Ascended Heroes","Pokémon Center ETB",59.99,"https://seller.tcgplayer.com/blog/ascended-heroes-quick-facts"],
 ["Ascended Heroes","Booster Bundle",26.94,"https://seller.tcgplayer.com/blog/ascended-heroes-quick-facts"]
];
for(const [set,name,amount,sourceUrl] of RESEARCHED_OFFICIAL_MSRPS){
 const product=productById.get(canonicalId(set,name));
 if(product&&product.pricing.msrp.amount==null)
  product.pricing.msrp={amount,currency:"USD",source:"TCGplayer seller guide: published US MSRP",sourceUrl,verified:true};
}
