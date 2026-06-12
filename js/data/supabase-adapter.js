/**
 * supabase-adapter.js
 * Manzuma Strategic Workbench — Supabase backend.
 *
 * DECOUPLED FROM CLICKUP:
 *   The workbench owns its data in wb_* tables and never reads or writes
 *   the ClickUp-synced tables (bot_entities, pm_snapshots, pm_lists_config…).
 *
 * Future manual linking (phase 2):
 *   wb_concepts.linked_bot_entity_id and wb_items.linked_bot_entity_id
 *   are nullable FKs to bot_entities — a picker UI will populate them
 *   to connect a workbench item to its ClickUp counterpart.
 *
 * Mapping (in-app table → database table):
 *   concepts                        → wb_concepts
 *   products | initiatives | projects → wb_items (entity_type column)
 *   formations                      → wb_formations
 *   formation_members / _entities   → wb_formation_members / _entities
 *   project_phases                  → wb_project_phases
 *   individuals / entities          → wb_individuals / wb_entities
 *   portfolios / audit_log / baselines → wb_*
 */

import { DataAdapter } from './adapter.js';
import { SUPABASE } from '../../config.js';

const SUPABASE_ESM = 'https://esm.sh/@supabase/supabase-js@2.45.4';

/* In-app table → DB table (1:1 tables) */
const TBL = {
  portfolios:         'wb_portfolios',
  individuals:        'wb_individuals',
  entities:           'wb_entities',
  formations:         'wb_formations',
  formation_members:  'wb_formation_members',
  formation_entities: 'wb_formation_entities',
  project_phases:     'wb_project_phases',
  audit_log:          'wb_audit_log',
  baselines:          'wb_baselines',
  concepts:           'wb_concepts'
};

/* Item categories share wb_items; entity_type distinguishes them */
const ITEM_KIND = { products:'منتج', initiatives:'مبادرة', projects:'مشروع' };

export class SupabaseAdapter extends DataAdapter {
  constructor() {
    super();
    this.client = null;
    this.rtChannel = null;
  }

