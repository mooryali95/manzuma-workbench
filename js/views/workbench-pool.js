/**
 * views/workbench-pool.js
 * العمود الجانبي (Pool) + نوافذ الأفراد/الكيانات.
 * مفصول عن workbench.js وفق مبدأ المسؤولية الواحدة (v5.7).
 */

import { wireDraggable } from '../components/drag-drop.js';
import { openForm, confirm as confirmDialog } from '../components/modal.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { uid, SECTORS, ENTITY_KINDS } from '../models.js';
import { escapeText, escapeAttr, svgPerson, svgBuilding } from '../utils.js';
import { renderWorkbench } from './workbench.js';

export function renderPool(store, router, viewRoot) {
  const pool = document.createElement('aside');
  pool.className = 'pool';
  if (localStorage.getItem('wb_pool_collapsed') === '1') pool.classList.add('collapsed');
  pool.innerHTML = `
    <div class="pool-header">
      <span class="pool-header-title">العمود الجانبي</span>
      <button class="pool-toggle" title="تصغير / توسيع" aria-label="تصغير أو توسيع العمود الجانبي">${pool.classList.contains('collapsed') ? '⮜' : '⮞'}</button>
    </div>

    <div class="pool-section" data-pool="individuals">
      <div class="pool-section-head">
        <span class="pool-section-title" data-sec-toggle="individuals"><span class="sec-chev">▾</span> الأفراد <span class="count">${(store.state.individuals||[]).length}</span></span>
        <button class="btn-add" data-act="add-individual">+ إضافة</button>
      </div>
      <div class="pool-items"></div>
    </div>

    <div class="pool-section" data-pool="entities">
      <div class="pool-section-head">
        <span class="pool-section-title" data-sec-toggle="entities"><span class="sec-chev">▾</span> الكيانات <span class="count">${(store.state.entities||[]).length}</span></span>
        <button class="btn-add" data-act="add-entity">+ إضافة</button>
      </div>
      <div class="pool-items"></div>
    </div>

    <div class="pool-section" data-pool="products">
      <div class="pool-section-head">
        <span class="pool-section-title" data-sec-toggle="products"><span class="sec-chev">▾</span> المنتجات/المبادرات بلا تشكيل <span class="count" id="orphans-count">0</span></span>
        <button class="btn-add" data-act="add-item">+ إضافة</button>
      </div>
      <div class="pool-items"></div>
    </div>

    <div class="pool-section" data-pool="projects">
      <div class="pool-section-head">
        <span class="pool-section-title" data-sec-toggle="projects"><span class="sec-chev">▾</span> المشاريع بلا تشكيل <span class="count" id="proj-orphans-count">0</span></span>
        <button class="btn-add" data-act="add-project">+ إضافة</button>
      </div>
      <div class="pool-items"></div>
    </div>
  `;

  /* v4.8.1: طي/توسيع كل قسم على حدة (محفوظ) */
  pool.querySelectorAll('[data-sec-toggle]').forEach(t => {
    const key = t.dataset.secToggle;
    const section = t.closest('.pool-section');
    const apply = (collapsed) => {
      section.classList.toggle('sec-collapsed', collapsed);
      t.querySelector('.sec-chev').textContent = collapsed ? '◂' : '▾';
    };
    apply(localStorage.getItem('wb_sec_' + key) === '1');
    t.addEventListener('click', () => {
      const collapsed = !section.classList.contains('sec-collapsed');
      apply(collapsed);
      localStorage.setItem('wb_sec_' + key, collapsed ? '1' : '0');
    });
  });

  /* v4.8.1: إضافة منتج/مبادرة أو مشروع من العمود مباشرة */
  const addItemFromPool = (fixedKind) => {
    const concepts = (store.state.concepts || []).filter(c => c.is_active !== false);
    if (!concepts.length) { toastError('أنشئ مفهوماً أولاً من صفحة المحافظ'); return; }
    const kindField = fixedKind
      ? []
      : [{ name:'kind', label:'النوع', type:'select', value:'مبادرة',
           options:[{value:'مبادرة',label:'مبادرة'},{value:'منتج',label:'منتج'}] }];
    openForm({
      title: fixedKind ? 'إضافة مشروع' : 'إضافة منتج/مبادرة',
      fields: [
        { name:'name', label:'الاسم', required:true },
        ...kindField,
        { name:'concept_id', label:'المفهوم الأم', type:'select', required:true,
          value:String(concepts[0].id),
          options: concepts.map(c => ({ value:String(c.id), label:c.name })) },
        { name:'owner', label:'المالك (اختياري)' }
      ],
      confirm: async (data) => {
        if (!data.name || !data.concept_id) return false;
        const kind = fixedKind || data.kind;
        const tbl = kind === 'مشروع' ? 'projects' : kind === 'منتج' ? 'products' : 'initiatives';
        try {
          const row = await store.actCreate(tbl, {
            id: uid('itm'), name: data.name, parent_id: data.concept_id,
            entity_type: kind, owner: data.owner || null, is_active: true
          });
          await store.logAudit({ action:'item_create', entity_type: tbl.replace(/s$/,''),
            entity_id:String(row.id), summary_ar:`إضافة ${kind}: «${data.name}» (من الورشة)` });
          toastSuccess(`تمت الإضافة: ${data.name}`);
          renderWorkbench(viewRoot, store, router, {});
        } catch (e) { toastError('فشل: ' + e.message); }
      }
    });
  };
  pool.querySelector('[data-act="add-item"]').addEventListener('click', () => addItemFromPool(null));
  pool.querySelector('[data-act="add-project"]').addEventListener('click', () => addItemFromPool('مشروع'));

  /* زر الطي/التوسيع */
  pool.querySelector('.pool-toggle').addEventListener('click', () => {
    pool.classList.toggle('collapsed');
    const collapsed = pool.classList.contains('collapsed');
    localStorage.setItem('wb_pool_collapsed', collapsed ? '1' : '0');
    pool.querySelector('.pool-toggle').textContent = collapsed ? '⮜' : '⮞';
  });

  /* Individuals pool */
  const indItems = pool.querySelector('[data-pool="individuals"] .pool-items');
  const individuals = (store.state.individuals || []).slice().sort((a,b) => a.name_ar.localeCompare(b.name_ar, 'ar'));
  if (individuals.length === 0) {
    indItems.innerHTML = `<div class="pool-empty">لا يوجد أفراد بعد</div>`;
  } else {
    individuals.forEach(i => indItems.appendChild(renderPoolInd(i, store, viewRoot, router)));
  }
  pool.querySelector('[data-act="add-individual"]').addEventListener('click', () => addIndividual(store, viewRoot, router));

  /* Entities pool */
  const entItems = pool.querySelector('[data-pool="entities"] .pool-items');
  const ents = (store.state.entities || []).slice().sort((a,b) => a.name_ar.localeCompare(b.name_ar, 'ar'));
  if (ents.length === 0) {
    entItems.innerHTML = `<div class="pool-empty">لا توجد كيانات بعد</div>`;
  } else {
    ents.forEach(e => entItems.appendChild(renderPoolEnt(e, store, viewRoot, router)));
  }
  pool.querySelector('[data-act="add-entity"]').addEventListener('click', () => addEntity(store, viewRoot, router));

  /* Orphan products */
  const orphans = [
    ...(store.state.products || []).filter(p => !p.formation_id && p.is_active !== false),
    ...(store.state.initiatives || []).filter(p => !p.formation_id && p.is_active !== false)
  ];
  pool.querySelector('#orphans-count').textContent = orphans.length;
  const prodItems = pool.querySelector('[data-pool="products"] .pool-items');
  if (orphans.length === 0) {
    prodItems.innerHTML = `<div class="pool-empty">لا توجد منتجات/مبادرات بلا تشكيل</div>`;
  } else {
    orphans.forEach(p => {
      const el = document.createElement('button');
      const isInit = p.entity_type === 'مبادرة';
      el.className = 'card-item';
      el.dataset.kind = isInit ? 'initiative' : 'product';
      el.style.cssText = 'padding:7px 10px;font-size:11.5px;text-align:right;display:flex;justify-content:space-between;align-items:center;gap:6px;';
      el.innerHTML = `<span style="flex:1">${escapeText(p.name)}</span><span style="font-size:8px;color:var(--ink-4);">${isInit ? 'مبادرة' : 'منتج'}</span>`;
      wireDraggable(el, { type:'product', id:p.id, kind: isInit ? 'initiative' : 'product' });
      prodItems.appendChild(el);
    });
  }

  /* Orphan projects (v4.7) */
  const projOrphans = (store.state.projects || [])
    .filter(p => !p.formation_id && p.is_active !== false);
  pool.querySelector('#proj-orphans-count').textContent = projOrphans.length;
  const projItems = pool.querySelector('[data-pool="projects"] .pool-items');
  if (projOrphans.length === 0) {
    projItems.innerHTML = `<div class="pool-empty">لا توجد مشاريع بلا تشكيل</div>`;
  } else {
    projOrphans.forEach(p => {
      const el = document.createElement('button');
      el.className = 'card-item';
      el.dataset.kind = 'project';
      el.style.cssText = 'padding:7px 10px;font-size:11.5px;text-align:right;display:flex;justify-content:space-between;align-items:center;gap:6px;';
      el.innerHTML = `<span style="flex:1">${escapeText(p.name)}</span><span style="font-size:8px;color:var(--ink-4);">مشروع</span>`;
      wireDraggable(el, { type:'product', id:p.id, kind:'project' });
      projItems.appendChild(el);
    });
  }

  return pool;
}

