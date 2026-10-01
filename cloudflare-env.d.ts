declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    ASSETS: Fetcher;
    ADMIN_PASSWORD_HASH?: string;
    ADMIN_PASSWORD_SALT?: string;
    STAFF_PASSWORD_HASH?: string;
    STAFF_PASSWORD_SALT?: string;
    STAFF_PASSWORD_RESET_REVISION?: string;
    BUCKET?: R2Bucket;
  }
}
