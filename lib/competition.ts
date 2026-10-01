import { database } from './storage';
import { seedMasters, seedFixture } from './seed';
import { manualEntry } from './manual-entry';
const map:Record<string,string>={'Individual Masculino':'INDIVIDUAL MASCULINO','Individual Femenino':'INDIVIDUAL FEMENINO','Individual Senior +50':'INDIVIDUAL MASCULINO +50','Grupal Masculino':'GRUPAL MASCULINO','Grupal Femenino':'GRUPAL FEMENINO','Grupal Mixto':'GRUPO MIXTO','Grupal Senior +50':'GRUPAL MASCULINO +50'};
class Conflict extends Error {}
async function competitionEpoch(){return await setting('competition_epoch')||'1';}
const parse=(r:any)=>JSON.parse(r.data);
async function rows(table:string) {return (await database().prepare(`SELECT * FROM ${table}`).all()).results;}
async function setting(key:string){const r=await database().prepare('SELECT data FROM settings WHERE key=?').bind(key).first<any>();return r?parse(r):null;}
async function seed(){
 if(await setting('seed-v14'))return;
 const db=database();
 const queries=[...seedMasters.map(m=>db.prepare('INSERT OR IGNORE INTO masters(code,data) VALUES(?,?)').bind(m.codigo,JSON.stringify(m))),...seedFixture.map((f,i)=>db.prepare('INSERT OR IGNORE INTO official(id,data) VALUES(?,?)').bind(String(i),JSON.stringify(f)))];
 for(let i=0;i<queries.length;i+=40)await db.batch(queries.slice(i,i+40));
 await db.prepare('INSERT OR IGNORE INTO settings(key,data) VALUES(?,?)').bind('seed-v14','true').run();
}
function audit(action:string,no:any,mode:string,detail:string){return database().prepare('INSERT INTO history(data) VALUES(?)').bind(JSON.stringify({date:new Date().toLocaleString('es-UY',{timeZone:'America/Montevideo'}),action,no,mode,detail}));}
const later=(a:any,b:any)=>!b||Number(a.stamp)>Number(b.stamp)||(a.stamp===b.stamp&&String(a.id)>String(b.id));
async function opState(){const entries=(await rows('operations')).map(parse);const acc=entries.filter((e:any)=>e.key.startsWith('acc:')&&e.value).map((e:any)=>e.key.slice(4));const pista={enPista:entries.find((e:any)=>e.key==='track:enPista')?.value||null,proximo:entries.find((e:any)=>e.key==='track:proximo')?.value||null};return {entries,acreditaciones:acc,pista};}
async function putEvent(key:string,value:any,epoch:string){const old=await database().prepare('SELECT data FROM operations WHERE key=?').bind(key).first<any>();const stamp=Math.max(Date.now(),old?parse(old).stamp+1:0);const e={key,value,stamp,id:crypto.randomUUID()};const saved=await database().prepare("INSERT INTO operations(key,data) SELECT ?,? WHERE ?=COALESCE((SELECT json_extract(data,'$') FROM settings WHERE key='competition_epoch'),'1') ON CONFLICT(key) DO UPDATE SET data=excluded.data").bind(key,JSON.stringify(e),epoch).run();if(!saved.meta.changes)throw new Conflict('La competencia cambió. Sincronizá antes de guardar.');return e;}
let bridgeBusy=false;
async function bridge(){
 const c=await setting('bridge');if(!c?.url)return {enabled:false,ok:false,message:'Apps Script sin configurar'};
 if(bridgeBusy)return {enabled:true,ok:false,message:'Sincronización en curso'};
 bridgeBusy=true;
 try{
 const local=await opState();
 const res=await fetch(c.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({accion:'sincronizar_operativo_v14',token:c.token,eventos:local.entries}),redirect:'follow',signal:AbortSignal.timeout(8000)});
 const data:any=await res.json();
 if(!res.ok||!data.ok||data.protocol!=='COPA-OPERATIVO-V1'||!Array.isArray(data.eventos))throw new Error(data.error||'La implementación no corresponde al sincronizador V14');
 const known=new Set((await rows('masters')).map((r:any)=>r.code));
 for(const e of data.eventos){
 if(!e||!Number.isSafeInteger(e.stamp)||typeof e.id!=='string')continue;
 if(e.key.startsWith('acc:')){if(!known.has(e.key.slice(4))||typeof e.value!=='boolean')continue;}
 else if(['track:enPista','track:proximo'].includes(e.key)){if(e.value!==null&&(!Number.isInteger(e.value?.tanda)||e.value.tanda<1||e.value.tanda>9999))continue;}
 else continue;
 // Conditional SQL makes a late bridge response unable to overwrite a newer local action.
 await database().prepare(`INSERT INTO operations(key,data) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data WHERE json_extract(excluded.data,'$.stamp')>json_extract(operations.data,'$.stamp') OR (json_extract(excluded.data,'$.stamp')=json_extract(operations.data,'$.stamp') AND json_extract(excluded.data,'$.id')>json_extract(operations.data,'$.id'))`).bind(e.key,JSON.stringify(e)).run();
 }
 return {enabled:true,ok:true,message:'Acreditación y pista sincronizadas'};
 }catch(e:any){return {enabled:true,ok:false,message:'Cambios guardados; sincronización pendiente. '+e.message};}finally{bridgeBusy=false;}
}
function normalize(r:any,masters:any[]){
 const m=masters.find(m=>m.numero===Number(r.no));if(!m)throw new Error('Inscripción inexistente');
 if(!m.modalidades[r.mode])throw new Error('La inscripción no participa en esa modalidad');
 if(!Number.isFinite(r.time)||r.time<=0||r.time>86400)throw new Error('Tiempo inválido');
 const pens=(r.penalties||[]).map((p:any)=>{if(!Number.isFinite(p.seconds)||p.seconds<0||p.seconds>3600||!Number.isInteger(p.type)||p.type<0||p.type>5)throw new Error('Penalización inválida');return {type:p.type,seconds:p.seconds,repeat:!!p.repeat,detail:String(p.detail||'').slice(0,2000)};});
 const pen=pens.reduce((s:number,p:any)=>s+p.seconds*(p.repeat?2:1),0);
 return {...r,no:m.numero,name:m.pais||m.codigo,captain:m.capitan,people:m.modalidades[r.mode].map((name:string)=>({name})),penalties:pens,pen,penalty:pen,rep:pens.filter((p:any)=>p.repeat).length,final:Math.round((r.time+pen)*100)/100,obs:String(r.obs||'').slice(0,4000)};
}
function topRows(all:any[],mode:string){const best=new Map();for(const m of all.filter(m=>m.phase==='PRIMERA'))for(const r of parse(m)){if(r.mode!==mode||!r.published)continue;const old=best.get(r.no);if(!old||r.final<old.final)best.set(r.no,r);}return [...best.values()].sort((a,b)=>a.final-b.final||a.no-b.no);}
function bracket(mode:string,all:any[],locked?:any[]){
 const top=locked||topRows(all,mode).slice(0,8);if(!top.length)return [];
 const pairs=[[0,7],[3,4],[2,5],[6,1]];const out:any[]=[];
 const add=(phase:string,round:string,key:number,a:any,b:any)=>{
  const id=`TOP8:${mode}:${phase}:${key}`;const saved=all.find(m=>m.id===id);const rs=saved?parse(saved):[];let winner=null;
  if(a&&!b)winner=a;if(b&&!a)winner=b;
  if(a&&b&&rs.length===2&&rs.every((r:any)=>r.published)&&rs[0].final!==rs[1].final)winner=rs.reduce((w:any,r:any)=>r.final<w.final?r:w);
  const f={id,modalidad:mode,phase,ronda:round,llave:key,equipoA:a?.no||null,equipoB:b?.no||null,delegacionA:a?.name||'',delegacionB:b?.name||'',winner:winner?.no||null,done:!!winner,tie:rs.length===2&&rs.every((r:any)=>r.published)&&rs[0].final===rs[1].final};out.push(f);return winner;
 };
 const w=pairs.map(([a,b],i)=>add('QF','Cuartos de final',i+1,top[a],top[b]));
 if(out.every(f=>f.done||(!f.equipoA&&!f.equipoB))){const s=[add('SF','Semifinal',1,w[0],w[1]),add('SF','Semifinal',2,w[2],w[3])];if(out.filter(f=>f.phase==='SF').every(f=>f.done||(!f.equipoA&&!f.equipoB)))add('FINAL','Final',1,s[0],s[1]);}
 return out.filter(f=>f.equipoA||f.equipoB);
}
async function snapshot(){const [mr,fr,mm,hh,op,c]=await Promise.all([rows('masters'),rows('official'),rows('matches'),database().prepare('SELECT data FROM (SELECT id,data FROM history ORDER BY id DESC LIMIT 2000) ORDER BY id').all(),opState(),setting('bridge')]);const masters=mr.map(parse).sort((a,b)=>a.numero-b.numero);const modes=[...new Set(mm.filter((m:any)=>m.phase==='PRIMERA').flatMap(m=>parse(m).filter((r:any)=>r.published).map((r:any)=>r.mode)))];return {ok:true,epoch:await competitionEpoch(),fixtureRevision:await setting('fixture_revision')||'1',masters,official:fr.map(parse).sort((a,b)=>a.tanda-b.tanda),results:mm.flatMap((m:any)=>parse(m).map((r:any)=>({...r,version:m.version,phase:m.phase}))),logs:hh.results.map(parse),fixture:(await Promise.all(modes.map(async(m:any)=>bracket(m,mm,await setting('top8:'+m))))).flat(),acreditaciones:op.acreditaciones,pista:op.pista,config:{url:c?.url||'',configured:!!c?.url}};}
export async function publicSnapshot(){
 await seed();
 const all=await snapshot();
 const published=all.results.filter((r:any)=>r.published);
 const acc=new Set(all.acreditaciones);
 const tandas=[...new Set(all.official.map((r:any)=>r.tanda))];
 const official=tandas.map(tanda=>{
  const participants=all.official.filter((r:any)=>r.tanda===tanda);
  const active=participants.filter((r:any)=>r.inscripcion);
  const match=published.filter((r:any)=>r.matchId==='PRIMERA:TANDA:'+tanda);
  const finished=match.length===active.length&&active.length>0;
  const status=all.pista.enPista?.tanda===tanda?'EN PISTA':all.pista.proximo?.tanda===tanda?'PRÓXIMO A PISTA':finished?'FINALIZADA':active.every((r:any)=>acc.has(r.inscripcion))?'LISTA':'PENDIENTE';
  return {tanda,estado:status,participantes:participants.map((r:any)=>({circuito:r.circuito,inscripcion:r.inscripcion,pais:r.pais,categoria:r.categoria,modalidad:map[r.categoria]||r.categoria.toUpperCase(),competidores:r.competidores,dorsales:r.dorsales}))};
 });
 const results=published.map((r:any)=>({no:r.no,name:r.name,mode:r.mode,people:(r.people||[]).map((p:any)=>({name:p.name})),time:r.time,pen:r.pen??r.penalty??0,final:r.final,penalties:(r.penalties||[]).map((p:any)=>({type:p.type,seconds:p.seconds,repeat:p.repeat,detail:p.detail})),obs:r.obs||'',matchId:r.matchId,sector:r.sector,phase:r.phase,tanda:r.tanda}));
 const groups=new Map<string,any[]>();for(const r of results){if(!groups.has(r.matchId))groups.set(r.matchId,[]);groups.get(r.matchId)!.push(r);}
 const lastPublished=[...all.logs].reverse().find((h:any)=>h.action==='PUBLICADO'&&groups.has(h.detail));
 const lastRows=lastPublished?groups.get(lastPublished.detail)!:[];
 const tied=lastRows.length===2&&lastRows[0].final===lastRows[1].final;
 const win=lastRows.length&&!tied?lastRows.reduce((a:any,b:any)=>a.final<b.final?a:b):null;
 const lastResult=lastRows.length?{matchId:lastRows[0].matchId,tanda:lastRows[0].tanda,phase:lastRows[0].phase,mode:lastRows[0].mode,tied,winner:win?{no:win.no,people:win.people,name:win.name,sector:win.sector,final:win.final}:null}:null;
 return {ok:true,pista:all.pista,official,results,fixture:all.fixture,lastResult};
}

