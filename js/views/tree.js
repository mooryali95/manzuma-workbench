/**
 * views/tree.js  (v4.6 — Org Chart)
 * 🌳 الشجرة — مخطط هيكلي تنظيمي على نمط لوحة منظومة:
 * عقدة جذر ← أعمدة المحافظ (بألوانها) ← بطاقات المفاهيم
 * ← عناصر قابلة للفتح داخل البطاقة ← التنقل بالنقر.
 *
 * يدعم «المحفظة الفعلية» (v4.5): العنصر المتجاوز يُحتسب ويظهر
 * في محفظته الفعلية ضمن بطاقة «↩ عناصر واردة».
 */

import { escapeText } from '../utils.js';
import { projectProgress, projectStatus, statusLabelAr } from '../models.js';
import { APP } from '../../config.js';

const KIND_LABEL = { product:'منتج', initiative:'مبادرة', project:'مشروع' };
const KIND_ICON  = { product:'📦', initiative:'🚀', project:'🏗' };
const today = () => new Date().toISOString().slice(0, 10);

/* حالة العرض خلال الجلسة */
const ocState = { openCards: new Set(), search: '' };

export function renderTree(root, store, router) {
  root.innerHTML = '';
  const model = buildModel(store);

  /* ─── أدوات ─── */
  const tools = document.createElement('div');
  tools.className = 'tree-tools';
  tools.innerHTML = `
    <input type="search" id="oc-search" placeholder="🔎 بحث…" value="${escapeText(ocState.search)}">
    <button class="btn sm" id="oc-expand">⊞ فتح كل البطاقات</button>
    <button class="btn sm" id="oc-collapse">⊟ إغلاقها</button>
  `;
  root.appendChild(tools);

  const wrap = document.createElement('div');
  wrap.className = 'oc-wrap';
  root.appendChild(wrap);

  const draw = () => drawChart(wrap, model, store, router);
  draw();

  tools.querySelector('#oc-search').addEventListener('input', (e) => {
    ocState.search = e.target.value.trim();
    draw();
  });
  tools.querySelector('#oc-expand').addEventListener('click', () => {
    model.portfolios.forEach(p => {
      p.cards.forEach(c => ocState.openCards.add(c.key));
    });
    draw();
  });
  tools.querySelector('#oc-collapse').addEventListener('click', () => {
    ocState.openCards.clear();
    draw();
  });
}

