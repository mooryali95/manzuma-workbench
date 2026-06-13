/**
 * app.js
 * Application entry point.
 *  - Boots data adapter (Supabase or local fallback)
 *  - Loads state into Store
 *  - Initializes hash-based router
 *  - Mounts the appropriate view based on the route
 *
 * Routes (hash-based):
 *   #portfolios                    → Portfolios kanban
 *   #portfolio?pf=ID&focus=ID     → Portfolio detail
 *   #project?id=ID                → Project detail (with Gantt)
 *   #workbench[?concept=ID]       → Formations workbench
 */

import { BACKEND, APP } from '../config.js';
import { Store } from './store.js';
import { LocalAdapter } from './data/local-adapter.js';
import { SupabaseAdapter } from './data/supabase-adapter.js';
import { ClickUpAdapter } from './data/clickup-adapter.js';
import { renderPortfolios } from './views/portfolios.js';
import { renderPortfolioDetail } from './views/portfolio.js';
import { renderProjectDetail } from './views/project.js';
import { renderWorkbench } from './views/workbench.js';
import { renderTree } from './views/tree.js';
import { renderAuditList } from './views/portfolios.js';
import { AuthManager, ROLE_LABELS } from './auth.js';
import { renderLogin, renderPending } from './views/login.js';
import { toastError, toastSuccess, toastInfo } from './components/toast.js';
import { openForm, confirm as confirmDialog } from './components/modal.js';
import { escapeText as escape } from './utils.js';

let store = null;
let router = null;
let auth = null;

/* ─── Router (hash-based) ───────────────────────────────────────── */
class Router {
  constructor() {
    this.appRoot = null;
    this.currentRoute = null;
    window.addEventListener('hashchange', () => this.handle());
  }
  init(appRoot) {
    this.appRoot = appRoot;
    /* workbench.html sets window.__INITIAL_VIEW — must be honored here,
       BEFORE the default is applied (was previously dead code) */
    if (!location.hash) location.hash = (window.__INITIAL_VIEW || APP.default_view);
    this.handle();
  }
  /* Re-render the current route without changing the hash.
     Used after mutations when the route stays the same
     (hashchange wouldn't fire, so render must be explicit). */
  refresh() {
    this.render();
  }
  handle() {
    const hash = location.hash.slice(1) || APP.default_view;
    const [view, queryStr] = hash.split('?');
    const params = {};
    if (queryStr) {
      queryStr.split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        params[decodeURIComponent(k)] = v !== undefined ? decodeURIComponent(v) : '';
      });
    }
    this.currentRoute = { view, params };
    this.render();
  }
  navigate(view, params = {}) {
    const qs = Object.entries(params)
      .filter(([_,v]) => v !== undefined && v !== null && v !== '')
      .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    location.hash = view + (qs ? '?' + qs : '');
  }
  render() {
    if (!this.appRoot || !store?.state) return;
    let { view, params } = this.currentRoute;

    /* v5.2: انتقال صفحات ناعم (يحترم تقليل الحركة) */
    this.appRoot.classList.remove('view-enter');
    void this.appRoot.offsetWidth;
    this.appRoot.classList.add('view-enter');

    /* v4.8: حارس الصفحات المسموحة */
    const VIEW_KEY = { tree:'tree', portfolios:'portfolios', portfolio:'portfolios',
                       project:'portfolios', workbench:'workbench' };
    if (auth && VIEW_KEY[view] && !auth.canSee(VIEW_KEY[view])) {
      const fallback = auth.firstAllowedView();
      toastInfo('هذه الصفحة غير متاحة لحسابك');
      this.navigate(fallback);
      return;
    }

    /* Save scroll position per view */
    this.appRoot.classList.remove('fade-up');
    void this.appRoot.offsetWidth;  /* re-trigger animation */
    this.appRoot.classList.add('fade-up');

    switch (view) {
      case 'tree':
        renderTree(this.appRoot, store, this);
        break;
      case 'portfolios':
        renderPortfolios(this.appRoot, store, this);
        break;
      case 'portfolio':
        renderPortfolioDetail(this.appRoot, store, this, params);
        break;
      case 'project':
        renderProjectDetail(this.appRoot, store, this, params);
        break;
      case 'workbench':
        renderWorkbench(this.appRoot, store, this, params);
        break;
      default:
        location.hash = APP.default_view;
    }
  }
}

