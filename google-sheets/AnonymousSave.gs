/**
 * Anonymous public save endpoint for Pokémon catalog.
 * Bind this Apps Script to the specific spreadsheet: Extensions > Apps Script.
 * Deploy: Web app, Execute as Me, Access Anyone.
 *
 * Warning: anyone who knows the endpoint can overwrite shared profiles/lists.
 * Do not use for confidential, financial, or sensitive data.
 * Never expose an owner access token to the browser.
 */
const TAB_NAMES = {profile:"Profiles",wishlist:"Wishlists"};
const MAX_JSON = 45000;
const MAX_ITEMS = 350;
function output_(message,status) {
  return ContentService.createTextOutput(JSON.stringify({status:status||"ok",message:message}))
    .setMimeType(ContentService.MimeType.JSON);
}
function validId_(s){return typeof s==="string"&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(s);}
function validate_(kind,id,doc){
  if(!TAB_NAMES[kind]||!validId_(id)||!doc||doc.id!==id||typeof doc.name!=="string"||!doc.name.trim()||doc.name.length>80)return false;
  if(kind==="profile")return ["balanced","sealed","rip"].indexOf(doc.strategy)!==-1&&["buyDiscountPct","considerDiscountPct","maxMsrpPremiumPct","minScore"].every(k=>typeof doc[k]==="number"&&isFinite(doc[k])&&doc[k]>=0&&doc[k]<=300)&& (doc.maxPricePerPack==null||(typeof doc.maxPricePerPack==="number"&&isFinite(doc.maxPricePerPack)&&doc.maxPricePerPack>=0));
  if(!validId_(doc.profileId)||!Array.isArray(doc.items)||doc.items.length>MAX_ITEMS)return false;
  const ids={};
  for(const item of doc.items){
    if(!item||typeof item.productId!=="string"||item.productId.length>180||ids[item.productId]||typeof item.notes!=="string"||item.notes.length>3000||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>9999||item.desiredPrice!=null&&(typeof item.desiredPrice!=="number"||!isFinite(item.desiredPrice)||item.desiredPrice<0))return false;
    ids[item.productId]=true;
  }
  return true;
}
function doPost(e){
  // A LockService transaction serializes conflicting edits.
  // There is no identity-based authorization in this deliberately public service.
  if(!e||!e.parameter)return output_("Missing request","error");
  const kind=e.parameter.kind,id=e.parameter.id,raw=e.parameter.payload,expected=e.parameter.expected||"",requestId=e.parameter.requestId||"";
  if(!TAB_NAMES[kind]||!validId_(id)||!raw||raw.length>MAX_JSON||!/^[a-z0-9-]{12,80}$/.test(requestId))return output_("Invalid request","error");
  let doc;
  try{doc=JSON.parse(raw);}catch(ex){return output_("Invalid JSON","error");}
  if(!validate_(kind,id,doc))return output_("Invalid document","error");
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))return output_("Service busy","error");
  try{
    const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_NAMES[kind]);
    if(!sheet)return output_("Sheet tab does not exist","error");
    if(sheet.getMaxColumns()<5)sheet.insertColumnsAfter(sheet.getMaxColumns(),5-sheet.getMaxColumns());
    const last=Math.max(1,sheet.getLastRow()),rows=last>1?sheet.getRange(2,1,last-1,3).getValues():[];
    const pos=rows.findIndex(r=>String(r[0])===id);
    const present=pos>=0?String(rows[pos][2]||""):"";
    if(present!==expected)return output_("Conflict: document changed","conflict");
    const n=pos>=0?pos+2:last+1;
    sheet.getRange(n,1,1,5).setValues([[id,doc.name,raw,new Date().toISOString(),requestId]]);
    SpreadsheetApp.flush();
    return output_("Saved","ok");
  }catch(ex){
    console.error(ex);
    return output_("Save unavailable","error");
  }finally{lock.releaseLock();}
}
// No doGet route: public viewing already uses the Google Visualization read-only endpoint.
