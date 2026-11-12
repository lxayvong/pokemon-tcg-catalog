/* User-specific profiles and watchlists. Seed data is versioned in /data.
   Browser edits persist per origin in localStorage and can be exported/imported.
   A public GitHub Pages site cannot write commits without a secure authenticated backend. */
const WORKSPACE_STORAGE_KEY="pokemonCatalogWorkspaceV1";
const PROFILE_SEEDS=[{"id":"balanced","name":"Balanced Buyer","strategy":"balanced","buyDiscountPct":35,"considerDiscountPct":18,"maxMsrpPremiumPct":10,"maxPricePerPack":null,"minScore":0},{"id":"sealed","name":"Sealed Collector","strategy":"sealed","buyDiscountPct":30,"considerDiscountPct":15,"maxMsrpPremiumPct":20,"maxPricePerPack":null,"minScore":7},{"id":"rip","name":"Pack Ripper","strategy":"rip","buyDiscountPct":20,"considerDiscountPct":8,"maxMsrpPremiumPct":5,"maxPricePerPack":8,"minScore":6}];
const WISHLIST_SEEDS=[{"id":"laem","name":"Laem","profileId":"balanced","items":[]},{"id":"donny","name":"Donny","profileId":"balanced","items":[]},{"id":"joe","name":"Joe","profileId":"balanced","items":[]}];
function cleanWorkspace(raw){
 const obj=raw&&typeof raw==="object"?raw:{},profiles=Array.isArray(obj.profiles)?obj.profiles:PROFILE_SEEDS,wishlists=Array.isArray(obj.wishlists)?obj.wishlists:WISHLIST_SEEDS;
 const unique=arr=>[...new Set(arr.map(x=>x.id))].map(id=>arr.find(x=>x.id===id));
 const profileRows=unique(profiles.filter(x=>x&&typeof x.name==="string"&&typeof x.id==="string")).map(x=>({...PROFILE_SEEDS[0],...x}));
 const lists=unique(wishlists.filter(x=>x&&typeof x.name==="string"&&typeof x.id==="string")).map(x=>({...x,profileId:x.profileId||profileRows[0]?.id||"balanced",items:Array.isArray(x.items)?x.items.filter(i=>i&&typeof i.productId==="string"):[]}));
 return {schemaVersion:1,profiles:profileRows.length?profileRows:PROFILE_SEEDS.map(x=>({...x})),wishlists:lists,activeProfileId:obj.activeProfileId||profileRows[0]?.id||"balanced",activeWishlistId:obj.activeWishlistId??null};
}
function loadWorkspace(){try{return cleanWorkspace(JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY)||"null"))}catch(_){return cleanWorkspace(null)}}
let workspace=loadWorkspace();
// Require an explicit wish-list choice on every page load.
workspace.activeWishlistId=null;
function saveWorkspace(){localStorage.setItem(WORKSPACE_STORAGE_KEY,JSON.stringify(workspace))}
function workspaceId(){return "u"+Date.now().toString(36)+Math.random().toString(36).slice(2,9)}
function currentProfile(){return workspace.profiles.find(p=>p.id===workspace.activeProfileId)||workspace.profiles[0]}
function currentWishlist(){return workspace.wishlists.find(w=>w.id===workspace.activeWishlistId)||null}
function newProfile(name){const obj={...PROFILE_SEEDS[0],id:workspaceId(),name:String(name).trim()};if(!obj.name)throw Error("Profile name is required");workspace.profiles.push(obj);workspace.activeProfileId=obj.id;saveWorkspace();return obj}
function newWishlist(name){const obj={id:workspaceId(),name:String(name).trim(),profileId:currentProfile()?.id||"balanced",items:[]};if(!obj.name)throw Error("Wish list name is required");workspace.wishlists.push(obj);workspace.activeWishlistId=obj.id;saveWorkspace();return obj}
function savedProductRecord(product,observed,details,ratings,verdict){
 const price=observed==null||observed===""?null:Number(observed);
 return {productId:product.id,set:product.set,name:product.name,type:product.type,packs:product.packCount,image:product.images?.[0]?.url||null,
 contents:details?.text||product.contents?.description||"",contentsConfidence:details?.confidence||null,
 snapshot:{savedAt:new Date().toISOString(),msrp:product.pricing?.msrp?.amount??null,market:product.pricing?.market?.amount??null,
 marketDate:product.pricing?.market?.reportedAt??null,retailerPrices:(product.offers||[]).map(o=>({retailer:o.retailer,amount:o.amount,url:o.url,observedAt:o.observedAt})),
 observedPrice:Number.isFinite(price)&&price>=0?price:null,ratings:ratings||{},action:verdict?.action||null},
 desiredPrice:null,quantity:1,notes:""};
}
function saveProductToWishlist(listId,item){const l=workspace.wishlists.find(x=>x.id===listId);if(!l)throw Error("Wish list not found");const old=l.items.findIndex(x=>x.productId===item.productId);if(old>=0){l.items[old]={...item,quantity:l.items[old].quantity,desiredPrice:l.items[old].desiredPrice,notes:l.items[old].notes};}else l.items.push(item);saveWorkspace()}
function removeWishProduct(listId,productId){const l=workspace.wishlists.find(x=>x.id===listId);if(!l)return;l.items=l.items.filter(x=>x.productId!==productId);saveWorkspace()}
function exportWorkspace(){return JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),...workspace},null,2)}
function importWorkspace(json){const parsed=typeof json==="string"?JSON.parse(json):json;if(!parsed||parsed.schemaVersion!==1||!Array.isArray(parsed.profiles)||!Array.isArray(parsed.wishlists))throw Error("Invalid workspace backup");workspace=cleanWorkspace(parsed);saveWorkspace();return workspace}
function profileDecision(x,observed,record,ratings,profile){
 const policy=profile||currentProfile(),s=ratings||{};
 if(observed===null||observed===""||observed===undefined)return {action:"ENTER PRICE",tone:"neutral",confidence:"—",reasons:["Enter an asking price to apply the selected rule profile."],trend:"Trend not evaluated"};
 const n=Number(observed);if(!Number.isFinite(n)||n<0)return {action:"ENTER PRICE",tone:"neutral",confidence:"—",reasons:["Enter a valid non-negative price."],trend:"Trend not evaluated"};
 const market=x.market>0?x.market:null,msrp=x.msrp>0?x.msrp:null,offers=(record?.offers||[]).filter(o=>Number.isFinite(o.amount)&&o.amount>0);
 const lowest=offers.length?Math.min(...offers.map(o=>o.amount)):null;
 const buy=Math.max(0,Math.min(95,Number(policy.buyDiscountPct)||0))/100,consider=Math.max(0,Math.min(95,Number(policy.considerDiscountPct)||0))/100;
 const maxMsrp=Math.max(0,Number(policy.maxMsrpPremiumPct)||0)/100;
 const score=policy.strategy==="rip"?(s.rip||0):policy.strategy==="sealed"?(s.hold||0):(s.inv||0);
 const minScore=Math.max(0,Number(policy.minScore)||0);
 const maxPack=policy.maxPricePerPack==null||policy.maxPricePerPack===""?null:Number(policy.maxPricePerPack);
 const perPack=x.packs>0?n/x.packs:null;
 let action="RESEARCH",tone="neutral";let reasons=[];
 if(market!=null){const ratio=n/market;
   if(ratio<=1-buy){action="BUY";tone="good";reasons.push(Math.round((1-ratio)*100)+"% below recorded TCGplayer market");}
   else if(ratio<=1-consider){action="CONSIDER";tone="good";reasons.push(Math.round((1-ratio)*100)+"% below market");}
   else if(ratio<=1.05){action="WAIT";tone="caution";reasons.push("Near market price; limited margin");}
   else{action="SKIP";tone="bad";reasons.push(Math.round((ratio-1)*100)+"% above recorded market");}
 } else if(msrp!=null){action=n<=msrp?"CONSIDER":"WAIT";tone="caution";reasons.push("Market price unavailable; assessed against retail benchmark");}
 else if(lowest!=null){action=n<=lowest?"CONSIDER":"WAIT";tone="caution";reasons.push("Market price unavailable; assessed against retailer listings");}
 else reasons.push("No verified price benchmarks");
 if(msrp!=null&&n>msrp*(1+maxMsrp)){if(action==="BUY"||action==="CONSIDER"){action="WAIT";tone="caution"}reasons.push("Exceeds profile MSRP premium ceiling ("+policy.maxMsrpPremiumPct+"%)");}
 if(maxPack!=null&&Number.isFinite(maxPack)&&x.packs>0&&perPack>maxPack){action="SKIP";tone="bad";reasons.push("Pack cost exceeds profile maximum of $"+maxPack.toFixed(2));}
 if(minScore>0&&score<minScore){if(action==="BUY"||action==="CONSIDER"){action="WAIT";tone="caution"}reasons.push("Strategy score "+score+"/10 below profile minimum "+minScore+"/10");}
 if(lowest!=null&&n>lowest*1.12)reasons.push("Lower documented first-party retailer price: $"+lowest.toFixed(2));
 if(perPack!=null)reasons.push("$"+perPack.toFixed(2)+" per pack");
 const referenceDate=record?.pricing?.market?.reportedAt||record?.pricing?.market?.observedAt;
 const days=referenceDate?Math.floor((Date.now()-Date.parse(referenceDate+"T00:00:00Z"))/86400000):null;
 const fresh=record?.pricing?.market?.verified&&days!==null&&days>=0&&days<=14;
 let confidence=market!=null&&fresh?"Medium":"Low";
 if(action==="BUY"&&!fresh){action="CONSIDER";tone="neutral";reasons.unshift("Price reference is stale or unverified; firm BUY withheld");}
 reasons.unshift("Profile: "+policy.name+" ("+policy.strategy+")");
 return {action,tone,confidence,reasons:reasons.slice(0,6),trend:"Trend not evaluated: price history unavailable"};
}

