/**
 * config.js
 * Manzuma Strategic Workbench — runtime config
 *
 * Backend selection: 'supabase' | 'local'
 * Switch backend at runtime by changing BACKEND constant.
 * Same data model is preserved across backends — only the adapter changes.
 */

export const BACKEND = 'supabase';   // 'supabase' | 'local'

export const SUPABASE = {
  url:  'https://urdgaplsjirwqovpncbn.supabase.co',
  anon: 'sb_publishable_oz4xHosuWK1u6lV-uupPBw_K6eZ30ji'
};

export const APP = {
  name_ar: 'منظومة · الورشة الاستراتيجية',
  version: '4.3.0',
  schema_version: 4,
  locale: 'ar-SA',
  default_view: 'portfolios'   // 'portfolios' | 'workbench'
};

/* ClickUp integration — stub config for future use */
export const CLICKUP = {
  proxy_url: '',   /* Cloudflare Worker proxy endpoint */
  workspace_id: '' /* will populate when integration is wired */
};
