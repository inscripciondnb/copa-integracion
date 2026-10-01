import { database } from './storage';
export const categories:Record<string,string>={'Individual Masculino':'INDIVIDUAL MASCULINO','Individual Femenino':'INDIVIDUAL FEMENINO','Individual Senior +50':'INDIVIDUAL MASCULINO +50','Grupal Masculino':'GRUPAL MASCULINO','Grupal Femenino':'GRUPAL FEMENINO','Grupal Mixto':'GRUPO MIXTO','Grupal Senior +50':'GRUPAL MASCULINO +50'};
const read=(r:any)=>JSON.parse(r.data);
const clean=(v:any,max=150)=>String(v||'').trim().slice(0,max);
export async function manualEntry(p:any,epoch:string){
 const db=database(),masters=(await db.prepare('SELECT * FROM masters').all()).results.map(read),official=(await db.prepare('SELECT * FROM official').all()).results;
 const mode=categories[p.categoria];if(!mode)throw new Error('Seleccioná una modalidad válida.');
 const revision=await db.prepare("SELECT data FROM settings WHERE key='fixture_revision'").first<{data:string}>();
 if(String(p.fixtureRevision||'1')!==(revision?read(revision):'1'))throw new Error('El fixture cambió en otro dispositivo. Sincronizá antes de continuar.');
 const statements=[],newEntry=p.accion==='alta_manual';let master:any;
 if(newEntry){
  const no=p.numero===''||p.numero==null?Math.max(0,...masters.map((m:any)=>m.numero))+1:Number(p.numero);
  if(!Number.isInteger(no)||no<1||no>9999)throw new Error('Número de inscripción inválido (1 a 9999).');
  const codigo='COPA-'+String(no).padStart(4,'0');if(masters.some((m:any)=>m.codigo===codigo))throw new Error('Ese número ya existe. Buscalo en Acreditación o usá otro número.');
  if(!Array.isArray(p.integrantes)||p.integrantes.length!==(mode.startsWith('INDIVIDUAL')?1:4))throw new Error('Ingresá 1 competidor para individual o 4 para grupal.');
  const names=p.integrantes.map((v:any)=>clean(v));if(names.some((n:string)=>!n)||new Set(names.map((n:string)=>n.toLowerCase())).size!==names.length)throw new Error('Los nombres de integrantes deben estar completos y sin repetirse.');
  const dorsals=Array.isArray(p.dorsales)?p.dorsales.map((d:any)=>clean(d,30)):[];if(dorsals.length&&dorsals.length!==names.length)throw new Error('Ingresá un dorsal por integrante, en el mismo orden.');
  const pais=clean(p.pais),capitan=clean(p.capitan);if(!pais||!capitan)throw new Error('Ingresá delegación/país y capitán o referente.');
  master={codigo,numero:no,pais,capitan,modalidades:{[mode]:names},dorsales:{[mode]:dorsals},manual:true};
  statements.push(db.prepare('INSERT INTO masters(code,data) VALUES(?,?)').bind(codigo,JSON.stringify(master)));masters.push(master);
 }else{master=masters.find((m:any)=>m.codigo===p.inscripcion);if(!master||!master.modalidades[mode])throw new Error('La inscripción no participa en esa modalidad.');}
 const assign=!newEntry||p.asignar===true;
 let tanda:number|null=null;
 if(assign){
  const all=official.map(read);if(all.some((f:any)=>f.inscripcion===master.codigo&&categories[f.categoria]===mode))throw new Error('La inscripción ya tiene una tanda en esta modalidad.');
  const rival=p.rival?masters.find((m:any)=>m.codigo===p.rival):null;
  if(p.rival&&(!rival||rival.codigo===master.codigo||!rival.modalidades[mode]))throw new Error('Seleccioná un rival distinto de la misma modalidad.');
  if(rival&&all.some((f:any)=>f.inscripcion===rival.codigo&&categories[f.categoria]===mode))throw new Error('El rival ya tiene una tanda en esta modalidad. Elegí completar esa tanda libre.');
  const circuit=p.circuito;if(!['ROJO','AMARILLO'].includes(circuit))throw new Error('Seleccioná ROJO o AMARILLO.');
  tanda=p.tanda?Number(p.tanda):Math.max(0,...all.map((f:any)=>f.tanda))+1;if(!Number.isInteger(tanda)||tanda<1||tanda>9999)throw new Error('Tanda inválida.');
  const target=official.filter((f:any)=>read(f).tanda===tanda);
  if(p.tanda&&!target.length)throw new Error('La tanda seleccionada ya no existe.');
  if(target.some((f:any)=>categories[read(f).categoria]!==mode))throw new Error('La tanda debe ser de la misma modalidad.');
  if(await db.prepare('SELECT id FROM matches WHERE tanda=?').bind(tanda).first())throw new Error('Esta tanda ya tiene resultados. No se pueden cambiar sus participantes.');
  if(await db.prepare('SELECT key FROM settings WHERE key=?').bind('top8:'+mode).first())throw new Error('El Top 8 de esta modalidad ya está iniciado. No se pueden agregar participantes a la clasificación.');
  for(const lane of ['ROJO','AMARILLO']){
   const entry=lane===circuit?master:rival,existing=target.find((f:any)=>read(f).circuito===lane);
   if(existing&&read(existing).inscripcion){if(entry)throw new Error('El circuito '+lane+' está ocupado. Elegí un circuito libre.');continue;}
   const f={tanda,circuito:lane,inscripcion:entry?.codigo||'',capitan:entry?.capitan||'',pais:entry?.pais||'',categoria:p.categoria,competidores:entry?entry.modalidades[mode].join(' / '):'',dorsales:entry?(entry.dorsales?.[mode]||[]).join(' / '):''};
   if(existing)statements.push(db.prepare('UPDATE official SET data=? WHERE id=?').bind(JSON.stringify(f),existing.id));else statements.push(db.prepare('INSERT INTO official(id,data) VALUES(?,?)').bind('manual:'+crypto.randomUUID(),JSON.stringify(f)));
  }
 }
 const next=crypto.randomUUID();
 const guard="INSERT INTO settings(key,data) SELECT 'fixture_revision',CASE WHEN ?=COALESCE((SELECT json_extract(data,'$') FROM settings WHERE key='fixture_revision'),'1') AND ?=COALESCE((SELECT json_extract(data,'$') FROM settings WHERE key='competition_epoch'),'1') AND (?=0 OR (NOT EXISTS(SELECT 1 FROM matches WHERE tanda=?) AND NOT EXISTS(SELECT 1 FROM settings WHERE key=?))) THEN ? ELSE json('stale fixture') END ON CONFLICT(key) DO UPDATE SET data=excluded.data";
 statements.unshift(db.prepare(guard).bind(String(p.fixtureRevision||'1'),epoch,assign?1:0,tanda||0,'top8:'+mode,JSON.stringify(next)));
 if(newEntry&&p.acreditar===true){const key='acc:'+master.codigo;statements.push(db.prepare('INSERT INTO operations(key,data) VALUES(?,?)').bind(key,JSON.stringify({key,value:true,stamp:Date.now(),id:crypto.randomUUID()})));}
 statements.push(db.prepare('INSERT INTO history(data) VALUES(?)').bind(JSON.stringify({date:new Date().toLocaleString('es-UY',{timeZone:'America/Montevideo'}),action:newEntry?'ALTA MANUAL':'ENFRENTAMIENTO ASIGNADO',no:master.numero,mode,detail:tanda?'TANDA '+tanda:'Pendiente de asignar enfrentamiento'})));
 try{await db.batch(statements);}catch(e:any){if(/malformed JSON|UNIQUE constraint/i.test(e.message))throw new Error('La inscripción o el fixture cambió. Sincronizá y revisá la asignación.');throw e;}
 return {ok:true,inscripcion:master.codigo,tanda};
}
