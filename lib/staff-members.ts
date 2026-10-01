import type { ChatGPTUser } from '../app/chatgpt-auth';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { authorizeStaff, STAFF_OWNER_EMAIL, StaffAccessError, staffError, assertSameOrigin } from './staff';
import { database } from './storage';
import { passwordConfig,passwordHash } from './staff-password';
export async function staffMembersApi(request:Request,user?:ChatGPTUser|null){
 try{
 const identity=await authorizeStaff(user===undefined?await getChatGPTUser():user,request);
 if(identity.role!=='admin')throw new StaffAccessError(403,'Solo el administrador puede gestionar accesos del staff.');
 const db=database();
 if(request.method==='GET'){
 return Response.json({ok:true,owner:STAFF_OWNER_EMAIL,configured:true},{headers:{'Cache-Control':'private, no-store'}});
 }
 assertSameOrigin(request);
 const p:any=await request.json();
 const current=await passwordConfig();
 if(p.accion==='cambiar'){
 const password=typeof p.password==='string'?p.password:'';
 if(password.length<12||password.length>128)throw new StaffAccessError(400,'Usá una contraseña de entre 12 y 128 caracteres.');
 const salt=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
 await db.prepare("UPDATE settings SET data=? WHERE key='staff_password'").bind(JSON.stringify({...current,hash:await passwordHash(password,salt),salt,revision:Date.now()})).run();
 }else if(p.accion==='revocar'){
 await db.prepare("UPDATE settings SET data=? WHERE key='staff_password'").bind(JSON.stringify({...current,revision:Date.now()})).run();
 }else throw new StaffAccessError(400,'Operación no admitida.');
 await db.prepare("DELETE FROM staff_sessions WHERE token_hash NOT LIKE 'admin:%'").run();
 return Response.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return staffError(error);}
}
