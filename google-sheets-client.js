/* Google Sheets shared storage for decision profiles and wish lists.
 * Google Identity Services authorizes the person; Sheets enforces spreadsheet
 * sharing. No client secret, service-account key or access token is persisted.
 * One document per row limits overwrites to the selected list/profile.
 */
const gs={token:null,expiresAt:0,baseline:new Map(),loaded:false,busy:false};
function gsConfig(){
 const c=window.POKEMON_GOOGLE_SHEETS||{};
 if(!/^[a-zA-Z0-9_.-]+\.apps\.googleusercontent\.com$/.test(c.clientId||""))return null;
 if(!/^[A-Za-z0-9_-]{20,}$/.test(c.spreadsheetId||""))return null;
 return {clientId:c.clientId,spreadsheetId:c.spreadsheetId,profilesTab:c.profilesTab||"Profiles",wishlistsTab:c.wishlistsTab||"Wishlists"};
}
function gsStatus(message,error=false){
 const el=document.getElementById("sheets-status");
 if(el){el.textContent=message;el.dataset.status=error?"error":"info";}
}
function gsControls(){
 const config=gsConfig(),connected=!!gs.token&&gs.expiresAt>Date.now();
 const ids=["sheets-connect","sheets-disconnect","sheets-init","sheets-load","sheets-save-profile","sheets-save-wishlist"];
 for(const id of ids){const x=document.getElementById(id);if(!x)continue;
  if(id==="sheets-connect")x.disabled=!config||gs.busy;
  else x.disabled=!connected||gs.busy||(id.startsWith("sheets-save-")&&!gs.loaded);
 }
 const state=document.getElementById("sheets-connection");
 if(state)state.textContent=!config?"Google Sheets setup required":connected?"Connected to Google Sheets":"Not connected";
}
async function gsConnect(){
 const cfg=gsConfig();if(!cfg)return gsStatus("Configure the Google client ID and spreadsheet ID first.",true);
 if(!window.google?.accounts?.oauth2?.initTokenClient)return gsStatus("Google sign-in library not loaded. Check connectivity and refresh.",true);
 if(gs.busy)return;
 gs.busy=true;gsControls();
 try{
  const token=await new Promise((resolve,reject)=>{
   const client=google.accounts.oauth2.initTokenClient({
    client_id:cfg.clientId,scope:"https://www.googleapis.com/auth/spreadsheets",
    callback:r=>r?.error?reject(new Error(r.error_description||r.error)):resolve(r),
    error_callback:e=>reject(new Error(e?.message||e?.type||"Google sign-in closed"))
   });
   client.requestAccessToken({prompt:gs.token?"":"consent"});
  });
  if(!token?.access_token)throw Error("Google did not return an access token");
  gs.token=token.access_token;
  gs.expiresAt=Date.now()+Math.max(60,Number(token.expires_in)||3600)*1000-30000;
  gsStatus("Google access granted. Click Load from Sheets to view the current shared data.");
 }catch(e){gsStatus("Google connection failed: "+e.message,true);}
 finally{gs.busy=false;gsControls();}
}
function gsDisconnect(){
 if(gs.token&&window.google?.accounts?.oauth2?.revoke)google.accounts.oauth2.revoke(gs.token,()=>{});
 gs.token=null;gs.expiresAt=0;gs.loaded=false;gs.baseline.clear();
 gsStatus("Disconnected. Local browser work remains available.");
 gsControls();
}
async function gsApi(path,method="GET",body=null){
 const cfg=gsConfig();if(!cfg)throw Error("Google Sheets configuration is missing");
 if(!gs.token||gs.expiresAt<=Date.now())throw Error("Google access expired. Click Connect to Google again.");
 const res=await fetch("https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(cfg.spreadsheetId)+path,{
  method,headers:{"Authorization":"Bearer "+gs.token,...(body?{"Content-Type":"application/json"}:{})},
  body:body?JSON.stringify(body):undefined,cache:"no-store"
 });
 const payload=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(payload.error?.message||"Google Sheets API error "+res.status);
 return payload;
}
const gsKindTab=kind=>kind==="profile"?gsConfig()?.profilesTab:kind==="wishlist"?gsConfig()?.wishlistsTab:null;
const gsRange=(tab,range)=>encodeURIComponent("'"+tab.replace(/'/g,"''")+"'!"+range);
const gsKey=(kind,id)=>kind+":"+id;
function gsReadRows(result,kind){
 const values=result?.values||[],out=[];
 for(let i=0;i<values.length;i++){
  const row=values[i]||[],id=String(row[0]||"").trim();
  if(!id)continue;
  let doc;try{doc=JSON.parse(String(row[2]||""))}catch{throw Error("Invalid JSON in "+gsKindTab(kind)+" row "+(i+2));}
  if(!doc||doc.id!==id||typeof doc.name!=="string")throw Error("Invalid document in "+gsKindTab(kind)+" row "+(i+2));
  out.push({id,doc,row:i+2,raw:String(row[2])});
 }
 return out;
}
async function gsGetRows(kind){
 const tab=gsKindTab(kind);if(!tab)throw Error("Unknown document type");
 const value=await gsApi("/values/"+gsRange(tab,"A2:D"));
 return gsReadRows(value,kind);
}
async function gsEnsureTabs(){
 const cfg=gsConfig();
 const metadata=await gsApi("?fields=sheets(properties(title))");
 const existing=new Set((metadata.sheets||[]).map(s=>s.properties.title));
 const missing=[cfg.profilesTab,cfg.wishlistsTab].filter(x=>!existing.has(x));
 if(missing.length){
  await gsApi(":batchUpdate","POST",{requests:missing.map(title=>({addSheet:{properties:{title}}}))});
 }
 // Initialize headers and only empty tabs, never overwrite populated rows.
 const writes=[];
 for(const kind of ["profile","wishlist"]){
  const tab=gsKindTab(kind),data=await gsApi("/values/"+gsRange(tab,"A1:D1"));
  if(!(data.values||[]).length){
   writes.push({range:"'"+tab.replace(/'/g,"''")+"'!A1:D1",values:[["ID","Name","JSON","Updated UTC"]]});
  }
 }
 if(writes.length)await gsApi("/values:batchUpdate","POST",{valueInputOption:"RAW",data:writes});
 const seeded=[];
 for(const kind of ["profile","wishlist"]){
  const existingRows=await gsGetRows(kind);
  if(existingRows.length)continue;
  const docs=kind==="profile"?workspace.profiles:workspace.wishlists;
  if(!docs.length)continue;
  const tab=gsKindTab(kind);
  const records=docs.map(d=>[d.id,d.name,JSON.stringify(d),new Date().toISOString()]);
  await gsApi("/values/"+gsRange(tab,"A1:D")+":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS","POST",{values:records});
  seeded.push(kind+"s");
 }
 return seeded;
}
async function gsInitialize(){
 if(!confirm("Initialize the configured Google spreadsheet? This adds Profiles/Wishlists tabs if needed and seeds empty tabs from your current browser data. Existing rows are preserved."))return;
 if(gs.busy)return;gs.busy=true;gsControls();
 try{
  const seeded=await gsEnsureTabs();
  gs.loaded=false;gs.baseline.clear();
  gsStatus("Spreadsheet initialized"+(seeded.length?" with "+seeded.join(" and "):"")+". Click Load from Sheets to begin.");
 }catch(e){gsStatus("Initialization failed: "+e.message,true);}
 finally{gs.busy=false;gsControls();}
}
async function gsLoad(){
 if(gs.busy)return;
 if(!confirm("Replace your current browser profiles and wish lists with the shared Google Sheet? Export your current workspace first if you have unsaved changes."))return;
 gs.busy=true;gsControls();
 try{
  const [profiles,wishlists]=await Promise.all([gsGetRows("profile"),gsGetRows("wishlist")]);
  if(!profiles.length&&!wishlists.length)throw Error("No saved entries found. Click Initialize spreadsheet first.");
  const prevProfile=workspace.activeProfileId,prevList=workspace.activeWishlistId;
  const next=cleanWorkspace({schemaVersion:1,profiles:profiles.map(x=>x.doc),wishlists:wishlists.map(x=>x.doc),
   activeProfileId:prevProfile,activeWishlistId:prevList});
  workspace=next;
  if(!workspace.profiles.some(p=>p.id===workspace.activeProfileId))workspace.activeProfileId=workspace.profiles[0]?.id;
  if(!workspace.wishlists.some(w=>w.id===workspace.activeWishlistId))workspace.activeWishlistId=workspace.wishlists[0]?.id||null;
  saveWorkspace();gs.baseline.clear();
  for(const r of profiles)gs.baseline.set(gsKey("profile",r.id),r.raw);
  for(const r of wishlists)gs.baseline.set(gsKey("wishlist",r.id),r.raw);
  gs.loaded=true;refreshWorkspace();render();
  gsStatus("Loaded "+profiles.length+" decision profiles and "+wishlists.length+" wish lists from Google Sheets.");
 }catch(e){gsStatus("Load failed: "+e.message,true);}
 finally{gs.busy=false;gsControls();}
}
async function gsSave(kind){
 if(!gs.loaded)return gsStatus("Load from Sheets first to prevent overwriting others' changes.",true);
 if(gs.busy)return;
 const doc=kind==="profile"?currentProfile():currentWishlist();
 if(!doc)return gsStatus("Select an entry to save.",true);
 const tab=gsKindTab(kind),key=gsKey(kind,doc.id);
 const data=JSON.parse(JSON.stringify(doc));
 const raw=JSON.stringify(data);
 if(raw.length>45000)return gsStatus("This list is too large for one Google Sheets cell. Export JSON or split it before saving.",true);
 gs.busy=true;gsControls();
 try{
  const rows=await gsGetRows(kind),existing=rows.find(r=>r.id===doc.id);
  const baseline=gs.baseline.has(key)?gs.baseline.get(key):null;
  if((existing?.raw||null)!==baseline){
   throw Error("Conflict: someone changed "+doc.name+" in Google Sheets after your last Load. Export local changes before reloading.");
  }
  const values=[[doc.id,doc.name,raw,new Date().toISOString()]];
  if(existing){
   await gsApi("/values/"+gsRange(tab,"A"+existing.row+":D"+existing.row)+"?valueInputOption=RAW","PUT",{values});
  }else{
   await gsApi("/values/"+gsRange(tab,"A1:D")+":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS","POST",{values});
  }
  gs.baseline.set(key,raw);
  gsStatus(doc.name+" saved to Google Sheets successfully.");
 }catch(e){gsStatus("Save failed: "+e.message,true);}
 finally{gs.busy=false;gsControls();}
}
function setupGoogleSheetsUI(){
 const connect=document.getElementById("sheets-connect"),disconnect=document.getElementById("sheets-disconnect");
 const init=document.getElementById("sheets-init"),load=document.getElementById("sheets-load");
 if(connect)connect.onclick=gsConnect;
 if(disconnect)disconnect.onclick=gsDisconnect;
 if(init)init.onclick=gsInitialize;
 if(load)load.onclick=gsLoad;
 const p=document.getElementById("sheets-save-profile"),w=document.getElementById("sheets-save-wishlist");
 if(p)p.onclick=()=>gsSave("profile");
 if(w)w.onclick=()=>gsSave("wishlist");
 gsControls();
 gsStatus(gsConfig()?"Connect Google to read and save shared data. Changes remain local until you click Save.":"Google Sheets is ready in code. Add the public OAuth client ID and spreadsheet ID to google-sheets-config.js.");
}
