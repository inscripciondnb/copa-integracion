import { env } from 'cloudflare:workers';
export function database(): D1Database { if (!env.DB) throw new Error('La base de competencia no está disponible. Reintentá sin cerrar el formulario.'); return env.DB; }

export function photoBucket():R2Bucket{if(!env.BUCKET)throw new Error("La galería no está disponible. Reintentá en unos segundos.");return env.BUCKET;}

export function passwordBootstrap(){return {hash:env.STAFF_PASSWORD_HASH,salt:env.STAFF_PASSWORD_SALT,reset:env.STAFF_PASSWORD_RESET_REVISION};}
