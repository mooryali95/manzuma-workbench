/**
 * auth.js  (v4.4)
 * Auth manager over the Supabase client.
 *
 * Roles (wb_user_roles, enforced server-side by RLS):
 *   owner   — full access + user management
 *   editor  — read/write
 *   viewer  — read-only
 *   pending — signed up, awaiting activation by an owner
 *
 * First-ever signup is auto-promoted to owner by a DB trigger.
 */

export class AuthManager {
  constructor(client) {
    this.client = client;     /* supabase-js client (persistSession: true) */
    this.user = null;         /* { id, email } */
    this.role = null;         /* owner | editor | viewer | pending | null */
  }

  /* Returns the current session user (or null) and hydrates role. */
  async restore() {
    const { data } = await this.client.auth.getSession();
    const session = data?.session;
    if (!session?.user) { this.user = null; this.role = null; return null; }
    this.user = { id: session.user.id, email: session.user.email };
    await this.fetchRole();
    return this.user;
  }

  async fetchRole() {
    if (!this.user) { this.role = null; this.allowedViews = null; return null; }
    const { data, error } = await this.client
      .from('wb_user_roles').select('role, allowed_views')
      .eq('user_id', this.user.id).maybeSingle();
    if (error) { console.warn('role fetch failed:', error.message); this.role = null; return null; }
    this.role = data?.role || 'pending';
    this.allowedViews = data?.allowed_views || null;   /* null = الكل */
    return this.role;
  }

  /* v4.8: هل يحق له رؤية صفحة (مفاتيح: tree | portfolios | workbench) */
  canSee(viewKey) {
    if (this.isOwner) return true;            /* المالك يرى كل شيء دائماً */
    if (!this.allowedViews) return true;       /* null = الكل */
    return this.allowedViews.includes(viewKey);
  }
  firstAllowedView() {
    const order = ['tree', 'portfolios', 'workbench'];
    return order.find(v => this.canSee(v)) || 'tree';
  }

  async signIn(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(translateAuthError(error.message));
    this.user = { id: data.user.id, email: data.user.email };
    await this.fetchRole();
    return this.user;
  }

  async signUp(email, password) {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw new Error(translateAuthError(error.message));
    /* If email confirmation is OFF, a session is returned immediately. */
    if (data.session?.user) {
      this.user = { id: data.session.user.id, email: data.session.user.email };
      await this.fetchRole();
      return { user: this.user, needsConfirmation: false };
    }
    return { user: null, needsConfirmation: true };
  }

  async signOut() {
    await this.client.auth.signOut();
    this.user = null;
    this.role = null;
  }

  /* Reacts to token refresh / sign-out from another tab. */
  onChange(callback) {
    this.client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { this.user = null; this.role = null; }
      callback(event);
    });
  }

  get canRead()    { return ['owner','editor','contributor','viewer'].includes(this.role); }
  get canWrite()   { return ['owner','editor'].includes(this.role); }
  get canPropose() { return this.role === 'contributor'; }   /* يقترح فقط */
  get isOwner()    { return this.role === 'owner'; }
}

export const ROLE_LABELS = {
  owner:       'مالك',
  editor:      'محرر',
  contributor: 'مقترِح',
  viewer:      'مشاهد',
  pending:     'بانتظار التفعيل'
};

/* ترجمة أشهر رسائل أخطاء Supabase Auth */
function translateAuthError(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'بيانات الدخول غير صحيحة';
  if (m.includes('email not confirmed'))       return 'البريد لم يُؤكَّد بعد — افحص صندوق الوارد';
  if (m.includes('user already registered'))   return 'هذا البريد مسجّل مسبقاً — جرّب تسجيل الدخول';
  if (m.includes('password should be at least')) return 'كلمة المرور قصيرة — 6 أحرف على الأقل';
  if (m.includes('rate limit') || m.includes('too many')) return 'محاولات كثيرة — انتظر قليلاً ثم أعد المحاولة';
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'صيغة البريد غير صحيحة';
  return msg;
}
