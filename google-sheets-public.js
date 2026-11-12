/* Read-only, signed-out Google Sheets loader.
 * Google Visualization responses require a spreadsheet explicitly shared with
 * Anyone with the link (Viewer). It does not grant write permissions.
 * Local edits are preserved when they differ from the last loaded snapshot.
 */
const PUBLIC_SHEET_BASELINE_KEY="pokemonCatalogPublicSheetsBaselineV1";
const PUBLIC_PENDING_KEY="pokemonCatalogPendingSheetsWritesV1";
const PUBLIC_LOCAL_BACKUP_KEY="pokemonCatalogPreSyncBackupV1";
function pendingSheetWrites(){try{return JSON.parse(localStorage.getItem(PUBLIC_PENDING_KEY)||"{}")||{}}catch{return {}}}
function markSheetPending(kind,id){const o=pendingSheetWrites();o[kind+":"+id]=Date.now();localStorage.setItem(PUBLIC_PENDING_KEY,JSON.stringify(o))}
function clearSheetPending(kind,id){const o=pendingSheetWrites();delete o[kind+":"+id];localStorage.setItem(PUBLIC_PENDING_KEY,JSON.stringify(o))}

const publicSheetsState={status:"idle"};
function publicSheetNotice(msg,error=false){
 publicSheetsState.status=error?"error":"ready";
 const header=document.getElementById("public-data-status");if(header){header.textContent=msg;header.dataset.status=error?"error":"ok";}
 const lower=document.getElementById("public-sheet-status");if(lower){lower.textContent=msg;lower.dataset.status=error?"error":"ok";}
}
function publicSheetBaseline(){
 try{const o=JSON.parse(localStorage.getItem(PUBLIC_SHEET_BASELINE_KEY)||"{}");return o&&typeof o==="object"?o:{}}catch{return {};}
}
function publicSheetQuery(sheetName){
 return new Promise((resolve,reject)=>{
  const c=window.POKEMON_GOOGLE_SHEETS||{},id=c.spreadsheetId;
  if(!/^[A-Za-z0-9_-]{20,}$/.test(id||""))return reject(new Error("Spreadsheet ID not configured"));
  // Google Visualization API supports a JSONP response handler for public sheets.
  const callback="__pokemonPublicSheet_"+Math.random().toString(36).slice(2);
  const script=document.createElement("script");
  const source="https://docs.google.com/spreadsheets/d/"+encodeURIComponent(id)+"/gviz/tq?sheet="+encodeURIComponent(sheetName)+"&headers=0&tqx="+encodeURIComponent("out:json;responseHandler:"+callback)+"&_="+Date.now();
  let complete=false;
  const finish=(err,table)=>{if(complete)return;complete=true;clearTimeout(timer);delete window[callback];script.remove();err?reject(err):resolve(table);};
  const timer=setTimeout(()=>finish(new Error("Google Sheets did not respond; check public Viewer access")),9000);
  window[callback]=res=>{
   if(res?.status!=="ok"){
    const detail=Array.isArray(res?.errors)?res.errors.map(e=>e.detailed_message||e.message||e.reason).filter(Boolean).join("; "):"";
    return finish(new Error(detail||"Google returned "+String(res?.status||"an invalid response")));
   }
   if(!Array.isArray(res.table?.rows))return finish(new Error("Google Sheets response did not include table rows"));
   finish(null,res.table);
  };
  script.onerror=()=>finish(new Error("Google Sheets public endpoint could not be reached. Check public Viewer access and network permissions."));
  script.src=source;
  document.head.appendChild(script);
 });
}
function publicSheetRecordCell(row,index){
 const cell=row?.c?.[index];
 return cell?.v==null?"":String(cell.v);
}
function publicSheetDocuments(table,label){
 const docs=[];
 (table.rows||[]).forEach((row,index)=>{
  const cells=row.c||[],id=String(cells[0]?.v??"").trim();
  if(!id||id==="ID")return;
  const location=(label==="profile"?"Profiles":"Wishlists")+" row "+(index+2);
  const content=publicSheetRecordCell(row,2);
  if(!content)throw new Error(location+": missing saved JSON");
  let documentValue;
  try{documentValue=JSON.parse(content);}
  catch(ex){throw new Error(location+": invalid JSON ("+ex.message+")");}
  if(!documentValue||documentValue.id!==id||typeof documentValue.name!=="string")
   throw new Error(location+": document ID or name mismatch");
  if(label==="wishlist"&&!Array.isArray(documentValue.items))
   throw new Error(location+": missing wish-list items");
  if(label==="profile"&&!["balanced","sealed","rip"].includes(documentValue.strategy))
   throw new Error(location+": invalid decision-profile strategy");
  docs.push(documentValue);
 });
 return docs;
}
function initialDocumentUnmodified(kind,local){
 if(kind==="wishlist"){const seed=WISHLIST_SEEDS.find(x=>x.id===local.id);return !!seed&&local.name===seed.name&&local.profileId===seed.profileId&&Array.isArray(local.items)&&local.items.length===0;}
 const seed=PROFILE_SEEDS.find(x=>x.id===local.id);
 return !!seed&&["name","strategy","buyDiscountPct","considerDiscountPct","maxMsrpPremiumPct","maxPricePerPack","minScore"].every(k=>local[k]===seed[k]);
}
function mergePublicDocs(kind,remote,previousBaseline,hasExistingStorage){
 const prop=kind==="profile"?"profiles":"wishlists",local=workspace[prop],byId=new Map(local.map(x=>[x.id,x])),next=[...local];
 let protectedCount=0;
 for(const record of remote){
  const index=next.findIndex(x=>x.id===record.id);
  if(index<0){next.push(record);continue;}
  const existing=byId.get(record.id),k=kind+":"+record.id;
  let clean=!hasExistingStorage||initialDocumentUnmodified(kind,existing);
  if(Object.prototype.hasOwnProperty.call(previousBaseline,k))clean=JSON.stringify(existing)===previousBaseline[k];
  // Shared wishlist rows are authoritative on page load, unless a local edit
  // is explicitly queued or has failed to sync.
  if(kind==="wishlist"&&!pendingSheetWrites()[k]){
   if(JSON.stringify(existing)!==JSON.stringify(record)){
    try{const backup=JSON.parse(localStorage.getItem(PUBLIC_LOCAL_BACKUP_KEY)||"{}");backup[k]=existing;localStorage.setItem(PUBLIC_LOCAL_BACKUP_KEY,JSON.stringify(backup))}catch(_){}
   }
   next[index]=record;
   continue;
  }
  if(clean)next[index]=record;
  else if(kind==="wishlist"){
   // Keep unsynced local edits intact, including removals; remote data will
   // be adopted when the next verified save clears this pending marker.
   next[index]=existing;
   protectedCount++;
  }else protectedCount++;
 }
 workspace[prop]=next;
 return protectedCount;
}
async function autoLoadPublicSheets(){
 const cfg=window.POKEMON_GOOGLE_SHEETS||{};
 if(!cfg.spreadsheetId)return publicSheetNotice("Shared lists not configured",true);
 publicSheetNotice("Loading shared profiles & wish lists...");
 try{
  const [profileResult,wishlistResult]=await Promise.allSettled([
   publicSheetQuery(cfg.profilesTab||"Profiles").then(table=>publicSheetDocuments(table,"profile")),
   publicSheetQuery(cfg.wishlistsTab||"Wishlists").then(table=>publicSheetDocuments(table,"wishlist"))
  ]);
  const profiles=profileResult.status==="fulfilled"?profileResult.value:[],
        wishlists=wishlistResult.status==="fulfilled"?wishlistResult.value:[];
  const warnings=[];
  if(profileResult.status==="rejected")warnings.push("Profiles: "+profileResult.reason.message);
  if(wishlistResult.status==="rejected")warnings.push("Wishlists: "+wishlistResult.reason.message);
  if(!profiles.length&&!wishlists.length)throw new Error(warnings.join("; ")||"Spreadsheet has no readable profile or wish-list rows");
  const hasExistingStorage=!!localStorage.getItem(WORKSPACE_STORAGE_KEY);
  const previousBaseline=publicSheetBaseline();
  const protectedCount=(profileResult.status==="fulfilled"?mergePublicDocs("profile",profiles,previousBaseline,hasExistingStorage):0)+
    (wishlistResult.status==="fulfilled"?mergePublicDocs("wishlist",wishlists,previousBaseline,hasExistingStorage):0);
  // Save the source baseline, not the local merge, so subsequent browser edits
  // remain distinguishable from the last public read.
  const baseline={...previousBaseline};
  if(profileResult.status==="fulfilled")for(const p of profiles)baseline["profile:"+p.id]=JSON.stringify(p);
  if(wishlistResult.status==="fulfilled")for(const w of wishlists)baseline["wishlist:"+w.id]=JSON.stringify(w);
  localStorage.setItem(PUBLIC_SHEET_BASELINE_KEY,JSON.stringify(baseline));
  workspace=cleanWorkspace(workspace);
  saveWorkspace();
  refreshWorkspace();
  render();
  const count=profiles.length+wishlists.length;
  publicSheetNotice("Shared data loaded ("+count+" records)"+
   (protectedCount?"; "+protectedCount+" locally edited record(s) preserved":"")+
   (warnings.length?"; "+warnings.join("; "):""),warnings.length>0);
 }catch(err){
  publicSheetNotice("Google Sheets read failed: "+(err?.message||"Unknown read error")+". Browser-saved data is still available.",true);
  console.warn("Public Sheets read failed:",err);
 }
}
