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
import { AuthManager, ROLE_LABELS } from './auth.js';
import { renderLogin, renderPending } from './views/login.js';
import { toastError, toastSuccess } from './components/toast.js';
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
    const { view, params } = this.currentRoute;

    /* Save scroll position per view */
    this.appRoot.classList.remove('fade-up');
    void this.appRoot.offsetWidth;  /* re-trigger animation */
    this.appRoot.classList.add('fade-up');

    switch (view) {
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
  const canWrite = auth ? auth.canWrite : true;
  const userChip = auth?.user ? `
      <div class="user-chip" title="${escape(auth.user.email)}">
        <span class="user-role" data-role="${escape(auth.role)}">${escape(ROLE_LABELS[auth.role] || auth.role)}</span>
        <span class="user-email" dir="ltr">${escape(auth.user.email)}</span>
        <button class="btn-icon sm" id="btn-signout" title="تسجيل الخروج">⎋</button>
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
      ${auth?.isOwner ? '<button class="btn" id="btn-users">👥 المستخدمون</button>' : ''}
      <button class="btn" id="btn-export" title="تصدير نسخة احتياطية JSON">⇩ تصدير</button>
      ${canWrite ? '<button class="btn" id="btn-import" title="استيراد نسخة احتياطية JSON">⇪ استيراد</button>' : ''}
      ${canWrite ? '<button class="btn" id="btn-baseline">🎯 تثبيت Baseline</button>' : ''}
      <a class="btn" href="#workbench">🛠 الورشة</a>
      <a class="btn" href="#portfolios">📊 المحافظ</a>
    </div>
  `;

  /* تسجيل الخروج */
  rootHeader.querySelector('#btn-signout')?.addEventListener('click', async () => {
    await auth.signOut();
    location.reload();
  });

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
  const fields = users.map(u => ({
    name: u.user_id,
    label: `${u.email}${u.last_sign_in_at ? '' : ' · لم يدخل بعد'}`,
    type: 'select',
    value: u.role,
    options: roleOpts
  }));

  openForm({
    title: `إدارة المستخدمين (${users.length})`,
    fields,
    confirmLabel: 'حفظ الأدوار',
    confirm: async (data) => {
      const changes = users.filter(u => data[u.user_id] && data[u.user_id] !== u.role);
      if (!changes.length) { toastSuccess('لا تغييرات'); return; }
      try {
        for (const u of changes) {
          await store.adapter.setUserRole(u.user_id, data[u.user_id]);
          await store.logAudit({
            action: 'role_change', entity_type: 'user', entity_id: u.user_id,
            summary_ar: `تغيير دور ${u.email}: ${ROLE_LABELS[u.role]} ← ${ROLE_LABELS[data[u.user_id]]}`
          });
        }
        toastSuccess(`تم تحديث ${changes.length} دور`);
      } catch (e) { toastError('فشل: ' + e.message); }
    }
  });
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

  try {
    await store.boot();
  } catch (e) {
    console.error('Store boot failed:', e);
    appRoot.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><div class="title">فشل تحميل البيانات</div><div class="desc">${escape(e.message)}</div></div>`;
    setConn('error', 'خطأ في التحميل');
    return;
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
