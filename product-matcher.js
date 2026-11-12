/* Exact product resolution for external retailer listings. Source candidates must be curated;
   identical UPC/retailer SKU can denote multiple artwork styles or assortment families. */
const normalizedCode=v=>String(v??"").toUpperCase().replace(/[^0-9A-Z]/g,"");
const normalizedWords=v=>String(v??"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
function productTokens(v){return normalizedWords(v).split(" ").filter(x=>x.length>2&&!["pokemon","trading","card","game","collection","booster","packs","pack","with","the"].includes(x))}
function productVariant(v){
 const t=normalizedWords(v);
 return {pokemonCenter:/pokemon center|pc etb/.test(t),etb:/elite trainer box|\betb\b/.test(t),boosterBundle:/booster bundle/.test(t),boosterBox:/booster box|booster display/.test(t),figure:/figure collection/.test(t),ultraPremium:/ultra premium/.test(t),techSticker:/tech sticker/.test(t)};
}
function matchRetailListing(listing,products){
 const ranked=[];
 for(const p of products){
  const ids=p.identifiers||{},why=[],conflicts=[],title=normalizedWords(listing.title||listing.name||""),key=normalizedWords(p.set+" "+p.name);
  let points=0,strong=false;
  const tests=[["UPC",listing.upc,ids.upc,100],["manufacturer SKU",listing.manufacturerSku,ids.manufacturerSku,85],["retailer SKU",listing.retailerSku,ids.retailerSkus?.[listing.retailer],90]];
  for(const [label,a,b,n] of tests){if(normalizedCode(a)&&normalizedCode(b)){if(normalizedCode(a)===normalizedCode(b)){points+=n;strong=true;why.push(label+" exact match")}else conflicts.push(label+" conflict")}}
  const a=productVariant(title),b=productVariant(key+" "+p.type);
  for(const prop of ["pokemonCenter","etb","boosterBundle","boosterBox","figure","ultraPremium","techSticker"]){if(a[prop]!==b[prop]&&(a[prop]||b[prop])&&["pokemonCenter","boosterBox","boosterBundle","figure","ultraPremium"].includes(prop))conflicts.push(prop+" variant conflict")}
  if(title===key||title===normalizedWords(p.name+" "+p.set)){points+=40;why.push("exact canonical title")}
  else{
    const set=normalizedWords(p.set),tokens=productTokens(p.name),words=new Set(title.split(" "));
    if(set&&title.includes(set)){points+=15;why.push("matching expansion")}
    if(tokens.length&&tokens.every(t=>words.has(t))){points+=20;why.push("matching product name tokens")}
  }
  if(listing.packCount!=null&&Number.isFinite(Number(listing.packCount))){if(Number(listing.packCount)===p.packCount){points+=10;why.push("matching pack count")}else conflicts.push("pack count conflict")}
  if(Array.isArray(listing.packMix)&&Array.isArray(p.contents?.packMix)){
    const canon=m=>m.map(x=>normalizedWords(x.set)+":"+Number(x.count)).sort().join("|");
    if(canon(listing.packMix)===canon(p.contents.packMix)){points+=20;why.push("pack contents match")}else conflicts.push("pack contents conflict");
  }
  if(title&&points>0)ranked.push({id:p.id,points,strong,why,conflicts});
 }
 ranked.sort((a,b)=>a.conflicts.length-b.conflicts.length||b.points-a.points);
 const candidates=ranked.filter(r=>!r.conflicts.length),best=candidates[0],runnerUp=candidates[1];
 const unique=best&&(!runnerUp||best.points-runnerUp.points>=20);
 const status=best&&best.strong&&unique?"matched":best?"review":"unmatched";
 return {status,productId:best?.id||null,confidence:best?.points||0,evidence:best?.why||[],conflicts:ranked[0]?.conflicts||[],alternatives:candidates.slice(1,4).map(x=>x.id)};
}
function catalogMatchAudit(products){
 const byRetail=new Map(),byUpc=new Map(),issues=[];
 for(const p of products){
  const upc=normalizedCode(p.identifiers.upc);
  if(upc){if(byUpc.has(upc)&&byUpc.get(upc)!==p.id)issues.push({kind:"UPC reused",id:p.id,other:byUpc.get(upc),code:upc});else byUpc.set(upc,p.id)}
  for(const [retailer,sku] of Object.entries(p.identifiers.retailerSkus||{})){const v=normalizedCode(sku);if(!v)continue;const k=retailer+"|"+v;if(byRetail.has(k)&&byRetail.get(k)!==p.id)issues.push({kind:"Retailer SKU reused",id:p.id,other:byRetail.get(k),code:k});else byRetail.set(k,p.id)}
 }
 return issues;
}
