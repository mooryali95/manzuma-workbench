/**
 * views/portfolios.js
 * Top-level kanban view: 4 columns (3 portfolios + Uncategorized).
 * Drag concepts between columns to assign portfolio.
 */

import { wireDraggable, wireDropZone } from '../components/drag-drop.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { openForm } from '../components/modal.js';
import { linkBadgeHtml } from '../components/clickup-link.js';
import { countsForConcept, uid } from '../models.js';
import { escapeText, timeAgo } from '../utils.js';

const UNCAT = 'uncat';

export function renderPortfolios(root, store, router) {
  root.innerHTML = '';
  const s = store.state;

  const portfolios = (s.portfolios || []).slice().sort((a,b) => (a.sort_order||0) - (b.sort_order||0));
  const allPfs = [...portfolios, { id:UNCAT, name_ar:'غير مصنف', description_ar:'مفاهيم لم تُصنَّف بعد', color:'#888780', bg_color:'#F1ECDF' }];

  /* ─── KPIs ─── */
  const kpiStrip = document.createElement('section');
  kpiStrip.className = 'kpi-strip';
  const stats = computeStats(s);
  kpiStrip.innerHTML = `
    ${kpiCard('المحافظ', portfolios.length)}
    ${kpiCard('المفاهيم', stats.concepts)}
    ${kpiCard('المنتجات', stats.products)}
    ${kpiCard('المبادرات', stats.initiatives)}
    ${kpiCard('المشاريع', stats.projects)}
    ${kpiCard('متوسط الإنجاز', stats.avgProgress + '%')}
  `;
  root.appendChild(kpiStrip);

  /* ─── Baseline strip ─── */
  const baseline = (s.baselines || [])[0];
  const bl = document.createElement('div');
  bl.className = 'baseline-strip' + (baseline ? '' : ' no-baseline');
  if (baseline) {
    const ago = timeAgo(baseline.created_at);
    bl.innerHTML = `
      <span>🎯 آخر Baseline: ${escapeText(baseline.name)} · ${ago}</span>
      <span class="changes" id="bl-changes-count">— تغييرات</span>
    `;
  } else {
    bl.innerHTML = `<span>لم يتم تثبيت Baseline بعد</span><span style="font-size:10px">ابدأ بتثبيت Baseline لتتبع التغييرات</span>`;
  }
  root.appendChild(bl);

  /* Live change count vs latest baseline (snapshot hydrated at boot) */
  if (baseline && store.baseline) {
    const n = store.diffFromBaseline().length;
    const cEl = bl.querySelector('#bl-changes-count');
    if (cEl) cEl.textContent = n === 0 ? 'لا تغييرات منذ التثبيت' : `${n} تغيير منذ التثبيت`;
  }

  /* ─── Kanban ─── */
  const kanban = document.createElement('section');
  kanban.className = 'kanban';

  allPfs.forEach(pf => {
    const col = document.createElement('div');
    col.className = 'column';
    col.dataset.pf = pf.id;

    const conceptsHere = pf.id === UNCAT ? store.conceptsUnassigned() : store.conceptsInPortfolio(pf.id);

    col.innerHTML = `
      <div class="column-head">
        <div class="pf-name">${escapeText(pf.name_ar)}</div>
        <div class="pf-count">${conceptsHere.length} مفهوم</div>
      </div>
      <div class="column-body" data-body="${pf.id}"></div>
    `;

    const body = col.querySelector('[data-body]');
    if (conceptsHere.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'dropzone-hint';
      hint.textContent = pf.id === UNCAT ? 'لا توجد مفاهيم غير مصنفة' : 'اسحب مفهوماً هنا';
      body.appendChild(hint);
    } else {
      conceptsHere.forEach(c => body.appendChild(renderConceptCard(c, store, router)));
    }

    /* Wire the column as a drop zone */
    wireDropZone(col, 'concept', async (payload) => {
      const newPfId = pf.id === UNCAT ? null : pf.id;
      const concept = (store.state.concepts || []).find(c => String(c.id) === String(payload.id));
      if (!concept) return;
      if (concept.portfolio_id === newPfId) return;

      const before = concept.portfolio_id;
      try {
        await store.actUpdate('concepts', concept.id, { portfolio_id: newPfId });
        await store.logAudit({
          action: 'concept_portfolio_change',
          entity_type:'concept', entity_id: String(concept.id),
          before_data:{ portfolio_id: before },
          after_data: { portfolio_id: newPfId },
          summary_ar: `«${concept.name}» → ${pf.name_ar}`
        });
        toastSuccess(`تم نقل «${concept.name}» إلى ${pf.name_ar}`);
        renderPortfolios(root, store, router);
      } catch (e) {
        toastError('فشل النقل: ' + e.message);
      }
    });

    /* Add-concept button */
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-add';
    addBtn.style.cssText = 'width:100%;margin-top:10px;justify-content:center;padding:8px;';
    addBtn.textContent = '+ مفهوم جديد';
    addBtn.addEventListener('click', () => openAddConceptModal(store, router, pf, root));
    col.appendChild(addBtn);

    kanban.appendChild(col);
  });

  root.appendChild(kanban);

  /* ─── Changes panel ─── */
  const changesPanel = document.createElement('section');
  changesPanel.className = 'changes-panel';
  changesPanel.innerHTML = `
    <h3>سجل التغييرات الأخيرة</h3>
    <div class="changes-list" id="audit-list"></div>
  `;
  root.appendChild(changesPanel);
  renderAuditList(changesPanel.querySelector('#audit-list'), s.audit_log || []);
}

