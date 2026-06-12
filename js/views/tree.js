/**
 * views/tree.js  (v4.5)
 * 🌳 الشجرة — الصورة الكلية من أول نظرة.
 *
 * هرمية: محفظة ← مفهوم ← عنصر (منتج/مبادرة/مشروع) ← مراحل
 * مع تجميع تصاعدي (Roll-up) على كل عقدة، وبحث فوري،
 * ودعم «المحفظة الفعلية»: العنصر المتجاوز يظهر مرة واحدة
 * في محفظته الفعلية بوسم «↩ تابع لمفهوم X»، ويُترك في
 * مفهومه الأم سطر شبحي «⤴ في محفظة Y» (لا يُحتسب).
 */

import { escapeText } from '../utils.js';
import { projectProgress, projectStatus, statusLabelAr } from '../models.js';
import { linkBadgeHtml } from '../components/clickup-link.js';

const KIND_LABEL = { product:'منتج', initiative:'مبادرة', project:'مشروع' };
const today = () => new Date().toISOString().slice(0, 10);

/* حالة العرض (تبقى خلال الجلسة) */
const treeState = { open: new Set(), search: '', booted: false };

export function renderTree(root, store, router) {
  root.innerHTML = '';

  /* أول فتح: افتح كل المحافظ فقط */
  if (!treeState.booted) {
    (store.state.portfolios || []).forEach(p => treeState.open.add('pf:' + p.id));
    treeState.booted = true;
  }

  const model = buildModel(store);

  /* ─── شريط الملخص ─── */
  const summary = document.createElement('div');
  summary.className = 'tree-summary';
  summary.innerHTML = `
    <div class="ts-cell"><div class="v tnum">${model.totals.portfolios}</div><div class="l">محفظة</div></div>
    <div class="ts-cell"><div class="v tnum">${model.totals.concepts}</div><div class="l">مفهوم</div></div>
    <div class="ts-cell"><div class="v tnum">${model.totals.items}</div><div class="l">عنصر</div></div>
    <div class="ts-cell"><div class="v tnum">${model.totals.phases}</div><div class="l">مرحلة</div></div>
    <div class="ts-cell ${model.totals.overdue ? 'is-late' : ''}"><div class="v tnum">${model.totals.overdue}</div><div class="l">متأخرة</div></div>
    <div class="ts-cell"><div class="v tnum">${model.totals.avgProgress}%</div><div class="l">متوسط التقدم</div></div>
  `;
  root.appendChild(summary);

  /* ─── أدوات الشجرة ─── */
  const tools = document.createElement('div');
  tools.className = 'tree-tools';
  tools.innerHTML = `
    <input type="search" id="tree-search" placeholder="🔎 بحث في الشجرة…" value="${escapeText(treeState.search)}">
    <button class="btn sm" id="tree-expand">⊞ توسيع الكل</button>
    <button class="btn sm" id="tree-collapse">⊟ طي الكل</button>
  `;
  root.appendChild(tools);

  const treeRoot = document.createElement('div');
  treeRoot.className = 'tree-root';
  root.appendChild(treeRoot);

  const draw = () => drawTree(treeRoot, model, store, router);
  treeRoot.addEventListener('tree:redraw', draw);
  draw();

  tools.querySelector('#tree-search').addEventListener('input', (e) => {
    treeState.search = e.target.value.trim();
    draw();
  });
  tools.querySelector('#tree-expand').addEventListener('click', () => {
    collectAllKeys(model).forEach(k => treeState.open.add(k));
    draw();
  });
  tools.querySelector('#tree-collapse').addEventListener('click', () => {
    treeState.open.clear();
    draw();
  });
}

