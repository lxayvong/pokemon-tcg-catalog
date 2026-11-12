import test from "node:test";
import assert from "node:assert/strict";
import worker, {validateDocument,authorized,allowedId,docUrl} from "../src/index.js";

const env={APP_ORIGIN:"https://lxayvong.github.io",GH_OWNER:"lxayvong",GH_REPO:"pokemon-tcg-catalog"};
const sample={id:"laem",name:"Laem",profileId:"balanced",items:[{productId:"ptcg:evolving-skies:booster-box",name:"Booster Box",notes:"",quantity:1,desiredPrice:null}]};

test("repo document IDs cannot traverse directories",()=>{
 assert.equal(allowedId("laem"),true);
 for(const id of ["../private","laem/joe","laem.json","Laem","",null])assert.equal(allowedId(id),false);
 assert.equal(docUrl("wishlist","../private",env),null);
 assert.equal(docUrl("bad","laem",env),null);
 assert.match(docUrl("wishlist","laem",env),/\/data\/wishlists\/laem\.json$/);
});

test("approval is scoped per person and per profile",()=>{
 const admin={role:"admin"},editor={role:"editor",wishlists:["laem"],profiles:[]};
 assert.equal(authorized(admin,"wishlist","joe"),true);
 assert.equal(authorized(editor,"wishlist","laem"),true);
 assert.equal(authorized(editor,"wishlist","donny"),false);
 assert.equal(authorized(editor,"profile","balanced"),false);
 assert.equal(authorized(null,"wishlist","laem"),false);
});

test("wish-list data validation rejects mismatched IDs and duplicate products",()=>{
 assert.equal(validateDocument("wishlist","laem",sample),null);
 assert.match(validateDocument("wishlist","joe",sample),/Invalid document/);
 assert.match(validateDocument("wishlist","laem",{...sample,items:[sample.items[0],sample.items[0]]}),/duplicate/);
 assert.match(validateDocument("wishlist","laem",{...sample,items:[{...sample.items[0],quantity:0}]}),/quantity/);
 assert.match(validateDocument("wishlist","laem",{...sample,items:[{...sample.items[0],notes:"x".repeat(3001)}]}),/notes/);
});

test("profile threshold validation",()=>{
 const p={id:"balanced",name:"Balanced",strategy:"balanced",buyDiscountPct:35,considerDiscountPct:18,maxMsrpPremiumPct:20,maxPricePerPack:null,minScore:3};
 assert.equal(validateDocument("profile","balanced",p),null);
 assert.match(validateDocument("profile","balanced",{...p,buyDiscountPct:101}),/buyDiscountPct/);
 assert.match(validateDocument("profile","balanced",{...p,strategy:"unknown"}),/strategy/);
});

test("unauthenticated or unconfigured cloud saves fail closed",async()=>{
 const res=await worker.fetch(new Request("https://worker.example/api/save?kind=wishlist&id=laem",{method:"POST",headers:{"Origin":env.APP_ORIGIN,"Content-Type":"application/json"},body:JSON.stringify({document:sample})}),env);
 assert.equal(res.status,503);
 const payload=await res.json();
 assert.match(payload.error,/not configured/);
});

test("health endpoint works without secrets",async()=>{
 const res=await worker.fetch(new Request("https://worker.example/health"),env);
 assert.equal(res.status,200);
 assert.equal((await res.json()).ok,true);
});

test("unknown browser origin is rejected",async()=>{
 const res=await worker.fetch(new Request("https://worker.example/health",{headers:{Origin:"https://attacker.example"}}),env);
 assert.equal(res.status,403);
});

test("only configured website origin passes preflight",async()=>{
 const res=await worker.fetch(new Request("https://worker.example/api/save",{method:"OPTIONS",headers:{Origin:env.APP_ORIGIN}}),env);
 assert.equal(res.status,204);
 assert.equal(res.headers.get("access-control-allow-origin"),env.APP_ORIGIN);
});
