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
const ocState = {
  openCards: new Set(),
  openPfs: new Set(),                                  /* لطور القائمة */
  search: '',
  layout: localStorage.getItem('oc_layout') || 'auto', /* auto|wide|grid|stack */
  zoom: Number(localStorage.getItem('oc_zoom')) || 1,
  theatre: false   /* وضع العرض — لا يُحفظ: التطبيق يفتح فاتحاً دائماً */
};
let _ro = null;  /* ResizeObserver */

export function renderTree(root, store, router) {
  root.innerHTML = '';
  const model = buildModel(store);

  /* ─── أدوات ─── */
  const tools = document.createElement('div');
  tools.className = 'tree-tools';
  tools.innerHTML = `
    <input type="search" id="oc-search" placeholder="🔎 بحث…" value="${escapeText(ocState.search)}">
    <span class="oc-seg" id="oc-layouts">
      <button data-l="auto"  class="btn sm">تلقائي</button>
      <button data-l="wide"  class="btn sm">🖥 شجرة</button>
      <button data-l="grid"  class="btn sm">▦ شبكة</button>
      <button data-l="stack" class="btn sm">☰ قائمة</button>
    </span>
    <span class="oc-seg" id="oc-zoom">
      <button class="btn sm" data-z="out" aria-label="تصغير">−</button>
      <span class="oc-zoom-val tnum">${Math.round(ocState.zoom * 100)}%</span>
      <button class="btn sm" data-z="in" aria-label="تكبير">+</button>
      <button class="btn sm" data-z="fit">ملاءمة</button>
    </span>
    <button class="btn sm" id="oc-expand">⊞ فتح الكل</button>
    <button class="btn sm" id="oc-collapse">⊟ إغلاق</button>
    <button class="btn sm oc-theatre-btn" id="oc-theatre">🎦 وضع العرض</button>
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

  /* 🎦 وضع العرض: مسرح داكن + ملء شاشة للاجتماعات */
  const theatreBtn = tools.querySelector('#oc-theatre');
  const applyTheatre = () => {
    wrap.classList.toggle('oc-theatre', ocState.theatre);
    theatreBtn.classList.toggle('active', ocState.theatre);
    theatreBtn.textContent = ocState.theatre ? '✕ خروج من العرض' : '🎦 وضع العرض';
  };
  theatreBtn.addEventListener('click', async () => {
    ocState.theatre = !ocState.theatre;
    applyTheatre();
    try {
      if (ocState.theatre && !document.fullscreenElement) await wrap.requestFullscreen();
      else if (!ocState.theatre && document.fullscreenElement) await document.exitFullscreen();
    } catch { /* المتصفح قد يمنع — الوضع الداكن يعمل بدونه */ }
    draw();
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && ocState.theatre) {
      ocState.theatre = false; applyTheatre(); draw();
    }
  });
  applyTheatre();

  /* أطوار العرض */
  const markLayout = () => tools.querySelectorAll('#oc-layouts .btn').forEach(b =>
    b.classList.toggle('active', b.dataset.l === ocState.layout));
  markLayout();
  tools.querySelectorAll('#oc-layouts .btn').forEach(b =>
    b.addEventListener('click', () => {
      ocState.layout = b.dataset.l;
      localStorage.setItem('oc_layout', ocState.layout);
      markLayout(); draw();
    }));

  /* التكبير (للطور الواسع) */
  const zoomVal = tools.querySelector('.oc-zoom-val');
  const setZoom = (z) => {
    ocState.zoom = Math.min(1.4, Math.max(0.5, Math.round(z * 100) / 100));
    localStorage.setItem('oc_zoom', ocState.zoom);
    zoomVal.textContent = Math.round(ocState.zoom * 100) + '%';
    applyZoom(wrap);
  };
  tools.querySelector('[data-z="in"]').addEventListener('click',  () => setZoom(ocState.zoom + 0.1));
  tools.querySelector('[data-z="out"]').addEventListener('click', () => setZoom(ocState.zoom - 0.1));
  tools.querySelector('[data-z="fit"]').addEventListener('click', () => {
    const content = wrap.querySelector('.oc-content');
    if (!content) return;
    setZoom(Math.min(1.2, wrap.clientWidth / (content.scrollWidth + 24)));
  });

  /* إعادة التموضع عند تغير الأبعاد (آيباد، تدوير، تغيير نافذة) */
  if (_ro) _ro.disconnect();
  _ro = new ResizeObserver(() => {
    if (resolveLayout(wrap) !== wrap.dataset.layout) draw();
    else requestAnimationFrame(() => drawConnectors(wrap));
  });
  _ro.observe(wrap);
}

/* الطور الفعلي: اليدوي إن حُدد، وإلا حسب العرض */
function resolveLayout(wrap) {
  if (ocState.layout !== 'auto') return ocState.layout;
  const w = wrap.clientWidth || window.innerWidth;
  if (w >= 1000) return 'wide';
  if (w >= 620)  return 'grid';
  return 'stack';
}

function applyZoom(wrap) {
  const content = wrap.querySelector('.oc-content');
  if (!content) return;
  const z = wrap.dataset.layout === 'wide' ? ocState.zoom : 1;
  content.style.transform = z === 1 ? '' : `scale(${z})`;
  content.style.transformOrigin = 'top right';
  /* عوّض ارتفاع الحاوية بعد التحجيم */
  wrap.style.height = z === 1 ? '' : (content.scrollHeight * z + 20) + 'px';
  requestAnimationFrame(() => drawConnectors(wrap));
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

  const layout = resolveLayout(wrap);
  wrap.dataset.layout = layout;

  const R = model.rootAgg;
  const RING_R = 26, CIRC = 2 * Math.PI * RING_R;
  const rootCard = `
    <div class="oc-root">
      <div class="oc-ring">
        <svg viewBox="0 0 64 64" width="64" height="64">
          <circle class="ring-bg" cx="32" cy="32" r="${RING_R}"/>
          <circle class="ring-fg" cx="32" cy="32" r="${RING_R}"
            stroke-dasharray="${CIRC.toFixed(1)}"
            stroke-dashoffset="${CIRC.toFixed(1)}"
            data-ring-target="${(CIRC * (1 - R.avg / 100)).toFixed(1)}"/>
        </svg>
        <span class="ring-num tnum" data-count="${R.avg}">0</span>
      </div>
      <div class="oc-root-text">
        <div class="oc-root-name">🏛 ${escapeText(APP.name_ar)}</div>
        <div class="oc-root-meta">
          <b class="tnum" data-count="${R.total}">0</b> عنصر ·
          <b class="tnum" data-count="${R.phases}">0</b> مرحلة
          ${R.overdue ? ` · <b class="late tnum" data-count="${R.overdue}">0</b> <span class="late">متأخرة</span>` : ''}
        </div>
      </div>
    </div>`;

  if (layout === 'stack') {
    /* ☰ أكورديون عمودي للجوال */
    wrap.innerHTML = `
      <div class="oc-content oc-stack">
        ${rootCard}
        ${visPortfolios.map(p => {
          const open = q ? true : ocState.openPfs.has(String(p.pf.id));
          return `
          <div class="oc-acc ${open ? 'open' : ''}">
            <div class="oc-pf-head" style="--pfc:${escapeText(p.pf.color || '#8A6D2F')};--pfbg:${escapeText(p.pf.bg_color || '#F6F1E4')}"
                 data-acc="${escapeText(p.pf.id)}">
              <span class="oc-pf-name">${open ? '▾' : '◂'} ${escapeText(p.pf.name_ar)}</span>
              <span class="oc-pf-meta tnum">${p.agg.avg}%${p.agg.overdue ? ` | <b>${p.agg.overdue} متأخرة</b>` : ''}</span>
            </div>
            ${open ? `<div class="oc-cards">${p.visCards.map(c => cardHtml(c, p.pf, store, q, hit)).join('') || '<div class="oc-empty">لا مفاهيم</div>'}</div>` : ''}
          </div>`;
        }).join('')}
      </div>`;
  } else {
    /* 🖥 شجرة (موصلات SVG) أو ▦ شبكة */
    wrap.innerHTML = `
      <div class="oc-content oc-${layout}">
        <div class="oc-root-row">${rootCard}</div>
        <div class="oc-cols">
          ${visPortfolios.map(p => columnHtml(p, store, q, hit)).join('')}
        </div>
        ${layout === 'wide' ? '<svg class="oc-svg" aria-hidden="true"></svg>' : ''}
      </div>
      ${visPortfolios.length ? '' : '<div class="empty-state"><div class="icon">🔎</div><div class="title">لا نتائج</div></div>'}`;
  }

  wireInteractions(wrap, model, store, router);
  applyZoom(wrap);
  requestAnimationFrame(() => {
    drawConnectors(wrap);
    animateIn(wrap);
  });
}

/* ─── حركات غرفة القيادة (تحترم prefers-reduced-motion) ─────────── */
function animateIn(wrap) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* حلقة التقدم */
  const ring = wrap.querySelector('.ring-fg');
  if (ring) {
    const target = ring.dataset.ringTarget;
    if (reduced) ring.style.strokeDashoffset = target;
    else requestAnimationFrame(() =>
      requestAnimationFrame(() => { ring.style.strokeDashoffset = target; }));
  }

  /* الأرقام تعدّ تصاعدياً */
  wrap.querySelectorAll('[data-count]').forEach(el => {
    const target = Number(el.dataset.count) || 0;
    if (reduced || target === 0) { el.textContent = target; return; }
    const dur = 750, t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  /* الخطوط ترسم نفسها */
  const svg = wrap.querySelector('.oc-svg');
  if (svg && !reduced) {
    svg.querySelectorAll('path').forEach((p, i) => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
      p.style.transition = `stroke-dashoffset .55s ease ${0.08 * i}s`;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => { p.style.strokeDashoffset = 0; }));
    });
  }
}

/* موصلات SVG مرسومة من المواضع الفعلية — لا تنكسر مع أي أبعاد */
function drawConnectors(wrap) {
  const content = wrap.querySelector('.oc-content');
  const svg = wrap.querySelector('.oc-svg');
  if (!content || !svg || wrap.dataset.layout !== 'wide') { svg?.replaceChildren(); return; }

  const rootEl = content.querySelector('.oc-root');
  const heads = [...content.querySelectorAll('.oc-pf-head')];
  if (!rootEl || !heads.length) { svg.replaceChildren(); return; }

  const W = content.scrollWidth, H = content.scrollHeight;
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  /* offsetLeft/Top غير متأثرة بـ transform:scale — مثالية هنا */
  const center = (el) => {
    let x = el.offsetWidth / 2, y = 0, n = el;
    while (n && n !== content) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x, y: y, h: el.offsetHeight };
  };

  const r = center(rootEl);
  const rootBottom = { x: r.x, y: r.y + r.h };
  const pts = heads.map(h => { const c = center(h); return { x: c.x, y: c.y }; });
  const topY = Math.min(...pts.map(p => p.y));
  const busY = rootBottom.y + Math.max(16, (topY - rootBottom.y) / 2);

  /* الناقل يمتد ليشمل موضع الجذر دائماً — اتصال مضمون */
  const xs = pts.map(p => p.x);
  const busMin = Math.min(...xs, rootBottom.x);
  const busMax = Math.max(...xs, rootBottom.x);
  const seg = (d) => `<path d="${d}"/>`;
  let paths = seg(`M ${rootBottom.x} ${rootBottom.y} V ${busY}`);
  if (pts.length > 1 || busMin !== busMax) paths += seg(`M ${busMin} ${busY} H ${busMax}`);
  for (const p of pts) paths += seg(`M ${p.x} ${busY} V ${p.y + 1}`);

  svg.innerHTML = `<g class="oc-lines">${paths}</g>`;
}

function wireInteractions(wrap, model, store, router) {
  wrap.querySelectorAll('[data-acc]').forEach(el =>
    el.addEventListener('click', () => {
      const k = String(el.dataset.acc);
      ocState.openPfs.has(k) ? ocState.openPfs.delete(k) : ocState.openPfs.add(k);
      drawChart(wrap, model, store, router);
    }));
  wrap.querySelectorAll('[data-oc-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.dataset.ocToggle;
      ocState.openCards.has(k) ? ocState.openCards.delete(k) : ocState.openCards.add(k);
      drawChart(wrap, model, store, router);
    });
  });
  wrap.querySelectorAll('[data-nav-pf]:not([data-acc])').forEach(el =>
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
    <div class="oc-pf-head" style="--pfc:${escapeText(color)};--pfbg:${escapeText(bg)}"
         data-nav-pf="${escapeText(pf.id)}" role="link" tabindex="0">
      <span class="oc-pf-name">${escapeText(pf.name_ar)}</span>
      <span class="oc-pf-meta tnum">${agg.avg}%${agg.overdue ? ` | <b>${agg.overdue} متأخرة</b>` : ''}</span>
    </div>
    <div class="oc-cards">
      ${visCards.map(c => cardHtml(c, pf, store, q, hit)).join('') ||
        `<div class="oc-empty">لا مفاهيم بعد<br>
         <button class="oc-empty-cta" data-nav-pf="${escapeText(pf.id)}">+ أضف مفهوماً</button></div>`}
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
