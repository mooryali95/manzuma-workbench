/**
 * views/login.js  (v4.4)
 * Auth gate screens: sign-in / sign-up toggle + pending-activation.
 * Rendered into the app root BEFORE the store boots.
 */

import { APP } from '../../config.js';
import { escapeText } from '../utils.js';
import { ROLE_LABELS } from '../auth.js';

/**
 * renderLogin(root, auth, onSuccess)
 * onSuccess(user) is called after a successful sign-in/up WITH a session.
 */
export function renderLogin(root, auth, onSuccess) {
  let mode = 'signin';   /* signin | signup */

  const draw = () => {
    root.innerHTML = `
      <div class="auth-wrap">
        <div class="auth-card">
          <div class="auth-logo">قيمة</div>
          <h1 class="auth-title">${escapeText(APP.name_ar)}</h1>
          <p class="auth-sub">${mode === 'signin' ? 'سجّل دخولك للمتابعة' : 'أنشئ حساباً جديداً'}</p>

          <div class="field">
            <label>البريد الإلكتروني</label>
            <input type="email" id="auth-email" dir="ltr" placeholder="name@example.com" autocomplete="email">
          </div>
          <div class="field">
            <label>كلمة المرور</label>
            <input type="password" id="auth-pass" dir="ltr" placeholder="••••••••"
                   autocomplete="${mode === 'signin' ? 'current-password' : 'new-password'}">
          </div>

          <div class="auth-error" id="auth-error" hidden></div>

          <button class="btn primary auth-submit" id="auth-submit">
            ${mode === 'signin' ? 'تسجيل الدخول' : 'إنشاء الحساب'}
          </button>

          <div class="auth-switch">
            ${mode === 'signin'
              ? 'لا تملك حساباً؟ <a href="#" id="auth-toggle">إنشاء حساب</a>'
              : 'لديك حساب؟ <a href="#" id="auth-toggle">تسجيل الدخول</a>'}
          </div>
          <div class="auth-note">
            ${mode === 'signup'
              ? 'الحسابات الجديدة تبقى «بانتظار التفعيل» حتى يفعّلها مالك النظام.'
              : ''}
          </div>
        </div>
      </div>
    `;

    const emailEl = root.querySelector('#auth-email');
    const passEl  = root.querySelector('#auth-pass');
    const errEl   = root.querySelector('#auth-error');
    const btn     = root.querySelector('#auth-submit');

    const showError = (msg) => { errEl.textContent = msg; errEl.hidden = false; };

    const submit = async () => {
      const email = emailEl.value.trim();
      const pass  = passEl.value;
      errEl.hidden = true;
      if (!email || !pass) { showError('أدخل البريد وكلمة المرور'); return; }
      btn.disabled = true;
      btn.textContent = 'جارٍ المعالجة…';
      try {
        if (mode === 'signin') {
          const user = await auth.signIn(email, pass);
          onSuccess(user);
        } else {
          const res = await auth.signUp(email, pass);
          if (res.needsConfirmation) {
            root.querySelector('.auth-card').innerHTML = `
              <div class="auth-logo">✉️</div>
              <h1 class="auth-title">تحقق من بريدك</h1>
              <p class="auth-sub">أرسلنا رابط تأكيد إلى<br><b dir="ltr">${escapeText(email)}</b><br>بعد التأكيد عُد وسجّل دخولك.</p>
              <button class="btn auth-submit" id="auth-back">عودة لتسجيل الدخول</button>
            `;
            root.querySelector('#auth-back').addEventListener('click', () => { mode = 'signin'; draw(); });
          } else {
            onSuccess(res.user);
          }
        }
      } catch (e) {
        showError(e.message);
        btn.disabled = false;
        btn.textContent = mode === 'signin' ? 'تسجيل الدخول' : 'إنشاء الحساب';
      }
    };

    btn.addEventListener('click', submit);
    [emailEl, passEl].forEach(el =>
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); }));
    root.querySelector('#auth-toggle')?.addEventListener('click', (e) => {
      e.preventDefault();
      mode = mode === 'signin' ? 'signup' : 'signin';
      draw();
    });
    setTimeout(() => emailEl.focus(), 80);
  };

  draw();
}

/** شاشة «بانتظار التفعيل» — للحسابات بدور pending */
export function renderPending(root, auth, onSignOut) {
  root.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">⏳</div>
        <h1 class="auth-title">حسابك بانتظار التفعيل</h1>
        <p class="auth-sub">
          مرحباً <b dir="ltr">${escapeText(auth.user?.email || '')}</b><br>
          تم إنشاء حسابك بنجاح بدور «${escapeText(ROLE_LABELS.pending)}».<br>
          اطلب من مالك النظام تفعيلك من نافذة «المستخدمون»، ثم حدّث الصفحة.
        </p>
        <button class="btn auth-submit" id="auth-refresh">🔄 تحقّق من التفعيل</button>
        <button class="btn ghost auth-submit" id="auth-signout" style="margin-top:8px">تسجيل الخروج</button>
      </div>
    </div>
  `;
  root.querySelector('#auth-refresh').addEventListener('click', async () => {
    await auth.fetchRole();
    if (auth.canRead) location.reload();
  });
  root.querySelector('#auth-signout').addEventListener('click', async () => {
    await auth.signOut();
    onSignOut();
  });
}