/* ─── Header (global app header outside the view) ───────────────── */
function renderShellHeader(rootHeader) {
  /* v4.4.1: قبل اكتمال المصادقة تُعرض ترويسة مصغّرة بلا أدوات */
  const authed = BACKEND === 'local' || (auth && auth.canRead);
  if (!authed) {
    rootHeader.innerHTML = `
      <div class="lhs">
        <h1 class="h1">${escape(APP.name_ar)}</h1>
        <p class="sub">v${APP.version}</p>
      </div>
      <div class="rhs">
        <div class="conn" id="conn" data-state="loading">
          <span class="conn-dot"></span>
          <span id="conn-text">جارٍ الاتصال…</span>
        </div>
      </div>
    `;
    return;
  }
  const canWrite = auth ? auth.canWrite : true;
  const userChip = auth?.user ? `
      <div class="user-chip" title="${escape(auth.user.email)}">
        <span class="user-role" data-role="${escape(auth.role)}">${escape(ROLE_LABELS[auth.role] || auth.role)}</span>
        <span class="user-email" dir="ltr">${escape(auth.user.email)}</span>
        <button class="btn-icon sm" id="btn-signout" title="تسجيل الخروج" aria-label="تسجيل الخروج">⎋</button>
      </div>` : '';

  rootHeader.innerHTML = `
    <div class="lhs">
      <h1 class="h1">${escape(APP.name_ar)}</h1>
      <p class="sub">v${APP.version} · مرتبط بـ Supabase Manzuma DB</p>
    </div>
    <div class="rhs">
      <div class="conn" id="conn" data-state="loading">
        <span class="conn-dot"></span>
        <span id="conn-text">جارٍ الاتصال…</span>
      </div>
      ${userChip}
      <nav class="main-nav" aria-label="التنقل الرئيسي">
        ${!auth || auth.canSee('tree') ? '<a class="nav-link" data-nav="tree" href="#tree">🌳 <span>الشجرة</span></a>' : ''}
        ${!auth || auth.canSee('portfolios') ? '<a class="nav-link" data-nav="portfolios" href="#portfolios">📊 <span>المحافظ</span></a>' : ''}
        ${!auth || auth.canSee('workbench') ? '<a class="nav-link" data-nav="workbench" href="#workbench">🛠 <span>الورشة</span></a>' : ''}
      </nav>
      <div class="tools-menu">
        <button class="btn" id="btn-tools" aria-haspopup="true" aria-expanded="false" aria-label="قائمة الأدوات">⚙ أدوات</button>
        <div class="tools-pop" id="tools-pop" hidden>
          <button class="tools-item" id="btn-export">⇩ تصدير نسخة احتياطية</button>
          ${canWrite ? '<button class="tools-item" id="btn-import">⇪ استيراد نسخة احتياطية</button>' : ''}
          ${canWrite ? '<button class="tools-item" id="btn-baseline">🎯 تثبيت Baseline</button>' : ''}
          ${auth?.isOwner ? '<button class="tools-item" id="btn-audit">📜 سجل التغييرات</button>' : ''}
          ${auth?.isOwner ? '<button class="tools-item" id="btn-users">👥 المستخدمون</button>' : ''}
        </div>
      </div>
    </div>
  `;

  /* قائمة الأدوات: فتح/إغلاق نظيف بلا تسريب مستمعين */
  const toolsBtn = rootHeader.querySelector('#btn-tools');
  const toolsPop = rootHeader.querySelector('#tools-pop');
  if (toolsBtn && toolsPop) {
    const closePop = () => { toolsPop.hidden = true; toolsBtn.setAttribute('aria-expanded', 'false'); };
    const openPop  = () => { toolsPop.hidden = false; toolsBtn.setAttribute('aria-expanded', 'true'); };
    toolsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toolsPop.hidden ? openPop() : closePop();
    });
    toolsPop.addEventListener('click', () => closePop());           /* أي عنصر يُغلق */
    /* مستمع document واحد فقط (يُسجَّل مرة عبر العَلَم) */
    if (!window._toolsPopGlobalBound) {
      window._toolsPopGlobalBound = true;
      document.addEventListener('click', (e) => {
        const pop = document.getElementById('tools-pop');
        const btn = document.getElementById('btn-tools');
        if (pop && !pop.hidden && !pop.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
          pop.hidden = true; btn?.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          const pop = document.getElementById('tools-pop');
          if (pop) { pop.hidden = true; document.getElementById('btn-tools')?.setAttribute('aria-expanded','false'); }
        }
      });
      window.addEventListener('hashchange', () => {
        const pop = document.getElementById('tools-pop');
        if (pop) pop.hidden = true;
      });
    }
  }

  /* الحالة النشطة لروابط التنقل (مبدأ Visibility of System Status) */
  const markActiveNav = () => {
    const KEY = { tree:'tree', portfolios:'portfolios', portfolio:'portfolios',
                  project:'portfolios', workbench:'workbench' };
    const current = KEY[(location.hash.slice(1) || APP.default_view).split('?')[0]] || '';
    rootHeader.querySelectorAll('.nav-link').forEach(a => {
      const active = a.dataset.nav === current;
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  };
  markActiveNav();
  window.addEventListener('hashchange', markActiveNav);

  /* تسجيل الخروج */
  rootHeader.querySelector('#btn-signout')?.addEventListener('click', async () => {
    await auth.signOut();
    location.reload();
  });

  /* سجل التغييرات (owner) */
  rootHeader.querySelector('#btn-audit')?.addEventListener('click', () => openAuditModal());

  /* إدارة المستخدمين (owner) */
  rootHeader.querySelector('#btn-users')?.addEventListener('click', () => openUsersModal());

  /* تصدير JSON (v4.3) */
  rootHeader.querySelector('#btn-export')?.addEventListener('click', () => {
    try {
      const snap = store.exportSnapshot();
      const blob = new Blob([JSON.stringify(snap, null, 2)], { type:'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `manzuma-workbench-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toastSuccess('تم تصدير النسخة الاحتياطية');
    } catch (e) { toastError('فشل التصدير: ' + e.message); }
  });

  /* استيراد JSON (v4.3) — معاينة الأعداد ثم تأكيد قبل الدمج */
  rootHeader.querySelector('#btn-import')?.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.addEventListener('change', () => {
      const file = inp.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let parsed;
        try { parsed = JSON.parse(reader.result); }
        catch { toastError('ملف JSON غير صالح'); return; }
        if (parsed?.meta?.app !== 'manzuma-workbench' || !parsed.data) {
          toastError('الملف ليس نسخة احتياطية من الورشة');
          return;
        }
        const d = parsed.data;
        const n = (k) => (d[k] || []).length;
        const summary =
          `المصدر: ${parsed.meta.exported_at?.slice(0,16).replace('T',' ') || '—'}\n` +
          `${n('portfolios')} محفظة · ${n('concepts')} مفهوم · ` +
          `${n('products') + n('initiatives') + n('projects')} عنصر · ` +
          `${n('project_phases')} مرحلة · ${n('formations')} تشكيل · ` +
          `${n('individuals')} فرد · ${n('entities')} كيان.\n` +
          `سيتم الدمج بالمعرّف (Upsert) — السجلات المطابقة تُستبدل والجديدة تُضاف، ولا يُحذف شيء.`;
        confirmDialog({
          title: 'استيراد نسخة احتياطية',
          message: summary,
          confirmLabel: 'استيراد ودمج',
          onConfirm: async () => {
            try {
              await store.importSnapshot(parsed);
              await store.logAudit({ action:'import_json', entity_type:'system',
                summary_ar:'استيراد نسخة احتياطية JSON ودمجها' });
              toastSuccess('تم الاستيراد والدمج');
              router.refresh();
            } catch (e) { toastError('فشل الاستيراد: ' + e.message); }
          }
        });
      };
      reader.readAsText(file);
    });
    inp.click();
  });

  rootHeader.querySelector('#btn-baseline')?.addEventListener('click', () => {
    openForm({
      title: 'تثبيت Baseline جديد',
      fields: [
        { name:'name', label:'اسم الـ Baseline', required:true, placeholder:'مثل: «Q1-2026»' },
        { name:'description', label:'وصف (اختياري)', type:'textarea' }
      ],
      confirm: async (data) => {
        if (!data.name) return false;
        try {
          const bl = await store.setBaseline(data.name, data.description);
          toastSuccess(`تم تثبيت: ${bl.name}`);
          router.refresh();
        } catch (e) { toastError('فشل: ' + e.message); }
      }
    });
  });
}

