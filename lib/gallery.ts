import { database,photoBucket } from './storage';
import { authorizeStaff,staffError,StaffAccessError,assertSameOrigin } from './staff';
import { getChatGPTUser,type ChatGPTUser } from '../app/chatgpt-auth';
const MAX=8*1024*1024;
function error(message:string,status:number){return Response.json({ok:false,error:message},{status,headers:{'Cache-Control':'no-store'}})}
function mimeOf(bytes:Uint8Array){
 if(bytes.length<16)return null;
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)&&new TextDecoder().decode(bytes.slice(12,16))==='IHDR')return 'image/png';
 if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')return 'image/webp';
 return null;
}
async function readUpload(request:Request){
 const maxBody=MAX+65536;if(Number(request.headers.get('content-length')||0)>maxBody)throw new StaffAccessError(413,'La foto debe pesar como máximo 8 MB.');
 if(!request.body)throw new StaffAccessError(400,'Seleccioná una foto.');
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBody){await reader.cancel();throw new StaffAccessError(413,'La foto debe pesar como máximo 8 MB.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();
}
export async function galleryApi(request:Request){
 try{
 const db=database();
 if(request.method==='GET'){
 const url=new URL(request.url),before=url.searchParams.get('before'),beforeId=url.searchParams.get('before_id');
 const query=before&&beforeId?db.prepare('SELECT id,author,created_at FROM gallery_photos WHERE created_at<? OR (created_at=? AND id<?) ORDER BY created_at DESC,id DESC LIMIT 41').bind(before,before,beforeId):db.prepare('SELECT id,author,created_at FROM gallery_photos ORDER BY created_at DESC,id DESC LIMIT 41');
 const found=(await query.all()).results;const more=found.length>40;const photos=found.slice(0,40),last:any=photos.at(-1);
 return Response.json({ok:true,photos:photos.map((p:any)=>({id:p.id,author:p.author,createdAt:p.created_at,url:'/api/galeria/foto/'+p.id})),nextCursor:more&&last?{createdAt:last.created_at,id:last.id}:null},{headers:{'Cache-Control':'no-store'}});
 }
 assertSameOrigin(request);
 const form=await readUpload(request);const file=form.get('foto');
 if(!(file instanceof File)||file.size<16)throw new StaffAccessError(400,'Seleccioná una foto JPG, PNG o WebP.');
 if(file.size>MAX)throw new StaffAccessError(413,'La foto debe pesar como máximo 8 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer()),mime=mimeOf(bytes);if(!mime)throw new StaffAccessError(400,'Formato de foto no admitido. Usá JPG, PNG o WebP.');
 const author=String(form.get('nombre')||'').trim().slice(0,80);const id=crypto.randomUUID(),key='copa-2026/'+id;const bucket=photoBucket();
 await bucket.put(key,bytes,{httpMetadata:{contentType:mime}});
 try{await db.prepare('INSERT INTO gallery_photos(id,object_key,mime,bytes,author,created_at) VALUES(?,?,?,?,?,?)').bind(id,key,mime,file.size,author,new Date().toISOString()).run();}
 catch(e){await bucket.delete(key);throw e;}
 return Response.json({ok:true,id,url:'/api/galeria/foto/'+id},{status:201,headers:{'Cache-Control':'no-store'}});
 }catch(e){if(e instanceof StaffAccessError)return error(e.message,e.status);console.error('Galería:',e);return error('No se pudo guardar o consultar la foto. Conservá el archivo y reintentá.',503);}
}
export async function galleryPhoto(id:string){
 try{
 if(!/^[0-9a-f-]{36}$/.test(id))return new Response('Foto no encontrada',{status:404});
 const row=await database().prepare('SELECT object_key,mime FROM gallery_photos WHERE id=?').bind(id).first<{object_key:string,mime:string}>();if(!row)return new Response('Foto no encontrada',{status:404});
 const object=await photoBucket().get(row.object_key);if(!object)return new Response('Foto no encontrada',{status:404});
 return new Response(object.body,{headers:{'Content-Type':row.mime,'Content-Disposition':'inline','X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=60','Content-Security-Policy':"default-src 'none'"}});
 }catch(e){console.error('Foto Copa:',e);return new Response('Foto temporalmente no disponible',{status:503});}
}
export async function staffGalleryApi(request:Request,user?:ChatGPTUser|null){
 try{
 await authorizeStaff(user===undefined?await getChatGPTUser():user,request);
 if(request.method==='GET')return galleryApi(request);
 assertSameOrigin(request);const p:any=await request.json();if(p.accion!=='quitar'||typeof p.id!=='string')throw new StaffAccessError(400,'Operación inválida');
 const db=database();const row=await db.prepare('SELECT object_key FROM gallery_photos WHERE id=?').bind(p.id).first<{object_key:string}>();if(!row)return Response.json({ok:true});
 await db.prepare('DELETE FROM gallery_photos WHERE id=?').bind(p.id).run();
 try{await photoBucket().delete(row.object_key)}catch(e){console.error('Limpieza de foto:',e);}
 return Response.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return staffError(e);}
}
