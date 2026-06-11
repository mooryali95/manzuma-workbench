/**
 * views/project.js
 * Project Detail view:
 *  - Breadcrumb (portfolios → portfolio → concept → project)
 *  - Header with toggle between Initiative ↔ Project
 *  - KPIs (phases counts)
 *  - Gantt chart
 *  - Phase CRUD (add/edit/delete)
 *  - Description + owner
 */

import { renderGantt } from '../components/gantt.js';
import { openForm, confirm as confirmDialog } from '../components/modal.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { PHASE_STATUSES, statusLabelAr, uid, projectProgress, projectStatus } from '../models.js';
import { escapeText, addMonths } from '../utils.js';

export function renderProjectDetail(root, store, router, params) {
  root.innerHTML = '';
  const projId = params.id;
  const project = findProject(store, projId);

  if (!project) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `<div class="icon">⚠️</div><div class="title">المشروع غير موجود</div><div class="desc">قد يكون قد حُذف</div><div style="margin-top:14px"><a href="#portfolios" class="btn">العودة للمحافظ</a></div>`;
    root.appendChild(empty);
    return;
  }

  /* ─── Locate parent concept + portfolio ─── */
  const concept = (store.state.concepts || []).find(c => Number(c.id) === Number(project.parent_id))
    || { id: null, name:'—', portfolio_id: null };
  const portfolio = (store.state.portfolios || []).find(p => p.id === concept.portfolio_id) || {
    id:'uncat', name_ar:'غير مصنف'
  };

  const isProject = project.entity_type === 'مشروع';
  const isInitiative = project.entity_type === 'مبادرة';

  /* ─── Breadcrumb ─── */
  const bc = document.createElement('nav');
  bc.className = 'breadcrumb';
  bc.innerHTML = `
    <a href="#portfolios">المحافظ</a><span class="sep">›</span>
    <a href="#portfolio?pf=${encodeURIComponent(portfolio.id || 'uncat')}">${escapeText(portfolio.name_ar)}</a><span class="sep">›</span>
    <a href="#portfolio?pf=${encodeURIComponent(portfolio.id || 'uncat')}&focus=${concept.id || ''}">${escapeText(concept.name || '—')}</a><span class="sep">›</span>
    <span class="current">${escapeText(project.name)}</span>
  `;
  root.appendChild(bc);

  /* ─── Header ─── */
  const header = document.createElement('header');
  header.className = 'app-header';
  const kindLabel = isProject ? '📂 مشروع' : '💡 مبادرة';
  const kindColor = isProject ? 'var(--info)' : 'var(--warn)';

  const prog = isProject ? projectProgress(store, project.id) : 0;
  const stat = isProject ? projectStatus(store, project.id) : 'not_started';

  header.innerHTML = `
    <div class="lhs">
      <h1 class="h1" style="display:flex;align-items:center;gap:10px;">
        ${escapeText(project.name)}
        <span style="font-size:11px;padding:3px 10px;border-radius:999px;background:${kindColor};color:#fff;font-weight:500;">${kindLabel}</span>
      </h1>
      <p class="sub">${escapeText(concept.name || '—')} · ${escapeText(portfolio.name_ar)}</p>
    </div>
    <div class="rhs">
      <button class="btn" data-act="toggle-kind">${isProject ? '↩ إرجاع كمبادرة' : '🚀 تحويل إلى مشروع'}</button>
      <button class="btn" data-act="edit">✎ تعديل</button>
      <button class="btn danger" data-act="delete">حذف</button>
    </div>
  `;
  root.appendChild(header);

  header.querySelector('[data-act="toggle-kind"]').addEventListener('click', () => toggleKind(store, router, project));
  header.querySelector('[data-act="edit"]').addEventListener('click', () => editProject(store, router, project, root));
  header.querySelector('[data-act="delete"]').addEventListener('click', () => deleteProject(store, router, project));

  if (isInitiative) {
    /* ─── Initiative view (idea/proposal, no timeline) ─── */
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'padding:24px 28px;background:var(--c3-tint);border:1px dashed var(--c3-line);';
    card.innerHTML = `
      <div style="font-size:14px;color:var(--c3-ink);line-height:1.7;">
        <strong style="font-size:13px;font-weight:700;">هذه مبادرة (فكرة/اقتراح)</strong> — لم تبدأ بعد ولا تحتوي على جدول زمني.
        <br><br>عند البدء، اضغط زر «تحويل إلى مشروع» في الأعلى لإضافة المراحل والجدول الزمني.
      </div>
    `;
    root.appendChild(card);
    return;
  }

  /* ─── KPIs for Project ─── */
  const phases = store.phasesOfProject(project.id);
  const stats = {
    total: phases.length,
    completed: phases.filter(p => p.status === 'completed').length,
    inProgress: phases.filter(p => p.status === 'in_progress').length,
    blocked: phases.filter(p => p.status === 'blocked').length,
    notStarted: phases.filter(p => p.status === 'not_started').length
  };

  const kpiStrip = document.createElement('section');
  kpiStrip.className = 'kpi-strip';
  kpiStrip.innerHTML = `
    ${kpiCard('الإنجاز الكلي', prog + '%', statusLabelAr(stat))}
    ${kpiCard('إجمالي المراحل', stats.total)}
    ${kpiCard('المكتملة', stats.completed, '', 'var(--good)')}
    ${kpiCard('الجارية', stats.inProgress, '', 'var(--warn)')}
    ${kpiCard('لم تبدأ', stats.notStarted, '', 'var(--idle)')}
    ${stats.blocked ? kpiCard('متعثرة', stats.blocked, '', 'var(--danger)') : ''}
  `;
  root.appendChild(kpiStrip);

  /* ─── Gantt ─── */
  const ganttContainer = document.createElement('div');
  root.appendChild(ganttContainer);
  renderGantt(ganttContainer, phases, {
    onAddPhase: () => addPhaseModal(store, router, project, root),
    onPhaseClick: (phase) => editPhaseModal(store, router, project, phase, root)
  });

  /* ─── Phase list ─── */
  if (phases.length) {
    const listCard = document.createElement('section');
    listCard.className = 'card';
    listCard.style.cssText = 'margin-top:18px';
    listCard.innerHTML = `
      <h3 class="h3" style="font-size:14px;margin:0 0 12px">قائمة المراحل</h3>
      <div id="phase-rows"></div>
    `;
    const rowsRoot = listCard.querySelector('#phase-rows');
    phases.forEach(p => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line);font-size:13px;';
      row.innerHTML = `
        <div style="flex:1;min-width:0;">
          <div style="font-weight:500;color:var(--ink-1);">${escapeText(p.name_ar)}</div>
          <div style="font-size:11px;color:var(--ink-3);margin-top:2px;">${escapeText(p.start_date || '?')} ← ${escapeText(p.end_date || '?')}</div>
        </div>
        <span class="status-pill" data-s="${p.status}">${statusLabelAr(p.status)}</span>
        <span class="tnum" style="font-size:11px;color:var(--ink-2);min-width:35px;text-align:left;">${p.progress || 0}%</span>
        <button class="btn-icon sm" data-edit="${p.id}">✎</button>
        <button class="btn-icon sm" data-del="${p.id}" style="color:var(--danger)">×</button>
      `;
      row.querySelector('[data-edit]').addEventListener('click', () => editPhaseModal(store, router, project, p, root));
      row.querySelector('[data-del]').addEventListener('click', () => deletePhase(store, router, project, p, root));
      rowsRoot.appendChild(row);
    });
    rowsRoot.firstChild.style.borderTop = 'none';
    root.appendChild(listCard);
  }
}

