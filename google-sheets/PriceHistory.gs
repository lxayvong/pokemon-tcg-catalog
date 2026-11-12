/**
 * Pokémon Catalog: historical prices + original release dates.
 * Install as a NEW script file PriceHistory.gs in the existing bound Apps Script project.
 * All mutating functions are owner-only in the Apps Script editor or owner-installed triggers.
 * Do NOT expose these functions through the public anonymous wishlist doPost handler.
 */
var PRICE_DB_V1 = {
  marketTab:"MarketPriceHistory", retailTab:"RetailPriceHistory",
  releaseTab:"ProductReleaseDates", setTab:"SetReleaseDates", logTab:"PriceIngestionLog",
  marketHeaders:["Observation Key","Product ID","Price USD","Observed Date","Source","Source URL","Match Confidence","Evidence Type","Imported UTC","Batch ID","Notes"],
  retailHeaders:["Observation Key","Product ID","Retailer","Price USD","Observed Date","Availability","Source URL","Evidence Type","Imported UTC","Batch ID"],
  releaseHeaders:["Product ID","Original Release Date","Release Status","Source URL","Verified UTC","Notes"],
  setHeaders:["Set Name","Set Release Date","Source URL","Verified UTC","Notes"],
  logHeaders:["Batch ID","Started UTC","Imported","Duplicates","Rejected","Status","Detail"]
};
function priceDbTab_(name){var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);if(!sh)throw Error("Missing price history tab: "+name);return sh;}
function priceUtc_(){return new Date().toISOString();}
function priceDate_(v){var s=String(v||"");return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s+"T00:00:00Z"))&&new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s?s:null;}
function priceId_(s){return /^ptcg:[a-z0-9-]+:[a-z0-9-]+$/.test(String(s||""));}
function priceUrl_(s){return /^https:\/\/[^\s/]+\.[^\s/]+(?:\/[^\s]*)?$/i.test(String(s||""));}
function priceKey_(r){
 // Exact same source, product, effective observation and price means same observation.
 var raw=[r.kind,r.productId,r.source||r.retailer,r.sourceUrl,r.observedDate,Number(r.price).toFixed(2),r.evidenceType].join("|");
 // Two deterministic 32-bit fingerprints; portable for seed imports and Apps Script.
 var a=2166136261,b=2246822519;
 for(var i=0;i<raw.length;i++){var c=raw.charCodeAt(i);a=Math.imul(a^c,16777619)>>>0;b=Math.imul(b^c,2246822519)>>>0;}
 return ("00000000"+a.toString(16)).slice(-8)+("00000000"+b.toString(16)).slice(-8);
}
function priceValidate_(r){
 if(!r||!["market","retail"].includes(r.kind)||!priceId_(r.productId))return "Invalid kind or product ID";
 if(!Number.isFinite(r.price)||r.price<=0||r.price>1000000)return "Invalid positive USD price";
 if(!priceDate_(r.observedDate)||r.observedDate>priceUtc_().slice(0,10))return "Missing, invalid or future observation date";
 if(!priceUrl_(r.sourceUrl))return "Missing valid HTTPS evidence URL";
 if(!["exact","catalog-verified","unverified"].includes(r.matchConfidence))return "Missing match confidence";
 if(!["direct-observation","research-snapshot","retailer-listing"].includes(r.evidenceType))return "Missing evidence type";
 if(r.kind==="market"&&(!r.source||r.source.length>80))return "Missing source";
 if(r.kind==="retail"&&(!r.retailer||r.retailer.length>80||!["in-stock","out-of-stock","preorder","unknown"].includes(r.availability)))return "Missing retailer or availability";
 if(r.kind==="retail"&&r.evidenceType!=="retailer-listing")return "Retail observations must be retailer listings";
 if(r.kind==="market"&&r.evidenceType==="retailer-listing")return "Retail listing is not a market price";
 return null;
}
function priceInstallSchema(){
 var ss=SpreadsheetApp.getActiveSpreadsheet();
 [[PRICE_DB_V1.marketTab,PRICE_DB_V1.marketHeaders],[PRICE_DB_V1.retailTab,PRICE_DB_V1.retailHeaders],
  [PRICE_DB_V1.releaseTab,PRICE_DB_V1.releaseHeaders],[PRICE_DB_V1.setTab,PRICE_DB_V1.setHeaders],
  [PRICE_DB_V1.logTab,PRICE_DB_V1.logHeaders]].forEach(function(pair){
  var sh=ss.getSheetByName(pair[0])||ss.insertSheet(pair[0]);
  if(sh.getLastRow()===0){sh.getRange(1,1,1,pair[1].length).setValues([pair[1]]);sh.setFrozenRows(1);}
  else if(sh.getRange(1,1,1,pair[1].length).getValues()[0].join("|")!==pair[1].join("|"))throw Error("Unexpected headers in "+pair[0]);
 });
}
function priceIngestBatch(records,batchId){
 // Call from owner's Script editor, never from doPost(e).
 if(!Array.isArray(records)||records.length>500||!/^price-[a-z0-9-]{5,80}$/.test(batchId))throw Error("Bad batch");
 var lock=LockService.getScriptLock();lock.waitLock(30000);
 var result={batchId:batchId,imported:0,duplicates:0,rejected:0,errors:[]},started=priceUtc_();
 try{
  var tabs={market:priceDbTab_(PRICE_DB_V1.marketTab),retail:priceDbTab_(PRICE_DB_V1.retailTab)};
  var existing={};
  Object.keys(tabs).forEach(function(k){
   var sh=tabs[k],last=sh.getLastRow();
   existing[k]=new Set(last>1?sh.getRange(2,1,last-1,1).getValues().map(function(x){return x[0];}):[]);
  });
  var pending={market:[],retail:[]},seen={market:new Set(),retail:new Set()};
  records.forEach(function(r,i){
   var e=priceValidate_(r);if(e){result.rejected++;result.errors.push({row:i+1,reason:e});return;}
   var k=priceKey_(r),bucket=r.kind;
   if(existing[bucket].has(k)||seen[bucket].has(k)){result.duplicates++;return;}
   seen[bucket].add(k);
   var pre=[k,r.productId];
   pending[bucket].push(bucket==="market"
    ?pre.concat([r.price,r.observedDate,r.source,r.sourceUrl,r.matchConfidence,r.evidenceType,priceUtc_(),batchId,r.notes||""])
    :pre.concat([r.retailer,r.price,r.observedDate,r.availability,r.sourceUrl,r.evidenceType,priceUtc_(),batchId]));
   result.imported++;
  });
  Object.keys(pending).forEach(function(k){
   var rows=pending[k];if(!rows.length)return;
   var sh=tabs[k];sh.getRange(sh.getLastRow()+1,1,rows.length,rows[0].length).setValues(rows);
  });
  priceDbTab_(PRICE_DB_V1.logTab).appendRow([batchId,started,result.imported,result.duplicates,result.rejected,result.rejected?"partial":"ok",JSON.stringify(result.errors).slice(0,8000)]);
  return result;
 }finally{lock.releaseLock();}
}
function priceSaveRelease(record){
 // Product-specific original release dates. Set release dates are stored separately.
 if(!record||!priceId_(record.productId)||!priceDate_(record.releaseDate)||!priceUrl_(record.sourceUrl)||record.releaseDate>priceUtc_().slice(0,10))throw Error("Invalid verified product release date");
 var sh=priceDbTab_(PRICE_DB_V1.releaseTab),lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  var values=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,1).getValues():[];
  var at=values.findIndex(function(v){return v[0]===record.productId;});
  var row=[record.productId,record.releaseDate,"confirmed",record.sourceUrl,priceUtc_(),record.notes||""];
  sh.getRange(at<0?sh.getLastRow()+1:at+2,1,1,row.length).setValues([row]);
  return {productId:record.productId,releaseDate:record.releaseDate};
 }finally{lock.releaseLock();}
}
function priceTrend_(history,days,asOf,thresholdPct){
 // Only independently dated observations can establish a price direction.
 var target=Date.parse(asOf+"T00:00:00Z")-days*86400000,span=days===7?3:days===30?7:14;
 var eligible=history.filter(function(x){return x.verified===true&&x.evidenceType==="direct-observation"&&priceDate_(x.date)&&Number.isFinite(x.price)&&x.price>0&&Date.parse(x.date+"T00:00:00Z")<=Date.parse(asOf+"T00:00:00Z")}).sort(function(a,b){return a.date.localeCompare(b.date);});
 var current=eligible.filter(function(x){return Date.parse(asOf+"T00:00:00Z")-Date.parse(x.date+"T00:00:00Z")<=3*86400000;}).slice(-1)[0];
 var prior=eligible.filter(function(x){return Math.abs(Date.parse(x.date+"T00:00:00Z")-target)<=span*86400000;}).sort(function(a,b){return Math.abs(Date.parse(a.date+"T00:00:00Z")-target)-Math.abs(Date.parse(b.date+"T00:00:00Z")-target);})[0];
 if(!current||!prior||prior.date===current.date)return {direction:"insufficient-history",days:days,current:current||null,prior:prior||null,changePct:null};
 var pct=100*(current.price-prior.price)/prior.price,bound=Number.isFinite(thresholdPct)?thresholdPct:2;
 return {direction:pct>bound?"up":pct< -bound?"down":"stable",days:days,current:current,prior:prior,changePct:Math.round(pct*100)/100};
}
function priceGetHistory(productId){
 if(!priceId_(productId))throw Error("Invalid product ID");
 var sh=priceDbTab_(PRICE_DB_V1.marketTab),n=sh.getLastRow();
 if(n<2)return [];
 return sh.getRange(2,1,n-1,11).getValues().filter(function(a){return a[1]===productId;}).map(function(a){
  return {key:a[0],productId:a[1],price:Number(a[2]),date:String(a[3]),source:a[4],sourceUrl:a[5],
   matchConfidence:a[6],evidenceType:a[7],verified:a[6]==="exact",importedAt:a[8]};
 }).sort(function(a,b){return a.date.localeCompare(b.date);});
}
function priceGetStats(productId,asOf){
 var history=priceGetHistory(productId),day=asOf||priceUtc_().slice(0,10),eligible=history.filter(function(x){return x.verified&&x.evidenceType==="direct-observation";});
 var sorted=eligible.slice().sort(function(a,b){return a.date.localeCompare(b.date);});
 return {productId:productId,asOf:day,historyCount:history.length,verifiedDirectObservations:eligible.length,
  latest:sorted.length?sorted[sorted.length-1]:null,
  direction7d:priceTrend_(eligible,7,day,2),direction30d:priceTrend_(eligible,30,day,2),direction90d:priceTrend_(eligible,90,day,2)};
}

