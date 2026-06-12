/**
 * components/gantt.js
 * Professional RTL Gantt chart renderer.
 *
 * Geometry (RTL):
 *  - Time flows right → left: the EARLIEST month sits on the RIGHT.
 *  - The month axis is emitted in chronological DOM order; because the
 *    document is dir=rtl, the first DOM item lands rightmost — so the
 *    axis and the bars share the same origin without reversal tricks.
 *  - Bars are absolutely positioned with `right:N%` inside the track,
 *    where N = elapsed-days(start) / total-days × 100.
 *  - The "today" marker is a single absolute line spanning the chart;
 *    its offset uses calc() to skip the label column (140px + 14px gap).
 *
 * Phase shape: { id, name_ar, start_date, end_date, status, progress }
 */

import { escapeText, escapeAttr } from '../utils.js';

const AR_MONTHS = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
];
const LABEL_COL_PX = 154;   /* 140px label column + 14px grid gap */
const DAY_MS = 86400000;

function parseDate(d) {
  if (!d) return null;
  const x = new Date(d);
  return isNaN(x.getTime()) ? null : x;
}
const monthKey = (d) => d.getFullYear() * 12 + d.getMonth();

export function renderGantt(root, phases, opts = {}) {
  root.innerHTML = '';
  root.classList.add('gantt-wrap');

  if (!phases.length) {
    root.innerHTML = `
      <div class="gantt-empty">
        <div class="ttl">لا توجد مراحل بعد</div>
        <div class="dsc">أضف مرحلة لبدء جدولة المشروع</div>
        <button class="btn primary sm" style="margin-top:14px" id="gantt-first-add">+ إضافة أول مرحلة</button>
      </div>`;
    if (opts.onAddPhase) {
      root.querySelector('#gantt-first-add').addEventListener('click', opts.onAddPhase);
    }
    return;
  }

  /* ─── Date range (snapped to month boundaries, padded) ─── */
  const padding = opts.paddingMonths ?? 1;
  let minDate = null, maxDate = null;
  for (const p of phases) {
    const s = parseDate(p.start_date), e = parseDate(p.end_date);
    if (s && (!minDate || s < minDate)) minDate = s;
    if (e && (!maxDate || e > maxDate)) maxDate = e;
  }
  if (!minDate) minDate = new Date();
  if (!maxDate) maxDate = new Date(minDate.getFullYear(), minDate.getMonth() + 5, 28);
  minDate = new Date(minDate.getFullYear(), minDate.getMonth() - padding, 1);
  maxDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + padding + 1, 0);

  const monthsCount = monthKey(maxDate) - monthKey(minDate) + 1;
  const totalDays = (maxDate - minDate) / DAY_MS;
  const multiYear = minDate.getFullYear() !== maxDate.getFullYear();

  const monthLabels = [];
  for (let i = 0; i < monthsCount; i++) {
    const m = new Date(minDate.getFullYear(), minDate.getMonth() + i, 1);
    monthLabels.push(AR_MONTHS[m.getMonth()] + (multiYear ? ' ' + String(m.getFullYear()).slice(-2) : ''));
  }

  /* ─── Header: month axis — chronological DOM order.
         RTL grid places the first item rightmost, matching bar origin. ─── */
  const header = document.createElement('div');
  header.className = 'gantt-header';
  header.innerHTML = `
    <div class="gantt-title">المراحل</div>
    <div class="gantt-axis" style="--months:${monthsCount}">
      ${monthLabels.map(l => `<div class="month">${escapeText(l)}</div>`).join('')}
    </div>
  `;
  root.appendChild(header);

  /* ─── Chart ─── */
  const chart = document.createElement('div');
  chart.className = 'gantt-chart';

  phases.forEach(p => {
    const start = parseDate(p.start_date);
    const end = parseDate(p.end_date);
    let rightPct = 0, widthPct = 0;
    if (start && end) {
      const sDays = (start - minDate) / DAY_MS;
      const eDays = (end - minDate) / DAY_MS;
      rightPct = (sDays / totalDays) * 100;
      widthPct = Math.max(((eDays - sDays) / totalDays) * 100, 1);
    }

    const row = document.createElement('div');
    row.className = 'gantt-row';
    const dateRange = (start && end)
      ? `${start.toLocaleDateString('en-CA')} ← ${end.toLocaleDateString('en-CA')}`
      : 'بدون تاريخ';

    row.innerHTML = `
      <div class="row-label">
        ${escapeText(p.name_ar || 'بلا اسم')}
        <span class="row-meta">${escapeText(dateRange)}</span>
      </div>
      <div class="row-track" style="--months:${monthsCount}">
        ${ start && end
          ? `<div class="row-bar" data-s="${escapeAttr(p.status)}" style="right:${rightPct.toFixed(3)}%;width:${widthPct.toFixed(3)}%" data-phase-id="${escapeAttr(p.id)}">
                ${ p.status === 'in_progress' && p.progress
                  ? `<div class="progress-fill" style="width:${p.progress}%"></div>` : '' }
                <span style="position:relative;z-index:2">${ p.progress || 0 }%</span>
              </div>`
          : '<div style="font-size:10px;color:var(--ink-4);padding:4px 8px">بدون تواريخ</div>' }
      </div>
    `;
    chart.appendChild(row);

    if (start && end) {
      row.querySelector('.row-bar').addEventListener('click', () => opts.onPhaseClick?.(p));
    }
  });

  /* ─── Today marker — one absolute line across the whole chart.
         Offset skips the label column then scales by elapsed fraction. ─── */
  const today = new Date();
  if (today >= minDate && today <= maxDate) {
    const frac = ((today - minDate) / DAY_MS) / totalDays;
    const marker = document.createElement('div');
    marker.className = 'gantt-today';
    marker.style.right = `calc(${LABEL_COL_PX}px + (100% - ${LABEL_COL_PX}px) * ${frac.toFixed(4)})`;
    chart.appendChild(marker);
  }

  root.appendChild(chart);

  /* ─── Dependency arrows (v4.3) — SVG overlay, RTL-aware ───
     Predecessor END = LEFT edge of its bar (time flows right→left);
     dependent START = RIGHT edge of its bar. Elbow path between them. */
  const hasDeps = phases.some(p => p.depends_on_phase_id);
  if (hasDeps) {
    requestAnimationFrame(() => {
      const chartRect = chart.getBoundingClientRect();
      if (!chartRect.width) return;
      const barOf = (id) => chart.querySelector(`.row-bar[data-phase-id="${CSS.escape(String(id))}"]`);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'gantt-deps');
      svg.setAttribute('width', chartRect.width);
      svg.setAttribute('height', chartRect.height);
      svg.innerHTML = `<defs>
        <marker id="dep-arrow" viewBox="0 0 8 8" refX="7" refY="4"
                markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--ink-3)"/>
        </marker>
      </defs>`;
      let drawn = 0;
      for (const p of phases) {
        if (!p.depends_on_phase_id) continue;
        const fromBar = barOf(p.depends_on_phase_id);
        const toBar = barOf(p.id);
        if (!fromBar || !toBar) continue;
        const a = fromBar.getBoundingClientRect();
        const b = toBar.getBoundingClientRect();
        const x1 = a.left - chartRect.left;            /* end of predecessor */
        const y1 = a.top - chartRect.top + a.height / 2;
        const x2 = b.right - chartRect.left;           /* start of dependent */
        const y2 = b.top - chartRect.top + b.height / 2;
        const midX = (x2 >= x1) ? x1 - 8 : (x1 + x2) / 2;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d',
          `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2 + 2} ${y2}`);
        path.setAttribute('marker-end', 'url(#dep-arrow)');
        svg.appendChild(path);
        drawn++;
      }
      if (drawn) chart.appendChild(svg);
    });
  }

  /* ─── Add-phase row ─── */
  if (opts.onAddPhase) {
    const addRow = document.createElement('div');
    addRow.className = 'gantt-add-phase';
    addRow.innerHTML = `<div class="placeholder"></div><button class="add-btn">+ إضافة مرحلة</button>`;
    addRow.querySelector('.add-btn').addEventListener('click', opts.onAddPhase);
    root.appendChild(addRow);
  }

  /* ─── Legend ─── */
  const legend = document.createElement('div');
  legend.className = 'gantt-legend';
  legend.innerHTML = `
    <span class="gantt-legend-item"><span class="sw completed"></span>مكتمل</span>
    <span class="gantt-legend-item"><span class="sw in_progress"></span>قيد التنفيذ</span>
    <span class="gantt-legend-item"><span class="sw not_started"></span>لم يبدأ</span>
    <span class="gantt-legend-item"><span class="sw blocked"></span>متعثر</span>
  `;
  root.appendChild(legend);
}