function renderPoolInd(ind, store, viewRoot, router) {
  const el = document.createElement('button');
  el.className = 'card-ind';
  el.style.cssText = 'justify-content:space-between;width:100%;font-size:11.5px;';
  el.innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:5px;">
      ${svgPerson()}
      ${ ind.sector ? `<span class="sector">${escapeText(ind.sector)}</span>` : '' }
      ${escapeText(ind.name_ar)}
    </span>
    <span style="display:inline-flex;gap:2px;">
      <span data-edit style="font-size:11px;color:var(--ink-3);cursor:pointer;font-weight:700;padding:0 4px;" title="تعديل">✎</span>
      <span data-del style="font-size:12px;color:var(--danger);cursor:pointer;font-weight:700;padding:0 4px;" title="حذف">×</span>
    </span>
  `;
  wireDraggable(el, { type:'individual', id: ind.id });
  el.querySelector('[data-edit]').addEventListener('click', (e) => {
    e.stopPropagation();
    editIndividual(ind, store, viewRoot, router);
  });
  el.querySelector('[data-del]').addEventListener('click', (e) => {
    e.stopPropagation();
    confirmDialog({
      title: 'حذف فرد',
      message: `حذف «${ind.name_ar}» نهائياً؟ سيُزال من كل التشكيلات المرتبط بها.`,
      danger: true,
      confirmLabel: 'حذف',
      onConfirm: async () => {
        try {
          await store.actRemove('individuals', ind.id);
          store.state.formation_members = (store.state.formation_members || []).filter(m => m.individual_id !== ind.id);
          await store.logAudit({ action:'individual_remove', entity_type:'individual', summary_ar:`حذف فرد «${ind.name_ar}»` });
          toastSuccess('تم الحذف');
          renderWorkbench(viewRoot, store, router, {});
        } catch (err) { toastError('فشل: ' + err.message); }
      }
    });
  });
  return el;
}

function renderPoolEnt(ent, store, viewRoot, router) {
  const el = document.createElement('button');
  el.className = 'card-ent';
  el.style.cssText = 'justify-content:space-between;width:100%;font-size:11.5px;';
  el.innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:5px;">
      ${svgBuilding()}
      ${ ent.kind ? `<span class="kind">${escapeText(ent.kind)}</span>` : '' }
      ${escapeText(ent.name_ar)}
    </span>
    <span style="display:inline-flex;gap:2px;">
      <span data-edit style="font-size:11px;color:var(--ink-3);cursor:pointer;font-weight:700;padding:0 4px;" title="تعديل">✎</span>
      <span data-del style="font-size:12px;color:var(--danger);cursor:pointer;font-weight:700;padding:0 4px;" title="حذف">×</span>
    </span>
  `;
  wireDraggable(el, { type:'entity', id: ent.id });
  el.querySelector('[data-edit]').addEventListener('click', (e) => {
    e.stopPropagation();
    editEntity(ent, store, viewRoot, router);
  });
  el.querySelector('[data-del]').addEventListener('click', (e) => {
    e.stopPropagation();
    confirmDialog({
      title: 'حذف كيان',
      message: `حذف «${ent.name_ar}» نهائياً؟ سيُزال من كل التشكيلات المرتبط بها.`,
      danger: true,
      confirmLabel: 'حذف',
      onConfirm: async () => {
        try {
          await store.actRemove('entities', ent.id);
          store.state.formation_entities = (store.state.formation_entities || []).filter(x => x.entity_id !== ent.id);
          await store.logAudit({ action:'entity_remove', entity_type:'entity', summary_ar:`حذف كيان «${ent.name_ar}»` });
          toastSuccess('تم الحذف');
          renderWorkbench(viewRoot, store, router, {});
        } catch (err) { toastError('فشل: ' + err.message); }
      }
    });
  });
  return el;
}