/* ─── نافذة إدارة المستخدمين (v4.4 — owner فقط) ─────────────────── */
async function openUsersModal() {
  let users;
  try {
    users = await store.adapter.listUsers();
  } catch (e) { toastError('فشل جلب المستخدمين: ' + e.message); return; }

  if (!users.length) { toastError('لا يوجد مستخدمون بعد'); return; }

  const roleOpts = Object.entries(ROLE_LABELS).map(([v, l]) => ({ value: v, label: l }));
  const VIEW_PRESETS = {
    all:             { label:'كل الصفحات',        views:null },
    tree:            { label:'الشجرة فقط',        views:['tree'] },
    tree_portfolios: { label:'الشجرة والمحافظ',   views:['tree','portfolios'] },
    portfolios:      { label:'المحافظ فقط',       views:['portfolios'] },
    workbench:       { label:'الورشة فقط',        views:['workbench'] }
  };
  const presetOf = (views) => {
    if (!views) return 'all';
    const key = Object.keys(VIEW_PRESETS).find(k => {
      const v = VIEW_PRESETS[k].views;
      return v && v.length === views.length && v.every(x => views.includes(x));
    });
    return key || 'all';
  };
  const viewOpts = Object.entries(VIEW_PRESETS).map(([v, p]) => ({ value: v, label: p.label }));
  const fields = users.flatMap(u => [
    {
      name: u.user_id,
      label: `${u.email}${u.last_sign_in_at ? '' : ' · لم يدخل بعد'} — الدور`,
      type: 'select',
      value: u.role,
      options: roleOpts
    },
    {
      name: u.user_id + '::views',
      label: '↳ الصفحات المتاحة',
      type: 'select',
      value: presetOf(u.allowed_views),
      options: viewOpts
    }
  ]);

  openForm({
    title: `إدارة المستخدمين (${users.length})`,
    fields,
    confirmLabel: 'حفظ الأدوار',
    confirm: async (data) => {
      const roleChanges = users.filter(u => data[u.user_id] && data[u.user_id] !== u.role);
      const viewChanges = users.filter(u => {
        const v = data[u.user_id + '::views'];
        return v && v !== presetOf(u.allowed_views);
      });
      if (!roleChanges.length && !viewChanges.length) { toastSuccess('لا تغييرات'); return; }
      try {
        for (const u of roleChanges) {
          await store.adapter.setUserRole(u.user_id, data[u.user_id]);
          await store.logAudit({
            action: 'role_change', entity_type: 'user', entity_id: u.user_id,
            summary_ar: `تغيير دور ${u.email}: ${ROLE_LABELS[u.role]} ← ${ROLE_LABELS[data[u.user_id]]}`
          });
        }
        for (const u of viewChanges) {
          const preset = VIEW_PRESETS[data[u.user_id + '::views']];
          await store.adapter.setUserViews(u.user_id, preset.views);
          await store.logAudit({
            action: 'views_change', entity_type: 'user', entity_id: u.user_id,
            summary_ar: `صفحات ${u.email}: ${preset.label}`
          });
        }
        toastSuccess(`تم الحفظ (${roleChanges.length + viewChanges.length} تغيير)`);
      } catch (e) { toastError('فشل: ' + e.message); }
    }
  });
}