function priceSaveSetRelease(record){
 if(!record||typeof record.setName!=="string"||!record.setName.trim()||!priceDate_(record.releaseDate)||!priceUrl_(record.sourceUrl)||record.releaseDate>priceUtc_().slice(0,10))throw Error("Invalid sourced set release");
 var sh=priceDbTab_(PRICE_DB_V1.setTab),lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  var values=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,1).getValues():[];
  var at=values.findIndex(function(v){return v[0]===record.setName;});
  var row=[record.setName,record.releaseDate,record.sourceUrl,priceUtc_(),"Set launch is NOT automatically the release date of each associated sealed product"];
  sh.getRange(at<0?sh.getLastRow()+1:at+2,1,1,row.length).setValues([row]);
  return {setName:record.setName,releaseDate:record.releaseDate};
 }finally{lock.releaseLock();}
}
function priceGetRelease(productId,setName){
 if(!priceId_(productId))throw Error("Invalid product ID");
 var sh=priceDbTab_(PRICE_DB_V1.releaseTab),n=sh.getLastRow();
 var rows=n>1?sh.getRange(2,1,n-1,6).getValues():[];
 var match=rows.find(function(r){return r[0]===productId&&r[2]==="confirmed";});
 var out={originalReleaseDate:match?String(match[1]):null,productReleaseVerified:!!match,sourceUrl:match?match[3]:null,setReleaseDate:null,setReleaseSourceUrl:null};
 if(setName){
  sh=priceDbTab_(PRICE_DB_V1.setTab);n=sh.getLastRow();
  rows=n>1?sh.getRange(2,1,n-1,5).getValues():[];
  var set=rows.find(function(r){return r[0]===setName;});
  if(set){out.setReleaseDate=String(set[1]);out.setReleaseSourceUrl=set[2];}
 }
 return out;
}
function priceGetProductOverview(productId,setName,asOf){
 var stats=priceGetStats(productId,asOf),release=priceGetRelease(productId,setName);
 return {productId:productId,release:release,market:stats};
}

