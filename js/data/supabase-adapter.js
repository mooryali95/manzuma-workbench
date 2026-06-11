/**
 * supabase-adapter.js
 * Manzuma workbench backed by Supabase.
 *
 * Tables touched:
 *   wb_portfolios, wb_individuals, wb_entities,
 *   wb_formations, wb_formation_members, wb_formation_entities,
 *   wb_project_phases, wb_audit_log, wb_baselines,
 *   bot_entities (read-only for concepts/products/initiatives/projects + write portfolio_id, formation_id)
 *
 * Table-name mapping (in-app → database):
 *   portfolios          → wb_portfolios
 *   individuals         → wb_individuals
 *   entities            → wb_entities
 *   formations          → wb_formations
 *   formation_members   → wb_formation_members
 *   formation_entities  → wb_formation_entities
 *   project_phases      → wb_project_phases
 *   audit_log           → wb_audit_log
 *   baselines           → wb_baselines
 *   concepts / products / initiatives / projects → bot_entities (filtered by entity_type)
 */

import { DataAdapter } from './adapter.js';
import { SUPABASE } from '../../config.js';

const SUPABASE_ESM = 'https://esm.sh/@supabase/supabase-js@2.45.4';

/* In-app table → DB table */
const TBL = {
  portfolios:         'wb_portfolios',
  individuals:        'wb_individuals',
  entities:           'wb_entities',
  formations:         'wb_formations',
  formation_members:  'wb_formation_members',
  formation_entities: 'wb_formation_entities',
  project_phases:     'wb_project_phases',
  audit_log:          'wb_audit_log',
  baselines:          'wb_baselines'
};

/* bot_entities entity_type filter for in-app categories */
const BOT_TYPE_BY_KIND = {
  concept:    'مفهوم',
  product:    'منتج',
  initiative: 'مبادرة',
  project:    'مشروع'
};

export class SupabaseAdapter extends DataAdapter {
  constructor() {
    super();
    this.client = null;
    this.realtimeChannel = null;
  }

  async init() {
    const mod = await import(SUPABASE_ESM);
    this.client = mod.createClient(SUPABASE.url, SUPABASE.anon, {
      auth: { persistSession:false },
      realtime: { params: { eventsPerSecond:5 } }
    });
    /* sanity check */
    const { error } = await this.client.from('wb_portfolios').select('id', { head:true, count:'exact' });
    if (error) throw new Error('Supabase init failed: ' + error.message);
    return true;
  }

  async loadAll() {
    const c = this.client;
    const [
      portfolios, individuals, entities,
      formations, formMembers, formEntities,
      botEntities, projectPhases,
      auditLog, baselines
    ] = await Promise.all([
      c.from('wb_portfolios').select('*').order('sort_order'),
      c.from('wb_individuals').select('*').order('name_ar'),
      c.from('wb_entities').select('*').order('name_ar'),
      c.from('wb_formations').select('*').order('sort_order'),
      c.from('wb_formation_members').select('*'),
      c.from('wb_formation_entities').select('*'),
      c.from('bot_entities').select('*').eq('is_active', true).order('id'),
      c.from('wb_project_phases').select('*').order('sort_order'),
      c.from('wb_audit_log').select('*').order('created_at', { ascending:false }).limit(200),
      c.from('wb_baselines').select('id, name, description, created_by, created_at').order('created_at', { ascending:false })
    ]);

    const err = [
      portfolios, individuals, entities, formations,
      formMembers, formEntities, botEntities, projectPhases,
      auditLog, baselines
    ].find(r => r.error);
    if (err) throw new Error('Load failed: ' + err.error.message);

    /* Split bot_entities by entity_type */
    const beAll = botEntities.data || [];
    const beBy = (t) => beAll.filter(r => r.entity_type === t);

    return {
      portfolios:         portfolios.data || [],
      individuals:        individuals.data || [],
      entities:           entities.data || [],
      formations:         formations.data || [],
      formation_members:  formMembers.data || [],
      formation_entities: formEntities.data || [],
      concepts:           beBy('مفهوم'),
      products:           beBy('منتج'),
      initiatives:        beBy('مبادرة'),
      projects:           beBy('مشروع'),
      project_phases:     projectPhases.data || [],
      audit_log:          auditLog.data || [],
      baselines:          baselines.data || []
    };
  }

