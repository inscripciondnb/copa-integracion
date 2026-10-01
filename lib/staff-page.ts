import { getChatGPTUser,chatGPTSignInPath,chatGPTSignOutPath,type ChatGPTUser } from '../app/chatgpt-auth';
import { authorizeStaff,StaffAccessError } from './staff';
import { documentHtml } from './document';
import { staffMembersDocument } from './staff-members-document';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]!));
function gate(message:string,signedIn:boolean,status:number){return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acceso del staff · Copa Integración</title><link rel="icon" href="/favicon.svg"><style>body{margin:0;background:#16110e;color:#f3eadb;font:16px/1.5 Arial,sans-serif;min-height:100vh;display:grid;place-items:center}.card{max-width:480px;margin:20px;padding:32px;border:1px solid #4c3b28;border-top:5px solid #c8272d;background:#201914}h1{font-size:28px;line-height:1.2;margin:10px 0 18px}small{color:#d4a94e}p{color:#beae9b}a{display:block;color:#d4a94e;margin-top:16px}.button{background:#d4a94e;color:#16110e;text-align:center;padding:13px 16px;font-weight:bold;text-decoration:none}.secondary{border:1px solid #4c3b28;background:transparent;color:#f3eadb}a:focus-visible{outline:3px solid #d4a94e;outline-offset:4px}</style></head><body><main class="card"><small>BOMBEROS URUGUAY · COPA INTEGRACIÓN 2026</small><h1>Acceso del staff</h1><p>${escape(message)}</p><form id="login"><label for="password">Contraseña del staff</label><input id="password" type="password" autocomplete="current-password" required maxlength="128" style="box-sizing:border-box;width:100%;padding:14px;margin:10px 0;font-size:18px"><button class="button" style="width:100%;border:0;cursor:pointer" type="submit">Ingresar al staff</button><p id="error" role="alert"></p></form><script>document.getElementById('login').addEventListener('submit',async function(e){e.preventDefault();const button=this.querySelector('button');button.disabled=true;try{const r=await fetch('/api/staff/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('password').value})});const p=await r.json();if(!r.ok)throw new Error(p.error||'No se pudo ingresar');location.href='/staff';}catch(e){document.getElementById('error').textContent=e.message;}finally{button.disabled=false;}});</script><a href="${chatGPTSignInPath('/staff/accesos')}" target="_top">Administrar contraseña (organizador)</a><a class="button secondary" href="/en-vivo">Ver competencia en vivo</a></main></body></html>`,{status,headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie'}});}
export async function renderStaffPage(request:Request,manage=false,user?:ChatGPTUser|null){
 const session=user===undefined?await getChatGPTUser():user;
 try{
 const identity=await authorizeStaff(session,request);
 if(manage&&identity.role!=='admin')throw new StaffAccessError(403,'Solo el organizador puede administrar la contraseña.');
 let html=manage?staffMembersDocument:documentHtml;
 if(!manage){
 const keys=['COPA_V14_OWN_CACHE','COPA_V14_OUTBOX','COPA_V14_ACC_CACHE'];
 for(const key of keys)html=html.replaceAll("'"+key+"'",JSON.stringify(key+'_'+identity.user.userId));
 if(identity.role==='admin'){
 const migrate=`for(const key of ${JSON.stringify(keys)}){try{const dest=key+'_'+${JSON.stringify(identity.user.userId)},value=localStorage.getItem(key);if(value!==null&&localStorage.getItem(dest)===null){localStorage.setItem(dest,value);localStorage.removeItem(key);}}catch{}}`;
 html=html.replace('"use strict";','"use strict";'+migrate);
 }
 }

 const account=`<div class="account-strip" style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--line,#4c3b28);padding:12px 0;margin-bottom:12px;font-size:14px"><span>${identity.role==='admin'?'Administrador':'Staff'} · ${escape(identity.user.email)}</span>${identity.role==='admin'?'<a href="/staff/accesos">Administrar contraseña</a>':''}${identity.role==='admin'?'<form method="post" action="/api/admin/logout"><button>Cerrar sesión del organizador</button></form>':''}<form method="post" action="/api/staff/logout" style="margin:0"><button type="submit">Cerrar sesión del staff</button></form></div>`;
 return new Response(html.replace('<div class="shell">','<div class="shell">'+account),{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie'}});
 }catch(e){return gate(e instanceof StaffAccessError?e.message:'No se pudo verificar el acceso. Reintentá en unos segundos.',!!session,e instanceof StaffAccessError?e.status:503);}
}
