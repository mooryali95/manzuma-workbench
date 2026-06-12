/**
 * views/workbench.js
 * Structure Workbench:
 *  - Left: concepts with their formations
 *  - Each formation: dropzones for individuals + entities + products
 *  - Right: pool of available individuals, entities, products
 *  - Drag from pool to formation; drag inside formation to reorder
 */

import { wireDraggable, wireDropZone } from '../components/drag-drop.js';
import { openForm, confirm as confirmDialog } from '../components/modal.js';
import { toastSuccess, toastError, toastInfo } from '../components/toast.js';
import { uid, SECTORS, ENTITY_KINDS, formationKind } from '../models.js';
import { escapeText, escapeAttr, svgPerson, svgBuilding } from '../utils.js';

export function renderWorkbench(root, store, router, params) {
  root.innerHTML = '';
  const s = store.state;

  /* ─── Breadcrumb ─── */
  const bc = document.createElement('nav');
  bc.className = 'breadcrumb';
  bc.innerHTML = `<a href="#portfolios">المحافظ</a><span class="sep">›</span><span class="current">ورشة الهيكل</span>`;
  root.appendChild(bc);

  /* ─── Header ─── */
  const header = document.createElement('header');
  header.className = 'app-header';
  header.innerHTML = `
    <div class="lhs">
      <h1 class="h1" style="font-size:22px;">🛠 ورشة الهيكل</h1>
      <p class="sub">إدارة التشكيلات والأفراد والكيانات تحت كل مفهوم</p>
    </div>
    <div class="rhs">
      <a class="btn" href="#portfolios">← المحافظ</a>
    </div>
  `;
  root.appendChild(header);

  /* ─── Two-column workbench ─── */
  const wb = document.createElement('div');
  wb.className = 'workbench';

  /* Left: concepts column */
  const conceptsCol = document.createElement('div');
  const concepts = (s.concepts || []).filter(c => c.is_active !== false);

  /* Filter by single concept if requested */
  const focusConcept = params.concept ? concepts.find(c => String(c.id) === String(params.concept)) : null;
  const conceptsToShow = focusConcept ? [focusConcept] : concepts;

  if (!conceptsToShow.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `<div class="icon">📐</div><div class="title">لا توجد مفاهيم</div><div class="desc">أنشئ مفهوماً أولاً</div>`;
    conceptsCol.appendChild(empty);
  } else {
    conceptsToShow.forEach(c => conceptsCol.appendChild(renderConceptBlock(c, store, router, root, params)));
  }
  wb.appendChild(conceptsCol);

  /* Right: pool */
  const pool = renderPool(store, router, root);
  wb.appendChild(pool);

  root.appendChild(wb);
}

/* ─── Concept block with its formations ─── */
function renderConceptBlock(concept, store, router, viewRoot, params) {
  const block = document.createElement('section');
  block.className = 'wb-concept';
  block.dataset.conceptId = concept.id;

  const formations = store.formationsForConcept(concept.id);

  block.innerHTML = `
    <div class="wb-concept-head">
      <div class="wb-concept-name">${escapeText(concept.name)}</div>
      <div style="font-size:11px;color:var(--ink-3);">${formations.length} تشكيل · ${store.productsOfConcept(concept.id).length} منتج · ${store.projectsOfConcept(concept.id).length} مشروع</div>
    </div>
    <div class="wb-concept-body"></div>
  `;

  const body = block.querySelector('.wb-concept-body');

  formations.forEach(f => {
    body.appendChild(renderFormation(f, concept, store, router, viewRoot));
  });

  /* Add formation button */
  const addBtn = document.createElement('button');
  addBtn.className = 'add-formation';
  addBtn.innerHTML = `+ إضافة تشكيل جديد لـ «${escapeText(concept.name)}»`;
  addBtn.addEventListener('click', () => addFormation(store, router, concept, viewRoot, params));
  body.appendChild(addBtn);

  return block;
}

