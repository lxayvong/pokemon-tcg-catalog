"use strict";
/* Standalone Android PWA. The only shared database is Google Sheets.
   Wish lists and profiles are deliberately not persisted in localStorage.
   In-memory edits are verified against the sheet before being called saved. */
const cfg=window.POKEMON_GOOGLE_SHEETS||{};
const state={lists:[],profiles:[],selected:"",tab:"browse",query:"",set:"",type:"",sort:"default",
 loaded:false,loading:false,installPrompt:null,queue:new Map(),timers:new Map(),draining:false,
 saving:new Set(),unsynced:new Set(),lastSync:null,lastError:"",maxProducts:141,filterOpen:false};
const $=id=>document.getElementById(id);
const safe=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>Number.isFinite(Number(n))&&n!=null?"$"+Number(n).toFixed(2):"Unverified";
const plural=(count,s)=>count+" "+s+(count===1?"":"s");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const listById=id=>state.lists.find(x=>x.id===id);
const active=()=>listById(state.selected);
const products=productRecords;
const scoredRows=products.map(p=>({id:p.id,set:p.set,name:p.name,type:p.type,
 packs:p.packCount,market:p.pricing.market?.amount??null,msrp:p.pricing.msrp?.amount??null}));
const goodUrl=url=>typeof url==="string"&&/^https:\/\//i.test(url)?url:null;
function message(text,error=false){
 const el=$("toast");el.textContent=text;el.dataset.error=String(error);el.hidden=false;
 clearTimeout(message.timer);message.timer=setTimeout(()=>el.hidden=true,5200);
}
function setConnection(text,kind="busy"){
 const el=$("connection");el.dataset.state=kind;$("connection-text").textContent=text;
 $("retry-button").hidden=kind==="ok"&&!state.unsynced.size;
}
function stamp(){return new Date().toISOString();}
function sheetQuery(tab){
 return new Promise((resolve,reject)=>{
  if(!cfg.spreadsheetId)return reject(new Error("Google Sheet is not configured"));
  const cb="__androidSheet_"+Math.random().toString(36).slice(2);
  const script=document.createElement("script");
  let done=false;
  const timer=setTimeout(()=>finish(new Error("Google Sheets did not respond in 12 seconds")),12000);
  function finish(error,result){
   if(done)return;done=true;clearTimeout(timer);
   delete window[cb];script.remove();
   error?reject(error):resolve(result);
  }
  window[cb]=res=>{
   if(res?.status!=="ok"||!Array.isArray(res?.table?.rows))return finish(new Error(
    (res?.errors||[]).map(x=>x.message||x.detailed_message).join("; ")||"Invalid Google Sheets response"));
   finish(null,res.table);
  };
  script.onerror=()=>finish(new Error("Cannot access the public Google Sheet"));
  script.src="https://docs.google.com/spreadsheets/d/"+encodeURIComponent(cfg.spreadsheetId)+
   "/gviz/tq?sheet="+encodeURIComponent(tab)+"&headers=0&tqx="+
   encodeURIComponent("out:json;responseHandler:"+cb)+"&_="+Date.now();
  document.head.appendChild(script);
 });
}
function col(row,n){return row?.c?.[n]?.v==null?"":String(row.c[n].v);}
function parseSheet(table,kind){
 const out=[],seen=new Set();
 for(const row of table.rows||[]){
  const id=col(row,0).trim();if(!id||id.toLowerCase()==="id")continue;
  if(seen.has(id))throw Error("Duplicate Google Sheets ID: "+id+". Resolve this in the Sheet to avoid overwrites.");
  seen.add(id);
  let parsed;
  try{parsed=JSON.parse(col(row,2));}catch{throw Error("Google Sheets contains invalid JSON for "+id);}
  if(parsed?.id!==id||typeof parsed.name!=="string")throw Error("Invalid "+kind+" row: "+id);
  if(kind==="wishlist"&&!Array.isArray(parsed.items))throw Error("Invalid wish-list items for "+id);
  out.push({doc:parsed,raw:col(row,2),timestamp:col(row,3)});
 }
 return out;
}
async function readRemote(id){
 const rows=parseSheet(await sheetQuery(cfg.wishlistsTab||"Wishlists"),"wishlist");
 return rows.find(x=>x.doc.id===id)||{doc:null,raw:""};
}
function applyOp(doc,op){
 const items=doc.items;
 if(op.type==="add"){
  const i=items.findIndex(x=>x.productId===op.item.productId);
  if(i<0)items.push(op.item);
  else items[i]={...items[i],...op.item,quantity:items[i].quantity,desiredPrice:items[i].desiredPrice,notes:items[i].notes};
 }else if(op.type==="remove"){
  doc.items=items.filter(x=>x.productId!==op.productId);
 }else if(op.type==="edit"){
  const item=items.find(x=>x.productId===op.productId);
  if(item)item[op.field]=op.value;
 }
 return doc;
}
function pendingFor(id){return state.queue.get(id)||[];}
function enqueue(id,op){
 if(!id)return;
 const pending=pendingFor(id);pending.push(op);state.queue.set(id,pending);state.unsynced.add(id);
 renderHeader();
 clearTimeout(state.timers.get(id));
 state.timers.set(id,setTimeout(()=>{state.timers.delete(id);void drain();},650));
}
function applyPending(id,base){
 const doc=structuredClone(base);
 for(const op of pendingFor(id))applyOp(doc,op);
 return doc;
}
function updateFromRemote(id,remote){
 const at=state.lists.findIndex(x=>x.id===id);
 if(at<0)state.lists.push(remote);
 else state.lists[at]=remote;
}
async function refreshShared(silent=false){
 if(state.loading)return;
 if(state.unsynced.size){if(!silent)message("Unsynced changes are still pending. Tap Retry sync first.",true);return;}
 if(!navigator.onLine){setConnection("Offline · Google Sheets requires a connection","error");return;}
 state.loading=true;setConnection("Loading shared Google Sheets...","busy");
 try{
  const [wish,profile]=await Promise.all([
   sheetQuery(cfg.wishlistsTab||"Wishlists").then(t=>parseSheet(t,"wishlist")),
   sheetQuery(cfg.profilesTab||"Profiles").then(t=>parseSheet(t,"profile")).catch(e=>{console.warn("Profiles unavailable",e);return null;})
  ]);
  state.lists=wish.map(x=>x.doc);
  if(profile)state.profiles=profile.map(x=>x.doc);
  if(state.selected&&!active())state.selected="";
  state.loaded=true;state.lastError="";state.lastSync=stamp();
  setConnection("Google Sheets connected · "+plural(state.lists.length,"wish list"),"ok");
  if(!silent)message("Google Sheets refreshed");
 }catch(e){
  state.lastError=e.message;
  setConnection("Couldn't read Google Sheets · "+e.message,"error");
  if(!silent)message("Google Sheets couldn't load: "+e.message,true);
 }finally{state.loading=false;renderAll();}
}
function saveItem(p){
 const row=scoredRows.find(x=>x.id===p.id);
 const rating=typeof score==="function"?score(row):{inv:5,col:5,rip:5,hold:5};
 return {productId:p.id,set:p.set,name:p.name,type:p.type,packs:p.packCount,
  image:goodUrl(p.images?.[0]?.url),contents:p.contents?.description||"",
  contentsConfidence:p.contents?.verified?"Verified description":"Catalog reference",
  snapshot:{savedAt:stamp(),msrp:p.pricing?.msrp?.amount??null,market:p.pricing?.market?.amount??null,
   marketDate:p.pricing?.market?.reportedAt??null,
   retailerPrices:(p.offers||[]).map(x=>({retailer:x.retailer,amount:x.amount,url:x.url,observedAt:x.observedAt})),
   observedPrice:null,ratings:{inv:rating.inv||5,col:rating.col||5,rip:rating.rip||5,
    hold:rating.hold||5,note:"Subjective assessment; not an investment forecast."},action:"NOT EVALUATED"},
  desiredPrice:null,quantity:1,notes:""};
}
function addProduct(id){
 if(!state.loaded){message("Google Sheets is still loading. Try again when connected.",true);return;}
 if(!state.selected){message("Choose a wish list first. Nothing was added.",true);$("list-picker").focus();$("list-picker").scrollIntoView({behavior:"smooth",block:"center"});return;}
 if(!navigator.onLine){message("Connect to the internet before editing shared wish lists.",true);return;}
 const p=productById.get(id),list=active();if(!p||!list)return;
 const item=saveItem(p);
 applyOp(list,{type:"add",item});
 enqueue(list.id,{type:"add",item});
 message(p.name+" added to "+list.name+" · syncing");
 renderAll();
}
function removeProduct(id){
 const list=active();
 if(!list||!navigator.onLine)return message("Select a wish list and connect to the internet.",true);
 const item=list.items.find(x=>x.productId===id);if(!item)return;
 if(!confirm("Remove "+item.name+" from "+list.name+"?"))return;
 applyOp(list,{type:"remove",productId:id});
 enqueue(list.id,{type:"remove",productId:id});
 message("Removed from "+list.name+" · syncing");renderAll();
}
function updateProduct(id,field,raw){
 const list=active();if(!list)return;
 const item=list.items.find(x=>x.productId===id);if(!item)return;
 let value=raw;
 if(field==="quantity")value=Math.max(1,Math.min(9999,Math.trunc(Number(raw)||1)));
 if(field==="desiredPrice")value=raw===""?null:Math.max(0,Number(raw)||0);
 if(field==="notes")value=String(raw).slice(0,3000);
 item[field]=value;enqueue(list.id,{type:"edit",productId:id,field,value});
 renderHeader();message("Change queued for Google Sheets");
}
async function verifyWrite(id,payload){
 const expected=JSON.stringify(payload);
 let lastError="",consecutiveErrors=0;
 for(const delay of [550,800,1050,1400,1750,2200,2900,3700]){
  await sleep(delay);
  try{
   const record=await readRemote(id);
   if(record.raw===expected||JSON.stringify(record.doc)===expected)return {ok:true,doc:record.doc};
   lastError="Google Sheets has not reflected the update yet";
   consecutiveErrors=0;
  }catch(e){lastError=e.message;if(++consecutiveErrors>=2)break;}
 }
 return {ok:false,error:lastError};
}
function randomReq(){
 const bytes=crypto.getRandomValues(new Uint8Array(12));
 return "req-"+[...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function sendChanges(id,ops){
 if(!navigator.onLine)throw Error("Offline. Your in-memory changes have not been saved.");
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(cfg.anonymousSaveUrl||""))
  throw Error("Google Apps Script save endpoint is not configured");
 const current=await readRemote(id);
 const local=listById(id);
 if(!local)throw Error("Wish list was removed");
 const base=current.doc?structuredClone(current.doc):{id:local.id,name:local.name,profileId:local.profileId||"balanced",items:[]};
 for(const op of ops)applyOp(base,op);
 // If a previous attempt actually saved, don't POST again.
 if(JSON.stringify(base)===current.raw)return base;
 const raw=JSON.stringify(base);
 if(raw.length>45000)throw Error("This wish list exceeds the 45 KB save limit");
 const body=new URLSearchParams({kind:"wishlist",id,payload:raw,expected:current.raw,requestId:randomReq()});
 // Opaque no-CORS response cannot prove success. Public Sheet readback can.
 await fetch(cfg.anonymousSaveUrl,{method:"POST",mode:"no-cors",cache:"no-store",redirect:"follow",body});
 const result=await verifyWrite(id,base);
 if(!result.ok)throw Error("Save not confirmed: "+result.error+". Use Retry sync; don't refresh yet.");
 return result.doc;
}
async function drain(){
 if(state.draining)return;
 if(!navigator.onLine){setConnection("Offline · edits can't sync","error");return;}
 state.draining=true;
 try{
  for(const [id] of state.queue){
   const ops=pendingFor(id).splice(0);
   if(!ops.length){state.queue.delete(id);continue;}
   state.saving.add(id);setConnection("Saving to Google Sheets...","busy");renderHeader();
   try{
    const saved=await sendChanges(id,ops);
    updateFromRemote(id,applyPending(id,saved));
    if(!pendingFor(id).length){state.queue.delete(id);state.unsynced.delete(id);}
    state.lastSync=stamp();state.lastError="";
    message(listById(id)?.name+" saved in Google Sheets");
    setConnection(state.unsynced.size?"Still syncing changes...":"Google Sheets · all changes saved",state.unsynced.size?"busy":"ok");
   }catch(e){
    state.queue.set(id,[...ops,...pendingFor(id)]);
    state.unsynced.add(id);state.lastError=e.message;
    setConnection("Google Sheets save not confirmed · Retry sync","error");
    message(e.message,true);
    break;
   }finally{state.saving.delete(id);renderAll();}
  }
 }finally{state.draining=false;renderHeader();}
}
function retrySync(){
 if(state.unsynced.size){for(const timer of state.timers.values())clearTimeout(timer);state.timers.clear();void drain();}
 else void refreshShared();
}
function chooseList(id){
 state.selected=state.lists.some(x=>x.id===id)?id:"";
 renderAll();
}
function selectTab(tab){
 if(!["browse","wishlist","settings"].includes(tab))return;
 state.tab=tab;
 for(const e of document.querySelectorAll(".page"))e.classList.toggle("active",e.dataset.page===tab);
 for(const e of document.querySelectorAll("[data-nav]")){e.classList.toggle("active",e.dataset.nav===tab);e.setAttribute("aria-current",e.dataset.nav===tab?"page":"false");}
 renderAll();window.scrollTo({top:0,behavior:"smooth"});
}
function renderHeader(){
 const list=active(),select=$("list-picker");if(!select)return;
 const choice=state.selected;
 select.innerHTML='<option value="">Default · Select a wish list</option>'+
  state.lists.map(l=>'<option value="'+safe(l.id)+'">'+safe(l.name)+" ("+l.items.length+")</option>").join("");
 select.value=choice;select.disabled=!state.loaded;
 const info=$("selection-info");info.textContent=!state.loaded?"Connecting to shared data...":
  !list?"Select a wish list before adding any products":
  plural(list.items.length,"product")+" · "+(state.unsynced.has(list.id)?"Changes pending Google Sheets":state.saving.has(list.id)?"Saving...":"Google Sheets");
 $("wishlist-nav-count").textContent=list?list.items.length:"";
 $("catalog-count").textContent=String(products.length);
 $("list-count").textContent=list?String(list.items.length):"—";
 $("market-count").textContent=String(products.filter(p=>p.pricing.market?.amount!=null).length);
 $("sync-detail").textContent=state.unsynced.size?
  plural(state.unsynced.size,"wish list")+" awaiting confirmation":
  state.lastSync?"Last Google Sheets refresh "+new Date(state.lastSync).toLocaleTimeString():"Not synchronized yet";
}
function imageFor(p){const url=goodUrl(p.images?.[0]?.url);return url?
 '<img loading="lazy" decoding="async" src="'+safe(url)+'" alt="'+safe(p.name)+' product packaging" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="placeholder" hidden>▣</span>':
 '<span class="placeholder">▣</span>';}
function marketLink(p){const ref=goodUrl(p.pricing.market?.sourceUrl)||
 (p.identifiers.tcgplayerProductId?"https://www.tcgplayer.com/product/"+encodeURIComponent(p.identifiers.tcgplayerProductId):null);
 return ref?'<a class="market-link" href="'+safe(ref)+'" target="_blank" rel="noopener">Market source ↗</a>':
 '<span class="tagline">Market source unverified</span>';}
function renderBrowse(){
 const query=state.query.trim().toLowerCase();
 let matches=products.filter(p=>(!query||(p.set+" "+p.name+" "+p.type).toLowerCase().includes(query))&&
 (!state.set||p.set===state.set)&&(!state.type||p.type===state.type));
 if(state.sort==="market-asc")matches.sort((a,b)=>(a.pricing.market?.amount??Infinity)-(b.pricing.market?.amount??Infinity));
 else if(state.sort==="market-desc")matches.sort((a,b)=>(b.pricing.market?.amount??-1)-(a.pricing.market?.amount??-1));
 else if(state.sort==="packs")matches.sort((a,b)=>b.packCount-a.packCount);
 else if(state.sort==="alpha")matches.sort((a,b)=>(a.set+a.name).localeCompare(b.set+b.name));
 $("results-count").textContent=plural(matches.length,"product");
 const list=active(),added=new Set(list?.items.map(x=>x.productId)||[]);
 $("products").innerHTML=matches.length?matches.map(p=>{
  const inList=added.has(p.id),market=p.pricing.market?.amount,retail=p.pricing.msrp?.amount,
   best=(p.offers||[]).filter(x=>Number.isFinite(x.amount)).sort((a,b)=>a.amount-b.amount)[0],
   check=p.pricing.market?.reportedAt,kind=p.pricing.market?.verified?"Verified snapshot":"Reference / unverified";
  return '<article class="product"><div class="product-head"><div class="product-art">'+imageFor(p)+'</div>'+
   '<div class="product-copy"><div class="set">'+safe(p.set)+'</div><h3>'+safe(p.name)+'</h3>'+
   '<div class="tagline">'+safe(p.type)+' · '+plural(p.packCount,"pack")+'</div>'+
   '<div class="price-line"><span><small>TCGplayer market</small><br><strong>'+money(market)+'</strong></span>'+
   '<span>'+marketLink(p)+'</span></div>'+
   '<div class="tagline">'+safe(kind)+(check?" · checked "+safe(check):"")+'</div></div></div>'+
   '<div class="product-footer"><div class="product-meta"><span>MSRP '+money(retail)+'</span>'+
   (best?'<span>Store '+safe(best.retailer)+' '+money(best.amount)+'</span>':"")+'</div>'+
   '<button class="product-add '+(inList?"saved":!list?"need-list":"")+'" type="button" data-add="'+safe(p.id)+'">'+
   (inList?"✓ In list":list?"＋ Add":"Select list")+'</button></div></article>';
 }).join(""):'<div class="empty"><strong>No products found</strong>Try another search or filter.</div>';
}
function renderWishlist(){
 const l=active(),target=$("wishlist-items"),head=$("wishlist-title"),sub=$("wishlist-sub");
 if(!state.loaded){head.textContent="Connecting to Sheets";sub.textContent="Loading wish lists";target.innerHTML='<div class="empty">Google Sheets is loading...</div>';return;}
 if(!l){head.textContent="Select a wish list";sub.textContent="Use the selector above to view Laem, Donny, Joe, or another shared list.";target.innerHTML='<div class="empty"><strong>No list selected</strong>Choose a wish list first. Default never adds products to someone else’s list.</div>';return;}
 head.textContent=l.name;sub.textContent=plural(l.items.length,"saved product")+" · "+(state.unsynced.has(l.id)?"Sync pending":"Shared via Google Sheets");
 target.innerHTML=l.items.length?l.items.map(x=>{
  const p=productById.get(x.productId);
  const name=x.name||p?.name||x.productId,img=goodUrl(x.image||p?.images?.[0]?.url);
  return '<article class="list-card" data-item="'+safe(x.productId)+'"><div class="list-top"><div class="list-image">'+
   (img?'<img loading="lazy" src="'+safe(img)+'" alt="'+safe(name)+'">':'▣')+'</div><div><h3>'+safe(name)+'</h3>'+
   '<small>'+safe(x.set||p?.set||"Unknown set")+'</small><div class="list-prices"><span>Market <b>'+money(x.snapshot?.market??p?.pricing.market?.amount)+'</b></span>'+
   '<span>MSRP <b>'+money(x.snapshot?.msrp??p?.pricing.msrp?.amount)+'</b></span></div></div></div>'+
   '<div class="list-controls"><label>Quantity<input type="number" min="1" max="9999" inputmode="numeric" data-field="quantity" value="'+safe(x.quantity||1)+'"></label>'+
   '<label>Target price ($)<input type="number" min="0" step=".01" inputmode="decimal" placeholder="Optional" data-field="desiredPrice" value="'+safe(x.desiredPrice??"")+'"></label>'+
   '<label style="grid-column:1/-1">Notes<textarea data-field="notes" placeholder="Add a note">'+safe(x.notes||"")+'</textarea></label></div>'+
   '<div class="list-actions"><small class="muted">Automatically saves to Google Sheets</small><button class="danger" type="button" data-remove="'+safe(x.productId)+'">Remove</button></div></article>';
 }).join(""):'<div class="empty"><strong>Nothing here yet</strong>Browse products and tap Add to build this wish list.</div>';
}
function renderSettings(){
 $("source-url").href="https://docs.google.com/spreadsheets/d/"+encodeURIComponent(cfg.spreadsheetId)+"/edit";
 $("source-count").textContent=plural(state.lists.length,"shared wish list");
 $("settings-status").textContent=state.lastError||"Google Sheets is the sole source of truth. No wish lists are stored permanently on this device.";
}
function renderAll(){renderHeader();renderBrowse();renderWishlist();renderSettings();}
function setupFilters(){
 const sets=[...new Set(products.map(p=>p.set))].sort((a,b)=>a.localeCompare(b));
 const types=[...new Set(products.map(p=>p.type))].sort();
 $("set-filter").innerHTML='<option value="">All sets</option>'+sets.map(x=>'<option>'+safe(x)+'</option>').join("");
 $("type-filter").innerHTML='<option value="">All products</option>'+types.map(x=>'<option>'+safe(x)+'</option>').join("");
 $("quick-sets").innerHTML=['', "30th Anniversary Celebration","Pokémon 151","Prismatic Evolutions","Phantasmal Flames"].map(x=>
 '<button type="button" class="chip '+(x===state.set?"active":"")+'" data-quick-set="'+safe(x)+'">'+safe(x||"All sets")+'</button>').join("");
}
async function installApp(){
 if(state.installPrompt){
  const prompt=state.installPrompt;state.installPrompt=null;await prompt.prompt();
  const result=await prompt.userChoice;
  if(result?.outcome!=="accepted")message("You can install later from the Chrome menu.");
 }else message("In Chrome on Android, tap ⋮ → Install app / Add to Home screen.");
}
function wire(){
 $("list-picker").onchange=e=>chooseList(e.target.value);
 $("product-search").oninput=e=>{state.query=e.target.value;renderBrowse();};
 $("toggle-filters").onclick=()=>{state.filterOpen=!state.filterOpen;$("filters").hidden=!state.filterOpen;};
 $("set-filter").onchange=e=>{state.set=e.target.value;renderBrowse();document.querySelectorAll("[data-quick-set]").forEach(b=>b.classList.toggle("active",b.dataset.quickSet===state.set));};
 $("type-filter").onchange=e=>{state.type=e.target.value;renderBrowse();};
 $("sort-filter").onchange=e=>{state.sort=e.target.value;renderBrowse();};
 $("quick-sets").onclick=e=>{
  const b=e.target.closest("[data-quick-set]");if(!b)return;
  state.set=b.dataset.quickSet;$("set-filter").value=state.set;
  document.querySelectorAll("[data-quick-set]").forEach(x=>x.classList.toggle("active",x===b));renderBrowse();
 };
 $("products").onclick=e=>{const b=e.target.closest("[data-add]");if(b)addProduct(b.dataset.add);};
 $("wishlist-items").onclick=e=>{const b=e.target.closest("[data-remove]");if(b)removeProduct(b.dataset.remove);};
 $("wishlist-items").onchange=e=>{
  const i=e.target.closest("[data-field]"),row=i?.closest("[data-item]");
  if(i&&row)updateProduct(row.dataset.item,i.dataset.field,i.value);
 };
 $("retry-button").onclick=retrySync;
 $("refresh-button").onclick=()=>void refreshShared();
 $("install-button").onclick=()=>void installApp();
 $("add-list").onclick=()=>{
  if(!state.loaded||!navigator.onLine)return message("Connect to Google Sheets first.",true);
  const name=prompt("Name for the new shared wish list");if(!name||!name.trim())return;
  const clean=name.trim().slice(0,80);
  if(state.lists.some(x=>x.name.toLowerCase()===clean.toLowerCase()))return message("A wish list with that name already exists.",true);
  const id="u"+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  state.lists.push({id,name:clean,profileId:state.profiles[0]?.id||"balanced",items:[]});
  state.selected=id;enqueue(id,{type:"create"});renderAll();message(clean+" created · syncing");
 };
 for(const b of document.querySelectorAll("[data-nav]"))b.onclick=()=>selectTab(b.dataset.nav);
 window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();state.installPrompt=e;$("install-button").hidden=false;});
 window.addEventListener("appinstalled",()=>{state.installPrompt=null;$("install-button").hidden=true;message("Catalog installed! Open it from your app launcher.");});
 window.addEventListener("online",()=>{if(state.unsynced.size)void drain();else void refreshShared(true);});
 window.addEventListener("offline",()=>setConnection("Offline · Google Sheets unavailable","error"));
 window.addEventListener("beforeunload",e=>{if(state.unsynced.size){e.preventDefault();e.returnValue="Changes have not been confirmed in Google Sheets."; }});
 window.addEventListener("hashchange",()=>{const tab=location.hash.slice(1);if(["browse","wishlist","settings"].includes(tab))selectTab(tab);});
}
function init(){
 state.maxProducts=products.length;setupFilters();wire();
 const route=location.hash.slice(1);selectTab(["browse","wishlist","settings"].includes(route)?route:"browse");
 if("serviceWorker" in navigator)window.addEventListener("load",()=>{
  navigator.serviceWorker.register("./service-worker.js",{scope:"./"}).catch(e=>console.warn("Service worker not installed",e));
 });
 void refreshShared(true);
}
init();
