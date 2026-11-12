/* Install experience for the existing GitHub Pages catalog.
   Browser and Google Sheets syncing remain owned by the original app. */
(function(){
 const install=document.getElementById("pwa-install");
 const instructions=document.getElementById("pwa-install-help");
 const status=document.getElementById("pwa-install-status");
 if(!install||!instructions)return;
 let deferredPrompt=null;
 const standalone=()=>window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
 function setInstalled(){
  install.hidden=true;
  instructions.hidden=true;
  if(status)status.textContent="Installed";
 }
 if(standalone())setInstalled();
 window.addEventListener("beforeinstallprompt",event=>{
  event.preventDefault();
  deferredPrompt=event;
  if(!standalone()){
   install.hidden=false;
   instructions.hidden=true;
   if(status)status.textContent="Ready to install";
  }
 });
 window.addEventListener("appinstalled",()=>{
  deferredPrompt=null;
  setInstalled();
 });
 install.addEventListener("click",async()=>{
  if(!deferredPrompt){instructions.hidden=false;return;}
  const prompt=deferredPrompt;
  deferredPrompt=null;
  install.hidden=true;
  try{
   await prompt.prompt();
   const result=await prompt.userChoice;
   if(result?.outcome!=="accepted"&&!standalone()){
    instructions.hidden=false;
    if(status)status.textContent="Use Chrome's menu to install";
   }
  }catch(error){
   instructions.hidden=false;
   if(status)status.textContent="Use Chrome's menu to install";
   console.warn("PWA install prompt unavailable:",error);
  }
 });
 document.getElementById("pwa-help-toggle")?.addEventListener("click",()=>{
  instructions.hidden=!instructions.hidden;
 });
 if("serviceWorker" in navigator && location.protocol==="https:"){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js",{scope:"./"}).catch(err=>{
   console.warn("PWA offline screen registration failed:",err);
  }));
 }
})();
