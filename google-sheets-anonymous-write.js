/* Anonymous shared saves via an owner-deployed Apps Script web app.
 * Google Sheets remains public Viewer; the endpoint alone has write privileges.
 * Requests intentionally use opaque no-CORS POST. Success is ONLY reported
 * after rereading the public Google Sheet and matching a unique request ID.
 */
const publicWriteState={busy:false};
function anonymousSaveURL(){
 const u=window.POKEMON_GOOGLE_SHEETS?.anonymousSaveUrl||"";
 return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u)?u:null;
}
function anonymousSaveReady(){return !!anonymousSaveURL();}
function anonymousSaveNotice(text,error=false){
 const el=document.getElementById("anonymous-save-status");
 if(el){el.textContent=text;el.dataset.status=error?"error":"ok";}
 if(typeof workspaceNotify==="function")workspaceNotify(text);
}
function makeRequestId(){
 const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);
 return "req-"+Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
}
async function anonymousSave(kind,requestedId=null){
 const id=requestedId||(kind==="profile"?currentProfile()?.id:currentWishlist()?.id);
 const doc=workspace[kind==="profile"?"profiles":"wishlists"].find(x=>x.id===id);
 if(!doc)return anonymousSaveNotice("Select a "+kind+" to save.",true);
 try{saveWorkspace();}catch(err){return anonymousSaveNotice("Local saving failed: "+err.message,true);}
 const url=anonymousSaveURL();
 if(!url){
  anonymousSaveNotice("✓ "+doc.name+" saved in this browser. Shared saving needs one-time owner setup.");
  return;
 }
 if(publicWriteState.busy)return anonymousSaveNotice("Another shared save is in progress. Try again.",true);
 const snapshot=JSON.parse(JSON.stringify(doc)),raw=JSON.stringify(snapshot);
 if(raw.length>45000)return anonymousSaveNotice("Wish list too large for a single shared sheet record.",true);
 const baseline=publicSheetBaseline();
 const key=kind+":"+id;
 const expected=Object.prototype.hasOwnProperty.call(baseline,key)?baseline[key]:"";
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
  let confirmed=false,conflict=false;
  const tab=kind==="profile"?(window.POKEMON_GOOGLE_SHEETS?.profilesTab||"Profiles"):(window.POKEMON_GOOGLE_SHEETS?.wishlistsTab||"Wishlists");
  for(let attempt=0;attempt<5;attempt++){
   await new Promise(r=>setTimeout(r,800+attempt*350));
   try{
    const table=await publicSheetQuery(tab);
    for(const row of table.rows||[]){
     if(String(row.c?.[0]?.v||"")!==id)continue;
     const content=String(row.c?.[2]?.v||"");
     const receipt=String(row.c?.[4]?.v||"");
     if(receipt===requestId&&content===raw){confirmed=true;break;}
     if(content!==expected&&receipt!==requestId)conflict=true;
    }
   }catch(error){console.warn("Shared save verification retry:",error.message);}
   if(confirmed)break;
  }
  if(confirmed){
   baseline[key]=raw;
   localStorage.setItem(PUBLIC_SHEET_BASELINE_KEY,JSON.stringify(baseline));
   anonymousSaveNotice("✓ "+doc.name+" saved to shared Google Sheets.");
   if(typeof showCatalogToast==="function")showCatalogToast(doc.name+" saved to shared Sheets");
  }else{
   anonymousSaveNotice(conflict
     ?"Shared save NOT confirmed: someone changed this "+kind+". Refresh shared data before retrying."
     :"Shared save submitted but NOT confirmed. Check sheet access/deployment and try again.",true);
  }
 }catch(error){anonymousSaveNotice("Shared save failed; browser copy retained: "+error.message,true);}
 finally{publicWriteState.busy=false;if(field)field.disabled=false;}
}
function setupAnonymousSaveUI(){
 const status=document.getElementById("anonymous-save-status");
 if(status)status.textContent=anonymousSaveReady()
  ?"Shared editing enabled. Anyone with this link can update the shared spreadsheet."
  :"Browser saving works. Shared saving awaits one-time Apps Script deployment.";
 const b=document.getElementById("anonymous-save-wishlist");
 if(b)b.onclick=()=>anonymousSave("wishlist");
}