/* ─── Formation card ─── */
function renderFormation(formation, concept, store, router, viewRoot) {
  const card = document.createElement('div');
  card.className = 'formation';
  card.dataset.formationId = formation.id;

  const members = store.membersOfFormation(formation.id);
  const ents = store.entitiesOfFormation(formation.id);
  const products = store.productsOfFormation(formation.id);
  const kind = formationKind(formation, store);

  card.innerHTML = `
    <div class="formation-head">
      <input class="formation-name" value="${escapeAttr(formation.name_ar)}" data-act="rename" data-formation-id="${formation.id}">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="formation-kind">${escapeText(kind)} · ${members.length}</span>
        <button class="btn-icon sm" data-act="remove-formation" data-formation-id="${formation.id}" title="حذف التشكيل" style="color:var(--danger)">×</button>
      </div>
    </div>
    <div class="formation-body">
      <div class="dropzone" data-zone="members">
        <span class="dropzone-label">الأفراد</span>
        <div class="dropzone-items"></div>
      </div>
      <div class="dropzone" data-zone="entities">
        <span class="dropzone-label">الكيانات</span>
        <div class="dropzone-items"></div>
      </div>
      <div class="dropzone" data-zone="products">
        <span class="dropzone-label">المنتجات/المبادرات/المشاريع</span>
        <div class="dropzone-items"></div>
      </div>
    </div>
  `;

  /* Rename */
  card.querySelector('[data-act="rename"]').addEventListener('blur', async (e) => {
    const newName = e.target.value.trim();
    if (newName && newName !== formation.name_ar) {
      try {
        await store.actUpdate('formations', formation.id, { name_ar: newName });
        await store.logAudit({ action:'formation_rename', entity_type:'formation', entity_id: formation.id, summary_ar:`إعادة تسمية: «${formation.name_ar}» → «${newName}»` });
        toastInfo('تم تحديث الاسم');
      } catch (err) { toastError('فشل: ' + err.message); }
    }
  });

  /* Delete formation */
  card.querySelector('[data-act="remove-formation"]').addEventListener('click', () => {
    confirmDialog({
      title: 'حذف التشكيل',
      message: `هل أنت متأكد من حذف «${formation.name_ar}»؟ سيتم إزالة كل الأفراد والكيانات المرتبطة به (لكنها تبقى في الـ pool).`,
      danger: true,
      confirmLabel: 'حذف',
      onConfirm: async () => {
        try {
          await store.actRemove('formations', formation.id);
          await store.logAudit({ action:'formation_remove', entity_type:'formation', entity_id: formation.id, summary_ar:`حذف تشكيل «${formation.name_ar}»` });
          toastSuccess('تم الحذف');
          renderWorkbench(viewRoot, store, router, {});
        } catch (e) { toastError('فشل: ' + e.message); }
      }
    });
  });

  /* Render members */
  const membersZone = card.querySelector('[data-zone="members"]');
  const membersItems = membersZone.querySelector('.dropzone-items');
  if (members.length === 0) {
    membersItems.innerHTML = `<span class="dropzone-empty">اسحب أفراداً من العمود الجانبي</span>`;
  } else {
    members.forEach(m => membersItems.appendChild(renderInd(m, formation, store, viewRoot, router)));
  }
  wireDropZone(membersZone, 'individual', async (payload) => {
    try {
      await store.actAddMember(formation.id, payload.id);
      await store.logAudit({ action:'formation_add_member', entity_type:'formation', entity_id: formation.id, summary_ar:`إضافة فرد للتشكيل «${formation.name_ar}»` });
      toastSuccess('تم الإضافة');
      renderWorkbench(viewRoot, store, router, {});
    } catch (e) { toastError('فشل: ' + e.message); }
  });

  /* Render entities */
  const entitiesZone = card.querySelector('[data-zone="entities"]');
  const entitiesItems = entitiesZone.querySelector('.dropzone-items');
  if (ents.length === 0) {
    entitiesItems.innerHTML = `<span class="dropzone-empty">اسحب كياناً من العمود الجانبي</span>`;
  } else {
    ents.forEach(e => entitiesItems.appendChild(renderEnt(e, formation, store, viewRoot, router)));
  }
  wireDropZone(entitiesZone, 'entity', async (payload) => {
    try {
      await store.actAddEntityToFormation(formation.id, payload.id);
      await store.logAudit({ action:'formation_add_entity', entity_type:'formation', entity_id: formation.id, summary_ar:`إضافة كيان للتشكيل «${formation.name_ar}»` });
      toastSuccess('تم الإضافة');
      renderWorkbench(viewRoot, store, router, {});
    } catch (e) { toastError('فشل: ' + e.message); }
  });

  /* Render products */
  const productsZone = card.querySelector('[data-zone="products"]');
  const productsItems = productsZone.querySelector('.dropzone-items');
  if (products.length === 0) {
    productsItems.innerHTML = `<span class="dropzone-empty">اسحب منتجاً/مبادرة لربطه بهذا التشكيل</span>`;
  } else {
    products.forEach(p => productsItems.appendChild(renderProd(p, formation, store, viewRoot, router)));
  }
  wireDropZone(productsZone, 'product', async (payload) => {
    try {
      const tbl = payload.kind === 'initiative' ? 'initiatives'
                : payload.kind === 'project' ? 'projects' : 'products';
      await store.actUpdate(tbl, payload.id, { formation_id: formation.id });
      await store.logAudit({ action:'product_to_formation', entity_type:tbl.replace(/s$/,''), entity_id: payload.id, summary_ar:`ربط منتج بالتشكيل «${formation.name_ar}»` });
      toastSuccess('تم الربط');
      renderWorkbench(viewRoot, store, router, {});
    } catch (e) { toastError('فشل: ' + e.message); }
  });

  return card;
}

