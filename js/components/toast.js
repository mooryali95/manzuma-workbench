/**
 * components/toast.js
 * Lightweight toast notifications.
 */

let containerEl = null;

function ensureContainer() {
  if (containerEl) return containerEl;
  containerEl = document.querySelector('.toast-container');
  if (!containerEl) {
    containerEl = document.createElement('div');
    containerEl.className = 'toast-container';
    document.body.appendChild(containerEl);
  }
  return containerEl;
}

export function toast(message, kind = 'info', ms = 2800) {
  const c = ensureContainer();
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = message;
  c.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toast-out 0.25s ease forwards';
    setTimeout(() => t.remove(), 300);
  }, ms);
  return t;
}

export const toastSuccess = (m) => toast(m, 'success');
export const toastWarn    = (m) => toast(m, 'warning');
export const toastError   = (m) => toast(m, 'danger', 4000);
export const toastInfo    = (m) => toast(m, 'info');
