/**
 * models.js
 * Domain helpers and small utilities that work over the state shape.
 */

/* ─── ID generation ─────────────────────────────────────────────── */
let _seq = 0;
export function uid(prefix='id') {
  _seq = (_seq + 1) % 100000;
  return `${prefix}_${Date.now().toString(36)}${_seq.toString(36).padStart(3,'0')}`;
}

/* ─── Formation kind detection ──────────────────────────────────── */
export function formationKind(formation, store) {
  const n = store ? store.membersOfFormation(formation.id).length : 0;
  if (n === 0) return 'فارغ';
  if (n === 1) return 'Solo';
  if (n === 2) return 'Duo';
  if (n === 3) return 'Trio';
  return 'Group';
}

/* ─── Status helpers ────────────────────────────────────────────── */
export const PHASE_STATUSES = {
  not_started: { label_ar:'لم يبدأ',    color:'idle' },
  in_progress: { label_ar:'قيد التنفيذ', color:'warn' },
  completed:   { label_ar:'مكتمل',     color:'good' },
  blocked:     { label_ar:'متعثر',     color:'danger' }
};

export function statusLabelAr(status) {
  return PHASE_STATUSES[status]?.label_ar || status || '—';
}

/* ─── Sectors and kinds (for dropdowns) ─────────────────────────── */
export const SECTORS = ['ربحي','غير ربحي','أكاديمي','مبادرة','ابتكار','أخرى'];
export const ENTITY_KINDS = ['شركة','شركة غ.ر','جمعية','مبادرة','مركز','وقف','أخرى'];

/* ─── Project / Initiative kind ─────────────────────────────────── */
export function entityKind(record) {
  /* "kind" used in UI to mean the bot_entities.entity_type */
  return record.entity_type;
}
export function isProject(record)    { return record.entity_type === 'مشروع'; }
export function isInitiative(record) { return record.entity_type === 'مبادرة'; }
export function isProduct(record)    { return record.entity_type === 'منتج'; }
export function isConcept(record)    { return record.entity_type === 'مفهوم'; }

/* Map UI kind → bot_entities.entity_type */
export const UI_TO_BOT_KIND = {
  concept:'مفهوم', product:'منتج', initiative:'مبادرة', project:'مشروع', general:'عام'
};

/* ─── Counts ─────────────────────────────────────────────────────── */
export function countsForConcept(store, conceptId) {
  return {
    products:    store.productsOfConcept(conceptId).length,
    initiatives: store.initiativesOfConcept(conceptId).length,
    projects:    store.projectsOfConcept(conceptId).length,
    formations:  store.formationsForConcept(conceptId).length
  };
}

/* ─── Aggregate avg progress for a project (from phases) ────────── */
export function projectProgress(store, projectId) {
  const phases = store.phasesOfProject(projectId);
  if (!phases.length) return 0;
  const total = phases.reduce((s, p) => s + (p.progress || 0), 0);
  return Math.round(total / phases.length);
}

export function projectStatus(store, projectId) {
  const phases = store.phasesOfProject(projectId);
  if (!phases.length) return 'not_started';
  if (phases.some(p => p.status === 'blocked')) return 'blocked';
  if (phases.every(p => p.status === 'completed')) return 'completed';
  if (phases.some(p => p.status === 'in_progress' || p.status === 'completed')) return 'in_progress';
  return 'not_started';
}