function findProject(store, id) {
  /* Look in both projects and initiatives */
  return (store.state.projects || []).find(p => String(p.id) === String(id))
      || (store.state.initiatives || []).find(p => String(p.id) === String(id));
}

/* ─── Add phase modal ─── */
function addPhaseModal(store, router, project, root) {
  const phases = store.phasesOfProject(project.id);
  const today = new Date().toISOString().slice(0,10);
  const lastEnd = phases.length ? phases[phases.length-1].end_date : null;
  const defaultStart = lastEnd || today;
  const defaultEnd = addMonths(defaultStart, 1);

  openForm({
    title: `إضافة مرحلة جديدة لـ «${project.name}»`,
    fields: [
      { name:'name_ar', label:'اسم المرحلة', required:true, placeholder:'مثل: التخطيط' },
      { name:'start_date', label:'تاريخ البداية', type:'date', value: defaultStart, required:true },
      { name:'end_date',   label:'تاريخ النهاية', type:'date', value: defaultEnd, required:true },
      { name:'status', label:'الحالة', type:'select', value:'not_started',
        options: Object.entries(PHASE_STATUSES).map(([k,v]) => ({ value:k, label:v.label_ar }))
      },
      { name:'progress', label:'نسبة الإنجاز (%)', type:'number', value:0, min:0, max:100 },
      { name:'description_ar', label:'وصف (اختياري)', type:'textarea' }
    ],
    confirm: async (data) => {
      if (!data.name_ar) return false;
      if (data.end_date < data.start_date) {
        toastError('تاريخ النهاية يجب أن يكون بعد البداية');
        return false;
      }
      try {
        await store.actCreate('project_phases', {
          id: uid('ph'),
          project_entity_id: project.id,
          name_ar: data.name_ar,
          description_ar: data.description_ar || null,
          start_date: data.start_date,
          end_date: data.end_date,
          status: data.status || 'not_started',
          progress: Number(data.progress) || 0,
          sort_order: phases.length
        });
        await store.logAudit({
          action:'phase_create', entity_type:'phase',
          summary_ar:`إضافة مرحلة «${data.name_ar}» للمشروع «${project.name}»`
        });
        toastSuccess('تم إضافة المرحلة');
        renderProjectDetail(root, store, router, { id: project.id });
      } catch (e) { toastError('فشل: ' + e.message); }
    }
  });
}