/* ─── Add/Edit modals ─── */
function addIndividual(store, viewRoot, router) {
  openForm({
    title: 'إضافة فرد جديد',
    fields: [
      { name:'name_ar', label:'الاسم', required:true, placeholder:'مثل: علي' },
      { name:'sector', label:'القطاع', type:'select', options:[''].concat(SECTORS).map(s => ({ value:s, label: s || '— اختياري —' })) },
      { name:'notes', label:'ملاحظات', type:'textarea' }
    ],
    confirm: async (data) => {
      if (!data.name_ar) return false;
      try {
        await store.actCreate('individuals', { id: uid('ind'), ...data });
        await store.logAudit({ action:'individual_create', entity_type:'individual', summary_ar:`إضافة فرد: «${data.name_ar}»` });
        toastSuccess('تم الإضافة');
        renderWorkbench(viewRoot, store, router, {});
      } catch (e) { toastError('فشل: ' + e.message); }
    }
  });
}

function editIndividual(ind, store, viewRoot, router) {
  openForm({
    title: `تعديل «${ind.name_ar}»`,
    fields: [
      { name:'name_ar', label:'الاسم', required:true, value: ind.name_ar },
      { name:'sector', label:'القطاع', type:'select', value: ind.sector || '',
        options:[''].concat(SECTORS).map(s => ({ value:s, label: s || '— —' })) },
      { name:'notes', label:'ملاحظات', type:'textarea', value: ind.notes || '' }
    ],
    confirm: async (data) => {
      if (!data.name_ar) return false;
      try {
        await store.actUpdate('individuals', ind.id, data);
        toastSuccess('تم التحديث');
        renderWorkbench(viewRoot, store, router, {});
      } catch (e) { toastError('فشل: ' + e.message); }
    }
  });
}

