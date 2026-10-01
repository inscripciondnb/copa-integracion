import {readFileSync} from 'node:fs';import {resolve,dirname} from 'node:path';import {spawnSync} from 'node:child_process';
const manifestPath=resolve(process.argv[2]||'../Copa_Respaldo_2026/fotos.json'),photos=JSON.parse(readFileSync(manifestPath,'utf8'));
for(const photo of photos){const file=resolve(dirname(manifestPath),photo.file);const result=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['wrangler','r2','object','put','copa-integracion-fotos/'+photo.object_key,'--file',file,'--content-type',photo.mime,'--remote'],{stdio:'inherit'});if(result.status!==0)process.exit(1);}
console.log(photos.length+' foto(s) importada(s).');
