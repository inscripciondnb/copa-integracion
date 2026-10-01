# Copa Integración — GitHub + Cloudflare

Esta versión funciona en tu cuenta de Cloudflare Workers. Conserva datos maestros, acreditación, fixture, fiscalización offline, corroboración, ranking, Top 8, página pública y galería. Google Sheets y Drive no se usan como base de datos. Apps Script es opcional y solo sincroniza acreditaciones y pista.

## Dos accesos

- `/en-vivo`: página pública.
- `/staff`: contraseña compartida del staff.
- `/admin`: contraseña privada del organizador; permite gestionar la contraseña del staff y configurar Apps Script. No requiere ChatGPT.

Las contraseñas se guardan como hashes en secretos de Cloudflare. No hay contraseñas dentro del código. Las sesiones anteriores de Sites no se trasladan: todos deben ingresar de nuevo. Los borradores offline que aún no se enviaron permanecen en el navegador del sitio antiguo; sincronizalos o descargalos antes del cambio definitivo.

## 1. Subir el código a GitHub

Creá un repositorio, por ejemplo `copa-integracion`, preferentemente privado. Descomprimí este paquete y subí sus archivos conservando las carpetas y los archivos que empiezan con punto. El archivo `wrangler.jsonc` debe quedar en la raíz.

**El respaldo `Copa_Respaldo_2026.zip` se guarda aparte y no se sube a GitHub.** Puede contener datos de participantes y configuración privada.

## 2. Crear los recursos en tu Cloudflare

En una PC con Node.js 22 o posterior, abrí una terminal en la carpeta del código:

```sh
npm install
npx wrangler login
npx wrangler d1 create copa-integracion-db
npx wrangler r2 bucket create copa-integracion-fotos
```

El primer comando de D1 muestra `database_id`. Agregalo en `wrangler.jsonc`, dentro de `d1_databases`, junto a `database_name`, sin cambiar el nombre del enlace `DB`.

```json
"d1_databases": [{
  "binding": "DB",
  "database_name": "copa-integracion-db",
  "database_id": "PEGAR_ID_DEVUELTO_POR_CLOUDFLARE",
  "migrations_dir": "drizzle"
}]
```

## 3. Importar los datos y la foto

Extraé el respaldo al lado de la carpeta del código; su carpeta se llama `Copa_Respaldo_2026`. Importá solo en la base nueva, antes de abrir la aplicación:

```sh
npm run db:migrate
npx wrangler d1 execute copa-integracion-db --remote --file ../Copa_Respaldo_2026/datos.sql
node scripts/import-photos.mjs ../Copa_Respaldo_2026/fotos.json
```

El respaldo incluido se tomó el 1 de octubre de 2026 aproximadamente a las 11:45 de Uruguay. Contiene 80 inscripciones, 106 circuitos (53 tandas), acreditaciones/estados operativos, historial y una foto. En ese momento no había resultados guardados. Si el sitio original cambia después de esa copia, se necesita un respaldo nuevo antes del cambio definitivo. Las contraseñas y las sesiones no se importan.

## 4. Publicar y configurar claves

```sh
npm run build
npm run deploy
npm run passwords -- staff
npm run passwords -- admin
```

Cuando la terminal pida la contraseña del staff, ingresá `ARAPEYCONTROL26` para conservar la elegida. Para el organizador, elegí una contraseña distinta de al menos 12 caracteres. La escritura es oculta y los valores no se guardan en GitHub.

Cloudflare devuelve el enlace real `workers.dev`; no se inventa ni se configura aquí un enlace de producción antes de publicar. Podés conectar después tu propio dominio.

## 5. Conectar GitHub para actualizaciones

En Cloudflare: **Workers & Pages → tu Worker → Settings → Builds → Connect**. Elegí el repositorio y la rama principal. Nombre del Worker: `copa-integracion` (igual al de `wrangler.jsonc`). Comando de compilación: `npm run build`. Comando de publicación: `npm run deploy`. Actualizá en GitHub el `database_id` configurado.

No ejecutes la importación del respaldo como parte de cada publicación: se hace una sola vez en la base nueva. Las actualizaciones del código conservan la base y las fotos.

## Comprobación antes de cambiar de enlace

1. Ver 80 inscripciones y 53 tandas en el staff.
2. Ver la foto existente en la galería pública.
3. Entrar con la contraseña del staff y con la contraseña del organizador.
4. Revisar acreditaciones y estados de pista.
5. Probar un duelo, corroborarlo, verlo en vivo y eliminar sus resultados de prueba.
6. Verificar que los cambios pendientes de los dispositivos del sitio antiguo ya se sincronizaron.
7. Compartir el nuevo enlace solo después de verificar esos puntos.

El sitio anterior permanece disponible. No se deshabilita ni cambia automáticamente por extraer o subir este paquete.

## Documentación oficial

- Workers Builds: https://developers.cloudflare.com/workers/ci-cd/builds/
- Configuración Wrangler: https://developers.cloudflare.com/workers/wrangler/configuration/
- D1: https://developers.cloudflare.com/d1/
- R2: https://developers.cloudflare.com/r2/
