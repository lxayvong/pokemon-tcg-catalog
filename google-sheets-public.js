/* Read-only, signed-out Google Sheets loader.
 * Google Visualization responses require a spreadsheet explicitly shared with
 * Anyone with the link (Viewer). It does not grant write permissions.
 * Local edits are preserved when they differ from the last loaded snapshot.
 */
const PUBLIC_SHEET_BASELINE_KEY="pokemonCatalogPublicSheetsBaselineV1";
const publicSheetsState={status:"idle"};
function publicSheetNotice(msg,error=false){
 publicSheetsState.status=error?"error":"ready";
 const header=document.getElementById("public-data-status");if(header)header.textContent=msg;
 const lower=document.getElementById("public-sheet-status");if(lower)lower.textContent=msg;
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
  const source="https://docs.google.com/spreadsheets/d/"+encodeURIComponent(id)+"/gviz/tq?sheet="+encodeURIComponent(sheetName)+"&headers=1&tqx="+encodeURIComponent("out:json;responseHandler:"+callback);
  let complete=false;
  const finish=(err,table)=>{if(complete)return;complete=true;clearTimeout(timer);delete window[callback];script.remove();err?reject(err):resolve(table);};
  const timer=setTimeout(()=>finish(new Error("Google Sheets did not respond; check public Viewer access")),9000);
  window[callback]=res=>{
   if(res?.status!=="ok"||!res.table?.rows)return finish(new Error("Spreadsheet is unavailable for anonymous viewing"));
   finish(null,res.table);
  };
  script.onerror=()=>finish(new Error("Google Sheets public read failed"));
  script.src=source;
  document.head.appendChild(script);
 });
}
function publicSheetDocuments(table,label){
 const docs=[];
 for(const row of table.rows||[]){
  const cells=row.c||[],id=String(cells[0]?.v??"").trim();
  if(!id||id==="ID")continue;
  const content=cells[2]?.v;
  if(typeof content!=="string")continue;
  try{
   const documentValue=JSON.parse(content);
   if(!documentValue||documentValue.id!==id||typeof documentValue.name!=="string")continue;
   if(label==="wishlist"&&!Array.isArray(documentValue.items))continue;
   if(label==="profile"&&!["balanced","sealed","rip"].includes(documentValue.strategy))continue;
   docs.push(documentValue);
  }catch{ /* Ignore invalid row, never execute cell content. */ }
 }
 return docs;
}
function initialDocumentUnmodified(kind,local){
 if(kind==="wishlist")return Array.isArray(local.items)&&local.items.length===0;
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
  if(clean)next[index]=record;
  else protectedCount++;
 }
 workspace[prop]=next;
 return protectedCount;
}
async function autoLoadPublicSheets(){
 const cfg=window.POKEMON_GOOGLE_SHEETS||{};
 if(!cfg.spreadsheetId)return publicSheetNotice("Shared lists not configured",true);
 publicSheetNotice("Loading shared profiles & wish lists...");
 try{
  const [profileTable,wishlistTable]=await Promise.all([
   publicSheetQuery(cfg.profilesTab||"Profiles"),publicSheetQuery(cfg.wishlistsTab||"Wishlists")
  ]);
  const profiles=publicSheetDocuments(profileTable,"profile"),wishlists=publicSheetDocuments(wishlistTable,"wishlist");
  if(!profiles.length&&!wishlists.length)throw new Error("Spreadsheet has no readable profile or wish-list rows");
  const hasExistingStorage=!!localStorage.getItem(WORKSPACE_STORAGE_KEY);
  const previousBaseline=publicSheetBaseline();
  const protectedCount=mergePublicDocs("profile",profiles,previousBaseline,hasExistingStorage)+
    mergePublicDocs("wishlist",wishlists,previousBaseline,hasExistingStorage);
  // Save the source baseline, not the local merge, so subsequent browser edits
  // remain distinguishable from the last public read.
  const baseline={};
  for(const p of profiles)baseline["profile:"+p.id]=JSON.stringify(p);
  for(const w of wishlists)baseline["wishlist:"+w.id]=JSON.stringify(w);
  localStorage.setItem(PUBLIC_SHEET_BASELINE_KEY,JSON.stringify(baseline));
  workspace=cleanWorkspace(workspace);
  saveWorkspace();
  refreshWorkspace();
  render();
  const count=profiles.length+wishlists.length;
  publicSheetNotice(protectedCount
   ?"Shared data loaded ("+count+" records); "+protectedCount+" locally edited record(s) kept"
   :"Shared data loaded ("+count+" records)");
 }catch(err){
  publicSheetNotice("Shared data unavailable; using locally saved lists",true);
  console.warn("Public Sheets read skipped:",err.message);
 }
}
