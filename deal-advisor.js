/* Transparent heuristic, not an investment forecast. Actual market trend requires historical observations. */
function decisionForProduct(x, observed, product, scores){
 const price=Number(observed);
 if(observed==null||observed===""||!Number.isFinite(price)||price<0)return {action:"ENTER PRICE",tone:"neutral",confidence:"—",reasons:["Enter the asking price to compare against known benchmarks."],trend:"Trend: no time-series data",marketGap:null};
 const valid=n=>Number.isFinite(n)&&n>0;
 const market=valid(x.market)?x.market:null,msrp=valid(x.msrp)?x.msrp:null;
 const offers=(product?.offers||[]).filter(o=>valid(o.amount));
 const lowest=offers.length?Math.min(...offers.map(o=>o.amount)):null;
 const marketRecord=product?.pricing?.market;
 const marketReliable=market!==null&&marketRecord?.verified===true;
 const marketGap=market===null?null:(price/market-1);
 const retailGap=msrp===null?null:(price/msrp-1);
 const storeGap=lowest===null?null:(price/lowest-1);
 const packPrice=x.packs>0?price/x.packs:null;
 const sealedScores=scores||{};
 const collectible=(sealedScores.col||5)+(sealedScores.hold||5);
 let action="CONSIDER",tone="neutral",confidence="Low";const reasons=[];
 if(market===null&&msrp===null&&lowest===null){
   return {action:"RESEARCH",tone:"neutral",confidence:"Low",reasons:["No usable TCGplayer, MSRP, or retailer comparison; price alone is insufficient to recommend buying."],trend:"Trend: no time-series data",marketGap:null};
 }
 if(market!==null){
   if(marketGap<=-0.35){action="BUY";tone="good";reasons.push("Asking price "+Math.round(-marketGap*100)+"% below recorded TCGplayer market.");}
   else if(marketGap<=-0.18){action="CONSIDER";tone="good";reasons.push(Math.round(-marketGap*100)+"% below recorded TCGplayer market.");}
   else if(marketGap<=-0.07){action="CONSIDER";tone="neutral";reasons.push("Modest "+Math.round(-marketGap*100)+"% discount to recorded market.");}
   else if(marketGap<=0.08){action="WAIT";tone="caution";reasons.push("Close to recorded market; little margin for fees or price movement.");}
   else {action="SKIP";tone="bad";reasons.push(Math.round(marketGap*100)+"% above recorded TCGplayer market.");}
 } else if(msrp!==null){
   if(retailGap<=-0.2){action="CONSIDER";tone="good";reasons.push("At least 20% below retail benchmark, but no market value to validate resale pricing.");}
   else if(retailGap<=0.05){action="WAIT";tone="caution";reasons.push("Near retail benchmark; no verified market value.");}
   else {action="SKIP";tone="bad";reasons.push("Above retail benchmark without a verified market comparison.");}
 }else{
   if(storeGap<=-0.15){action="CONSIDER";tone="good";reasons.push("Below the lowest documented first-party retailer price.");}
   else if(storeGap<=0.05){action="WAIT";tone="caution";reasons.push("Close to a documented retailer price; no market value.");}
   else {action="SKIP";tone="bad";reasons.push("More expensive than a documented first-party retailer listing.");}
 }
 if(lowest!==null){
   if(price>lowest*1.12&&action==="BUY"){action="CONSIDER";tone="neutral";reasons.push("A lower first-party retailer list price exists; check it before buying.");}
   else if(price>lowest*1.12){reasons.push("Exceeds lowest documented retailer price ("+formatPriceForDecision(lowest)+").");}
   else if(price<lowest*.85){reasons.push("Below lowest documented retailer list price.");}
 }
 if(msrp!==null&&price<=msrp){reasons.push("At or below retail benchmark.");}
 if(packPrice!==null){reasons.push(formatPriceForDecision(packPrice)+" per booster pack ("+x.packs+" packs).");}
 else{reasons.push("No booster packs; evaluate the promos, accessories or deck instead.");}
 if(x.type==="PC ETB"||x.type==="UPC"){reasons.push("Premium sealed format; opening usually sacrifices the sealed-product premium.");}
 else if(x.packs>0&&sealedScores.rip<=4){reasons.push("Low rip-value score: stronger case for keeping sealed than opening.");}
 else if(x.packs>0&&sealedScores.rip>=8){reasons.push("Higher rip-value score, but individual pulls are never guaranteed.");}
 if(collectible>=17)reasons.push("High subjective collectibility/sealed-hold scores, not evidence of future returns.");
 const checked=marketRecord?.reportedAt||marketRecord?.observedAt||null;
 const ageDays=checked?Math.max(0,Math.floor((Date.now()-Date.parse(checked+"T00:00:00Z"))/86400000)):null;
 if(market!==null&&(!marketReliable||ageDays===null||ageDays>14)){
    confidence="Low";
    if(action==="BUY"){action="CONSIDER";tone="neutral";reasons.unshift("Market snapshot is unverified or stale, so a firm BUY signal is withheld.");}
    else reasons.push("Market snapshot is unverified or older than 14 days; confirm before purchase.");
 }else if(market!==null)confidence=offers.length?"Medium":"Medium";
 else confidence="Low";
 return {action,tone,confidence,reasons:reasons.slice(0,5),trend:"Trend: not evaluated (historical price series unavailable)",marketGap};
}
function formatPriceForDecision(n){return "$"+Number(n).toFixed(2);}