/* ─── Card renderers ─── */
function renderInd(ind, formation, store, viewRoot, router) {
  const el = document.createElement('button');
  el.className = 'card-ind';
  el.innerHTML = `
    ${svgPerson()}
    ${ ind.sector ? `<span class="sector">${escapeText(ind.sector)}</span>` : '' }
    ${escapeText(ind.name_ar)}
    <span title="إزالة من التشكيل" data-remove style="margin-right:4px;color:var(--ink-3);cursor:pointer;font-weight:700">×</span>
  `;
  wireDraggable(el, { type:'individual', id: ind.id });
  el.querySelector('[data-remove]').addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await store.actRemoveMember(formation.id, ind.id);
      await store.logAudit({ action:'formation_remove_member', entity_type:'formation', entity_id: formation.id, summary_ar:`إزالة «${ind.name_ar}» من «${formation.name_ar}»` });
      renderWorkbench(viewRoot, store, router, {});
    } catch (e) { toastError('فشل: ' + e.message); }
  });
  return el;
}

function renderEnt(ent, formation, store, viewRoot, router) {
  const el = document.createElement('button');
  el.className = 'card-ent';
  el.innerHTML = `
    ${svgBuilding()}
    ${ ent.kind ? `<span class="kind">${escapeText(ent.kind)}</span>` : '' }
    ${escapeText(ent.name_ar)}
    <span title="إزالة" data-remove style="margin-right:4px;color:var(--ink-3);cursor:pointer;font-weight:700">×</span>
  `;
  wireDraggable(el, { type:'entity', id: ent.id });
  el.querySelector('[data-remove]').addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await store.actRemoveEntityFromFormation(formation.id, ent.id);
      renderWorkbench(viewRoot, store, router, {});
    } catch (e) { toastError('فشل: ' + e.message); }
  });
  return el;
}

function renderProd(prod, formation, store, viewRoot, router) {
  const isInit = prod.entity_type === 'مبادرة';
  const el = document.createElement('button');
  el.className = 'card-item';
  el.dataset.kind = isInit ? 'initiative' : 'product';
  el.style.cssText = 'border-top:2px solid var(--c2-mid);padding:7px 10px;font-size:11.5px;text-align:right;background:#fff;display:inline-flex;align-items:center;gap:6px;';
  el.innerHTML = `${escapeText(prod.name)} <span style="font-size:8px;color:var(--ink-4);">${isInit ? 'مبادرة' : 'منتج'}</span>`;
  wireDraggable(el, { type:'product', id: prod.id, kind: isInit ? 'initiative' : 'product' });
  el.addEventListener('click', (e) => {
    e.preventDefault();
    if (isInit || prod.entity_type === 'مشروع') {
      router.navigate('project', { id: prod.id });
    }
  });
  return el;
}

/* ─── Add formation modal ─── */
function addFormation(store, router, concept, viewRoot, params) {
  openForm({
    title: `تشكيل جديد لـ «${concept.name}»`,
    fields: [
      { name:'name_ar', label:'اسم التشكيل', required:true, placeholder:'مثل: «المدربون الثلاثة»' }
    ],
    confirm: async (data) => {
      if (!data.name_ar) return false;
      try {
        await store.actCreate('formations', {
          id: uid('frm'),
          concept_id: concept.id,
          name_ar: data.name_ar,
          sort_order: store.formationsForConcept(concept.id).length
        });
        await store.logAudit({ action:'formation_create', entity_type:'formation', summary_ar:`إنشاء تشكيل «${data.name_ar}» تحت «${concept.name}»` });
        toastSuccess('تم الإنشاء');
        renderWorkbench(viewRoot, store, router, params);
      } catch (e) { toastError('فشل: ' + e.message); }
    }
  });
}

/* ─── Right pool sidebar ─── */
function renderPool(store, router, viewRoot) {
  const pool = document.createElement('aside');
  pool.className = 'pool';
  if (localStorage.getItem('wb_pool_collapsed') === '1') pool.classList.add('collapsed');
  pool.innerHTML = `
    <div class="pool-header">
      <span class="pool-header-title">العمود الجانبي</span>
      <button class="pool-toggle" title="تصغير / توسيع">${pool.classList.contains('collapsed') ? '⮜' : '⮞'}</button>
    </div>

    <div class="pool-section" data-pool="individuals">
      <div class="pool-section-head">
        <span class="pool-section-title">الأفراد <span class="count">${(store.state.individuals||[]).length}</span></span>
        <button class="btn-add" data-act="add-individual">+ إضافة</button>
      </div>
      <div class="pool-items"></div>
    </div>

    <div class="pool-section" data-pool="entities">
      <div class="pool-section-head">
        <span class="pool-section-title">الكيانات <span class="count">${(store.state.entities||[]).length}</span></span>
        <button class="btn-add" data-act="add-entity">+ إضافة</button>
      </div>
      <div class="pool-items"></div>
    </div>

    <div class="pool-section" data-pool="products">
      <div class="pool-section-head">
        <span class="pool-section-title">المنتجات/المبادرات بلا تشكيل <span class="count" id="orphans-count">0</span></span>
      </div>
      <div class="pool-items"></div>
    </div>

    <div class="pool-section" data-pool="projects">
      <div class="pool-section-head">
        <span class="pool-section-title">المشاريع بلا تشكيل <span class="count" id="proj-orphans-count">0</span></span>
      </div>
      <div class="pool-items"></div>
    </div>
  `;

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


