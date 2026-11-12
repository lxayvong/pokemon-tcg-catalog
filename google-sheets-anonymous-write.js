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
 if(el){el.textContent=text;el.dataset.status=error?"error":(text.startsWith("Saving")||text.startsWith("Save sent")?"pending":"ok");}
 if(typeof workspaceNotify==="function")workspaceNotify(text);
 if(error&&typeof showCatalogToast==="function")showCatalogToast(text,true);
 if(typeof updateWishlistIndicators==="function")updateWishlistIndicators();
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
 // Read actual current spreadsheet contents on EVERY write. A cached browser
 // baseline can be stale, particularly after a failed confirmation or refresh.
 // If duplicate IDs exist, refuse to overwrite an arbitrary row.
 try{
  const tab=kind==="profile"?(window.POKEMON_GOOGLE_SHEETS?.profilesTab||"Profiles"):(window.POKEMON_GOOGLE_SHEETS?.wishlistsTab||"Wishlists");
  const table=await publicSheetQuery(tab);
  const matches=(table.rows||[]).filter(row=>String(row.c?.[0]?.v??"")===id);
  if(matches.length>1)throw Error("Multiple Google Sheets rows share ID '"+id+"'. Consolidate those rows before saving to avoid losing items.");
  const remote=matches[0],rawRemote=remote?.c?.[2]?.v==null?"":String(remote.c[2].v);
  baseline[key]=rawRemote;
  if(rawRemote&&kind==="wishlist"){
   let current;
   try{current=JSON.parse(rawRemote);}
   catch{throw Error("Current Google Sheet record has invalid JSON. No changes were sent.");}
   if(!Array.isArray(current.items))throw Error("Current Google Sheet wish list has invalid items. No changes were sent.");
   const removed=typeof pendingWishlistDeletes==="function"?pendingWishlistDeletes(id):new Set();
   const ids=new Set(doc.items.map(item=>item.productId));
   for(const item of current.items){
    if(!ids.has(item.productId)&&!removed.has(item.productId)){
     doc.items.push(item);ids.add(item.productId);
    }
   }
   saveWorkspace();
   refreshWorkspace();
   render();
  }
 }catch(err){
  if(kind==="wishlist")setCatalogSheetSync(id,"error");
  return anonymousSaveNotice("Shared save paused to protect sheet data: "+err.message+" Browser changes retained.",true);
 }
 const snapshot=JSON.parse(JSON.stringify(doc)),raw=JSON.stringify(snapshot);
 if(raw.length>45000)return anonymousSaveNotice("Wish list too large for a single shared sheet record.",true);
 const expected=baseline[key]||"";
 if(expected===raw){
  if(kind==="wishlist"){publicSheetsState.remoteCounts=publicSheetsState.remoteCounts||{};publicSheetsState.remoteCounts[id]=new Set(doc.items.map(item=>item.productId)).size;setCatalogSheetSync(id,"synced");}
  if(typeof clearSheetPending==="function")clearSheetPending(kind,id);
  if(kind==="wishlist"&&typeof clearWishlistDeletes==="function")clearWishlistDeletes(id);
  anonymousSaveNotice("✓ "+doc.name+" already up to date in Google Sheets.");
  return;
 }

 publicWriteState.busy=true;
 anonymousSaveNotice("Saving "+doc.name+" to shared Google Sheets...");
 const field=document.getElementById("anonymous-save-wishlist");
 if(field)field.disabled=true;
 try{
  await window.PokemonSheetsClient.writeDocument({kind,id,payload:raw,expected});
  baseline[key]=raw;
  localStorage.setItem(PUBLIC_SHEET_BASELINE_KEY,JSON.stringify(baseline));
  if(kind==="wishlist"){
   publicSheetsState.remoteCounts=publicSheetsState.remoteCounts||{};
   publicSheetsState.remoteCounts[id]=new Set(snapshot.items.map(item=>item.productId)).size;
   setCatalogSheetSync(id,"synced");
  }
  if(JSON.stringify(workspace[kind==="profile"?"profiles":"wishlists"].find(x=>x.id===id))===raw){
   if(typeof clearSheetPending==="function")clearSheetPending(kind,id);
   if(kind==="wishlist"&&typeof clearWishlistDeletes==="function")clearWishlistDeletes(id);
  }
  anonymousSaveNotice("✓ "+doc.name+" saved to shared Google Sheets.");
  if(typeof showCatalogToast==="function")showCatalogToast(doc.name+" saved to shared Sheets");
 }catch(error){
  if(kind==="wishlist")setCatalogSheetSync(id,error?.code==="unconfirmed"?"unconfirmed":"error");
  anonymousSaveNotice("Shared save not confirmed; browser copy retained: "+error.message,error?.code!=="unconfirmed");
 }finally{publicWriteState.busy=false;if(field)field.disabled=false;}

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
