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
import { toastSuccess } from './components/toast.js';

export class Store {

  constructor(adapter) {
    this.adapter = adapter;
    this.state = null;
    this.baseline = null;     /* snapshot for change tracking */
    this.subscribers = new Set();
    this.lastLocalWriteAt = 0;   /* realtime self-echo suppression */
    this._rtTimer = null;
    this.auth = null;            /* v4.4: AuthManager (null = local mode) */
  }

  /* v4.4: يُستدعى مرة بعد المصادقة الناجحة */
  attachAuth(auth) { this.auth = auth; }

  get canWrite() { return this.auth ? this.auth.canWrite : true; }

  assertWrite() {
    if (!this.canWrite) {
      throw new Error('صلاحيتك للقراءة فقط — اطلب ترقية الدور من مالك النظام');
    }
  }

  get isProposer() { return this.auth ? this.auth.canPropose : false; }

  /* بوابة المقترحات (v5.6): إن كان المستخدم مقترِحاً، حوّل الكتابة لمقترح
     معلّق بدل تطبيقها. يرمي PROPOSAL_SUBMITTED ليعرض UI رسالة مناسبة. */
  async _maybePropose(op, table, recordOrId, patch, summary) {
    if (!this.isProposer) return false;
    /* الاسم المنطقي → الجدول الفعلي + entity_type للعناصر */
    const ITEM_KIND = { products:'منتج', initiatives:'مبادرة', projects:'مشروع' };
    const dbTable = ITEM_KIND[table] ? 'wb_items'
                  : ({ concepts:'wb_concepts', portfolios:'wb_portfolios',
                       individuals:'wb_individuals', entities:'wb_entities',
                       formations:'wb_formations', project_phases:'wb_project_phases' }[table] || table);
    let payload = op === 'create' ? { ...recordOrId } : { ...patch };
    if (ITEM_KIND[table] && op === 'create') payload.entity_type = ITEM_KIND[table];
    const recordId = op === 'create' ? (recordOrId.id || null) : recordOrId;
    let before = null;
    if (op !== 'create') {
      const arr = this.state[table] || [];
      before = arr.find(r => String(r.id) === String(recordId)) || null;
    }
    await this.adapter.createProposal({
      op, target_table: dbTable, record_id: recordId ? String(recordId) : null,
      payload, before_data: before, summary_ar: summary || null,
      proposer_email: this.auth?.user?.email || null
    });
    toastSuccess('أُرسل تعديلك كمقترح — بانتظار اعتماد المالك');
    const e = new Error('PROPOSAL_SUBMITTED');
    e.code = 'PROPOSAL_SUBMITTED';
    throw e;
  }

  markLocalWrite() { this.lastLocalWriteAt = Date.now(); }

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

  /* alias توافقي (v4.5.2) — يحمي من أي مزيج نسخ مخبأة بين الملفات */
  conceptsOfPortfolio(pfId) { return this.conceptsInPortfolio(pfId); }

  conceptsInPortfolio(pfId) {
    return (this.state.concepts || []).filter(c => c.portfolio_id === pfId && c.is_active !== false);
  }
  conceptsUnassigned() {
    return (this.state.concepts || []).filter(c => !c.portfolio_id && c.is_active !== false);
  }
  formationsForConcept(conceptId) {
    return (this.state.formations || [])
      .filter(f => String(f.concept_id) === String(conceptId));
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
    /* Products, initiatives AND projects (v4.7) can be linked to a
       formation — all live in wb_items and carry formation_id. */
    const pick = (arr) => (arr || []).filter(p => p.formation_id === formationId && p.is_active !== false);
    return [...pick(this.state.products), ...pick(this.state.initiatives), ...pick(this.state.projects)];
  }

