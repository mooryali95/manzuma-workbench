/**
 * views/portfolio.js
 * Portfolio Detail view: shows ALL contents of one portfolio
 *  - Stats header
 *  - Filter bar (text, kind, status)
 *  - Collapsible concept sections, each showing its products/initiatives/projects
 *  - Click an item → navigate to project detail or workbench
 */

import { renderFilterBar } from '../components/filter-bar.js';
import { openForm, confirm as confirmDialog } from '../components/modal.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { countsForConcept, projectProgress, projectStatus, statusLabelAr, uid } from '../models.js';
import { escapeText } from '../utils.js';
import {
  loadClickUpBridge, clickupLinkField, parseLinkChange,
  linkAuditEntry, linkBadgeHtml
} from '../components/clickup-link.js';

const TBL_BY_KIND = { product:'products', initiative:'initiatives', project:'projects' };

const UNCAT = 'uncat';
const filterState = {
  search: '',
  kind: 'all',   /* all | product | initiative | project */
  status: 'all', /* all | not_started | in_progress | completed | blocked */
  link: 'all'    /* all | linked | unlinked  (ClickUp bridge) */
};

export function renderPortfolioDetail(root, store, router, params) {
  root.innerHTML = '';
  /* Preload ClickUp directory in the background (badges/tooltips/modals) */
  loadClickUpBridge(store).catch(() => {});
  const pfId = params.pf || UNCAT;
  const pf = (store.state.portfolios || []).find(p => p.id === pfId) || {
    id: UNCAT, name_ar:'غير مصنف', description_ar:'مفاهيم لم تُصنَّف بعد',
    color:'#888780', bg_color:'#F1ECDF'
  };

  /* ─── Breadcrumb ─── */
  const bc = document.createElement('nav');
  bc.className = 'breadcrumb';
  bc.innerHTML = `
    <a href="#portfolios">المحافظ</a>
    <span class="sep">›</span>
    <span class="current">${escapeText(pf.name_ar)}</span>
  `;
  root.appendChild(bc);

  /* ─── Portfolio header ─── */
  const header = document.createElement('div');
  header.className = 'portfolio-header';
  header.dataset.pf = pf.id;

  const concepts = pfId === UNCAT ? store.conceptsUnassigned() : store.conceptsInPortfolio(pfId);
  const stats = computePortfolioStats(store, concepts);

  header.innerHTML = `
    <div>
      <div class="pf-title">${escapeText(pf.name_ar)}</div>
      <div class="pf-desc">${escapeText(pf.description_ar || '')}</div>
    </div>
    <div class="kpi-strip" style="margin:0;gap:10px;flex:1;max-width:680px;">
      ${kpiSmall('المفاهيم', concepts.length)}
      ${kpiSmall('المنتجات', stats.products)}
      ${kpiSmall('المبادرات', stats.initiatives)}
      ${kpiSmall('المشاريع', stats.projects)}
      ${kpiSmall('متوسط الإنجاز', stats.avgProgress + '%')}
    </div>
  `;
  root.appendChild(header);

  /* ─── Filter bar ─── */
  const filterRoot = document.createElement('div');
  root.appendChild(filterRoot);
  renderFilterBar(filterRoot, {
    search: { placeholder: 'بحث بالاسم...', value: filterState.search },
    chipGroups: [
      {
        key:'kind', label:'النوع', value: filterState.kind,
        options:[
          { value:'all',        label:'الكل' },
          { value:'product',    label:'منتجات' },
          { value:'initiative', label:'مبادرات' },
          { value:'project',    label:'مشاريع' }
        ]
      },
      {
        key:'status', label:'الحالة', value: filterState.status,
        options:[
          { value:'all',         label:'الكل' },
          { value:'not_started', label:'لم تبدأ' },
          { value:'in_progress', label:'جارية' },
          { value:'completed',   label:'مكتملة' },
          { value:'blocked',     label:'متعثرة' }
        ]
      },
      {
        key:'link', label:'ClickUp', value: filterState.link,
        options:[
          { value:'all',      label:'الكل' },
          { value:'linked',   label:'🔗 مرتبط' },
          { value:'unlinked', label:'غير مرتبط' }
        ]
      }
    ],
    onChange: (newState) => {
      filterState.search = newState.search;
      filterState.kind = newState.chips.kind;
      filterState.status = newState.chips.status;
      filterState.link = newState.chips.link;
      renderConceptSections(sectionsRoot, store, router, concepts);
    }
  });

  /* ─── Concept sections ─── */
  const sectionsRoot = document.createElement('div');
  root.appendChild(sectionsRoot);

  if (!concepts.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="icon">📁</div>
      <div class="title">لا توجد مفاهيم في هذه المحفظة</div>
      <div class="desc">عُد للوحة المحافظ واسحب مفهوماً إلى هنا</div>
    `;
    sectionsRoot.appendChild(empty);
    return;
  }

  renderConceptSections(sectionsRoot, store, router, concepts);

  if (params.focus) {
    setTimeout(() => {
      const sec = sectionsRoot.querySelector(`[data-concept-id="${params.focus}"]`);
      if (sec) sec.scrollIntoView({ behavior:'smooth', block:'center' });
    }, 100);
  }
}

function renderConceptSections(root, store, router, concepts) {
  root.innerHTML = '';

  let anyMatched = false;

  for (const c of concepts) {
    const products    = store.productsOfConcept(c.id);
    const initiatives = store.initiativesOfConcept(c.id);
    const projects    = store.projectsOfConcept(c.id);

    /* Compose items list with kind tagging */
    let items = [
      ...products.map(p => ({ ...p, _kind:'product' })),
      ...initiatives.map(p => ({ ...p, _kind:'initiative' })),
      ...projects.map(p => ({ ...p, _kind:'project' }))
    ];

    /* Apply filters */
    if (filterState.kind !== 'all') {
      items = items.filter(i => i._kind === filterState.kind);
    }
    if (filterState.search) {
      const q = filterState.search.toLowerCase();
      items = items.filter(i => (i.name || '').toLowerCase().includes(q));
    }
    if (filterState.status !== 'all') {
      items = items.filter(i => {
        if (i._kind !== 'project') return filterState.status === 'not_started';
        return projectStatus(store, i.id) === filterState.status;
      });
    }
    if (filterState.link !== 'all') {
      const wantLinked = filterState.link === 'linked';
      items = items.filter(i => Boolean(i.linked_bot_entity_id) === wantLinked);
    }

    if (items.length === 0 && filterState.search) continue;

    anyMatched = true;
    const sec = document.createElement('div');
    sec.className = 'concept-section';
    sec.dataset.conceptId = c.id;
    sec.dataset.collapsed = 'false';

    const counts = countsForConcept(store, c.id);
    sec.innerHTML = `
      <div class="concept-section-head">
        <div class="lhs">
          <div class="cs-name">${escapeText(c.name)} ${linkBadgeHtml(store, c)}</div>
          <div class="cs-stats">
            <span><b>${counts.products}</b> منتج</span>
            <span><b>${counts.initiatives}</b> مبادرة</span>
            <span><b>${counts.projects}</b> مشروع</span>
            <span><b>${counts.formations}</b> تشكيل</span>
          </div>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <a class="btn ghost sm" href="#workbench?concept=${encodeURIComponent(c.id)}">🛠 ورشة الهيكل</a>
          <button class="btn ghost sm" data-act="add-project" data-concept-id="${c.id}">+ عنصر جديد</button>
          <button class="btn ghost sm" data-act="edit-concept" title="تعديل المفهوم">✎</button>
          <button class="btn ghost sm" data-act="del-concept" title="حذف المفهوم" style="color:var(--danger)">حذف</button>
          <button class="toggle" aria-label="طيّ">▾</button>
        </div>
      </div>
      <div class="concept-section-body">
        <div class="items-grid"></div>
      </div>
    `;

    /* Toggle */
    const head = sec.querySelector('.concept-section-head');
    head.addEventListener('click', (e) => {
      if (e.target.closest('button.btn') || e.target.closest('a')) return;
      sec.dataset.collapsed = sec.dataset.collapsed === 'true' ? 'false' : 'true';
    });

    /* Add project/initiative */
    sec.querySelector('[data-act="add-project"]').addEventListener('click', (e) => {
      e.stopPropagation();
      openAddProjectModal(store, router, c);
    });

    /* Edit / delete concept */
    sec.querySelector('[data-act="edit-concept"]').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditConceptModal(store, router, c);
    });
    sec.querySelector('[data-act="del-concept"]').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConcept(store, router, c);
    });

    /* Items grid */
    const grid = sec.querySelector('.items-grid');
    if (!items.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:14px 8px;font-size:11px;color:var(--ink-3);text-align:center;font-style:italic';
      empty.textContent = 'لا توجد عناصر مطابقة';
      grid.appendChild(empty);
    } else {
      items.forEach(item => grid.appendChild(renderItemCard(item, store, router)));
    }

    root.appendChild(sec);
  }

  if (!anyMatched && filterState.search) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `<div class="icon">🔍</div><div class="title">لا نتائج لـ «${escapeText(filterState.search)}»</div>`;
    root.appendChild(empty);
  }
}

function renderItemCard(item, store, router) {
  const card = document.createElement('div');
  card.className = 'card-item';
  card.dataset.kind = item._kind;

  let statusBadge = '', progressBar = '';
  if (item._kind === 'project') {
    const prog = projectProgress(store, item.id);
    const stat = projectStatus(store, item.id);
    statusBadge = `<span class="status-pill" data-s="${stat}">${statusLabelAr(stat)} · ${prog}%</span>`;
    progressBar = `
      <div style="height:3px;background:rgba(0,0,0,0.05);border-radius:2px;margin-top:8px;overflow:hidden;">
        <div style="height:100%;background:var(--good);width:${prog}%"></div>
      </div>`;
  }

  const kindLabel = { product:'منتج', initiative:'مبادرة', project:'مشروع' }[item._kind] || item._kind;

  card.innerHTML = `
    <div class="head">
      <div style="flex:1;min-width:0">
        <div class="name">${escapeText(item.name)}</div>
        <div class="meta">${escapeText(item.owner || item.description || '—')}</div>
      </div>
      <div class="badges">
        <span class="kind-badge" data-kind="${item._kind}">${kindLabel}</span>
        ${statusBadge}
        ${linkBadgeHtml(store, item)}
      </div>
    </div>
    ${progressBar}
    <div style="display:flex;justify-content:flex-end;gap:2px;margin-top:6px;">
      <button class="btn-icon sm" data-act="edit-item" title="تعديل">✎</button>
      <button class="btn-icon sm" data-act="del-item" title="حذف" style="color:var(--danger)">×</button>
    </div>
  `;

  card.querySelector('[data-act="edit-item"]').addEventListener('click', (e) => {
    e.stopPropagation();
    openEditItemModal(store, router, item);
  });
  card.querySelector('[data-act="del-item"]').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteItem(store, router, item);
  });

  card.addEventListener('click', () => {
    if (item._kind === 'project' || item._kind === 'initiative') {
      router.navigate('project', { id: item.id });
    } else {
      /* product → workbench focused on this concept */
      router.navigate('workbench', { concept: item.parent_id });
    }
  });

  return card;
}

function openAddProjectModal(store, router, concept) {
  openForm({
    title: `إضافة ضمن «${concept.name}»`,
    fields: [
      { name:'name', label:'الاسم', required:true, placeholder:'مثل: «أيتام ألبانيا»' },
      { name:'kind', label:'النوع', type:'select', value:'مبادرة',
        options: [
          { value:'مبادرة', label:'مبادرة (فكرة لم تبدأ)' },
          { value:'مشروع',  label:'مشروع (بدأ التنفيذ)' },
          { value:'منتج',   label:'منتج' }
        ]
      },
      { name:'owner', label:'المالك (اختياري)' },
      { name:'description', label:'الوصف (اختياري)', type:'textarea' }
    ],
    confirm: async (data) => {
      if (!data.name) return false;
      try {
        const tbl = data.kind === 'مشروع' ? 'projects'
                  : data.kind === 'منتج'  ? 'products'
                  : 'initiatives';
        const row = await store.actCreate(tbl, {
          id: uid('itm'),
          name: data.name,
          parent_id: concept.id,
          entity_type: data.kind,
          owner: data.owner || null,
          description: data.description || null,
          is_active: true
        });
        await store.logAudit({
          action: 'item_create',
          entity_type: tbl.replace(/s$/,''),
          entity_id: String(row.id),
          after_data: row,
          summary_ar: `إضافة ${data.kind}: «${data.name}»`
        });
        toastSuccess(`تم إضافة ${data.kind}: ${data.name}`);
        router.refresh();
      } catch (e) {
        toastError('فشل الإنشاء: ' + e.message);
      }
    }
  });
}

/* ─── Concept edit / delete ─── */
async function openEditConceptModal(store, router, concept) {
  await loadClickUpBridge(store).catch(() => {});
  openForm({
    title: `تعديل «${concept.name}»`,
    fields: [
      { name:'name', label:'الاسم', required:true, value: concept.name },
      { name:'description', label:'الوصف', type:'textarea', value: concept.description || '' },
      clickupLinkField(store, concept.linked_bot_entity_id)
    ],
    confirm: async (data) => {
      if (!data.name) return false;
      try {
        const link = parseLinkChange(concept, data.linked_bot_entity_id);
        await store.actUpdate('concepts', concept.id, {
          name: data.name,
          description: data.description || null,
          linked_bot_entity_id: link.next
        });
        await store.logAudit({ action:'concept_update', entity_type:'concept', entity_id:String(concept.id), summary_ar:`تعديل مفهوم «${data.name}»` });
        if (link.changed) {
          await store.logAudit(linkAuditEntry('concept', { ...concept, name: data.name }, store, link.next));
        }
        toastSuccess('تم التحديث');
        router.refresh();
      } catch (e) { toastError('فشل: ' + e.message); }
    }
  });
}

function deleteConcept(store, router, concept) {
  confirmDialog({
    title: 'حذف المفهوم',
    message: `هل أنت متأكد من حذف «${concept.name}»؟ سيُخفى المفهوم وكل محتواه من الواجهة (يبقى محفوظاً في قاعدة البيانات).`,
    danger: true,
    confirmLabel: 'حذف',
    onConfirm: async () => {
      try {
        await store.actRemove('concepts', concept.id);
        await store.logAudit({ action:'concept_remove', entity_type:'concept', entity_id:String(concept.id), summary_ar:`حذف مفهوم «${concept.name}»` });
        toastSuccess('تم الحذف');
        router.refresh();
      } catch (e) { toastError('فشل: ' + e.message); }
    }
  });
}

/* ─── Item edit / delete ─── */
async function openEditItemModal(store, router, item) {
  await loadClickUpBridge(store).catch(() => {});
  openForm({
    title: `تعديل «${item.name}»`,
    fields: [
      { name:'name', label:'الاسم', required:true, value: item.name },
      { name:'owner', label:'المالك (اختياري)', value: item.owner || '' },
      { name:'description', label:'الوصف', type:'textarea', value: item.description || '' },
      clickupLinkField(store, item.linked_bot_entity_id)
    ],
    confirm: async (data) => {
      if (!data.name) return false;
      try {
        const link = parseLinkChange(item, data.linked_bot_entity_id);
        await store.actUpdate(TBL_BY_KIND[item._kind], item.id, {
          name: data.name,
          owner: data.owner || null,
          description: data.description || null,
          linked_bot_entity_id: link.next
        });
        await store.logAudit({ action:'item_update', entity_type:item._kind, entity_id:String(item.id), summary_ar:`تعديل «${data.name}»` });
        if (link.changed) {
          await store.logAudit(linkAuditEntry(item._kind, { ...item, name: data.name }, store, link.next));
        }
        toastSuccess('تم التحديث');
        router.refresh();
      } catch (e) { toastError('فشل: ' + e.message); }
    }
  });
}

function deleteItem(store, router, item) {
  confirmDialog({
    title: 'حذف العنصر',
    message: `هل أنت متأكد من حذف «${item.name}»؟`,
    danger: true,
    confirmLabel: 'حذف',
    onConfirm: async () => {
      try {
        await store.actRemove(TBL_BY_KIND[item._kind], item.id);
        await store.logAudit({ action:'item_remove', entity_type:item._kind, entity_id:String(item.id), summary_ar:`حذف «${item.name}»` });
        toastSuccess('تم الحذف');
        router.refresh();
      } catch (e) { toastError('فشل: ' + e.message); }
    }
  });
}

/* ─── Helpers ─── */
function kpiSmall(label, value) {
  return `<div class="kpi" style="padding:8px 12px;">
    <div class="kpi-label" style="font-size:9px;">${escapeText(label)}</div>
    <div class="kpi-value" style="font-size:18px;">${escapeText(value)}</div>
  </div>`;
}
function computePortfolioStats(store, concepts) {
  const ids = new Set(concepts.map(c => String(c.id)));
  const products = (store.state.products || []).filter(p => ids.has(String(p.parent_id)) && p.is_active !== false);
  const initiatives = (store.state.initiatives || []).filter(p => ids.has(String(p.parent_id)) && p.is_active !== false);
  const projects = (store.state.projects || []).filter(p => ids.has(String(p.parent_id)) && p.is_active !== false);

  let total = 0, count = 0;
  for (const proj of projects) {
    const p = projectProgress(store, proj.id);
    if (p > 0) { total += p; count++; }
  }
  return {
    products: products.length,
    initiatives: initiatives.length,
    projects: projects.length,
    avgProgress: count ? Math.round(total / count) : 0
  };
}