/* ─── نافذة سجل التغييرات (v5.5 — للأدمن، عبر الأدوات) ─── */
function openAuditModal() {
  ensureAuditModal();
  const m = document.getElementById('audit-modal');
  const list = m.querySelector('#audit-modal-list');
  renderAuditList(list, store.state.audit_log || []);
  m.dataset.open = 'true';
  document.getElementById('audit-backdrop').dataset.open = 'true';
}
function ensureAuditModal() {
  if (document.getElementById('audit-modal')) return;
  const bd = document.createElement('div');
  bd.className = 'backdrop'; bd.id = 'audit-backdrop';
  bd.addEventListener('click', closeAuditModal);
  document.body.appendChild(bd);
  const m = document.createElement('div');
  m.className = 'modal audit-modal'; m.id = 'audit-modal';
  m.innerHTML = `
    <div class="modal-head"><h3>📜 سجل التغييرات</h3></div>
    <div class="modal-body"><div class="changes-list" id="audit-modal-list"></div></div>
    <div class="modal-foot"><button class="btn" id="audit-close">إغلاق</button></div>`;
  document.body.appendChild(m);
  m.querySelector('#audit-close').addEventListener('click', closeAuditModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && m.dataset.open === 'true') closeAuditModal();
  });
}
function closeAuditModal() {
  const m = document.getElementById('audit-modal');
  if (m) m.dataset.open = 'false';
  const bd = document.getElementById('audit-backdrop');
  if (bd) bd.dataset.open = 'false';
}

function setConn(state, text) {
  const conn = document.getElementById('conn');
  if (!conn) return;
  conn.dataset.state = state;
  document.getElementById('conn-text').textContent = text;
}