/* ─── بناء النموذج مع التجميعات ─────────────────────────────────── */
function buildModel(store) {
  const t = today();
  const portfolios = [...(store.state.portfolios || [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const itemNode = (item) => {
    const phases = store.phasesOfProject(item.id);
    const overdue = phases.filter(p =>
      p.status !== 'completed' && p.end_date && p.end_date < t).length;
    const progress = phases.length ? projectProgress(store, item.id) : null;
    const status = phases.length ? projectStatus(store, item.id) : 'not_started';
    return { item, phases, overdue, progress, status };
  };

  const model = {
    portfolios: [],
    totals: { portfolios: portfolios.length, concepts: 0, items: 0, phases: 0, overdue: 0, avgProgress: 0 }
  };
  const progressPool = [];

  for (const pf of portfolios) {
    const concepts = store.conceptsInPortfolio(pf.id).map(concept => {
      const own = store.childrenOf(concept.id);              /* عناصر المفهوم */
      const staying = [], moved = [];
      for (const raw of own) {
        const node = itemNode(raw);
        const effPf = store.effectivePortfolioId(raw);
        if (effPf && String(effPf) !== String(pf.id)) moved.push({ ...node, toPf: effPf });
        else staying.push(node);
      }
      return { concept, staying, moved };
    });

    /* العناصر الواردة عبر التجاوز من مفاهيم محافظ أخرى */
    const incoming = store.incomingItemsOfPortfolio(pf.id).map(raw => {
      const node = itemNode(raw);
      const homeConcept = store.conceptById(raw.parent_id);
      return { ...node, homeConcept };
    });

    /* تجميعات المحفظة: العناصر الفعلية = staying + incoming */
    const effItems = [
      ...concepts.flatMap(c => c.staying),
      ...incoming
    ];
    const agg = {
      concepts: concepts.length,
      items: effItems.length,
      phases: effItems.reduce((s, n) => s + n.phases.length, 0),
      overdue: effItems.reduce((s, n) => s + n.overdue, 0),
      status: { in_progress: 0, blocked: 0, completed: 0, not_started: 0 },
      avgProgress: 0
    };
    const withProg = effItems.filter(n => n.progress !== null);
    agg.avgProgress = withProg.length
      ? Math.round(withProg.reduce((s, n) => s + n.progress, 0) / withProg.length) : 0;
    effItems.forEach(n => { agg.status[n.status] = (agg.status[n.status] || 0) + 1; });

    model.portfolios.push({ pf, concepts, incoming, agg });
    model.totals.concepts += agg.concepts;
    model.totals.items += agg.items;
    model.totals.phases += agg.phases;
    model.totals.overdue += agg.overdue;
    withProg.forEach(n => progressPool.push(n.progress));
  }

  model.totals.avgProgress = progressPool.length
    ? Math.round(progressPool.reduce((s, v) => s + v, 0) / progressPool.length) : 0;
  return model;
}

function collectAllKeys(model) {
  const keys = [];
  for (const p of model.portfolios) {
    keys.push('pf:' + p.pf.id);
    p.concepts.forEach(c => keys.push('c:' + c.concept.id));
    [...p.concepts.flatMap(c => c.staying), ...p.incoming]
      .forEach(n => keys.push('i:' + n.item.id));
  }
  return keys;
}

/* ─── الرسم ──────────────────────────────────────────────────────── */
function drawTree(treeRoot, model, store, router) {
  const q = treeState.search.toLowerCase();
  const match = (txt) => q && (txt || '').toLowerCase().includes(q);

  treeRoot.innerHTML = '';
  let anyVisible = false;

  for (const { pf, concepts, incoming, agg } of model.portfolios) {
    /* عند البحث: تظهر المحفظة إن طابقت هي أو أي شيء تحتها */
    const subMatches = !q ? null : {
      concepts: concepts.filter(c =>
        match(c.concept.name) ||
        c.staying.some(n => match(n.item.name) || n.phases.some(ph => match(ph.name_ar))) ||
        c.moved.some(n => match(n.item.name))),
      incoming: incoming.filter(n => match(n.item.name) || n.phases.some(ph => match(ph.name_ar)))
    };
    const pfMatch = !q || match(pf.name_ar) || subMatches.concepts.length || subMatches.incoming.length;
    if (!pfMatch) continue;
    anyVisible = true;

    const pfKey = 'pf:' + pf.id;
    const pfOpen = q ? true : treeState.open.has(pfKey);
    const statusDots = `
      ${agg.status.in_progress ? `<span class="tdot warn" title="جارية">${agg.status.in_progress}</span>` : ''}
      ${agg.status.blocked ? `<span class="tdot danger" title="متعثرة">${agg.status.blocked}</span>` : ''}
      ${agg.status.completed ? `<span class="tdot good" title="مكتملة">${agg.status.completed}</span>` : ''}
      ${agg.status.not_started ? `<span class="tdot idle" title="لم تبدأ">${agg.status.not_started}</span>` : ''}
    `;

    const pfEl = node({
      key: pfKey, level: 0, open: pfOpen, hasChildren: concepts.length + incoming.length > 0,
      icon: '🗂', cls: 'tn-pf',
      title: pf.name_ar, highlight: match(pf.name_ar),
      meta: `${agg.concepts} مفهوم · ${agg.items} عنصر · ${agg.phases} مرحلة` +
            (agg.overdue ? ` · <b class="late">${agg.overdue} متأخرة</b>` : ''),
      right: `${statusDots}${progressBar(agg.avgProgress)}`,
      onTitle: () => router.navigate('portfolio', { pf: pf.id })
    });
    treeRoot.appendChild(pfEl.row);

    if (!pfOpen) continue;

    const visConcepts = q ? subMatches.concepts : concepts;
    for (const cNode of visConcepts) {
      const { concept, staying, moved } = cNode;
      const cKey = 'c:' + concept.id;
      const cOpen = q ? true : treeState.open.has(cKey);
      const cAggPhases = staying.reduce((s, n) => s + n.phases.length, 0);
      const cOverdue = staying.reduce((s, n) => s + n.overdue, 0);
      const kindCounts = ['product', 'initiative', 'project']
        .map(k => [k, staying.filter(n => n.item._kind === k).length])
        .filter(([, n]) => n)
        .map(([k, n]) => `${n} ${KIND_LABEL[k]}`).join(' · ');

      const cEl = node({
        key: cKey, level: 1, open: cOpen, hasChildren: staying.length + moved.length > 0,
        icon: '💡', cls: 'tn-concept',
        title: concept.name, highlight: match(concept.name),
        badges: linkBadgeHtml(store, concept),
        meta: (kindCounts || 'بلا عناصر') +
              (cAggPhases ? ` · ${cAggPhases} مرحلة` : '') +
              (cOverdue ? ` · <b class="late">${cOverdue} متأخرة</b>` : ''),
        onTitle: () => router.navigate('portfolio', { pf: pf.id, focus: concept.id })
      });
      treeRoot.appendChild(cEl.row);
      if (!cOpen) continue;

      for (const n of staying) {
        const filtered = q && !match(n.item.name) &&
          !n.phases.some(ph => match(ph.name_ar)) && !match(concept.name) && !match(pf.name_ar);
        if (filtered) continue;
        appendItemBranch(treeRoot, n, 2, store, router, { q, match });
      }
      /* أسطر شبحية للعناصر المنقولة */
      for (const n of moved) {
        const toPf = store.portfolioById(n.toPf);
        const ghost = node({
          key: null, level: 2, open: false, hasChildren: false,
          icon: '⤴', cls: 'tn-ghost',
          title: n.item.name, highlight: match(n.item.name),
          meta: `في محفظة «${escapeText(toPf?.name_ar || '?')}» — يُحتسب هناك`,
          onTitle: n.item._kind === 'project'
            ? () => router.navigate('project', { id: n.item.id })
            : () => router.navigate('portfolio', { pf: n.toPf, focus: n.item.parent_id })
        });
        treeRoot.appendChild(ghost.row);
      }
    }

    /* العناصر الواردة */
    const visIncoming = q ? subMatches.incoming : incoming;
    if (visIncoming.length) {
      const head = node({
        key: null, level: 1, open: true, hasChildren: false,
        icon: '↩', cls: 'tn-incoming-head',
        title: `عناصر واردة (${visIncoming.length})`,
        meta: 'عناصر محفظتها الفعلية هنا ومفهومها الأم في محفظة أخرى'
      });
      treeRoot.appendChild(head.row);
      for (const n of visIncoming) {
        appendItemBranch(treeRoot, n, 2, store, router, {
          q, match,
          extraTag: `<span class="tn-tag">↩ تابع لمفهوم «${escapeText(n.homeConcept?.name || '?')}»</span>`
        });
      }
    }
  }

  if (!anyVisible) {
    treeRoot.innerHTML = `<div class="empty-state"><div class="icon">🔎</div>
      <div class="title">لا نتائج</div><div class="desc">جرّب كلمة أخرى</div></div>`;
  }
}

/* فرع عنصر + مراحله */
function appendItemBranch(treeRoot, n, level, store, router, { q, match, extraTag = '' }) {
  const iKey = 'i:' + n.item.id;
  const iOpen = q ? n.phases.some(ph => match(ph.name_ar)) || treeState.open.has(iKey)
                  : treeState.open.has(iKey);
  const kindIcon = { product: '📦', initiative: '🚀', project: '🏗' }[n.item._kind] || '▫️';

  const iEl = node({
    key: iKey, level, open: iOpen, hasChildren: n.phases.length > 0,
    icon: kindIcon, cls: 'tn-item',
    title: n.item.name, highlight: match && match(n.item.name),
    badges: `<span class="kind-badge" data-kind="${n.item._kind}">${KIND_LABEL[n.item._kind]}</span>
             <span class="status-pill" data-s="${n.status}">${statusLabelAr(n.status)}</span>
             ${linkBadgeHtml(store, n.item)} ${extraTag}`,
    meta: n.phases.length
      ? `${n.phases.length} مرحلة` + (n.overdue ? ` · <b class="late">${n.overdue} متأخرة</b>` : '')
      : 'بلا مراحل',
    right: n.progress !== null ? progressBar(n.progress) : '',
    onTitle: n.item._kind === 'project'
      ? () => router.navigate('project', { id: n.item.id })
      : () => router.navigate('portfolio', { pf: store.effectivePortfolioId(n.item), focus: n.item.parent_id })
  });
  treeRoot.appendChild(iEl.row);
  if (!iOpen) return;

  const t = today();
  for (const ph of n.phases) {
    if (q && !match(ph.name_ar) && !match(n.item.name)) continue;
    const late = ph.status !== 'completed' && ph.end_date && ph.end_date < t;
    const phEl = node({
      key: null, level: level + 1, open: false, hasChildren: false,
      icon: late ? '⏰' : '◽', cls: 'tn-phase' + (late ? ' is-late' : ''),
      title: ph.name_ar, highlight: match && match(ph.name_ar),
      badges: `<span class="status-pill" data-s="${ph.status}">${statusLabelAr(ph.status)}</span>`,
      meta: `${ph.start_date || '?'} ← ${ph.end_date || '?'}` +
            (ph.depends_on_phase_id ? ' · ⛓' : ''),
      right: progressBar(ph.progress || 0, true)
    });
    treeRoot.appendChild(phEl.row);
  }
}

/* ─── لبنة العقدة ─────────────────────────────────────────────────── */
function node({ key, level, open, hasChildren, icon, cls, title, highlight, badges = '', meta = '', right = '', onTitle }) {
  const row = document.createElement('div');
  row.className = `tree-node ${cls}` + (highlight ? ' is-hit' : '');
  row.style.setProperty('--lvl', level);
  row.innerHTML = `
    <button class="tn-toggle" ${hasChildren ? '' : 'disabled'}>${hasChildren ? (open ? '▾' : '◂') : '·'}</button>
    <span class="tn-icon">${icon}</span>
    <span class="tn-title" role="link" tabindex="0">${escapeText(title)}</span>
    <span class="tn-badges">${badges}</span>
    <span class="tn-meta">${meta}</span>
    <span class="tn-right">${right}</span>
  `;
  if (key && hasChildren) {
    row.querySelector('.tn-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      treeState.open.has(key) ? treeState.open.delete(key) : treeState.open.add(key);
      /* أعد رسم الشجرة بالكامل عبر حدث مخصص */
      row.dispatchEvent(new CustomEvent('tree:redraw', { bubbles: true }));
    });
  }
  if (onTitle) {
    const el = row.querySelector('.tn-title');
    el.addEventListener('click', onTitle);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') onTitle(); });
  }
  return { row };
}

function progressBar(pct, mini = false) {
  return `<span class="tn-prog ${mini ? 'mini' : ''}" title="${pct}%">
    <span class="bar"><span class="fill" style="width:${pct}%"></span></span>
    <span class="num tnum">${pct}%</span>
  </span>`;
}
