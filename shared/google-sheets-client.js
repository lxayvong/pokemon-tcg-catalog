/* Shared Google Sheets client for the desktop catalog and Android PWA.
   Google Sheets is authoritative; this module never saves or caches wish-list data locally.
   Writes use the deployed Apps Script compare-and-swap endpoint, and are only
   considered confirmed when the public spreadsheet shows the exact saved JSON. */
(function(){
 "use strict";
 function config(){return window.POKEMON_GOOGLE_SHEETS||{}}
 function tab(kind){return kind==="profile"?(config().profilesTab||"Profiles"):(config().wishlistsTab||"Wishlists")}
 function cell(row,n){const v=row?.c?.[n]?.v;return v==null?"":String(v)}
 function query(sheetName){
  return new Promise((resolve,reject)=>{
   const id=config().spreadsheetId;
   if(!/^[A-Za-z0-9_-]{20,}$/.test(id||""))return reject(Error("Spreadsheet ID is not configured"));
   const callback="__pokemonSharedSheets_"+Math.random().toString(36).slice(2);
   const node=document.createElement("script");
   let finished=false;
   const timeout=setTimeout(()=>finish(Error("Google Sheets did not respond within 12 seconds")),12000);
   function finish(err,result){
    if(finished)return;finished=true;clearTimeout(timeout);delete window[callback];
    if(typeof node.remove==="function")node.remove();
    err?reject(err):resolve(result);
   }
   window[callback]=response=>{
    if(response?.status!=="ok"){
     const explanation=(response?.errors||[]).map(e=>e.detailed_message||e.message||e.reason).filter(Boolean).join("; ");
     return finish(Error(explanation||"Google Sheets returned an error"));
    }
    if(!Array.isArray(response.table?.rows))return finish(Error("Google Sheets returned no table rows"));
    finish(null,response.table);
   };
   node.onerror=()=>finish(Error("Google Sheets public read endpoint is unavailable"));
   node.src="https://docs.google.com/spreadsheets/d/"+encodeURIComponent(id)+"/gviz/tq?sheet="+
    encodeURIComponent(sheetName)+"&headers=0&tqx="+
    encodeURIComponent("out:json;responseHandler:"+callback)+"&_="+Date.now();
   document.head.appendChild(node);
  });
 }
 async function readDocument(kind,id){
  const table=await query(tab(kind));
  const matching=(table.rows||[]).filter(row=>cell(row,0).trim()===id);
  if(matching.length>1)throw Error("Multiple Google Sheets rows share ID '"+id+"'. Resolve duplicate rows before editing.");
  const raw=matching.length?cell(matching[0],2):"";
  let doc=null;
  if(raw){try{doc=JSON.parse(raw)}catch{throw Error("Google Sheets contains invalid JSON for "+id)}}
  if(doc&&(doc.id!==id||(kind==="wishlist"&&!Array.isArray(doc.items))))
   throw Error("Google Sheets contains an invalid "+kind+" document for "+id);
  return {raw,doc,updatedAt:matching.length?cell(matching[0],3):"",requestId:matching.length?cell(matching[0],4):""};
 }
 function saveUrl(){
  const url=config().anonymousSaveUrl||"";
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url))
   throw Error("Apps Script save endpoint is not configured");
  return url;
 }
 function requestId(){
  const bytes=crypto.getRandomValues(new Uint8Array(12));
  return "req-"+Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
 }
 async function writeDocument({kind,id,payload,expected,verify=true}){
  if(kind!=="profile"&&kind!=="wishlist")throw Error("Unknown document kind");
  if(!id)throw Error("No document ID selected");
  const raw=typeof payload==="string"?payload:JSON.stringify(payload);
  const currentExpected=typeof expected==="string"?expected:"";
  if(raw.length>45000)throw Error("Document exceeds Google Sheets' 45 KB save limit");
  if(raw===currentExpected)return {raw,confirmed:true,unchanged:true,requestId:null};
  const req=requestId();
  const body=new URLSearchParams({kind,id,payload:raw,expected:currentExpected,requestId:req});
  // no-cors gives an opaque response. It cannot establish whether Apps Script
  // accepted a POST. The only success signal is rereading the written JSON.
  await fetch(saveUrl(),{method:"POST",mode:"no-cors",body,cache:"no-store",redirect:"follow"});
  if(!verify)return {raw,confirmed:false,requestId:req};
  let lastError="",readFailures=0;
  for(const wait of [550,800,1100,1450,1900,2500,3300,4300]){
   await new Promise(resolve=>setTimeout(resolve,wait));
   try{
    const saved=await readDocument(kind,id);
    readFailures=0;
    if(saved.raw===raw)return {raw,confirmed:true,requestId:req,updatedAt:saved.updatedAt};
    if(saved.raw!==currentExpected){
     const err=Error("Conflict: another update changed the Google Sheets record. Browser edits were not confirmed.");
     err.code="conflict";
     throw err;
    }
    lastError="The saved document has not appeared in the public Google Sheet yet";
   }catch(e){
    if(e.code==="conflict")throw e;
    lastError=e.message;
    if(++readFailures>=2)break;
   }
  }
  const error=Error("Google Sheets save not confirmed: "+lastError);
  error.code="unconfirmed";
  throw error;
 }
 window.PokemonSheetsClient=Object.freeze({query,cell,tab,readDocument,writeDocument,saveUrl});
})();