/* ─── Bootstrap ─────────────────────────────────────────────────── */
async function boot() {
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'ar';

  /* Shell layout */
  const shell = document.querySelector('.shell');
  if (!shell) {
    console.error('No .shell element found');
    return;
  }
  shell.innerHTML = `
    <header class="app-header" id="shell-header"></header>
    <div id="app-root"></div>
  `;
  const appRoot = document.getElementById('app-root');
  renderShellHeader(document.getElementById('shell-header'));

  /* Pick adapter */
  let adapter;
  if (BACKEND === 'local') {
    adapter = new LocalAdapter();
    setConn('local', 'محلي (localStorage)');
  } else {
    adapter = new SupabaseAdapter();
  }

  /* Init adapter (creates the Supabase client; no data reads yet) */
  try {
    await adapter.init();
  } catch (e) {
    console.error('Adapter init failed:', e);
    toastError('فشل الاتصال بـ Supabase — التحول إلى الوضع المحلي');
    setConn('error', 'فشل الاتصال');
    adapter = new LocalAdapter();
    await adapter.init();
    setConn('local', 'محلي (احتياطي)');
  }

  /* ─── بوابة المصادقة (v4.4) — قبل أي تحميل للبيانات ─── */
  if (BACKEND === 'supabase' && adapter.client) {
    auth = new AuthManager(adapter.client);
    setConn('loading', 'التحقق من الجلسة…');
    await auth.restore();

    if (!auth.user) {
      setConn('local', 'غير مسجّل');
      await new Promise((resolve) => {
        renderLogin(appRoot, auth, () => resolve());
      });
    }

    /* مسجّل لكن بانتظار التفعيل */
    if (auth.user && !auth.canRead) {
      setConn('local', 'بانتظار التفعيل');
      renderPending(appRoot, auth, () => location.reload());
      return;
    }

    setConn('ok', 'متصل بـ Supabase');
    /* خروج من تبويب آخر → عودة لشاشة الدخول */
    auth.onChange((event) => { if (event === 'SIGNED_OUT') location.reload(); });
  }

  store = new Store(adapter);
  if (auth) store.attachAuth(auth);
  document.body.dataset.wbRole = auth ? auth.role : 'editor';
  router = new Router();

  /* أعد رسم الترويسة الآن بعد توفر المستخدم والدور */
  renderShellHeader(document.getElementById('shell-header'));
  if (BACKEND === 'supabase' && auth) setConn('ok', 'متصل بـ Supabase');

  /* v5.2: هيكل انتظار (Skeleton) — إدراك أداء أفضل من الفراغ */
  appRoot.innerHTML = `
    <div class="skeleton-page" aria-busy="true" aria-label="جارٍ التحميل">
      <div class="sk sk-title"></div>
      <div class="sk-row">
        <div class="sk sk-card"></div><div class="sk sk-card"></div>
        <div class="sk sk-card"></div><div class="sk sk-card"></div>
      </div>
      <div class="sk sk-block"></div>
    </div>`;

  try {
    await store.boot();
  } catch (e) {
    console.error('Store boot failed:', e);
    appRoot.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><div class="title">فشل تحميل البيانات</div><div class="desc">${escape(e.message)}</div></div>`;
    setConn('error', 'خطأ في التحميل');
    return;
  }

  /* v4.8: ابدأ من أول صفحة مسموحة إن كان الافتراضي محجوباً */
  if (auth && !auth.isOwner && auth.allowedViews) {
    const current = (location.hash.slice(1) || APP.default_view).split('?')[0];
    const KEY = { tree:'tree', portfolios:'portfolios', portfolio:'portfolios',
                  project:'portfolios', workbench:'workbench' };
    if (KEY[current] && !auth.canSee(KEY[current])) {
      location.hash = auth.firstAllowedView();
    }
  }

  /* Initial route */
  router.init(appRoot);

  /* Realtime (v4.3) — تحديث حي بين الأجهزة */
  if (BACKEND === 'supabase' && adapter.subscribe) {
    store.startRealtime(() => {
      toastSuccess('تم تحديث البيانات من جهاز آخر ⟳');
      router.refresh();
    }).then(ok => {
      if (ok) setConn('ok', 'متصل · مزامنة حية');
    }).catch(() => {});
  }
}

/* Run boot when DOM ready */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/* Expose for debugging */
window.__manzuma = { get store(){ return store; }, get router(){ return router; } };
