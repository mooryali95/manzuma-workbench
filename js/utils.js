/**
 * utils.js
 * Shared low-level helpers: HTML escaping, relative time, dates, SVG icons.
 * Single source — imported by views and components instead of local copies.
 */

export function escapeText(s) {
  return String(s ?? '').replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
}

export function escapeAttr(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

export function timeAgo(iso) {
  if (!iso) return '';
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return 'قبل لحظات';
  const min = Math.floor(sec / 60);
  if (min < 60) return `قبل ${min} د`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `قبل ${hr} س`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `قبل ${day} يوم`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `قبل ${mo} شهر`;
  return `قبل ${Math.floor(mo / 12)} سنة`;
}

export function addMonths(dateStr, n) {
  const x = new Date(dateStr);
  x.setMonth(x.getMonth() + n);
  return x.toISOString().slice(0, 10);
}

export function svgPerson() {
  return `<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="5" r="3"/><path d="M2 15c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>`;
}

export function svgBuilding() {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="2" width="10" height="13" rx="0.5"/><line x1="6" y1="5" x2="6" y2="7"/><line x1="10" y1="5" x2="10" y2="7"/><line x1="6" y1="9" x2="6" y2="11"/><line x1="10" y1="9" x2="10" y2="11"/><rect x="7" y="12" width="2" height="3"/></svg>`;
}
