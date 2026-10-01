/** Copa Integración · Sincronización operativa V14.
 * Configuración del proyecto > Propiedades de secuencia de comandos:
 * COPA_SYNC_TOKEN = una clave privada de al menos 16 caracteres.
 * Implementar como Aplicación web, ejecutar como propietario, acceso Cualquiera.
 * Este archivo NO usa Sheets ni Drive. Guarda sólo códigos acreditados y tandas.
 */
function doPost(e) {
 var lock=LockService.getScriptLock();
 try {
  var payload=JSON.parse(e.postData.contents||'{}');
  var props=PropertiesService.getScriptProperties();
  var token=props.getProperty('COPA_SYNC_TOKEN');
  if(!token||token.length<16||payload.token!==token)throw new Error('Clave de sincronización inválida');
  if(payload.accion!=='sincronizar_operativo_v14')throw new Error('Operación no admitida');
  if(!Array.isArray(payload.eventos)||payload.eventos.length>500)throw new Error('Cantidad de eventos inválida');
  lock.waitLock(10000);
  var values=props.getProperties();
  payload.eventos.forEach(function(event){
   if(!event||typeof event.key!=='string'||!Number.isSafeInteger(event.stamp)||typeof event.id!=='string')throw new Error('Evento inválido');
   if(/^acc:COPA-\d{4}$/.test(event.key)) {if(typeof event.value!=='boolean')throw new Error('Acreditación inválida');}
   else if(event.key==='track:enPista'||event.key==='track:proximo') {if(event.value!==null&&(!Number.isInteger(event.value.tanda)||event.value.tanda<1||event.value.tanda>9999))throw new Error('Tanda inválida');}
   else throw new Error('Campo no admitido');
   // Sólo estos cuatro campos pueden persistirse; se descarta cualquier dato extra.
   var clean={key:event.key,value:event.key.indexOf('acc:')===0?event.value:(event.value===null?null:{tanda:event.value.tanda}),stamp:event.stamp,id:event.id};
   var k='COPA_OP_'+event.key;
   var old=values[k]?JSON.parse(values[k]):null;
   if(!old||clean.stamp>old.stamp||(clean.stamp===old.stamp&&clean.id>old.id)){values[k]=JSON.stringify(clean);props.setProperty(k,values[k]);}
  });
  var eventos=Object.keys(values).filter(function(k){return k.indexOf('COPA_OP_')===0}).map(function(k){return JSON.parse(values[k]);});
  return copaJson({ok:true,protocol:'COPA-OPERATIVO-V1',eventos:eventos});
 }catch(err){return copaJson({ok:false,error:err.message});}
 finally{if(lock.hasLock())lock.releaseLock();}
}
function doGet(){return copaJson({ok:true,protocol:'COPA-OPERATIVO-V1',message:'Usar POST autenticado. Sólo acreditación y estados de pista.'});}
function copaJson(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
