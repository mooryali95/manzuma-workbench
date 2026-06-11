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
import { toastError, toastSuccess } from './components/toast.js';
import { openForm } from './components/modal.js';
import { escapeText as escape } from './utils.js';

let store = null;
let router = null;

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
      <button class="btn" id="btn-baseline">🎯 تثبيت Baseline</button>
      <a class="btn" href="#workbench">🛠 الورشة</a>
      <a class="btn" href="#portfolios">📊 المحافظ</a>
    </div>
  `;

  rootHeader.querySelector('#btn-baseline').addEventListener('click', () => {
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

  /* Init + load */
  try {
    await adapter.init();
    if (BACKEND === 'supabase') setConn('ok', 'متصل بـ Supabase');
  } catch (e) {
    console.error('Adapter init failed:', e);
    toastError('فشل الاتصال بـ Supabase — التحول إلى الوضع المحلي');
    setConn('error', 'فشل الاتصال');
    /* Fallback to local */
    adapter = new LocalAdapter();
    await adapter.init();
    setConn('local', 'محلي (احتياطي)');
  }

  store = new Store(adapter);
  router = new Router();

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
}

/* Run boot when DOM ready */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/* Expose for debugging */
window.__manzuma = { get store(){ return store; }, get router(){ return router; } };
