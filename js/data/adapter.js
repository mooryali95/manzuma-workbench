/**
 * adapter.js
 * Data Adapter Interface (contract)
 *
 * Each concrete adapter (local, supabase, clickup) implements these methods.
 * The Store uses this interface — never the concrete adapter directly.
 *
 * Design principles:
 *  - All methods return Promises
 *  - Schema is dictated by schema.js — adapters translate to their backend
 *  - Adapters do NOT mutate the schema (only persist/load)
 */

export class DataAdapter {

  async init() {
    /* connect, verify, prepare. Called once at app start */
    throw new Error('init() not implemented');
  }

  /* ─── Bulk load: full hydrate for app boot ─── */
  async loadAll() {
    /* returns: {
         portfolios:[], individuals:[], entities:[],
         formations:[], formation_members:[], formation_entities:[],
         concepts:[], products:[], initiatives:[], projects:[],
         project_phases:[], audit_log:[], baselines:[]
       } */
    throw new Error('loadAll() not implemented');
  }

  /* ─── Generic CRUD ─── */
  async create(table, record) { throw new Error('create() not implemented'); }
  async update(table, id, patch) { throw new Error('update() not implemented'); }
  async remove(table, id) { throw new Error('remove() not implemented'); }

  /* ─── Audit ─── */
  async logAudit(entry) { throw new Error('logAudit() not implemented'); }

  /* ─── Baseline ─── */
  async saveBaseline(name, snapshot) { throw new Error('saveBaseline() not implemented'); }
  async listBaselines() { throw new Error('listBaselines() not implemented'); }
  async deleteBaseline(id) { throw new Error('deleteBaseline() not implemented'); }

  /* ─── ClickUp bridge (read-only, optional) ─── */
  async listClickUpEntities() { return []; }
  async getClickUpStats() { return []; }

  /* ─── Subscribe (real-time, optional) ─── */
  async subscribe(callback) { /* override if backend supports real-time */ }
  async unsubscribe() { /* override if backend supports real-time */ }
}
