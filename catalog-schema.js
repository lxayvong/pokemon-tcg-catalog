/* Canonical product and retailer offer model. No unverified identifiers or offers are synthesized. */
const RETAILERS=Object.freeze(["Target","Meijer","Best Buy","Walmart","Sam's Club","Costco"]);
const slug=v=>String(v).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
function canonicalId(set,name){return "ptcg:"+slug(set)+":"+slug(name)}
function makeProduct(row,images,contents){
 const [set,name,type,packs,msrp,market]=row,lookup=set+"|"+name;
 return {id:canonicalId(set,name),name,set,type,packCount:packs,
 identifiers:{upc:null,manufacturerSku:null,tcgplayerProductId:null,retailerSkus:{}},
 images:images[lookup]?[{url:images[lookup],source:"legacy catalog",verified:false}]:[],
 contents:{description:contents[lookup]||null,verified:false},
 pricing:{msrp:{amount:msrp,currency:"USD",source:"legacy retail benchmark",verified:false},market:market==null?null:{amount:market,currency:"USD",source:"legacy reference",reportedAt:"2026-11-10",observedAt:null,verified:false}},
 offers:[]};
}
function validateCatalog(records){
 const ids=new Set(),issues=[];
 for(const p of records){
 if(ids.has(p.id))issues.push(p.id+": duplicate canonical ID");ids.add(p.id);
 if(!p.identifiers.upc)issues.push(p.id+": UPC not verified");
 if(!p.identifiers.manufacturerSku)issues.push(p.id+": manufacturer SKU not verified");
 if(!p.identifiers.tcgplayerProductId)issues.push(p.id+": TCGplayer ID not verified");
 if(!p.images.length)issues.push(p.id+": image missing");
 }
 return issues;
}
function addRetailerOffer(product,offer){
 if(!RETAILERS.includes(offer.retailer))throw Error("Unknown retailer");
 if(!offer.url||!offer.observedAt||!Number.isFinite(offer.amount)||offer.amount<0)throw Error("Offer requires URL, observation timestamp and valid price");
 if(!offer.matchMethod||!["upc","manufacturerSku","retailerSku","manual-verified"].includes(offer.matchMethod))throw Error("Offer requires a verified match method");
 product.offers.push({retailer:offer.retailer,retailerSku:offer.retailerSku||null,amount:offer.amount,currency:"USD",url:offer.url,observedAt:offer.observedAt,availability:offer.availability||"unknown",matchMethod:offer.matchMethod});
}