function addEntity(store, viewRoot, router) {
  openForm({
    title: 'إضافة كيان جديد',
    fields: [
      { name:'name_ar', label:'الاسم', required:true, placeholder:'مثل: راز التطويرية' },
      { name:'kind', label:'النوع', type:'select', options:[''].concat(ENTITY_KINDS).map(s => ({ value:s, label: s || '— —' })) },
      { name:'sector', label:'القطاع', type:'select', options:[''].concat(SECTORS).map(s => ({ value:s, label: s || '— —' })) },
      { name:'notes', label:'ملاحظات', type:'textarea' }
    ],
    confirm: async (data) => {
      if (!data.name_ar) return false;
      try {
        await store.actCreate('entities', { id: uid('ent'), ...data });
        await store.logAudit({ action:'entity_create', entity_type:'entity', summary_ar:`إضافة كيان: «${data.name_ar}»` });
        toastSuccess('تم الإضافة');
        renderWorkbench(viewRoot, store, router, {});
      } catch (e) { toastError('فشل: ' + e.message); }
    }
  });
}

function editEntity(ent, store, viewRoot, router) {
  openForm({
    title: `تعديل «${ent.name_ar}»`,
    fields: [
      { name:'name_ar', label:'الاسم', required:true, value: ent.name_ar },
      { name:'kind', label:'النوع', type:'select', value: ent.kind || '',
        options:[''].concat(ENTITY_KINDS).map(s => ({ value:s, label: s || '— —' })) },
      { name:'sector', label:'القطاع', type:'select', value: ent.sector || '',
        options:[''].concat(SECTORS).map(s => ({ value:s, label: s || '— —' })) },
      { name:'notes', label:'ملاحظات', type:'textarea', value: ent.notes || '' }
    ],
    confirm: async (data) => {
      if (!data.name_ar) return false;
      try {
        await store.actUpdate('entities', ent.id, data);
        toastSuccess('تم التحديث');
        renderWorkbench(viewRoot, store, router, {});
      } catch (e) { toastError('فشل: ' + e.message); }
    }
  });
}



