/* Final exact-source guard. Runs after every market-price overlay and before the UI.
 * Never allow category/search/editorial-only prices to influence market comparisons.
 * Original research references are retained separately for audit rather than deleted.
 */
const MARKET_SOURCE_INTEGRITY={checked:0,accepted:0,rejected:0,reasons:{},rejectedProducts:[]};
for(const p of productRecords){
 const m=p.pricing?.market;
 if(!m||!Number.isFinite(m.amount)||m.amount<=0)continue;
 MARKET_SOURCE_INTEGRITY.checked++;
 const source=String(m.sourceUrl||"");
 const exactId=source.match(/^https:\/\/(?:www\.)?tcgplayer\.com\/product\/(\d+)(?:[/?#]|$)/i)?.[1]||null;
 const knownId=p.identifiers?.tcgplayerProductId?String(p.identifiers.tcgplayerProductId):null;
 const conflicting=!!(exactId&&knownId&&exactId!==knownId);
 const specificallyDocumented=p.id==="ptcg:30th-anniversary-celebration:upc-day"&&
  source==="https://seller.tcgplayer.com/blog/30th-celebration-quick-facts"&&
  m.amount===363.67&&m.reportedAt==="2026-11-06";
 const tracker=source.match(/^https:\/\/catchemtcg\.com\/p\/tcgcsv-(\d+)(?:[/?#]|$)/i)?.[1]||null;
 const exactTracker=!!(tracker&&knownId&&knownId===tracker);
 if((exactId&&!conflicting)||specificallyDocumented||exactTracker){
  MARKET_SOURCE_INTEGRITY.accepted++;continue;
 }
 const reason=conflicting?"TCGplayer product ID conflicts with catalog identifier":
  !source?"No exact-product market source URL":
  /^https:\/\/.*(?:\/search\/|\/categories\/|\/board(?:[/?#]|$)|\/rip(?:[/?#]|$))/i.test(source)?"Generic category/search/market dashboard URL":
  "Market source does not prove the exact sealed-product variant";
 p.pricing.unverifiedMarketReference={
  amount:m.amount,currency:"USD",reportedAt:m.reportedAt||null,sourceUrl:source||null,
  source:m.source||"Legacy researched market value",verified:false,reason
 };
 p.pricing.market=null;
 MARKET_SOURCE_INTEGRITY.rejected++;
 MARKET_SOURCE_INTEGRITY.reasons[reason]=(MARKET_SOURCE_INTEGRITY.reasons[reason]||0)+1;
 MARKET_SOURCE_INTEGRITY.rejectedProducts.push({id:p.id,amount:m.amount,sourceUrl:source,reason});
}
