/**
 * views/portfolio.js
 * Portfolio Detail view: shows ALL contents of one portfolio
 *  - Stats header
 *  - Filter bar (text, kind, status)
 *  - Collapsible concept sections, each showing its products/initiatives/projects
 *  - Click an item → navigate to project detail or workbench
 */

import { renderFilterBar } from '../components/filter-bar.js';
import { openForm } from '../components/modal.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { countsForConcept, projectProgress, projectStatus, statusLabelAr } from '../models.js';
import { escapeText } from '../utils.js';

const UNCAT = 'uncat';
const filterState = {
  search: '',
  kind: 'all',   /* all | product | initiative | project */
  status: 'all'  /* all | not_started | in_progress | completed | blocked */
};

export function renderPortfolioDetail(root, store, router, params) {
  root.innerHTML = '';
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
      }
    ],
    onChange: (newState) => {
      filterState.search = newState.search;
      filterState.kind = newState.chips.kind;
      filterState.status = newState.chips.status;
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
          <div class="cs-name">${escapeText(c.name)}</div>
          <div class="cs-stats">
            <span><b>${counts.products}</b> منتج</span>
            <span><b>${counts.initiatives}</b> مبادرة</span>
            <span><b>${counts.projects}</b> مشروع</span>
            <span><b>${counts.formations}</b> تشكيل</span>
          </div>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <a class="btn ghost sm" href="#workbench?concept=${encodeURIComponent(c.id)}">🛠 ورشة الهيكل</a>
          <button class="btn ghost sm" data-act="add-project" data-concept-id="${c.id}">+ مبادرة/مشروع</button>
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
        <div class="meta">${escapeText(item.source_list_id || '—')}</div>
      </div>
      <div class="badges">
        <span class="kind-badge" data-kind="${item._kind}">${kindLabel}</span>
        ${statusBadge}
      </div>
    </div>
    ${progressBar}
  `;

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
          { value:'مشروع',  label:'مشروع (بدأ التنفيذ)' }
        ]
      }
    ],
    confirm: async (data) => {
      if (!data.name) return false;
      try {
        const tbl = data.kind === 'مشروع' ? 'projects' : 'initiatives';
        const row = await store.actCreate(tbl, {
          name: data.name,
          parent_id: concept.id,
          entity_type: data.kind,
          is_active: true
        });
        await store.logAudit({
          action: data.kind === 'مشروع' ? 'project_create' : 'initiative_create',
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

/* ─── Helpers ─── */
function kpiSmall(label, value) {
  return `<div class="kpi" style="padding:8px 12px;">
    <div class="kpi-label" style="font-size:9px;">${escapeText(label)}</div>
    <div class="kpi-value" style="font-size:18px;">${escapeText(value)}</div>
  </div>`;
}
function computePortfolioStats(store, concepts) {
  const ids = new Set(concepts.map(c => Number(c.id)));
  const products = (store.state.products || []).filter(p => ids.has(Number(p.parent_id)));
  const initiatives = (store.state.initiatives || []).filter(p => ids.has(Number(p.parent_id)));
  const projects = (store.state.projects || []).filter(p => ids.has(Number(p.parent_id)));

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
