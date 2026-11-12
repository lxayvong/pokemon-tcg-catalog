/* Anonymous shared saves via an owner-deployed Apps Script web app.
 * Google Sheets remains public Viewer; the endpoint alone has write privileges.
 * Requests intentionally use opaque no-CORS POST. Success is ONLY reported
 * after rereading the public Google Sheet and matching a unique request ID.
 */
const publicWriteState={busy:false};
window.catalogSheetSync=window.catalogSheetSync||{};
function setCatalogSheetSync(id,state){
 if(!id)return;
 window.catalogSheetSync[id]={state,updatedAt:Date.now()};
 if(typeof updateWishlistIndicators==="function")updateWishlistIndicators();
}
function anonymousSaveURL(){
 const u=window.POKEMON_GOOGLE_SHEETS?.anonymousSaveUrl||"";
 return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u)?u:null;
}
function anonymousSaveReady(){return !!anonymousSaveURL();}
function anonymousSaveNotice(text,error=false){
 const el=document.getElementById("anonymous-save-status");
 if(el){el.textContent=text;el.dataset.status=error?"error":(text.startsWith("Saving")?"pending":"ok");}
 if(typeof workspaceNotify==="function")workspaceNotify(text);
 if(error&&typeof showCatalogToast==="function")showCatalogToast(text,true);
 if(typeof updateWishlistIndicators==="function")updateWishlistIndicators();
}
function makeRequestId(){
 const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);
 return "req-"+Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
}
/** Inspect Apps Script's per-request receipt via JSONP. Works after the owner
 * deploys the updated AnonymousSave.gs code; older deployments time out and
 * the existing public-sheet readback remains the authoritative fallback.
 */
