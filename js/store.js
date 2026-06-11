/**
 * store.js
 * Single source of truth for application state.
 *
 * Responsibilities:
 *  - Hold current state (loaded from adapter)
 *  - Mutate state via well-defined actions
 *  - Notify subscribers (views) of changes
 *  - Persist mutations to the adapter
 *  - Track baseline + diff
 */

import { migrate } from './schema.js';

export class Store {

  constructor(adapter) {
    this.adapter = adapter;
    this.state = null;
    this.baseline = null;     /* snapshot for change tracking */
    this.subscribers = new Set();
  }

  /* ─── Lifecycle ─────────────────────────────────────────────── */
  async boot() {
    const raw = await this.adapter.loadAll();
    this.state = migrate(raw);
    /* Hydrate latest baseline snapshot so diffFromBaseline() works
       immediately (loadAll intentionally excludes the heavy JSONB). */
    try {
      const latest = (this.state.baselines || [])[0];
      if (latest?.snapshot_data) {
        this.baseline = latest.snapshot_data;
      } else if (latest && this.adapter.getBaseline) {
        const full = await this.adapter.getBaseline(latest.id);
        if (full?.snapshot_data) this.baseline = full.snapshot_data;
      }
    } catch (e) { console.warn('baseline hydrate skipped:', e.message); }
    return this.state;
  }

  async reload() {
    const raw = await this.adapter.loadAll();
    this.state = migrate(raw);
    this.emit();
    return this.state;
  }

  /* ─── Subscriptions ─────────────────────────────────────────── */
  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
  emit() {
    this.subscribers.forEach(fn => { try { fn(this.state); } catch(e){ console.error(e); } });
  }

  /* ─── Selectors ─────────────────────────────────────────────── */
  get s() { return this.state; }

  conceptsInPortfolio(pfId) {
    return (this.state.concepts || []).filter(c => c.portfolio_id === pfId);
  }
  conceptsUnassigned() {
    return (this.state.concepts || []).filter(c => !c.portfolio_id);
  }
  formationsForConcept(conceptId) {
    return (this.state.formations || [])
      .filter(f => Number(f.concept_entity_id) === Number(conceptId));
  }
  membersOfFormation(formationId) {
    const links = (this.state.formation_members || []).filter(m => m.formation_id === formationId);
    const map = new Map((this.state.individuals||[]).map(i => [i.id, i]));
    return links.map(l => map.get(l.individual_id)).filter(Boolean);
  }
  entitiesOfFormation(formationId) {
    const links = (this.state.formation_entities || []).filter(e => e.formation_id === formationId);
    const map = new Map((this.state.entities||[]).map(e => [e.id, e]));
    return links.map(l => map.get(l.entity_id)).filter(Boolean);
  }
  productsOfFormation(formationId) {
    /* Products AND initiatives can be linked to a formation —
       both live in bot_entities and carry formation_id. */
    const pick = (arr) => (arr || []).filter(p => p.formation_id === formationId && p.is_active !== false);
    return [...pick(this.state.products), ...pick(this.state.initiatives)];
  }
  productsOfConcept(conceptId) {
    return (this.state.products || []).filter(p => Number(p.parent_id) === Number(conceptId));
  }
  initiativesOfConcept(conceptId) {
    return (this.state.initiatives || []).filter(i => Number(i.parent_id) === Number(conceptId));
  }
  projectsOfConcept(conceptId) {
    return (this.state.projects || []).filter(p => Number(p.parent_id) === Number(conceptId));
  }
  phasesOfProject(projectId) {
    return (this.state.project_phases || [])
      .filter(p => Number(p.project_entity_id) === Number(projectId))
      .sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }
  childrenOf(parentId) {
    /* All bot_entities whose parent is this id, of any kind */
    const ids = new Set();
    const out = [];
    const push = (arr, kind) => {
      arr.forEach(x => {
        if (Number(x.parent_id) === Number(parentId) && !ids.has(x.id)) {
          ids.add(x.id);
          out.push({ ...x, _kind: kind });
        }
      });
    };
    push(this.state.products, 'product');
    push(this.state.initiatives, 'initiative');
    push(this.state.projects, 'project');
    return out;
  }

