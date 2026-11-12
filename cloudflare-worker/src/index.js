/**
 * Cloudflare Worker: GitHub App OAuth + scoped, conflict-safe JSON commits.
 * NEVER expose GitHub credentials in the public GitHub Pages app.
 * Required secrets: GH_CLIENT_ID, GH_CLIENT_SECRET, GH_APP_ID,
 * GH_INSTALLATION_ID, GH_APP_PRIVATE_KEY (PKCS#8 PEM), SESSION_SECRET,
 * APPROVED_USERS (JSON keyed by numeric GitHub user ID).
 */
const API = "https://api.github.com";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const repoPath = kind => kind === "wishlist" ? "data/wishlists" : kind === "profile" ? "data/profiles" : null;
function json(value, status=200, extra={}) { return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...extra}}); }
function b64(bytes) { let out="";for(let i=0;i<bytes.length;i+=4096)out+=String.fromCharCode(...bytes.slice(i,i+4096));return btoa(out); }
function unb64(v) { return Uint8Array.from(atob(v),c=>c.charCodeAt(0)); }
function url64(bytes) { return b64(bytes).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function unurl64(value) { return unb64(value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=")); }
function encodeJson(obj) {return url64(encoder.encode(JSON.stringify(obj))); }
function decodeJson(s){return JSON.parse(decoder.decode(unurl64(s))); }
async function hmacKey(secret){return crypto.subtle.importKey("raw",encoder.encode(secret),"HMAC",false,["sign","verify"]); }
async function signedToken(payload,secret){const body=encodeJson(payload),sig=new Uint8Array(await crypto.subtle.sign("HMAC",await hmacKey(secret),encoder.encode(body)));return body+"."+url64(sig);}
async function verifyToken(token,secret){if(!token||token.length>8000)return null;const parts=token.split(".");if(parts.length!==2)return null;try{const ok=await crypto.subtle.verify("HMAC",await hmacKey(secret),unurl64(parts[1]),encoder.encode(parts[0]));if(!ok)return null;const obj=decodeJson(parts[0]);return obj.exp>Date.now()/1000?obj:null;}catch{return null;}}
function approvedUsers(env){try{const obj=JSON.parse(env.APPROVED_USERS||"{}");return obj&&typeof obj==="object"?obj:{};}catch{return {};}}
function authorized(user,kind,id){if(!user)return false;if(user.role==="admin")return true;const list=kind==="wishlist"?user.wishlists:user.profiles;return Array.isArray(list)&&(list.includes("*")||list.includes(id));}
function allowedId(id){return typeof id==="string"&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(id);}
function cors(response,req,env){const headers=new Headers(response.headers);if(req.headers.get("Origin")===env.APP_ORIGIN){headers.set("Access-Control-Allow-Origin",env.APP_ORIGIN);headers.set("Access-Control-Allow-Headers","Authorization, Content-Type");headers.set("Access-Control-Allow-Methods","GET,POST,OPTIONS");headers.set("Vary","Origin");}return new Response(response.body,{status:response.status,headers});}
async function identity(req,env){const match=/^Bearer ([A-Za-z0-9._-]+)$/.exec(req.headers.get("Authorization")||"");const token=match?await verifyToken(match[1],env.SESSION_SECRET):null;if(!token||token.iss!=="pokemon-tcg-catalog"||!Number.isSafeInteger(token.sub))return null;const grants=approvedUsers(env)[String(token.sub)];return grants?{id:token.sub,login:token.login,grants}:null;}
function githubHeaders(token){return {"Accept":"application/vnd.github+json","Authorization":"Bearer "+token,"User-Agent":"pokemon-tcg-catalog-cloud-save","X-GitHub-Api-Version":"2022-11-28"};}
async function fetchGitHub(url,init){const res=await fetch(url,init);const body=await res.json().catch(()=>({}));return {status:res.status,body};}
async function installationToken(env){
 // GitHub App signing key must be unencrypted PKCS#8; convert the private key locally before uploading.
 const pem=env.GH_APP_PRIVATE_KEY||"";
 const body=pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
 if(!body)throw new Error("GitHub App private key not configured");
 const key=await crypto.subtle.importKey("pkcs8",unb64(body),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const now=Math.floor(Date.now()/1000);
 const message=encodeJson({alg:"RS256",typ:"JWT"})+"."+encodeJson({iat:now-30,exp:now+540,iss:String(env.GH_APP_ID)});
 const sig=new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,encoder.encode(message)));
 const response=await fetchGitHub(API+"/app/installations/"+encodeURIComponent(env.GH_INSTALLATION_ID)+"/access_tokens",{method:"POST",headers:githubHeaders(message+"."+url64(sig)),body:JSON.stringify({repositories:[env.GH_REPO],permissions:{contents:"write"}})});
 if(response.status!==201||!response.body.token)throw new Error("GitHub installation authentication failed ("+response.status+")");
 return response.body.token;
}
function docUrl(kind,id,env){const directory=repoPath(kind);if(!directory||!allowedId(id))return null;return API+"/repos/"+encodeURIComponent(env.GH_OWNER)+"/"+encodeURIComponent(env.GH_REPO)+"/contents/"+directory+"/"+id+".json";}
async function readDoc(kind,id,env,token){const url=docUrl(kind,id,env);if(!url)return {status:400};const r=await fetchGitHub(url,{headers:githubHeaders(token)});if(r.status===404)return {status:404,sha:null,document:null};if(r.status!==200||typeof r.body.content!=="string")return {status:502};try{const content=decoder.decode(unb64(r.body.content.replace(/\s/g,"")));return {status:200,sha:r.body.sha,document:JSON.parse(content)};}catch{return {status:502};}}
function validateDocument(kind,id,document){
 if(!document||typeof document!=="object"||Array.isArray(document)||document.id!==id||typeof document.name!=="string"||document.name.trim().length<1||document.name.length>80)return "Invalid document ID or name";
 if(kind==="profile"){
  if(!["balanced","sealed","rip"].includes(document.strategy))return "Invalid strategy";
  for(const k of ["buyDiscountPct","considerDiscountPct","maxMsrpPremiumPct","minScore"]){if(!Number.isFinite(document[k])||document[k]<0||document[k]> (k==="maxMsrpPremiumPct"?300:k==="minScore"?10:95))return "Invalid "+k;}
  if(document.maxPricePerPack!=null&&(!Number.isFinite(document.maxPricePerPack)||document.maxPricePerPack<0||document.maxPricePerPack>10000))return "Invalid max price per pack";
 } else if(kind==="wishlist"){
  if(!allowedId(document.profileId||""))return "Invalid assigned profile";
  if(!Array.isArray(document.items)||document.items.length>500)return "Too many wish list items";
  const ids=new Set();
  for(const x of document.items){if(!x||typeof x.productId!=="string"||x.productId.length>160||ids.has(x.productId))return "Invalid or duplicate product";ids.add(x.productId);if(typeof x.notes!=="string"||x.notes.length>3000)return "Invalid notes";if(!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>9999)return "Invalid quantity";if(x.desiredPrice!=null&&(!Number.isFinite(x.desiredPrice)||x.desiredPrice<0||x.desiredPrice>1000000))return "Invalid desired price";}
 }else return "Invalid document type";
 return null;
}
const error=(message,status)=>json({error:message},status);
async function oauthStart(req,env){
 if(!env.GH_CLIENT_ID||!env.SESSION_SECRET)return error("OAuth not configured",503);
 const nonce=url64(crypto.getRandomValues(new Uint8Array(24))),exp=Math.floor(Date.now()/1000)+600;
 const state=await signedToken({nonce,exp},env.SESSION_SECRET);
 const u=new URL("https://github.com/login/oauth/authorize");
 u.searchParams.set("client_id",env.GH_CLIENT_ID);
 u.searchParams.set("redirect_uri",new URL(req.url).origin+"/auth/callback");
 u.searchParams.set("state",state);
 // GitHub App user authorization requests no general repo write permission.
 const headers=new Headers({"Location":u.toString(),"Cache-Control":"no-store"});
 headers.append("Set-Cookie","oauth_state="+nonce+"; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600");
 return new Response(null,{status:302,headers});
}
function authPopupMessage(payload,env){
 const msg=JSON.stringify(payload).replace(/</g,"\\u003c");
 const target=JSON.stringify(env.APP_ORIGIN);
 const html='<!doctype html><meta charset="utf-8"><title>Catalog sign in</title><p>You can close this window.</p><script>if(window.opener){window.opener.postMessage('+msg+','+target+');window.close();}else{document.body.textContent="Sign-in window must be opened from the catalog.";}<\\/script>';
 return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
}
async function oauthCallback(req,env){
 const u=new URL(req.url),code=u.searchParams.get("code"),state=u.searchParams.get("state");
 const cookie=/\boauth_state=([^;]+)/.exec(req.headers.get("Cookie")||"")?.[1];
 const verified=await verifyToken(state,env.SESSION_SECRET);
 if(!cookie||!verified||cookie!==verified.nonce||!code)return error("Invalid or expired OAuth state",400);
 const exchange=await fetchGitHub("https://github.com/login/oauth/access_token",{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json","User-Agent":"pokemon-tcg-catalog-cloud-save"},body:JSON.stringify({client_id:env.GH_CLIENT_ID,client_secret:env.GH_CLIENT_SECRET,code,redirect_uri:new URL(req.url).origin+"/auth/callback"})});
 if(exchange.status!==200||!exchange.body.access_token)return error("GitHub sign-in failed",401);
 const who=await fetchGitHub(API+"/user",{headers:githubHeaders(exchange.body.access_token)});
 const id=who.body.id,grant=approvedUsers(env)[String(id)];
 if(who.status!==200||!Number.isSafeInteger(id)||!grant)return authPopupMessage({type:"pokemon-catalog-auth",error:"GitHub account is not on the approved list."},env);
 const exp=Math.floor(Date.now()/1000)+3600;
 const session=await signedToken({iss:"pokemon-tcg-catalog",sub:id,login:who.body.login,exp},env.SESSION_SECRET);
 return authPopupMessage({type:"pokemon-catalog-auth",token:session,login:who.body.login,expiresAt:exp*1000},env);
}
async function apiRoute(req,env){
 if(!env.GH_OWNER||!env.GH_REPO||!env.GH_INSTALLATION_ID||!env.GH_APP_ID||!env.GH_APP_PRIVATE_KEY||!env.APPROVED_USERS||!env.SESSION_SECRET)return error("Worker not configured; see deployment README",503);
 const user=await identity(req,env);
 if(!user)return error("Please sign in as an approved GitHub user",401);
 const url=new URL(req.url);
 if(url.pathname==="/api/me")return json({id:user.id,login:user.login,permissions:user.grants});
 const kind=url.searchParams.get("kind"),id=url.searchParams.get("id");
 if(!repoPath(kind)||!allowedId(id))return error("Invalid document path",400);
 if(!authorized(user.grants,kind,id))return error("Not permitted to access this document",403);
 let token;try{token=await installationToken(env);}catch(e){console.error(e);return error("Repository authentication unavailable",502);}
 if(req.method==="GET"&&url.pathname==="/api/document"){
  const r=await readDoc(kind,id,env,token);
  if(r.status===404)return json({document:null,sha:null},200);
  if(r.status!==200)return error("GitHub read failed",502);
  return json({document:r.document,sha:r.sha});
 }
 if(req.method==="POST"&&url.pathname==="/api/save"){
  const size=Number(req.headers.get("Content-Length")||0);if(size>140000)return error("Document too large",413);
  let payload;try{const body=await req.text();if(body.length>140000)return error("Document too large",413);payload=JSON.parse(body);}catch{return error("Invalid JSON",400);}
  const doc=payload.document,expectedSha=payload.expectedSha??null;
  const err=validateDocument(kind,id,doc);if(err)return error(err,400);
  if(expectedSha!==null&&(!/^[0-9a-f]{40}$/.test(expectedSha)))return error("Invalid expected SHA",400);
  const current=await readDoc(kind,id,env,token);
  if(current.status!==200&&current.status!==404)return error("Cannot validate repository version",502);
  if((current.sha||null)!==expectedSha)return json({error:"Conflict: list was updated by someone else. Reload the shared version before saving.",latestSha:current.sha},409);
  const url=docUrl(kind,id,env);
  const document={...doc,schemaVersion:1};
  const content=b64(encoder.encode(JSON.stringify(document,null,2)+"\n"));
  const body={message:"Update "+kind+" "+id+" by @"+user.login,content,branch:"main"};
  if(expectedSha)body.sha=expectedSha;
  const result=await fetchGitHub(url,{method:"PUT",headers:{...githubHeaders(token),"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(result.status===409||result.status===422)return json({error:"GitHub update conflict. Fetch the latest shared version before retrying."},409);
  if(result.status!==200&&result.status!==201){console.error("GitHub save status",result.status);return error("GitHub did not accept the commit",502);}
  return json({saved:true,sha:result.body.content?.sha,commit:result.body.commit?.sha,url:result.body.commit?.html_url});
 }
 return error("Unknown API route",404);
}
export default {async fetch(req,env){
 const url=new URL(req.url),origin=req.headers.get("Origin");
 if(req.method==="OPTIONS"){if(origin!==env.APP_ORIGIN)return error("Origin denied",403);return cors(new Response(null,{status:204}),req,env);}
 if(origin&&origin!==env.APP_ORIGIN)return error("Origin denied",403);
 try{
  let r;
  if(url.pathname==="/health"&&req.method==="GET")r=json({ok:true,service:"pokemon-tcg-catalog-cloud-save"});
  else if(url.pathname==="/auth/start"&&req.method==="GET")r=await oauthStart(req,env);
  else if(url.pathname==="/auth/callback"&&req.method==="GET")r=await oauthCallback(req,env);
  else if(url.pathname.startsWith("/api/"))r=await apiRoute(req,env);
  else r=error("Not found",404);
  return cors(r,req,env);
 }catch(e){console.error("Worker unexpected error",e);return cors(error("Unexpected server error",500),req,env);}
}};