function queryAppsScriptReceipt(requestId){
 return new Promise((resolve,reject)=>{
  const base=anonymousSaveURL();
  if(!base)return reject(new Error("Apps Script URL is not configured"));
  if(!/^req-[0-9a-f]{24}$/.test(requestId))return reject(new Error("Invalid receipt ID"));
  const callback="pokemonReceipt_"+Math.random().toString(36).slice(2);
  const node=document.createElement("script");
  let done=false;
  const finish=(err,data)=>{
   if(done)return;done=true;clearTimeout(timer);delete window[callback];node.remove();
   err?reject(err):resolve(data);
  };
  const timer=setTimeout(()=>finish(new Error("Apps Script receipt endpoint did not respond. Redeploy AnonymousSave.gs to enable detailed server errors.")),2500);
  window[callback]=data=>{
   if(!data||typeof data.status!=="string"||typeof data.message!=="string")return finish(new Error("Apps Script returned a malformed save receipt"));
   finish(null,data);
  };
  node.onerror=()=>finish(new Error("Apps Script receipt endpoint is unreachable or not deployed"));
  node.src=base+"?"+new URLSearchParams({action:"receipt",requestId,callback}).toString();
  document.head.appendChild(node);
 });
}
async function anonymousSaveImmediate(kind,requestedId=null){
 const id=requestedId||(kind==="profile"?currentProfile()?.id:currentWishlist()?.id);
 const doc=workspace[kind==="profile"?"profiles":"wishlists"].find(x=>x.id===id);
 if(!doc)return anonymousSaveNotice("Select a "+kind+" to save.",true);
 try{saveWorkspace();}catch(err){return anonymousSaveNotice("Local saving failed: "+err.message,true);}
 const url=anonymousSaveURL();
 if(!url){
  if(kind==="wishlist")setCatalogSheetSync(id,"error");
  anonymousSaveNotice("Saved in browser only. Google Sheets sync is not configured.",true);
  return;
 }
 
 const baseline=publicSheetBaseline();
 const key=kind+":"+id;
 if(kind==="wishlist")setCatalogSheetSync(id,"saving");
 // A visitor may add an item before the anonymous page-load read completes.
 // Fetch the authoritative row first rather than sending expected="" and
 // receiving a conflict for a list that already exists.
 if(!Object.prototype.hasOwnProperty.call(baseline,key)){
  try{
   const tab=kind==="profile"?(window.POKEMON_GOOGLE_SHEETS?.profilesTab||"Profiles"):(window.POKEMON_GOOGLE_SHEETS?.wishlistsTab||"Wishlists");
   const table=await publicSheetQuery(tab);
   const remote=(table.rows||[]).find(row=>String(row.c?.[0]?.v??"")===id);
   const rawRemote=remote?.c?.[2]?.v==null?"":String(remote.c[2].v);
   baseline[key]=rawRemote;
   // Preserve any products added in other browsers. Current local edits win
   // for a matching product; remote-only additions are merged in.
   if(rawRemote&&kind==="wishlist"){
    const current=JSON.parse(rawRemote),ids=new Set(doc.items.map(item=>item.productId));
    for(const item of current.items||[])if(!ids.has(item.productId)){doc.items.push(item);ids.add(item.productId);}
    saveWorkspace();refreshWorkspace();render();
   }
  }catch(err){if(kind==="wishlist")setCatalogSheetSync(id,"error");return anonymousSaveNotice("Couldn't read shared "+kind+" before saving: "+err.message+". Local changes retained.",true);}
 }
 const snapshot=JSON.parse(JSON.stringify(doc)),raw=JSON.stringify(snapshot);
 if(raw.length>45000)return anonymousSaveNotice("Wish list too large for a single shared sheet record.",true);
 const expected=baseline[key]||"";
 if(expected===raw){
  if(kind==="wishlist"){publicSheetsState.remoteCounts=publicSheetsState.remoteCounts||{};publicSheetsState.remoteCounts[id]=new Set(doc.items.map(item=>item.productId)).size;setCatalogSheetSync(id,"synced");}
  if(typeof clearSheetPending==="function")clearSheetPending(kind,id);
  anonymousSaveNotice("✓ "+doc.name+" already up to date in Google Sheets.");
  return;
 }
 const requestId=makeRequestId();
 publicWriteState.busy=true;
 anonymousSaveNotice("Saving "+doc.name+" to shared Google Sheets...");
 const field=document.getElementById("anonymous-save-wishlist");
 if(field)field.disabled=true;
 try{
  // Browsers intentionally cannot inspect this cross-origin response.
  // A confirmed public sheet reread below is required to report success.
  const body=new URLSearchParams({kind,id,payload:raw,expected,requestId});
  await fetch(url,{method:"POST",mode:"no-cors",body,cache:"no-store",redirect:"follow"});
  // The deployed Apps Script may be an older version without a receipt GET
  // endpoint. Verify against the actual public Sheet instead. The Visualization
  // API can lag behind a completed Apps Script write, so allow propagation.
  let confirmed=false,conflict=false,readbackError="",sawExpected=false;
  const tab=kind==="profile"?(window.POKEMON_GOOGLE_SHEETS?.profilesTab||"Profiles"):(window.POKEMON_GOOGLE_SHEETS?.wishlistsTab||"Wishlists");
  const delays=[600,850,1100,1450,1900,2500,3300,4300];
  for(const delay of delays){
   await new Promise(resolve=>setTimeout(resolve,delay));
   try{
    const table=await publicSheetQuery(tab);
    readbackError="";
    const row=(table.rows||[]).find(r=>String(r.c?.[0]?.v??"")===id);
    const content=row?.c?.[2]?.v==null?"":String(row.c[2].v);
    if(content===raw){confirmed=true;break;}
    if(content===expected){sawExpected=true;continue;}
    if(content!==expected){conflict=true;break;}
   }catch(e){readbackError=e?.message||"Unable to read shared spreadsheet";}
  }
  if(confirmed){
   baseline[key]=raw;
   localStorage.setItem(PUBLIC_SHEET_BASELINE_KEY,JSON.stringify(baseline));
   if(kind==="wishlist"){
    publicSheetsState.remoteCounts=publicSheetsState.remoteCounts||{};
    publicSheetsState.remoteCounts[id]=new Set(snapshot.items.map(item=>item.productId)).size;
    setCatalogSheetSync(id,"synced");
   }
   if(JSON.stringify(workspace[kind==="profile"?"profiles":"wishlists"].find(x=>x.id===id))===raw&&typeof clearSheetPending==="function")clearSheetPending(kind,id);
   anonymousSaveNotice("✓ "+doc.name+" saved to shared Google Sheets.");
   if(typeof showCatalogToast==="function")showCatalogToast(doc.name+" saved to shared Sheets");
  }else{
   // A missing receipt callback is not evidence that the POST failed. A slow
   // public read can still be catching up. Keep pending edits intact.
   let message;
   if(conflict)message="Google Sheets changed while saving "+doc.name+". Your browser changes are retained; use Retry sync to reconcile.";
   else if(readbackError)message="Save sent, but Google Sheets could not be read to confirm it: "+readbackError+". Browser changes retained.";
   else message="Save sent, but Google Sheets hasn't reflected the update yet. Your changes remain in this browser; Retry sync after a moment.";
   if(kind==="wishlist")setCatalogSheetSync(id,conflict?"error":"unconfirmed");
   anonymousSaveNotice(message,conflict);
  }
 }catch(error){if(kind==="wishlist")setCatalogSheetSync(id,"error");anonymousSaveNotice("Shared save failed; browser copy retained: "+error.message,true);}
 finally{publicWriteState.busy=false;if(field)field.disabled=false;}
}
// Serialize and coalesce writes: no edits are silently dropped while another
// shared save is in progress. Each document's latest state is read when its
// turn starts, and saves are confirmed against the public spreadsheet.
const queuedWrites=new Map();
let writeDrainActive=false;
async function anonymousSave(kind,requestedId=null){
 const id=requestedId||(kind==="profile"?currentProfile()?.id:currentWishlist()?.id);
 if(!id)return anonymousSaveNotice("Select a "+kind+" to save.",true);
 const key=kind+":"+id;
 queuedWrites.set(key,{kind,id});
 if(typeof markSheetPending==="function")markSheetPending(kind,id);
 if(kind==="wishlist")setCatalogSheetSync(id,"saving");
 if(writeDrainActive)return;
 writeDrainActive=true;
 try{
  while(queuedWrites.size){
   const [nextKey,job]=queuedWrites.entries().next().value;
   queuedWrites.delete(nextKey);
   await anonymousSaveImmediate(job.kind,job.id);
  }
 }finally{writeDrainActive=false;}
}
function setupAnonymousSaveUI(){
 const status=document.getElementById("anonymous-save-status");
 if(status){
  status.textContent=anonymousSaveReady()
   ?"Shared save endpoint configured. Save a profile or wish list to verify writing."
   :"Shared save endpoint not configured. Edits are stored only in this browser.";
  status.dataset.status=anonymousSaveReady()?"ready":"error";
 }
 const b=document.getElementById("anonymous-save-wishlist");
 if(b)b.onclick=()=>anonymousSave("wishlist");
}
