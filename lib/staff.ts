import { getChatGPTUser, type ChatGPTUser } from '../app/chatgpt-auth';
import { passwordSession } from './staff-password';
import {adminSession} from './admin';
export const STAFF_OWNER_EMAIL='mmgago.dnb@gmail.com';
export type StaffIdentity={role:'admin'|'staff';user:ChatGPTUser};
export class StaffAccessError extends Error{constructor(public status:number,message:string,public code:string=status===401?'AUTH_REQUIRED':'FORBIDDEN'){super(message)}}
export async function authorizeStaff(user:ChatGPTUser|null,request?:Request):Promise<StaffIdentity>{
 if(request&&await adminSession(request))return {role:'admin',user:{userId:'portable-admin',email:'Organizador',displayName:'Organizador',fullName:null}};
 if(request&&await passwordSession(request))return {role:'staff',user:{userId:'password-staff',email:'Acceso con contraseña',displayName:'Staff',fullName:null}};
 throw new StaffAccessError(401,'Ingresá la contraseña del staff.');
}
export async function requireStaff(request:Request){return authorizeStaff(await getChatGPTUser(),request);}
export function staffError(error:unknown){const status=error instanceof StaffAccessError?error.status:503;const message=error instanceof StaffAccessError?error.message:'No se pudo verificar el acceso. Reintentá en unos segundos.';return Response.json({ok:false,error:message,code:error instanceof StaffAccessError?error.code:'UNAVAILABLE',signIn:'/staff'},{status,headers:{'Cache-Control':'private, no-store'}});}
export function assertSameOrigin(request:Request){if(request.headers.get('origin')!==new URL(request.url).origin)throw new StaffAccessError(403,'Origen de solicitud inválido');}
