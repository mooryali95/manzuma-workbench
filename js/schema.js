/**
 * schema.js
 * Workbench schema definition + client-side migrations.
 *
 * The DB schema lives in supabase/schema.sql (canonical).
 * This file mirrors the in-app shape and runs forward-only migrations
 * on locally-cached state (for offline mode).
 *
 * Each entity has: id, created_at, updated_at (where applicable).
 */

import { APP } from '../config.js';

export const SCHEMA = {
  current_version: APP.schema_version,   /* bumped when migration added */

  tables: {
    portfolios: {
      pk: 'id',
      fields: ['id','key','name_ar','description_ar','color','bg_color','sort_order','created_at','updated_at']
    },
    individuals: {
      pk: 'id',
      fields: ['id','name_ar','sector','notes','created_at','updated_at']
    },
    entities: {
      pk: 'id',
      fields: ['id','name_ar','kind','sector','notes','created_at','updated_at']
    },
    formations: {
      pk: 'id',
      fields: ['id','concept_entity_id','name_ar','sort_order','created_at','updated_at']
    },
    formation_members: {
      pk: ['formation_id','individual_id'],
      fields: ['formation_id','individual_id','created_at']
    },
    formation_entities: {
      pk: ['formation_id','entity_id'],
      fields: ['formation_id','entity_id','created_at']
    },
    concepts: {    /* read-mostly view over bot_entities */
      pk: 'id',
      fields: ['id','name','entity_type','parent_id','source_list_id','portfolio_id','formation_id','sort_order','is_active','created_at']
    },
    products:   { pk:'id', fields:['id','name','entity_type','parent_id','source_list_id','portfolio_id','formation_id','is_active'] },
    initiatives:{ pk:'id', fields:['id','name','entity_type','parent_id','source_list_id','portfolio_id','formation_id','is_active'] },
    projects:   { pk:'id', fields:['id','name','entity_type','parent_id','source_list_id','portfolio_id','formation_id','is_active'] },
    project_phases: {
      pk: 'id',
      fields: ['id','project_entity_id','name_ar','description_ar','start_date','end_date','status','progress','sort_order','created_at','updated_at']
    },
    audit_log: {
      pk: 'id',
      fields: ['id','action','entity_type','entity_id','before_data','after_data','actor','summary_ar','created_at']
    },
    baselines: {
      pk: 'id',
      fields: ['id','name','description','snapshot_data','created_by','created_at']
    }
  }
};

/* ─── Migrations (offline-cache only — DB has its own migrations) ─── */
const MIGRATIONS = [
  { v: 1, name:'init', up(s) {
    s.portfolios ??= [];
    s.individuals ??= [];
    s.entities ??= [];
    s.formations ??= [];
    s.formation_members ??= [];
    s.formation_entities ??= [];
    s.concepts ??= [];
    s.products ??= [];
    s.initiatives ??= [];
    s.projects ??= [];
    return s;
  }},
  { v: 2, name:'add_phases', up(s) { s.project_phases ??= []; return s; }},
  { v: 3, name:'add_audit', up(s) { s.audit_log ??= []; return s; }},
  { v: 4, name:'add_baselines', up(s) { s.baselines ??= []; return s; }}
];

export function migrate(state) {
  let s = state || {};
  const fromV = s._schema_version || 0;
  for (const m of MIGRATIONS) {
    if (m.v > fromV) {
      s = m.up(s) || s;
      s._schema_version = m.v;
    }
  }
  return s;
}

export function isValidId(id) {
  return typeof id === 'string' && id.length > 0 && id.length < 100;
}