/* ─── النموذج ─────────────────────────────────────────────────────── */
function buildModel(store) {
  const t = today();

  const itemNode = (raw) => {
    const phases = store.phasesOfProject(raw.id);
    const overdue = phases.filter(p =>
      p.status !== 'completed' && p.end_date && p.end_date < t).length;
    return {
      item: raw,
      phases,
      overdue,
      progress: phases.length ? projectProgress(store, raw.id) : null,
      status: phases.length ? projectStatus(store, raw.id) : 'not_started'
    };
  };

  /* تجميعة لمجموعة عناصر */
  const aggregate = (nodes) => {
    const withProg = nodes.filter(n => n.progress !== null);
    return {
      total: nodes.length,
      done: nodes.filter(n => n.status === 'completed').length,
      overdue: nodes.reduce((s, n) => s + n.overdue, 0),
      phases: nodes.reduce((s, n) => s + n.phases.length, 0),
      avg: withProg.length
        ? Math.round(withProg.reduce((s, n) => s + n.progress, 0) / withProg.length)
        : (nodes.length && nodes.every(n => n.status === 'completed') ? 100 : 0)
    };
  };

  const portfolios = [...(store.state.portfolios || [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const model = { portfolios: [], rootAgg: null };
  const allEff = [];

  for (const pf of portfolios) {
    const cards = [];

    for (const concept of store.conceptsInPortfolio(pf.id)) {
      const staying = [];
      for (const raw of store.childrenOf(concept.id)) {
        const eff = store.effectivePortfolioId(raw);
        if (eff && String(eff) !== String(pf.id)) continue;  /* يُحتسب في محفظته الفعلية */
        staying.push(itemNode(raw));
      }
      cards.push({
        key: 'c:' + concept.id,
        kind: 'concept',
        concept,
        nodes: staying,
        agg: aggregate(staying)
      });
    }

    /* بطاقة العناصر الواردة عبر التجاوز */
    const incoming = store.incomingItemsOfPortfolio(pf.id).map(raw => ({
      ...itemNode(raw),
      homeConcept: store.conceptById(raw.parent_id)
    }));
    if (incoming.length) {
      cards.push({
        key: 'in:' + pf.id,
        kind: 'incoming',
        nodes: incoming,
        agg: aggregate(incoming)
      });
    }

    const pfNodes = cards.flatMap(c => c.nodes);
    allEff.push(...pfNodes);
    model.portfolios.push({ pf, cards, agg: aggregate(pfNodes) });
  }

  model.rootAgg = aggregate(allEff);
  return model;
}

/* ─── الرسم ──────────────────────────────────────────────────────── */
function drawChart(wrap, model, store, router) {
  const q = ocState.search.toLowerCase();
  const hit = (txt) => q && (txt || '').toLowerCase().includes(q);

  const cardMatches = (card) =>
    !q ||
    (card.kind === 'concept' && hit(card.concept.name)) ||
    card.nodes.some(n => hit(n.item.name));

  const visPortfolios = model.portfolios
    .map(p => ({ ...p, visCards: p.cards.filter(cardMatches) }))
    .filter(p => !q || hit(p.pf.name_ar) || p.visCards.length);

  const R = model.rootAgg;
  wrap.innerHTML = `
    <div class="oc-root-row">
      <div class="oc-root">
        <div class="oc-root-name">🏛 ${escapeText(APP.name_ar)}</div>
        <div class="oc-root-meta">
          ${R.avg}% إنجاز · ${R.total} عنصر · ${R.phases} مرحلة
          ${R.overdue ? ` · <b class="late">${R.overdue} متأخرة</b>` : ''}
        </div>
      </div>
    </div>
    <div class="oc-stem"></div>
    <div class="oc-cols">
      ${visPortfolios.map(p => columnHtml(p, store, q, hit)).join('')}
    </div>
    ${visPortfolios.length ? '' : `<div class="empty-state"><div class="icon">🔎</div><div class="title">لا نتائج</div></div>`}
  `;

  /* تفاعلات */
  wrap.querySelectorAll('[data-oc-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.dataset.ocToggle;
      ocState.openCards.has(k) ? ocState.openCards.delete(k) : ocState.openCards.add(k);
      drawChart(wrap, model, store, router);
    });
  });
  wrap.querySelectorAll('[data-nav-pf]').forEach(el =>
    el.addEventListener('click', () => router.navigate('portfolio', { pf: el.dataset.navPf })));
  wrap.querySelectorAll('[data-nav-concept]').forEach(el =>
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      router.navigate('portfolio', { pf: el.dataset.navPf, focus: el.dataset.navConcept });
    }));
  wrap.querySelectorAll('[data-nav-item]').forEach(el =>
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const { navItem, navKind, navPf, navConcept } = el.dataset;
      if (navKind === 'project') router.navigate('project', { id: navItem });
      else router.navigate('portfolio', { pf: navPf, focus: navConcept });
    }));
}

function columnHtml(p, store, q, hit) {
  const { pf, visCards, agg } = p;
  const color = pf.color || '#8A6D2F';
  const bg = pf.bg_color || '#F6F1E4';
  return `
  <div class="oc-col">
    <div class="oc-link"></div>
    <div class="oc-pf-head" style="--pfc:${escapeText(color)};--pfbg:${escapeText(bg)}"
         data-nav-pf="${escapeText(pf.id)}" role="link" tabindex="0">
      <span class="oc-pf-name">${escapeText(pf.name_ar)}</span>
      <span class="oc-pf-meta tnum">${agg.avg}%${agg.overdue ? ` | <b>${agg.overdue} متأخرة</b>` : ''}</span>
    </div>
    <div class="oc-cards">
      ${visCards.map(c => cardHtml(c, pf, store, q, hit)).join('') ||
        '<div class="oc-empty">لا مفاهيم</div>'}
    </div>
  </div>`;
}