  /* ─── Actions: create / update / remove ─────────────────────── */
  async actCreate(table, record) {
    const row = await this.adapter.create(table, record);
    if (row) {
      this.state[table] ??= [];
      this.state[table].push(row);
      this.emit();
    }
    return row;
  }
  async actUpdate(table, id, patch) {
    const row = await this.adapter.update(table, id, patch);
    if (row) {
      const arr = this.state[table] || [];
      const idx = arr.findIndex(r => String(r.id) === String(id));
      if (idx > -1) arr[idx] = { ...arr[idx], ...row };
      this.emit();
    }
    return row;
  }
  async actRemove(table, id) {
    await this.adapter.remove(table, id);
    if (['concepts','products','initiatives','projects'].includes(table)) {
      /* soft delete — mark inactive in local cache */
      const arr = this.state[table] || [];
      const idx = arr.findIndex(r => String(r.id) === String(id));
      if (idx > -1) arr[idx].is_active = false;
    } else {
      this.state[table] = (this.state[table] || []).filter(r => String(r.id) !== String(id));
    }
    this.emit();
    return true;
  }

  /* ─── Composite actions (M:N) ───────────────────────────────── */
  async actAddMember(formationId, individualId) {
    if (this.adapter.addMember) {
      await this.adapter.addMember(formationId, individualId);
    }
    this.state.formation_members ??= [];
    if (!this.state.formation_members.find(m => m.formation_id === formationId && m.individual_id === individualId)) {
      this.state.formation_members.push({ formation_id:formationId, individual_id:individualId });
    }
    this.emit();
  }
  async actRemoveMember(formationId, individualId) {
    if (this.adapter.removeMember) {
      await this.adapter.removeMember(formationId, individualId);
    }
    this.state.formation_members = (this.state.formation_members || [])
      .filter(m => !(m.formation_id === formationId && m.individual_id === individualId));
    this.emit();
  }
  async actAddEntityToFormation(formationId, entityId) {
    if (this.adapter.addFormationEntity) {
      await this.adapter.addFormationEntity(formationId, entityId);
    }
    this.state.formation_entities ??= [];
    if (!this.state.formation_entities.find(e => e.formation_id === formationId && e.entity_id === entityId)) {
      this.state.formation_entities.push({ formation_id:formationId, entity_id:entityId });
    }
    this.emit();
  }
  async actRemoveEntityFromFormation(formationId, entityId) {
    if (this.adapter.removeFormationEntity) {
      await this.adapter.removeFormationEntity(formationId, entityId);
    }
    this.state.formation_entities = (this.state.formation_entities || [])
      .filter(e => !(e.formation_id === formationId && e.entity_id === entityId));
    this.emit();
  }

  /* ─── Audit ─────────────────────────────────────────────────── */
  async logAudit(entry) {
    const row = await this.adapter.logAudit({
      ...entry,
      actor: entry.actor || 'workbench-user',
      created_at: new Date().toISOString()
    });
    if (row) {
      this.state.audit_log ??= [];
      this.state.audit_log.unshift(row);
      if (this.state.audit_log.length > 200) {
        this.state.audit_log.length = 200;
      }
    }
    return row;
  }

  /* ─── Baseline ──────────────────────────────────────────────── */
  async setBaseline(name='', description='') {
    const snapshot = structuredClone(this.state);
    delete snapshot.baselines;
    delete snapshot.audit_log;
    const bl = await this.adapter.saveBaseline(name || ('Baseline ' + new Date().toLocaleDateString('ar-SA')), snapshot, description);
    this.baseline = snapshot;
    this.state.baselines ??= [];
    this.state.baselines.unshift({ id: bl.id, name: bl.name, description: bl.description, created_at: bl.created_at });
    this.emit();
    return bl;
  }

  /* Compare current state to baseline → list of changes */
  diffFromBaseline() {
    if (!this.baseline) return [];
    const changes = [];
    const tables = ['concepts','products','initiatives','projects','formations','individuals','entities','project_phases'];
    for (const t of tables) {
      const base = new Map((this.baseline[t] || []).map(x => [String(x.id), x]));
      const curr = new Map((this.state[t] || []).map(x => [String(x.id), x]));
      /* additions */
      for (const [id, row] of curr) {
        if (!base.has(id)) changes.push({ table:t, kind:'add', id, current:row });
      }
      /* deletions */
      for (const [id, row] of base) {
        if (!curr.has(id)) changes.push({ table:t, kind:'remove', id, baseline:row });
      }
      /* modifications */
      for (const [id, row] of curr) {
        const b = base.get(id);
        if (!b) continue;
        if (JSON.stringify(b) !== JSON.stringify(row)) {
          changes.push({ table:t, kind:'modify', id, baseline:b, current:row });
        }
      }
    }
    return changes;
  }
}
