/**
 * local-adapter.js
 * Implementation of DataAdapter backed by localStorage.
 * Used as a fallback when Supabase is unavailable or for offline mode.
 */

import { DataAdapter } from './adapter.js';

const STORAGE_KEY = 'manzuma_wb_v4';

const EMPTY_STATE = {
  portfolios: [],
  individuals: [],
  entities: [],
  formations: [],
  formation_members: [],
  formation_entities: [],
  concepts: [],
  products: [],
  initiatives: [],
  projects: [],
  project_phases: [],
  audit_log: [],
  baselines: []
};

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(EMPTY_STATE);
    return { ...structuredClone(EMPTY_STATE), ...JSON.parse(raw) };
  } catch { return structuredClone(EMPTY_STATE); }
}

function writeStore(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
  catch (e) { console.warn('local-adapter write failed:', e); }
}

/* Mirror of the Supabase wb_portfolios seed — keeps offline mode usable
   and IDs identical for a clean re-sync later. */
const DEFAULT_PORTFOLIOS = [
  { id:'pf_foundation', key:'foundation',  name_ar:'محفظة التأسيس', description_ar:'المفاهيم الأساسية المستقرة', color:'#8B6914', bg_color:'#FBF5E4', sort_order:1 },
  { id:'pf_growth',     key:'growth',      name_ar:'محفظة النمو',   description_ar:'المفاهيم في طور التوسع',    color:'#085041', bg_color:'#E1F5EE', sort_order:2 },
  { id:'pf_zero_one',   key:'zero_to_one', name_ar:'محفظة 0/1',    description_ar:'الابتكارات والاختراقات',     color:'#3C3489', bg_color:'#EEEDFE', sort_order:3 }
];

export class LocalAdapter extends DataAdapter {

  async init() {
    /* nothing to connect for localStorage */
    return true;
  }

  async loadAll() {
    const s = readStore();
    /* Seed the 3 default portfolios on first run so the kanban
       layout matches Supabase even when offline. */
    if (!s.portfolios || s.portfolios.length === 0) {
      s.portfolios = structuredClone(DEFAULT_PORTFOLIOS);
      writeStore(s);
    }
    return s;
  }

  async create(table, record) {
    const s = readStore();
    if (!s[table]) s[table] = [];
    s[table].push(record);
    writeStore(s);
    return record;
  }

  async update(table, id, patch) {
    const s = readStore();
    const rows = s[table] || [];
    const idx = rows.findIndex(r => r.id === id);
    if (idx === -1) return null;
    rows[idx] = { ...rows[idx], ...patch, updated_at: new Date().toISOString() };
    writeStore(s);
    return rows[idx];
  }

  async remove(table, id) {
    const s = readStore();
    if (s[table]) s[table] = s[table].filter(r => r.id !== id);
    writeStore(s);
    return true;
  }

  async logAudit(entry) {
    const s = readStore();
    if (!s.audit_log) s.audit_log = [];
    s.audit_log.push({ ...entry, id: Date.now(), created_at: new Date().toISOString() });
    writeStore(s);
    return entry;
  }

  async saveBaseline(name, snapshot) {
    const s = readStore();
    if (!s.baselines) s.baselines = [];
    const baseline = {
      id: 'bl_' + Date.now(),
      name,
      snapshot_data: snapshot,
      created_at: new Date().toISOString()
    };
    s.baselines.push(baseline);
    writeStore(s);
    return baseline;
  }

  async listBaselines() {
    const s = readStore();
    return (s.baselines || []).sort((a,b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }

  async getBaseline(id) {
    const s = readStore();
    return (s.baselines || []).find(b => b.id === id) || null;
  }

  async deleteBaseline(id) {
    const s = readStore();
    if (s.baselines) s.baselines = s.baselines.filter(b => b.id !== id);
    writeStore(s);
    return true;
  }
}
