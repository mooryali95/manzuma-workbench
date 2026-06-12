/**
 * components/clickup-link.js
 * Phase 2 — ClickUp bridge (READ-ONLY).
 *
 * The workbench never writes to the ClickUp layer. It reads two
 * SECURITY DEFINER RPCs exposed by the database:
 *   wb_list_clickup_entities()  → linkable directory (bot_entities, active)
 *   wb_clickup_list_stats()     → per-list task stats from latest pm_snapshot
 *
 * The only write is to wb_concepts.linked_bot_entity_id /
 * wb_items.linked_bot_entity_id — workbench-owned columns.
 */

import { escapeText, timeAgo } from '../utils.js';

/* ─── Directory cache (per page-load, refreshed lazily) ─────────── */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Loads (and caches on the store) the ClickUp directory + stats.
 * Safe to call repeatedly; refetches only after TTL expiry.
 * Returns { entities:[], statsByList:Map, snapshotAt, available:bool }
 */
export async function loadClickUpBridge(store, { force = false } = {}) {
  const now = Date.now();
  const cached = store.clickup;
  if (!force && cached && (now - cached.loadedAt) < CACHE_TTL_MS) return cached;

  const bridge = { entities: [], statsByList: new Map(), snapshotAt: null, available: false, loadedAt: now };
  try {
    const [entities, stats] = await Promise.all([
      store.adapter.listClickUpEntities ? store.adapter.listClickUpEntities() : [],
      store.adapter.getClickUpStats ? store.adapter.getClickUpStats() : []
    ]);
    bridge.entities = entities || [];
    for (const row of (stats || [])) {
      bridge.statsByList.set(String(row.list_id), row);
      if (row.snapshot_at && (!bridge.snapshotAt || row.snapshot_at > bridge.snapshotAt)) {
        bridge.snapshotAt = row.snapshot_at;
      }
    }
    bridge.available = bridge.entities.length > 0;
  } catch (e) {
    console.warn('ClickUp bridge unavailable:', e.message);
  }
  store.clickup = bridge;
  return bridge;
}

/* ─── Lookups ────────────────────────────────────────────────────── */
export function clickupEntityById(store, id) {
  if (id === null || id === undefined || id === '') return null;
  return (store.clickup?.entities || []).find(e => String(e.id) === String(id)) || null;
}

export function statsForEntity(store, cuEntity) {
  if (!cuEntity?.source_list_id) return null;
  return store.clickup?.statsByList.get(String(cuEntity.source_list_id)) || null;
}

/* ─── Modal field builder ────────────────────────────────────────── */
/**
 * Builds a select-field config (for openForm) listing all ClickUp
 * entities, grouped visually by entity_type via a label prefix.
 */
export function clickupLinkField(store, currentLinkedId) {
  const entities = store.clickup?.entities || [];
  const options = [{ value: '', label: '— غير مرتبط —' }];
  for (const e of entities) {
    options.push({ value: String(e.id), label: `[${e.entity_type}] ${e.name}` });
  }
  return {
    name: 'linked_bot_entity_id',
    label: 'الربط بـ ClickUp (قراءة فقط)',
    type: 'select',
    value: currentLinkedId !== null && currentLinkedId !== undefined ? String(currentLinkedId) : '',
    options,
    help: entities.length
      ? 'يربط هذا العنصر بكيان تشغيلي في ClickUp لعرض إحصاءات مهامه الحية — دون أي تعديل على بيانات ClickUp.'
      : 'تعذّر تحميل دليل ClickUp حالياً — يمكنك الربط لاحقاً.'
  };
}

/**
 * Normalizes the select value ('' | '14') → null | number,
 * and reports whether it changed vs. the existing record.
 */
export function parseLinkChange(record, formValue) {
  const next = (formValue === '' || formValue === undefined) ? null : Number(formValue);
  const prev = (record.linked_bot_entity_id === null || record.linked_bot_entity_id === undefined)
    ? null : Number(record.linked_bot_entity_id);
  return { next, changed: next !== prev };
}

/** Arabic audit summary for a link/unlink action. */
export function linkAuditEntry(kind, record, store, nextId) {
  const target = clickupEntityById(store, nextId);
  return nextId === null
    ? { action: 'clickup_unlink', entity_type: kind, entity_id: String(record.id),
        summary_ar: `فك ربط «${record.name}» عن ClickUp` }
    : { action: 'clickup_link', entity_type: kind, entity_id: String(record.id),
        summary_ar: `ربط «${record.name}» بكيان ClickUp «${target ? target.name : nextId}»` };
}

/* ─── Presentational helpers ─────────────────────────────────────── */
/** Tiny inline badge for cards/sections of linked records. */
export function linkBadgeHtml(store, record) {
  if (!record?.linked_bot_entity_id) return '';
  const cu = clickupEntityById(store, record.linked_bot_entity_id);
  const title = cu ? `مرتبط بـ ClickUp: ${cu.name}` : 'مرتبط بـ ClickUp';
  return `<span class="cu-badge" title="${escapeText(title)}">🔗 ClickUp</span>`;
}

/** Full live-stats panel for the project detail view. */
export function clickupPanelHtml(store, record) {
  const cu = clickupEntityById(store, record.linked_bot_entity_id);
  if (!cu) {
    return `<div class="cu-panel">
      <div class="cu-panel-head"><span class="cu-badge">🔗 ClickUp</span>
      <span class="cu-panel-name">كيان غير معروف (#${escapeText(record.linked_bot_entity_id)})</span></div>
      <div class="cu-panel-note">تعذّر العثور على الكيان في الدليل — ربما عُطِّل في ClickUp.</div>
    </div>`;
  }
  const st = statsForEntity(store, cu);
  const statCell = (label, val, cls = '') =>
    `<div class="cu-stat ${cls}"><div class="v tnum">${val}</div><div class="l">${escapeText(label)}</div></div>`;

  let body;
  if (!st) {
    body = `<div class="cu-panel-note">لا توجد قائمة مهام مرتبطة بهذا الكيان في آخر Snapshot.</div>`;
  } else {
    body = `<div class="cu-stats">
      ${statCell('الإجمالي', st.total)}
      ${statCell('مفتوحة', st.open_n, 'is-open')}
      ${statCell('جارية', st.inprogress_n, 'is-prog')}
      ${statCell('متأخرة', st.overdue_n, st.overdue_n > 0 ? 'is-late' : '')}
      ${statCell('مغلقة', st.closed_n, 'is-done')}
    </div>
    <div class="cu-panel-note">آخر مزامنة: ${escapeText(timeAgo(st.snapshot_at))} · المصدر: pm_snapshots (قراءة فقط)</div>`;
  }

  return `<div class="cu-panel">
    <div class="cu-panel-head">
      <span class="cu-badge">🔗 ClickUp</span>
      <span class="cu-panel-name">${escapeText(cu.name)}</span>
      <span class="cu-panel-kind">${escapeText(cu.entity_type)}</span>
    </div>
    ${body}
  </div>`;
}