function editPhaseModal(store, router, project, phase, root) {
  openForm({
    title: `تعديل مرحلة «${phase.name_ar}»`,
    fields: [
      { name:'name_ar', label:'الاسم', required:true, value: phase.name_ar },
      { name:'start_date', label:'البداية', type:'date', value: phase.start_date || '', required:true },
      { name:'end_date',   label:'النهاية', type:'date', value: phase.end_date || '', required:true },
      { name:'status', label:'الحالة', type:'select', value: phase.status,
        options: Object.entries(PHASE_STATUSES).map(([k,v]) => ({ value:k, label:v.label_ar }))
      },
      { name:'progress', label:'نسبة الإنجاز (%)', type:'number', value: phase.progress || 0, min:0, max:100 },
      { name:'description_ar', label:'وصف', type:'textarea', value: phase.description_ar || '' }
    ],
    confirm: async (data) => {
      if (!data.name_ar) return false;
      if (data.end_date < data.start_date) { toastError('تاريخ النهاية يجب أن يكون بعد البداية'); return false; }
      try {
        await store.actUpdate('project_phases', phase.id, {
          name_ar: data.name_ar,
          description_ar: data.description_ar || null,
          start_date: data.start_date,
          end_date: data.end_date,
          status: data.status,
          progress: Number(data.progress) || 0
        });
        await store.logAudit({ action:'phase_update', entity_type:'phase', summary_ar:`تعديل «${data.name_ar}»` });
        toastSuccess('تم التحديث');
        renderProjectDetail(root, store, router, { id: project.id });
      } catch (e) { toastError('فشل: ' + e.message); }
    }
  });
}

