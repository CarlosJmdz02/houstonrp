const fs = require('fs');
let h = fs.readFileSync('app.html', 'utf8');
h = h.replace('<script src="assets/auth.js"></script>', '');
h = h.replace(/<script>\s*\(function\(\)\s*\{\s*const session = typeof hrpGetSession[\s\S]*?<\/script>/, '');
const stub = '<script>window.hrpGetSession=()=>({id:"1",username:"test"});window.hrpCheckGuildMembership=async()=>true;window.supaSingle=async()=>null;window.supaSelect=async()=>[];window.supaInsert=async()=>null;window.hrpGetSb=()=>null;window.addEventListener("error",e=>{document.title="ERR:"+e.message;});(function(){const i=new Image();i.onload=()=>{document.title="IMG_OK";};i.onerror=()=>{document.title="IMG_FAIL";};i.src="images/image.png";})();</script>';
h = h.replace('<script src="assets/license-canvas.js"></script>', stub + '<script src="assets/license-canvas.js"></script>');
fs.writeFileSync('_apptest.html', h);
console.log('written');