/* Repository JSON is the default configuration for first-time visitors. Never overwrite local edits. */
async function hydrateDefaultsFromRepo(){
 let hasLocal=false;try{hasLocal=!!localStorage.getItem(WORKSPACE_STORAGE_KEY)}catch(_){return}
 if(hasLocal||typeof fetch!=="function")return;
 try{
  const [profilesResponse,listsResponse]=await Promise.all([fetch("data/decision-profiles.json?build=profiles2",{cache:"no-store"}),fetch("data/wishlists.json?build=profiles2",{cache:"no-store"})]);
  if(!profilesResponse.ok||!listsResponse.ok)return;
  const [p,w]=await Promise.all([profilesResponse.json(),listsResponse.json()]);
  if(p.schemaVersion!==1||w.schemaVersion!==1||!Array.isArray(p.profiles)||!Array.isArray(w.wishlists))return;
  if(localStorage.getItem(WORKSPACE_STORAGE_KEY))return;
  workspace=cleanWorkspace({schemaVersion:1,profiles:p.profiles,wishlists:w.wishlists,activeProfileId:p.profiles[0]?.id,activeWishlistId:w.wishlists[0]?.id});
  refreshWorkspace();render();
 }catch(err){console.warn("Using bundled profile and wish-list defaults",err)}
}