function renderConceptCard(concept, store, router) {
  const card = document.createElement('div');
  card.className = 'concept-card';
  card.dataset.conceptId = concept.id;

  const counts = countsForConcept(store, concept.id);
  card.innerHTML = `
    <div class="cc-head">
      <div class="cc-name">${escapeText(concept.name)}</div>
      ${linkBadgeHtml(store, concept)}
    </div>
    <div class="cc-stats">
      <span><b>${counts.formations}</b> تشكيل</span>
      <span><b>${counts.products}</b> منتج</span>
      <span><b>${counts.initiatives}</b> مبادرة</span>
      <span><b>${counts.projects}</b> مشروع</span>
    </div>
  `;

  wireDraggable(card, { type:'concept', id: String(concept.id) });

  card.addEventListener('click', () => {
    router.navigate('portfolio', { pf: concept.portfolio_id || UNCAT, focus: concept.id });
  });
  return card;
}

function renderAuditList(root, log) {
  root.innerHTML = '';
  if (!log.length) {
    root.innerHTML = '<div style="font-size:11px;color:var(--ink-4);padding:8px 0">لا توجد تغييرات بعد</div>';
    return;
  }
  log.slice(0, 12).forEach(e => {
    const row = document.createElement('div');
    row.className = 'change-row';
    const iconClass = e.action?.includes('create') ? 'add'
                   : e.action?.includes('remove') ? 'del'
                   : e.action?.includes('portfolio') ? 'move'
                   : 'edit';
    const iconSym = iconClass === 'add' ? '+' : iconClass === 'del' ? '−' : iconClass === 'move' ? '↗' : '✎';
    row.innerHTML = `
      <span class="icon ${iconClass}">${iconSym}</span>
      <span class="summary">${escapeText(e.summary_ar || e.action || '—')}</span>
      <span class="ago">${timeAgo(e.created_at)}</span>
    `;
    root.appendChild(row);
  });
}

/* ─── Helpers ─── */
function kpiCard(label, value) {
  return `<div class="kpi"><div class="kpi-label">${escapeText(label)}</div><div class="kpi-value">${escapeText(value)}</div></div>`;
}
function computeStats(s) {
  const projects = (s.projects || []).filter(p => p.is_active !== false);
  /* Phase-based progress avg */
  let total = 0, count = 0;
  for (const proj of projects) {
    const phases = (s.project_phases || []).filter(ph => String(ph.item_id) === String(proj.id));
    if (phases.length) {
      const avg = phases.reduce((a,b)=> a + (b.progress||0), 0) / phases.length;
      total += avg; count++;
    }
  }
  return {
    concepts: (s.concepts||[]).filter(x => x.is_active !== false).length,
    products: (s.products||[]).filter(x => x.is_active !== false).length,
    initiatives: (s.initiatives||[]).filter(x => x.is_active !== false).length,
    projects: projects.length,
    avgProgress: count ? Math.round(total / count) : 0
  };
}

/* ─── Add concept modal ─── */
function openAddConceptModal(store, router, pf, root) {
  const isUncat = pf.id === 'uncat';
  openForm({
    title: isUncat ? 'مفهوم جديد (غير مصنف)' : `مفهوم جديد في «${pf.name_ar}»`,
    fields: [
      { name:'name', label:'اسم المفهوم', required:true, placeholder:'مثل: «بناء الأهلية»' },
      { name:'description', label:'الوصف (اختياري)', type:'textarea' }
    ],
    confirm: async (data) => {
      if (!data.name) return false;
      try {
        const row = await store.actCreate('concepts', {
          id: uid('cn'),
          name: data.name,
          description: data.description || null,
          portfolio_id: isUncat ? null : pf.id,
          is_active: true,
          sort_order: (store.state.concepts || []).length
        });
        await store.logAudit({
          action:'concept_create', entity_type:'concept', entity_id:String(row.id),
          summary_ar:`إنشاء مفهوم «${data.name}»`
        });
        toastSuccess(`تم إنشاء «${data.name}»`);
        renderPortfolios(root, store, router);
      } catch (e) { toastError('فشل الإنشاء: ' + e.message); }
    }
  });
}

