/* Read-only price-history view model. Google Sheets PriceSummary is authoritative.
 * Prices are dated research references, NOT live offers. Missing trends are not stable.
 */
(function(){
 "use strict";
 const rows=new Map();
 let status="loading",error="";
 const text=(r,i)=>{const value=r?.c?.[i]?.v;return value==null?"":String(value)};
 const money=v=>v===""?null:Number.isFinite(Number(v))?Number(v):null;
 function parse(table){
  const result=new Map();
  (table.rows||[]).forEach(row=>{
   const id=text(row,0);
   if(!/^ptcg:[a-z0-9-]+:[a-z0-9-]+$/.test(id))return;
   const trend=(dir,change)=>{
    const direction=text(row,dir);
    const pct=money(text(row,change));
    return {direction:["up","down","stable"].includes(direction)?direction:"insufficient-history",changePct:pct};
   };
   result.set(id,{id,releaseDate:text(row,1)||null,releaseUrl:text(row,2)||null,
    researchedPrice:money(text(row,3)),researchedDate:text(row,4)||null,
    source:text(row,5)||null,sourceUrl:text(row,6)||null,
    evidenceType:text(row,7)||null,matchConfidence:text(row,8)||null,
    trend7:trend(9,10),trend30:trend(11,12),trend90:trend(13,14),
    directObservations:money(text(row,15))||0,
    historicalObservations:money(text(row,16))||0,refreshedAt:text(row,17)||null});
  });
  return result;
 }
 async function load(){
  status="loading";error="";
  try{
   if(!window.PokemonSheetsClient?.query)throw Error("Google Sheets reader is unavailable");
   const t=await window.PokemonSheetsClient.query("PriceSummary");
   const incoming=parse(t);
   if(!incoming.size)throw Error("No price summary records were found");
   rows.clear();incoming.forEach((v,k)=>rows.set(k,v));
   status="ready";
  }catch(e){status="error";error=e?.message||"Unable to load price summary";}
  window.dispatchEvent(new CustomEvent("pokemon-price-history-loaded",{detail:{status,count:rows.size}}));
  return {status,count:rows.size,error};
 }
 window.PokemonPriceHistory=Object.freeze({load,get:id=>rows.get(id)||null,get status(){return status},get error(){return error},get count(){return rows.size}});
})();