function cardHtml(card, pf, store, q, hit) {
  const open = q ? card.nodes.some(n => hit(n.item.name)) || ocState.openCards.has(card.key)
                 : ocState.openCards.has(card.key);
  const a = card.agg;
  const late = a.overdue > 0;
  const isIncoming = card.kind === 'incoming';
  const title = isIncoming ? `↩ عناصر واردة (${a.total})` : card.concept.name;
  const highlight = !isIncoming && hit(title);

  /* نقاط الحالة: نقطة لكل عنصر */
  const dots = card.nodes.slice(0, 8).map(n =>
    `<span class="oc-dot s-${n.status}" title="${escapeText(n.item.name)} — ${statusLabelAr(n.status)}"></span>`
  ).join('') + (card.nodes.length > 8 ? `<span class="oc-dot-more">+${card.nodes.length - 8}</span>` : '');

  const itemsList = !open ? '' : `
    <div class="oc-items">
      ${card.nodes.map(n => itemRowHtml(n, card, pf, store, hit)).join('') ||
        '<div class="oc-empty">بلا عناصر</div>'}
    </div>`;

  return `
  <div class="oc-card ${late ? 'is-late' : ''} ${isIncoming ? 'is-incoming' : ''} ${highlight ? 'is-hit' : ''}"
       data-oc-toggle="${escapeText(card.key)}">
    <div class="oc-card-head">
      <span class="oc-card-name" ${isIncoming ? '' :
        `data-nav-concept="${escapeText(card.concept.id)}" data-nav-pf="${escapeText(pf.id)}" role="link" tabindex="0"`}>
        ${late ? '<span class="oc-warn">⚠</span> ' : ''}${escapeText(title)}
        ${!isIncoming && card.concept.linked_bot_entity_id ? ' <span class="cu-badge">🔗</span>' : ''}
      </span>
      <span class="oc-card-pct tnum ${late ? 'late' : ''}">${a.avg}%</span>
    </div>
    <div class="oc-bar"><span class="oc-fill ${late ? 'late' : ''}" style="width:${a.avg}%"></span></div>
    <div class="oc-card-chips">
      <span class="oc-chip tnum">${a.done}/${a.total}</span>
      ${a.overdue ? `<span class="oc-chip danger">⚠ ${a.overdue} متأخرة</span>` : ''}
      ${a.total && a.done === a.total ? '<span class="oc-chip good">✓ مكتمل</span>' : ''}
    </div>
    <div class="oc-dots">${dots}</div>
    ${itemsList}
  </div>`;
}

function itemRowHtml(n, card, pf, store, hit) {
  const effPf = store.effectivePortfolioId(n.item);
  return `
  <div class="oc-item ${hit(n.item.name) ? 'is-hit' : ''}"
       data-nav-item="${escapeText(n.item.id)}"
       data-nav-kind="${escapeText(n.item._kind)}"
       data-nav-pf="${escapeText(effPf || pf.id)}"
       data-nav-concept="${escapeText(n.item.parent_id)}"
       role="link" tabindex="0">
    <span class="oc-item-icon">${KIND_ICON[n.item._kind] || '▫️'}</span>
    <span class="oc-item-name">${escapeText(n.item.name)}</span>
    ${card.kind === 'incoming' && n.homeConcept
      ? `<span class="tn-tag">↩ ${escapeText(n.homeConcept.name)}</span>` : ''}
    <span class="oc-item-meta tnum">
      ${n.progress !== null ? n.progress + '%' : '—'}
      ${n.overdue ? ` · <b class="late">⚠${n.overdue}</b>` : ''}
    </span>
  </div>`;
}