function deletePhase(store, router, project, phase, root) {
  confirmDialog({
    title: 'حذف المرحلة',
    message: `هل أنت متأكد من حذف «${phase.name_ar}»؟`,
    danger: true,
    confirmLabel: 'حذف',
    onConfirm: async () => {
      try {
        await store.actRemove('project_phases', phase.id);
        await store.logAudit({ action:'phase_remove', entity_type:'phase', summary_ar:`حذف «${phase.name_ar}»` });
        toastSuccess('تم الحذف');
        renderProjectDetail(root, store, router, { id: project.id });
      } catch (e) { toastError('فشل: ' + e.message); }
    }
  });
}

/* ─── Toggle kind: initiative ↔ project ─── */
function toggleKind(store, router, project) {
  const isProject = project.entity_type === 'مشروع';
  const newKind = isProject ? 'مبادرة' : 'مشروع';
  const msg = isProject
    ? `تحويل «${project.name}» إلى مبادرة سيخفي مراحلها (تبقى محفوظة في قاعدة البيانات). متابعة؟`
    : `تحويل «${project.name}» إلى مشروع — يفعّل المراحل والجدول الزمني. متابعة؟`;

  confirmDialog({
    title: isProject ? 'إرجاع كمبادرة' : 'تحويل إلى مشروع',
    message: msg,
    confirmLabel: 'تأكيد',
    onConfirm: async () => {
      try {
        const tblOld = isProject ? 'projects' : 'initiatives';
        const tblNew = isProject ? 'initiatives' : 'projects';
        await store.actUpdate(tblOld, project.id, { entity_type: newKind });
        /* move row between in-memory categories */
        const arrOld = store.state[tblOld] || [];
        const arrNew = store.state[tblNew] || [];
        const idx = arrOld.findIndex(p => String(p.id) === String(project.id));
        if (idx > -1) {
          const moved = arrOld.splice(idx, 1)[0];
          moved.entity_type = newKind;
          arrNew.push(moved);
        }
        await store.logAudit({
          action: isProject ? 'project_to_initiative' : 'initiative_to_project',
          entity_type:'project', entity_id:String(project.id),
          summary_ar:`«${project.name}» ${isProject ? '→ مبادرة' : '→ مشروع'}`
        });
        toastSuccess('تم التحويل');
        router.refresh();
      } catch (e) { toastError('فشل: ' + e.message); }
    }
  });
}

function editProject(store, router, project, root) {
  openForm({
    title: `تعديل «${project.name}»`,
    fields: [
      { name:'name', label:'الاسم', required:true, value: project.name }
    ],
    confirm: async (data) => {
      if (!data.name) return false;
      const tbl = project.entity_type === 'مشروع' ? 'projects' : 'initiatives';
      try {
        await store.actUpdate(tbl, project.id, { name: data.name });
        await store.logAudit({ action:'project_rename', entity_type:tbl.replace(/s$/,''), summary_ar:`إعادة تسمية «${project.name}» → «${data.name}»` });
        toastSuccess('تم التحديث');
        renderProjectDetail(root, store, router, { id: project.id });
      } catch (e) { toastError('فشل: ' + e.message); }
    }
  });
}

function deleteProject(store, router, project) {
  confirmDialog({
    title: 'حذف المشروع',
    message: `هل أنت متأكد من حذف «${project.name}»؟ سيتم إخفاؤه (soft-delete).`,
    danger: true,
    confirmLabel: 'حذف',
    onConfirm: async () => {
      const tbl = project.entity_type === 'مشروع' ? 'projects' : 'initiatives';
      try {
        await store.actRemove(tbl, project.id);
        await store.logAudit({ action:'project_remove', entity_type:tbl.replace(/s$/,''), summary_ar:`حذف «${project.name}»` });
        toastSuccess('تم الحذف');
        router.navigate('portfolios');
      } catch (e) { toastError('فشل: ' + e.message); }
    }
  });
}

/* ─── Helpers ─── */
function kpiCard(label, value, meta='', color='') {
  return `<div class="kpi">
    <div class="kpi-label">${escapeText(label)}</div>
    <div class="kpi-value" ${color ? `style="color:${color}"`:''}>${escapeText(value)}</div>
    ${meta ? `<div class="kpi-meta">${escapeText(meta)}</div>` : ''}
  </div>`;
}