  async init() {
    const mod = await import(SUPABASE_ESM);
    this.client = mod.createClient(SUPABASE.url, SUPABASE.anon, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    /* v4.4: لا فحص للبيانات هنا — RLS يمنع القراءة قبل المصادقة.
       يكفي نجاح إنشاء العميل؛ التحقق الفعلي يتم بعد تسجيل الدخول. */
    return true;
  }

  async loadAll() {
    const c = this.client;
    const [
      portfolios, individuals, entities,
      formations, formMembers, formEntities,
      concepts, items, phases, auditLog, baselines
    ] = await Promise.all([
      c.from('wb_portfolios').select('*').order('sort_order'),
      c.from('wb_individuals').select('*').order('name_ar'),
      c.from('wb_entities').select('*').order('name_ar'),
      c.from('wb_formations').select('*').order('sort_order'),
      c.from('wb_formation_members').select('*'),
      c.from('wb_formation_entities').select('*'),
      c.from('wb_concepts').select('*').eq('is_active', true).order('sort_order'),
      c.from('wb_items').select('*').eq('is_active', true).order('sort_order'),
      c.from('wb_project_phases').select('*').order('sort_order'),
      c.from('wb_audit_log').select('*').order('created_at', { ascending:false }).limit(200),
      c.from('wb_baselines').select('id, name, description, created_by, created_at').order('created_at', { ascending:false })
    ]);

    const failed = [
      portfolios, individuals, entities, formations, formMembers,
      formEntities, concepts, items, phases, auditLog, baselines
    ].find(r => r.error);
    if (failed) throw new Error('Load failed: ' + failed.error.message);

    const allItems = items.data || [];
    const by = (t) => allItems.filter(r => r.entity_type === t);

    return {
      portfolios:         portfolios.data || [],
      individuals:        individuals.data || [],
      entities:           entities.data || [],
      formations:         formations.data || [],
      formation_members:  formMembers.data || [],
      formation_entities: formEntities.data || [],
      concepts:           concepts.data || [],
      products:           by('منتج'),
      initiatives:        by('مبادرة'),
      projects:           by('مشروع'),
      project_phases:     phases.data || [],
      audit_log:          auditLog.data || [],
      baselines:          baselines.data || []
    };
  }

  /* ─── Generic CRUD ───────────────────────────────────────────── */
  async create(table, record) {
    if (ITEM_KIND[table]) {
      record = { ...record, entity_type: ITEM_KIND[table] };
      const { data, error } = await this.client.from('wb_items').insert(record).select().single();
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
    if (ITEM_KIND[table]) {
      const { data, error } = await this.client.from('wb_items').update(patch).eq('id', id).select().single();
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
    /* Soft-delete for concepts & items to preserve history */
    if (table === 'concepts') {
      const { error } = await this.client.from('wb_concepts').update({ is_active:false }).eq('id', id);
      if (error) throw error;
      return true;
    }
    if (ITEM_KIND[table]) {
      const { error } = await this.client.from('wb_items').update({ is_active:false }).eq('id', id);
      if (error) throw error;
      return true;
    }
    /* Hard delete for everything else (individuals, entities, formations, phases…) */
    const dbTbl = TBL[table];
    if (!dbTbl) throw new Error('Unknown table: ' + table);
    const { error } = await this.client.from(dbTbl).delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  /* ─── M:N composite ops ──────────────────────────────────────── */
  async addMember(formation_id, individual_id) {
    const { error } = await this.client.from('wb_formation_members').upsert({ formation_id, individual_id });
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
    const { error } = await this.client.from('wb_formation_entities').upsert({ formation_id, entity_id });
    if (error) throw error;
    return true;
  }
  async removeFormationEntity(formation_id, entity_id) {
    const { error } = await this.client.from('wb_formation_entities')
      .delete().eq('formation_id', formation_id).eq('entity_id', entity_id);
    if (error) throw error;
    return true;
  }

  /* ─── Audit ──────────────────────────────────────────────────── */
  async logAudit(entry) {
    const { data, error } = await this.client.from('wb_audit_log').insert(entry).select().single();
    if (error) { console.warn('audit write failed', error); return null; }
    return data;
  }

  /* ─── Baselines ──────────────────────────────────────────────── */
  async saveBaseline(name, snapshot, description = '') {
    const payload = { id: 'bl_' + Date.now(), name, description, snapshot_data: snapshot };
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
    const { data, error } = await this.client.from('wb_baselines').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  }

  async deleteBaseline(id) {
    const { error } = await this.client.from('wb_baselines').delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  /* ─── User management (v4.4 — owner only, enforced in DB) ────── */
  async listUsers() {
    const { data, error } = await this.client.rpc('wb_list_users');
    if (error) throw error;
    return data || [];
  }

  async setUserRole(userId, role) {
    const { error } = await this.client.rpc('wb_set_user_role', { target: userId, new_role: role });
    if (error) throw error;
    return true;
  }

  /* ─── Realtime (v4.3) ────────────────────────────────────────── */
  /* One channel listening to all workbench display tables.
     The callback receives the raw postgres_changes payload;
     debouncing / self-echo suppression is the Store's concern. */
  async subscribe(callback) {
    if (this.rtChannel) await this.unsubscribe();
    const tables = [
      'wb_portfolios','wb_concepts','wb_items','wb_project_phases',
      'wb_formations','wb_formation_members','wb_formation_entities',
      'wb_individuals','wb_entities'
    ];
    let ch = this.client.channel('wb-realtime');
    for (const table of tables) {
      ch = ch.on('postgres_changes', { event:'*', schema:'public', table }, callback);
    }
    this.rtChannel = ch;
    return new Promise((resolve) => {
      ch.subscribe((status) => resolve(status === 'SUBSCRIBED'));
      setTimeout(() => resolve(false), 8000);  /* never hang boot */
    });
  }

  async unsubscribe() {
    if (this.rtChannel) {
      await this.client.removeChannel(this.rtChannel);
      this.rtChannel = null;
    }
  }

  /* ─── Snapshot import (v4.3 — backup restore via upsert) ─────── */
  /* Restores data tables only. audit_log/baselines are history and
     are intentionally NOT imported. Items are merged back into
     wb_items with their stored entity_type. */
  async importSnapshot(snap) {
    const c = this.client;
    const counts = {};
    const up = async (dbTbl, rows, key = 'id') => {
      if (!rows || !rows.length) { counts[dbTbl] = 0; return; }
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await c.from(dbTbl).upsert(rows.slice(i, i + 200), { onConflict: key });
        if (error) throw new Error(dbTbl + ': ' + error.message);
      }
      counts[dbTbl] = rows.length;
    };
    /* Order respects FKs: parents before children */
    await up('wb_portfolios',  snap.portfolios);
    await up('wb_individuals', snap.individuals);
    await up('wb_entities',    snap.entities);
    await up('wb_concepts',    snap.concepts);
    const items = [
      ...(snap.products || []), ...(snap.initiatives || []), ...(snap.projects || [])
    ].map(({ _kind, ...r }) => r);
    await up('wb_items', items);
    await up('wb_formations', snap.formations);
    await up('wb_formation_members',  snap.formation_members,  'formation_id,individual_id');
    await up('wb_formation_entities', snap.formation_entities, 'formation_id,entity_id');
    await up('wb_project_phases', snap.project_phases);
    return counts;
  }

  /* ─── ClickUp bridge (phase 2 — manual linking, READ-ONLY) ───── */
  /* bot_entities and pm_snapshots are fully RLS-locked for anon.
     Access goes through two SECURITY DEFINER RPCs that expose only
     the minimal read-only surface. The workbench NEVER writes to
     the ClickUp layer. */
  async listClickUpEntities() {
    const { data, error } = await this.client.rpc('wb_list_clickup_entities');
    if (error) throw error;
    return data || [];
  }

  async getClickUpStats() {
    const { data, error } = await this.client.rpc('wb_clickup_list_stats');
    if (error) throw error;
    return data || [];
  }
}
