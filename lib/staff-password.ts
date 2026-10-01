import { database, passwordBootstrap } from './storage';
import { StaffAccessError,assertSameOrigin,staffError } from './staff';
const COOKIE='__Host-copa_staff';
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
export const digest=async(value:string)=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
export async function passwordHash(password:string,salt:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256));}
type PasswordConfig={hash:string,salt:string,revision:number,bootstrapRevision?:string};
export async function passwordConfig(){
 const db=database(),initial=passwordBootstrap();
 let row=await db.prepare("SELECT data FROM settings WHERE key='staff_password'").first<{data:string}>();
 if(!row){
  if(!initial.hash||!initial.salt)throw new Error('Contraseña sin configurar');
  await db.prepare("INSERT OR IGNORE INTO settings(key,data) VALUES('staff_password',?)").bind(JSON.stringify({hash:initial.hash,salt:initial.salt,revision:Number(initial.reset)||1,bootstrapRevision:initial.reset})).run();
  row=await db.prepare("SELECT data FROM settings WHERE key='staff_password'").first<{data:string}>();
 }
 const current=JSON.parse(row!.data) as PasswordConfig;
 if(initial.reset&&current.bootstrapRevision!==initial.reset){
  if(!initial.hash||!initial.salt)throw new Error('Contraseña sin configurar');
  const replacement={hash:initial.hash,salt:initial.salt,revision:Number(initial.reset),bootstrapRevision:initial.reset};
  await db.prepare("UPDATE settings SET data=? WHERE key='staff_password' AND data=?").bind(JSON.stringify(replacement),row!.data).run();
  row=await db.prepare("SELECT data FROM settings WHERE key='staff_password'").first<{data:string}>();
  return JSON.parse(row!.data) as PasswordConfig;
 }
 return current;
}
export async function passwordSession(request:Request){const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(!token||! /^[a-f0-9]{64}$/.test(token))return false;const row=await database().prepare('SELECT revision,expires_at FROM staff_sessions WHERE token_hash=?').bind(await digest(token)).first<{revision:number,expires_at:number}>();return !!row&&row.expires_at>Date.now()&&row.revision===(await passwordConfig()).revision;}
export async function passwordLogin(request:Request){try{assertSameOrigin(request);const db=database(),now=Date.now();const body:any=await request.json();const password=typeof body.password==='string'?body.password:'';const config=await passwordConfig();if(password.length>128||await passwordHash(password,config.salt)!==config.hash)throw new StaffAccessError(401,'Contraseña incorrecta.');const token=hex(crypto.getRandomValues(new Uint8Array(32)).buffer);await db.prepare('INSERT INTO staff_sessions(token_hash,expires_at,revision) VALUES(?,?,?)').bind(await digest(token),now+86400000,config.revision).run();await db.prepare('DELETE FROM staff_sessions WHERE expires_at<?').bind(now).run();return Response.json({ok:true},{headers:{'Set-Cookie':`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`,'Cache-Control':'private, no-store'}});}catch(e){return staffError(e);}}
export async function passwordLogout(request:Request){try{assertSameOrigin(request);const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(token)await database().prepare('DELETE FROM staff_sessions WHERE token_hash=?').bind(await digest(token)).run();return new Response(null,{status:303,headers:{Location:'/staff','Set-Cookie':`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,'Cache-Control':'private, no-store'}});}catch(e){return staffError(e);}}