  /* ─── تحويل نوع العنصر (v4.7): منتج ⇄ مبادرة ⇄ مشروع ─── */
  async convertItemKind(item, oldKindUi, newKindUi) {
    const AR = { product:'منتج', initiative:'مبادرة', project:'مشروع' };
    const TBL = { product:'products', initiative:'initiatives', project:'projects' };
    if (oldKindUi === newKindUi) return false;
    this.assertWrite();
    await this.actUpdate(TBL[oldKindUi], item.id, { entity_type: AR[newKindUi] });
    /* نقل السجل بين السلال في الذاكرة */
    const arrOld = this.state[TBL[oldKindUi]] || [];
    const idx = arrOld.findIndex(p => String(p.id) === String(item.id));
    if (idx > -1) {
      const moved = arrOld.splice(idx, 1)[0];
      moved.entity_type = AR[newKindUi];
      (this.state[TBL[newKindUi]] ??= []).push(moved);
    }
    await this.logAudit({
      action:'item_convert', entity_type:newKindUi, entity_id:String(item.id),
      summary_ar:`تحويل «${item.name}»: ${AR[oldKindUi]} ← ${AR[newKindUi]}`
    });
    return true;
  }
  productsOfConcept(conceptId) {
    return (this.state.products || []).filter(p => String(p.parent_id) === String(conceptId) && p.is_active !== false);
  }
  initiativesOfConcept(conceptId) {
    return (this.state.initiatives || []).filter(i => String(i.parent_id) === String(conceptId) && i.is_active !== false);
  }
  projectsOfConcept(conceptId) {
    return (this.state.projects || []).filter(p => String(p.parent_id) === String(conceptId) && p.is_active !== false);
  }
  /* ─── المحفظة الفعلية (v4.5) ─── */
  allItems() {
    const out = [];
    const push = (arr, kind) => (arr || []).forEach(x => {
      if (x.is_active !== false) out.push({ ...x, _kind: kind });
    });
    push(this.state.products, 'product');
    push(this.state.initiatives, 'initiative');
    push(this.state.projects, 'project');
    return out;
  }
  conceptById(id) {
    return (this.state.concepts || []).find(c => String(c.id) === String(id)) || null;
  }
  portfolioById(id) {
    return (this.state.portfolios || []).find(p => String(p.id) === String(id)) || null;
  }
  /* portfolio_override_id إن وُجد، وإلا محفظة المفهوم الأم */
  effectivePortfolioId(item) {
    if (item?.portfolio_override_id) return String(item.portfolio_override_id);
    const concept = this.conceptById(item?.parent_id);
    return concept?.portfolio_id ? String(concept.portfolio_id) : null;
  }
  /* عناصر واردة لمحفظة عبر التجاوز (مفهومها الأم في محفظة أخرى) */
  incomingItemsOfPortfolio(pfId) {
    return this.allItems().filter(i => {
      if (!i.portfolio_override_id || String(i.portfolio_override_id) !== String(pfId)) return false;
      const home = this.conceptById(i.parent_id)?.portfolio_id;
      return String(home) !== String(pfId);
    });
  }

  phasesOfProject(projectId) {
    return (this.state.project_phases || [])
      .filter(p => String(p.item_id) === String(projectId))
      .sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }
  childrenOf(parentId) {
    /* All bot_entities whose parent is this id, of any kind */
    const ids = new Set();
    const out = [];
    const push = (arr, kind) => {
      arr.forEach(x => {
        if (String(x.parent_id) === String(parentId) && !ids.has(x.id)) {
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
  async actCreate(table, record, summary) {
    if (await this._maybePropose('create', table, record, null, summary)) return null;
    this.assertWrite();
    this.markLocalWrite();
    const row = await this.adapter.create(table, record);
    if (row) {
      this.state[table] ??= [];
      this.state[table].push(row);
      this.emit();
    }
    return row;
  }
  async actUpdate(table, id, patch, summary) {
    if (await this._maybePropose('update', table, id, patch, summary)) return null;
    this.assertWrite();
    this.markLocalWrite();
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
    this.assertWrite();
    this.markLocalWrite();
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
    this.markLocalWrite();
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
    this.markLocalWrite();
    if (this.adapter.removeMember) {
      await this.adapter.removeMember(formationId, individualId);
    }
    this.state.formation_members = (this.state.formation_members || [])
      .filter(m => !(m.formation_id === formationId && m.individual_id === individualId));
    this.emit();
  }
  async actAddEntityToFormation(formationId, entityId) {
    this.markLocalWrite();
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
    this.markLocalWrite();
    if (this.adapter.removeFormationEntity) {
      await this.adapter.removeFormationEntity(formationId, entityId);
    }
    this.state.formation_entities = (this.state.formation_entities || [])
      .filter(e => !(e.formation_id === formationId && e.entity_id === entityId));
    this.emit();
  }

  /* ─── Realtime (v4.3) ───────────────────────────────────────── */
  /* Starts the adapter's realtime channel. Remote changes trigger a
     debounced full reload; writes made from THIS tab within the last
     2.5s are treated as self-echo and ignored. */
  async startRealtime(onRemoteChange) {
    if (!this.adapter.subscribe) return false;
    const ok = await this.adapter.subscribe(() => {
      if (Date.now() - this.lastLocalWriteAt < 2500) return;  /* own echo */
      clearTimeout(this._rtTimer);
      this._rtTimer = setTimeout(async () => {
        try {
          await this.reload();
          onRemoteChange?.();
        } catch (e) { console.warn('realtime reload failed:', e.message); }
      }, 600);
    });
    return ok;
  }

  /* ─── Export / Import (v4.3) ────────────────────────────────── */
  exportSnapshot() {
    const data = structuredClone(this.state);
    delete data.baselines;   /* history stays server-side */
    delete data.audit_log;
    return {
      meta: {
        app: 'manzuma-workbench',
        version: 4,
        exported_at: new Date().toISOString()
      },
      data
    };
  }

  async importSnapshot(parsed) {
    this.assertWrite();
    if (!parsed || parsed.meta?.app !== 'manzuma-workbench' || !parsed.data) {
      throw new Error('ملف غير صالح — ليس نسخة احتياطية من الورشة');
    }
    this.markLocalWrite();
    const counts = await this.adapter.importSnapshot(parsed.data);
    await this.reload();
    return counts;
  }

  /* ─── Audit ─────────────────────────────────────────────────── */
  async logAudit(entry) {
    const row = await this.adapter.logAudit({
      ...entry,
      actor: entry.actor || this.auth?.user?.email || 'workbench-user',
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
    this.assertWrite();
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
