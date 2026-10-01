import { getChatGPTUser, type ChatGPTUser } from '../app/chatgpt-auth';
import { handle } from './competition';
import { authorizeStaff, StaffAccessError, staffError, assertSameOrigin } from './staff';
export async function staffCompetitionApi(request:Request,user?:ChatGPTUser|null){
 try{
  const identity=await authorizeStaff(user===undefined?await getChatGPTUser():user,request);
  if(request.method==='POST'){
   assertSameOrigin(request);
   const payload:any=await request.clone().json();
   if(payload.accion==='configurar_sync'&&identity.role!=='admin')throw new StaffAccessError(403,'Solo el administrador puede configurar la sincronización.');
  }
  const response=await handle(request);
  response.headers.set('Cache-Control','private, no-store');
  return response;
 }catch(error){return staffError(error);}
}