  /* ─── Generic CRUD ───────────────────────────────────────────── */
  async create(table, record) {
    /* Special-case bot_entities (concepts/products/initiatives/projects) */
    if (['concepts','products','initiatives','projects'].includes(table)) {
      record = { ...record, entity_type: BOT_TYPE_BY_KIND[table.replace(/s$/,'')] };
      const { data, error } = await this.client.from('bot_entities').insert(record).select().single();
      if (error) throw error;
      return data;
    }
    const dbTbl = TBL[table];
    if (!dbTbl) throw new Error('Unknown table: ' + table);
    const { data, error } = await this.client.from(dbTbl).insert(record).select().single();
    if (error) throw error;
    return data;
  }

  async update(table, id, patch) {
    if (['concepts','products','initiatives','projects'].includes(table)) {
      const { data, error } = await this.client.from('bot_entities').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    }
    const dbTbl = TBL[table];
    if (!dbTbl) throw new Error('Unknown table: ' + table);
    const { data, error } = await this.client.from(dbTbl).update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  async remove(table, id) {
    if (['concepts','products','initiatives','projects'].includes(table)) {
      /* Soft-delete by setting is_active=false to preserve history */
      const { error } = await this.client.from('bot_entities').update({ is_active:false }).eq('id', id);
      if (error) throw error;
      return true;
    }
    const dbTbl = TBL[table];
    if (!dbTbl) throw new Error('Unknown table: ' + table);
    const { error } = await this.client.from(dbTbl).delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  /* ─── Composite ops for M:N tables ───────────────────────────── */
  async addMember(formation_id, individual_id) {
    const { error } = await this.client.from('wb_formation_members')
      .upsert({ formation_id, individual_id });
    if (error) throw error;
    return true;
  }
  async removeMember(formation_id, individual_id) {
    const { error } = await this.client.from('wb_formation_members')
      .delete().eq('formation_id', formation_id).eq('individual_id', individual_id);
    if (error) throw error;
    return true;
  }
  async addFormationEntity(formation_id, entity_id) {
    const { error } = await this.client.from('wb_formation_entities')
      .upsert({ formation_id, entity_id });
    if (error) throw error;
    return true;
  }
  async removeFormationEntity(formation_id, entity_id) {
    const { error } = await this.client.from('wb_formation_entities')
      .delete().eq('formation_id', formation_id).eq('entity_id', entity_id);
    if (error) throw error;
    return true;
  }

  /* ─── Audit ─────────────────────────────────────────────────── */
  async logAudit(entry) {
    const { data, error } = await this.client.from('wb_audit_log')
      .insert(entry).select().single();
    if (error) { console.warn('audit write failed', error); return null; }
    return data;
  }

  /* ─── Baselines ─────────────────────────────────────────────── */
  async saveBaseline(name, snapshot, description='') {
    const payload = {
      id: 'bl_' + Date.now(),
      name, description,
      snapshot_data: snapshot
    };
    const { data, error } = await this.client.from('wb_baselines').insert(payload).select().single();
    if (error) throw error;
    return data;
  }

  async listBaselines() {
    const { data, error } = await this.client.from('wb_baselines')
      .select('id, name, description, created_by, created_at')
      .order('created_at', { ascending:false });
    if (error) throw error;
    return data || [];
  }

  async getBaseline(id) {
    const { data, error } = await this.client.from('wb_baselines')
      .select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  }

  async deleteBaseline(id) {
    const { error } = await this.client.from('wb_baselines').delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  /* ─── Realtime (future) ─────────────────────────────────────── */
  async subscribe(callback) {
    /* placeholder: wire postgres_changes to a subset of tables for live sync */
  }
  async unsubscribe() {
    if (this.realtimeChannel) {
      await this.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }
}
