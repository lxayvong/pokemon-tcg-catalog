/* Public frontend adapter for the Cloudflare Worker.
 * Browser-only saves continue working when cloud sync isn't configured.
 * GitHub tokens never reside here; the worker grants a short-lived scoped session.
 */
const cloud = {url:"",session:null,user:null,sha:new Map(),loaded:new Set()};
function cloudSettings(){
 const url=(window.POKEMON_CLOUD_SAVE_URL||"").trim().replace(/\/+$/,"");
 if(!url)return null;
 try{const parsed=new URL(url);if(parsed.protocol!=="https:")return null;return parsed.origin;}catch{return null;}
}
function cloudStatus(message,kind="info"){const x=document.getElementById("cloud-status");if(x){x.textContent=message;x.dataset.status=kind;}}
function cloudCan(kind,id){
 const permissions=cloud.user?.permissions;if(!permissions)return false;
 if(permissions.role==="admin")return true;
 const scopes=kind==="wishlist"?permissions.wishlists:permissions.profiles;
 return Array.isArray(scopes)&&(scopes.includes("*")||scopes.includes(id));
}
function syncCloudControls(){
 const configured=!!cloud.url,authed=!!cloud.user;
 const login=document.getElementById("cloud-login"),logout=document.getElementById("cloud-logout");
 if(login)login.hidden=authed||!configured;
 if(logout)logout.hidden=!authed;
 for(const kind of ["wishlist","profile"]){
  const id=kind==="wishlist"?currentWishlist()?.id:currentProfile()?.id;
  const key=kind+":"+id;
  const load=document.getElementById("cloud-load-"+kind),save=document.getElementById("cloud-save-"+kind);
  const permitted=authed&&cloudCan(kind,id);
  if(load)load.disabled=!permitted;
  if(save){save.disabled=!permitted||!cloud.loaded.has(key);save.title=permitted&&!cloud.loaded.has(key)?"First load the shared version to establish its revision":"";}
 }
 const who=document.getElementById("cloud-user");
 if(who)who.textContent=authed?"Signed in: @"+cloud.user.login:configured?"Not signed in":"Cloud sync awaiting Worker setup";
}
async function cloudRequest(method,path,body=null){
 if(!cloud.url||!cloud.session?.token)throw Error("Sign in with an approved GitHub account first");
 const resp=await fetch(cloud.url+path,{method,headers:{"Authorization":"Bearer "+cloud.session.token,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store"});
 const data=await resp.json().catch(()=>({error:"Invalid API response"}));
 if(resp.status===401){cloud.session=null;cloud.user=null;sessionStorage.removeItem("pokemonCatalogCloudSession");syncCloudControls();}
 if(!resp.ok){const e=new Error(data.error||"GitHub sync failed ("+resp.status+")");e.status=resp.status;throw e;}
 return data;
}
async function cloudCheckSession(){
 if(!cloud.session)return;
 try{const result=await cloudRequest("GET","/api/me");cloud.user=result;cloudStatus("Connected to GitHub as @"+result.login+". Load a shared copy before saving.");}
 catch(e){cloud.user=null;cloudStatus("Sign-in expired or access denied: "+e.message,"error");}
 syncCloudControls();
}
function cloudBeginLogin(){
 if(!cloud.url)return cloudStatus("Cloud sync is not configured. Set the Worker URL in cloud-save-config.js.","error");
 const popup=window.open(cloud.url+"/auth/start","pokemon-catalog-github-signin","popup=yes,width=520,height=680");
 if(!popup)cloudStatus("Your browser blocked sign-in popup. Allow popups for this site.","error");
 else cloudStatus("Complete GitHub sign-in in the popup.");
}
async function cloudOnMessage(event){
 if(!cloud.url||event.origin!==cloud.url||event.data?.type!=="pokemon-catalog-auth")return;
 if(event.data.error){cloudStatus(event.data.error,"error");return;}
 if(typeof event.data.token!=="string")return;
 cloud.session={token:event.data.token,expiresAt:event.data.expiresAt};
 sessionStorage.setItem("pokemonCatalogCloudSession",JSON.stringify(cloud.session));
 cloud.sha.clear();cloud.loaded.clear();
 await cloudCheckSession();
}
function cloudIdentity(kind){const obj=kind==="wishlist"?currentWishlist():currentProfile();return obj&&{kind,id:obj.id,key:kind+":"+obj.id};}
async function cloudLoad(kind){
 const ref=cloudIdentity(kind);if(!ref)return cloudStatus("Select a "+kind+" first.","error");
 if(!cloudCan(ref.kind,ref.id))return cloudStatus("This account cannot edit that "+kind+".","error");
 if(!confirm("Load shared "+kind+" '"+ref.id+"' from GitHub? This replaces its current browser copy. Export your workspace first if you have unsaved changes."))return;
 try{
  cloudStatus("Loading "+kind+" from GitHub...");
  const response=await cloudRequest("GET","/api/document?kind="+encodeURIComponent(ref.kind)+"&id="+encodeURIComponent(ref.id));
  const saved=response.document;
  if(saved){
   if(saved.id!==ref.id||typeof saved.name!=="string")throw Error("Shared document is not valid");
   if(kind==="wishlist"){const i=workspace.wishlists.findIndex(w=>w.id===ref.id);if(i>=0)workspace.wishlists[i]={...saved,items:Array.isArray(saved.items)?saved.items:[]};}
   else{const i=workspace.profiles.findIndex(p=>p.id===ref.id);if(i>=0)workspace.profiles[i]={...saved};}
   saveWorkspace();refreshWorkspace();render();
  }
  cloud.sha.set(ref.key,response.sha||null);cloud.loaded.add(ref.key);
  syncCloudControls();
  cloudStatus(saved?"Loaded the latest shared "+kind+" and its GitHub revision. Edit, then click Save to GitHub.":"No shared file exists yet. You can now create it using Save to GitHub.","ok");
 }catch(e){cloudStatus("Load failed: "+e.message,"error");}
}
async function cloudSave(kind){
 const ref=cloudIdentity(kind);if(!ref)return cloudStatus("Select a "+kind+" first.","error");
 if(!cloudCan(ref.kind,ref.id))return cloudStatus("You aren't approved to edit this "+kind+".","error");
 if(!cloud.loaded.has(ref.key))return cloudStatus("Load shared copy first. This prevents overwriting someone else's work.","error");
 const source=kind==="wishlist"?currentWishlist():currentProfile();
 if(!source)return;
 const copy=JSON.parse(JSON.stringify(source));
 const btn=document.getElementById("cloud-save-"+kind);if(btn)btn.disabled=true;
 try{
  const result=await cloudRequest("POST","/api/save?kind="+encodeURIComponent(ref.kind)+"&id="+encodeURIComponent(ref.id),{document:copy,expectedSha:cloud.sha.get(ref.key)||null});
  if(!result.saved||!result.sha)throw Error("Commit response missing confirmation");
  cloud.sha.set(ref.key,result.sha);
  cloudStatus("Saved "+kind+" '"+source.name+"' to GitHub. Commit: "+(result.commit||"unknown").slice(0,8),"ok");
 }catch(e){cloudStatus((e.status===409?"Save conflict. Someone else updated this file; export local changes before reloading. ":"Save failed. ")+e.message,"error");}
 finally{syncCloudControls();}
}
function cloudLogout(){cloud.session=null;cloud.user=null;cloud.loaded.clear();cloud.sha.clear();sessionStorage.removeItem("pokemonCatalogCloudSession");cloudStatus("Signed out. Browser-only saving is still available.");syncCloudControls();}
function setupCloudUI(){
 cloud.url=cloudSettings();
 const login=document.getElementById("cloud-login"),logout=document.getElementById("cloud-logout");
 if(login)login.onclick=cloudBeginLogin;
 if(logout)logout.onclick=cloudLogout;
 for(const kind of ["wishlist","profile"]){
  const load=document.getElementById("cloud-load-"+kind),save=document.getElementById("cloud-save-"+kind);
  if(load)load.onclick=()=>cloudLoad(kind);
  if(save)save.onclick=()=>cloudSave(kind);
 }
 window.addEventListener("message",cloudOnMessage);
 try{cloud.session=JSON.parse(sessionStorage.getItem("pokemonCatalogCloudSession")||"null");}catch{cloud.session=null;}
 if(cloud.session?.expiresAt&&cloud.session.expiresAt<Date.now()){cloud.session=null;sessionStorage.removeItem("pokemonCatalogCloudSession");}
 syncCloudControls();
 if(!cloud.url)cloudStatus("Cloud save code is ready, but the Worker has not been deployed. Browser saving still works.");
 else if(cloud.session)cloudCheckSession();
 else cloudStatus("Sign in to GitHub to load and save shared wish lists and profiles.");
}