export async function handle(request:Request){
 try{
 await seed();const url=new URL(request.url);
 if(request.method==='GET'){
 const action=url.searchParams.get('accion');
 if(action==='exportar')return Response.json(await snapshot(),{headers:{'Content-Disposition':'attachment; filename="Copa_Integracion_2026_respaldo.json"'}});
 if(action==='estado_operativo'){const sync=await bridge();return Response.json({ok:true,epoch:await competitionEpoch(),...await opState(),sync},{headers:{'Cache-Control':'no-store'}});}
 return Response.json(await snapshot(),{headers:{'Cache-Control':'no-store'}});
 }
 if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)throw new Error('Origen de solicitud inválido');
 const p:any=await request.json();const action=p.accion;const db=database();
 const epoch=await competitionEpoch();
 if(['alta_manual','asignar_enfrentamiento','guardar_duelo','revisar_duelo','acreditar','desacreditar','estado_pista','limpiar_pista','eliminar_duelo','reiniciar_competencia'].includes(action)&&String(p.epoch||'1')!==epoch)throw new Conflict('La competencia cambió por una eliminación o reinicio. Sincronizá antes de volver a guardar.');
 if(action==='alta_manual'||action==='asignar_enfrentamiento')return Response.json(await manualEntry(p,epoch));
 if(action==='eliminar_duelo'||action==='reiniciar_competencia'){
  if(p.confirmacion!==(action==='reiniciar_competencia'?'REINICIAR TODO':'ELIMINAR'))throw new Error('Confirmá la operación antes de borrar.');
  const nextEpoch=crypto.randomUUID(),statements=[];
  if(action==='eliminar_duelo'){
   const old:any=await db.prepare('SELECT * FROM matches WHERE id=?').bind(p.id).first();
   if(!old)throw new Conflict('El enfrentamiento ya no existe. Sincronizá.');
   if(old.version!==p.version)throw new Conflict('Otro dispositivo cambió este resultado. Sincronizá antes de eliminar.');
   const stage=['PRIMERA','QF','SF','FINAL'];
   if((old.phase==='PRIMERA'&&await setting('top8:'+old.mode))||(await rows('matches')).some((m:any)=>m.mode===old.mode&&stage.indexOf(m.phase)>stage.indexOf(old.phase)))throw new Conflict('Hay llaves posteriores que dependen de este resultado. Eliminá primero las rondas posteriores o usá Reiniciar todo.');
   statements.push(db.prepare('DELETE FROM matches WHERE id=? AND version=?').bind(p.id,p.version));
   if(old.phase!=='PRIMERA'&&!(await rows('matches')).some((m:any)=>m.mode===old.mode&&m.phase!=='PRIMERA'&&m.id!==old.id))statements.push(db.prepare('DELETE FROM settings WHERE key=?').bind('top8:'+old.mode));
   const op=await opState();for(const key of ['track:enPista','track:proximo']){const entry=op.entries.find((e:any)=>e.key===key);if(old.tanda&&entry?.value?.tanda===old.tanda){const event={key,value:null,stamp:Math.max(Date.now(),entry.stamp)+1,id:crypto.randomUUID()};statements.push(db.prepare('INSERT INTO operations(key,data) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').bind(key,JSON.stringify(event)));}}
   statements.push(audit('ENFRENTAMIENTO ELIMINADO',parse(old).map((r:any)=>r.no).join(' vs '),old.mode,old.id));
  }else{
   const entries=(await opState()).entries,stamp=Math.max(Date.now(),...entries.map((e:any)=>e.stamp))+1;
   const codes=(await rows('masters')).map((m:any)=>'acc:'+m.code);
   for(const key of [...codes,'track:enPista','track:proximo']){const event={key,value:key.startsWith('acc:')?false:null,stamp,id:crypto.randomUUID()};statements.push(db.prepare('INSERT INTO operations(key,data) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').bind(key,JSON.stringify(event)));}
   statements.push(db.prepare('DELETE FROM matches'),db.prepare("DELETE FROM settings WHERE key LIKE 'top8:%'"),db.prepare('DELETE FROM history'),audit('COMPETENCIA REINICIADA','','','Resultados, ranking, Top 8, acreditaciones y pista reiniciados.'));
  }

  // The first statement claims a new epoch atomically; a stale request aborts the entire batch.
  const claim="INSERT INTO settings(key,data) SELECT 'competition_epoch',CASE WHEN ?=COALESCE((SELECT json_extract(data,'$') FROM settings WHERE key='competition_epoch'),'1') AND (?='reiniciar_competencia' OR EXISTS(SELECT 1 FROM matches WHERE id=? AND version=?)) THEN ? ELSE json('stale competition') END ON CONFLICT(key) DO UPDATE SET data=excluded.data";
  statements.unshift(db.prepare(claim).bind(epoch,action,String(p.id||''),Number(p.version||0),JSON.stringify(nextEpoch)));
  try{await db.batch(statements);}catch(e:any){if(String(e.message).includes('malformed JSON'))throw new Conflict('Los datos cambiaron durante la operación. Sincronizá y reintentá.');throw e;}
  return Response.json({ok:true,epoch:nextEpoch});
 }
 if(action==='configurar_sync'){
 if(p.url&&!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(p.url))throw new Error('Ingresá el enlace /exec de Apps Script');
 const old=await setting('bridge');const token=p.token||old?.token||'';if(p.url&&token.length<16)throw new Error('La clave compartida debe tener al menos 16 caracteres');
 await db.prepare('INSERT INTO settings(key,data) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').bind('bridge',JSON.stringify({url:p.url||'',token})).run();
 return Response.json({ok:true,sync:await bridge()});
 }
 if(action==='acreditar'||action==='desacreditar'){
 if(!await db.prepare('SELECT code FROM masters WHERE code=?').bind(p.inscripcion).first())throw new Error('Inscripción inexistente');
 await putEvent('acc:'+p.inscripcion,action==='acreditar',epoch);await audit(action==='acreditar'?'ACREDITACIÓN':'ACREDITACIÓN RETIRADA',p.inscripcion,'','').run();return Response.json({ok:true});
 }
 if(action==='estado_pista'){
 const fr=(await rows('official')).map(parse).filter(f=>f.tanda===Number(p.tanda)&&f.inscripcion);const op=await opState();if(!fr.length||fr.some(f=>!op.acreditaciones.includes(f.inscripcion)))throw new Error('La tanda debe estar completamente acreditada');
 const key=p.tipo==='EN_PISTA'?'track:enPista':p.tipo==='PROXIMO'?'track:proximo':null;if(!key)throw new Error('Estado inválido');
 await putEvent(key,{tanda:Number(p.tanda)},epoch);if(p.tipo==='EN_PISTA'&&op.pista.proximo?.tanda===Number(p.tanda))await putEvent('track:proximo',null,epoch);return Response.json({ok:true});
 }
 if(action==='limpiar_pista'){await putEvent('track:enPista',null,epoch);await putEvent('track:proximo',null,epoch);return Response.json({ok:true});}
 if(action==='guardar_duelo'){
 if(!Array.isArray(p.rows)||p.rows.length<1||p.rows.length>2||new Set(p.rows.map((r:any)=>r.no)).size!==p.rows.length)throw new Error('Participantes inválidos');
 const masters=(await rows('masters')).map(parse);const rs=p.rows.map((r:any)=>normalize({...r,published:false},masters));const mode=rs[0].mode;if(rs.some((r:any)=>r.mode!==mode))throw new Error('Las modalidades deben coincidir');
 const op=await opState();if(rs.some((r:any)=>!op.acreditaciones.includes(masters.find(m=>m.numero===r.no).codigo)))throw new Error('Todos los participantes deben estar acreditados');
 let phase='PRIMERA',id=String(p.id||'');if(!/^[A-Za-z0-9_:\- +ÁÉÍÓÚÑáéíóúñ]{1,200}$/.test(id))throw new Error('Identificador inválido');
 if(id.startsWith('TOP8:')){const all=await rows('matches'),locked=await setting('top8:'+mode);const f=bracket(mode,all,locked).find(f=>f.id===id);if(!f||f.done||!f.equipoA||!f.equipoB)throw new Conflict('Esta llave cambió o ya se completó');if(rs[0].no!==f.equipoA||rs[1]?.no!==f.equipoB)throw new Conflict('Los participantes no coinciden con la llave');phase=f.phase;if(!locked)await db.prepare('INSERT OR IGNORE INTO settings(key,data) VALUES(?,?)').bind('top8:'+mode,JSON.stringify(topRows(all,mode).slice(0,8))).run();}
 else if(p.tanda){const fr=(await rows('official')).map(parse).filter(f=>f.tanda===Number(p.tanda)&&f.inscripcion);if(fr.length!==rs.length||fr.some(f=>!rs.some((r:any)=>r.no===Number(f.inscripcion.slice(5))&&r.mode===map[f.categoria]&&r.sector===f.circuito)))throw new Error('Los participantes no coinciden con el fixture');id='PRIMERA:TANDA:'+Number(p.tanda);}
 else throw new Error('Seleccioná un enfrentamiento desde el fixture');
 rs.forEach((r:any)=>{r.matchId=id;r.phase=phase;r.tanda=p.tanda||null;});
 const result=await db.prepare("INSERT OR IGNORE INTO matches(id,mode,phase,tanda,data) SELECT ?,?,?,?,? WHERE ?=COALESCE((SELECT json_extract(data,'$') FROM settings WHERE key='competition_epoch'),'1')").bind(id,mode,phase,p.tanda||null,JSON.stringify(rs),epoch).run();if(!result.meta.changes){const existing=await db.prepare('SELECT data FROM matches WHERE id=?').bind(id).first<any>();if(existing&&JSON.stringify(parse(existing))===JSON.stringify(rs))return Response.json({ok:true});throw new Conflict('Ya hay resultados para este enfrentamiento. Revisalos en Corroboración.');}
 await audit('FISCALIZACIÓN',rs.map((r:any)=>r.no).join(' vs '),mode,id).run();return Response.json({ok:true});
 }
 if(action==='revisar_duelo'){
 const old:any=await db.prepare('SELECT * FROM matches WHERE id=?').bind(p.id).first();if(!old)throw new Error('Enfrentamiento inexistente');if(old.version!==p.version)throw new Conflict('Otro dispositivo modificó este enfrentamiento. Sincronizá y revisá de nuevo.');
 const prev=parse(old);if(p.rows.length!==prev.length||p.rows.some((r:any,i:number)=>r.no!==prev[i].no||r.mode!==prev[i].mode||r.sector!==prev[i].sector))throw new Error('No se pueden cambiar los participantes durante la revisión');
 const masters=(await rows('masters')).map(parse);const rs=p.rows.map((r:any,i:number)=>normalize({...prev[i],...r,phase:old.phase,matchId:old.id,published:!!p.publish},masters));
 const impact=!p.publish||rs.some((r:any,i:number)=>r.final!==prev[i].final);if(impact){if(old.phase==='PRIMERA'&&await setting('top8:'+old.mode))throw new Conflict('La clasificación Top 8 de esta modalidad ya fue fijada al iniciar las llaves.');const stage=['PRIMERA','QF','SF','FINAL'];const downstream=(await rows('matches')).some((m:any)=>m.mode===old.mode&&stage.indexOf(m.phase)>stage.indexOf(old.phase));if(downstream)throw new Conflict('Ya se inició una ronda posterior. No se puede cambiar el ganador de esta ronda.');}
 const change=await db.prepare("UPDATE matches SET data=?,version=version+1 WHERE id=? AND version=? AND ?=COALESCE((SELECT json_extract(data,'$') FROM settings WHERE key='competition_epoch'),'1')").bind(JSON.stringify(rs),p.id,p.version,epoch).run();if(!change.meta.changes)throw new Conflict('El enfrentamiento cambió. Sincronizá para revisarlo.');
 await audit(p.publish?'PUBLICADO':'CORROBORACIÓN',rs.map((r:any)=>r.no).join(' vs '),old.mode,p.id).run();return Response.json({ok:true});
 }
 if(action==='generar_fixture')return Response.json({ok:true});
 throw new Error('Operación no admitida');
 }catch(e:any){console.error('Copa:',e.message);return Response.json({ok:false,error:e.message||'No se pudo guardar. Conservá el formulario y reintentá.'},{status:e instanceof Conflict?409:400});}
}