/** Optional owner-run smoke test; does not mutate any spreadsheet cells. */
function priceRunSelfTests(){
 var up=[
  {date:"2026-11-05",price:100,verified:true,evidenceType:"direct-observation"},
  {date:"2026-11-12",price:110,verified:true,evidenceType:"direct-observation"}
 ];
 var stable=[
  {date:"2026-11-05",price:100,verified:true,evidenceType:"direct-observation"},
  {date:"2026-11-12",price:101,verified:true,evidenceType:"direct-observation"}
 ];
 var down=[
  {date:"2026-11-05",price:110,verified:true,evidenceType:"direct-observation"},
  {date:"2026-11-12",price:100,verified:true,evidenceType:"direct-observation"}
 ];
 var result={
  up7:priceTrend_(up,7,"2026-11-12",2).direction==="up",
  down7:priceTrend_(down,7,"2026-11-12",2).direction==="down",
  stable7:priceTrend_(stable,7,"2026-11-12",2).direction==="stable",
  noResearchTrend:priceTrend_([{date:"2026-11-11",price:100,verified:true,evidenceType:"research-snapshot"}],7,"2026-11-12",2).direction==="insufficient-history",
  noFabricatedMonth:priceTrend_(up,30,"2026-11-12",2).direction==="insufficient-history",
  validLeapDay:priceDate_("2024-02-29")==="2024-02-29",
  badDate:priceDate_("2026-02-30")===null
 };
 if(Object.keys(result).some(function(k){return !result[k];}))throw Error("Price-history test failed: "+JSON.stringify(result));
 Logger.log(JSON.stringify(result));return result;
}
