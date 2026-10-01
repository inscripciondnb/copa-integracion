import {env} from 'cloudflare:workers';
import {renderStaffPage} from './lib/staff-page';
import {staffCompetitionApi} from './lib/staff-api';
import {staffMembersApi} from './lib/staff-members';
import {passwordLogin,passwordLogout} from './lib/staff-password';
import {galleryApi,galleryPhoto,staffGalleryApi} from './lib/gallery';
import {publicSnapshot} from './lib/competition';
import {liveDocument} from './lib/live-document';
import {adminLogin,adminLogout,adminDocument} from './lib/admin';
export default {async fetch(request:Request){const url=new URL(request.url),p=url.pathname.replace(/\/$/,'')||'/',method=request.method;
try{
 if(method==='GET'&&(p==='/'||p==='/staff'))return renderStaffPage(request);
 if(method==='GET'&&p==='/staff/accesos')return renderStaffPage(request,true);
 if(method==='GET'&&p==='/admin')return new Response(adminDocument,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'private,no-store'}});
 if(method==='GET'&&p==='/en-vivo')return new Response(liveDocument,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'}});
 if(method==='GET'&&p==='/api/publico')return Response.json(await publicSnapshot(),{headers:{'Cache-Control':'no-store'}});
 if(method==='POST'&&p==='/api/admin/login')return adminLogin(request);
 if(method==='POST'&&p==='/api/admin/logout')return adminLogout(request);
 if(method==='POST'&&p==='/api/staff/login')return passwordLogin(request);
 if(method==='POST'&&p==='/api/staff/logout')return passwordLogout(request);
 if(['GET','POST'].includes(method)&&p==='/api/copa')return staffCompetitionApi(request);
 if(['GET','POST'].includes(method)&&p==='/api/staff')return staffMembersApi(request);
 if(['GET','POST'].includes(method)&&p==='/api/staff/galeria')return staffGalleryApi(request);
 if(['GET','POST'].includes(method)&&p==='/api/galeria')return galleryApi(request);
 if(method==='GET'&&p.startsWith('/api/galeria/foto/'))return galleryPhoto(decodeURIComponent(p.slice('/api/galeria/foto/'.length)));
 if(p.startsWith('/api/'))return new Response('Operación no admitida',{status:405});
 return env.ASSETS.fetch(request);
}catch(e){console.error('Copa',e);return new Response('Servicio temporalmente no disponible',{status:503});}
}};
