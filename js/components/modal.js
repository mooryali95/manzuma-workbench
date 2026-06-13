/**
 * components/modal.js
 * Modal dialogs with form support.
 */

import { escapeText, escapeAttr } from '../utils.js';

let modalEl = null, backdropEl = null;
let onConfirm = null, onCancel = null;

function ensure() {
  if (modalEl) return;
  backdropEl = document.createElement('div');
  backdropEl.className = 'backdrop';
  document.body.appendChild(backdropEl);

  modalEl = document.createElement('div');
  modalEl.className = 'modal';
  modalEl.innerHTML = `
    <div class="modal-head">
      <h3 id="modal-title">إضافة</h3>
    </div>
    <div class="modal-body" id="modal-body"></div>
    <div class="modal-foot">
      <button class="btn" id="modal-cancel">إلغاء</button>
      <button class="btn primary" id="modal-confirm">حفظ</button>
    </div>
  `;
  document.body.appendChild(modalEl);

  backdropEl.addEventListener('click', () => close());
  modalEl.querySelector('#modal-cancel').addEventListener('click', () => close());
  modalEl.querySelector('#modal-confirm').addEventListener('click', async () => {
    const btn = modalEl.querySelector('#modal-confirm');
    if (btn.dataset.busy === '1') return;            /* منع الإرسال المزدوج */

    /* تحقق مرئي: الحقول الإلزامية الفارغة تتوهج ولا يُغلق النموذج */
    let firstInvalid = null;
    modalEl.querySelectorAll('[data-required="1"]').forEach(inp => {
      const empty = !(inp.value && String(inp.value).trim());
      inp.closest('.field').classList.toggle('field-invalid', empty);
      if (empty && !firstInvalid) firstInvalid = inp;
    });
    if (firstInvalid) {
      firstInvalid.focus();
      modalEl.classList.remove('shake'); void modalEl.offsetWidth;
      modalEl.classList.add('shake');
      return;
    }

    if (onConfirm) {
      const result = collectFormData();
      btn.dataset.busy = '1';
      const oldLabel = btn.textContent;
      btn.textContent = 'جارٍ الحفظ…';
      btn.disabled = true;
      try {
        const r = await onConfirm(result);          /* انتظار حقيقي للوعود */
        if (r === false) return;                    /* رفض تحقق من المستدعي — يبقى مفتوحاً */
      } finally {
        btn.dataset.busy = '';
        btn.textContent = oldLabel;
        btn.disabled = false;
      }
    }
    close();
  });
  document.addEventListener('keydown', (e) => {
    if (modalEl.dataset.open === 'true') {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
        modalEl.querySelector('#modal-confirm').click();
      }
    }
  });
}

function collectFormData() {
  const out = {};
  modalEl.querySelectorAll('[data-name]').forEach(inp => {
    out[inp.dataset.name] = inp.value.trim ? inp.value.trim() : inp.value;
  });
  return out;
}

export function close() {
  if (!modalEl) return;
  backdropEl.dataset.open = 'false';
  modalEl.dataset.open = 'false';
  if (onCancel) onCancel();
  onConfirm = null;
  onCancel  = null;
}

/**
 * openForm({ title, fields, confirm, cancel })
 *
 * fields: [{ name, label, type?, value?, options?, placeholder?, required? }]
 */
export function openForm({ title='إضافة', fields=[], confirm, cancel, confirmLabel='حفظ', cancelLabel='إلغاء' }) {
  ensure();
  modalEl.querySelector('#modal-title').textContent = title;
  const cbtn = modalEl.querySelector('#modal-confirm');
  cbtn.textContent = confirmLabel;
  cbtn.className = 'btn primary';                   /* لا يرث لون خطر سابقاً */
  modalEl.querySelector('#modal-cancel').textContent  = cancelLabel;

  const body = modalEl.querySelector('#modal-body');
  body.innerHTML = '';
  for (const f of fields) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    let inputHtml = '';
    const reqStar = f.required ? ' <span style="color:var(--danger)">*</span>' : '';
    const val = (f.value ?? '');
    if (f.type === 'select') {
      const opts = (f.options || []).map(o => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : (o.label ?? o.value);
        const sel = String(v) === String(val) ? ' selected' : '';
        return `<option value="${escapeAttr(v)}"${sel}>${escapeText(l)}</option>`;
      }).join('');
      inputHtml = `<select data-name="${escapeAttr(f.name)}">${opts}</select>`;
    } else if (f.type === 'textarea') {
      inputHtml = `<textarea data-name="${escapeAttr(f.name)}" placeholder="${escapeAttr(f.placeholder||'')}">${escapeText(val)}</textarea>`;
    } else if (f.type === 'date') {
      inputHtml = `<input type="date" data-name="${escapeAttr(f.name)}" value="${escapeAttr(val)}">`;
    } else if (f.type === 'number') {
      const min = f.min !== undefined ? ` min="${f.min}"` : '';
      const max = f.max !== undefined ? ` max="${f.max}"` : '';
      inputHtml = `<input type="number" data-name="${escapeAttr(f.name)}" value="${escapeAttr(val)}"${min}${max}>`;
    } else {
      inputHtml = `<input type="text" data-name="${escapeAttr(f.name)}" value="${escapeAttr(val)}" placeholder="${escapeAttr(f.placeholder||'')}">`;
    }
    wrap.innerHTML = `<label>${escapeText(f.label)}${reqStar}</label>${inputHtml}` +
      (f.required ? `<div class="field-error">هذا الحقل مطلوب</div>` : '') +
      (f.help ? `<div class="field-help">${escapeText(f.help)}</div>` : '');
    body.appendChild(wrap);
    if (f.required) {
      const inp = wrap.querySelector('[data-name]');
      inp.dataset.required = '1';
      inp.addEventListener('input', () => wrap.classList.remove('field-invalid'));
    }
  }

  onConfirm = (data) => {
    if (confirm) return confirm(data);
  };
  onCancel = cancel;

  backdropEl.dataset.open = 'true';
  modalEl.dataset.open = 'true';
  setTimeout(() => {
    const first = body.querySelector('[data-name]');
    if (first) first.focus();
  }, 100);
}

export function confirm({ title='تأكيد', message='هل أنت متأكد؟', confirmLabel='تأكيد', cancelLabel='إلغاء', danger=false, onConfirm:cb }) {
  ensure();
  modalEl.querySelector('#modal-title').textContent = title;
  const body = modalEl.querySelector('#modal-body');
  body.innerHTML = `<p style="margin:0;font-size:13px;color:var(--ink-2);line-height:1.7;white-space:pre-line">${escapeText(message)}</p>`;
  modalEl.querySelector('#modal-confirm').textContent = confirmLabel;
  const isDanger = danger || /حذف|إزالة/.test(confirmLabel) || /حذف/.test(title);
  modalEl.querySelector('#modal-confirm').className = 'btn ' + (isDanger ? 'danger' : 'primary');
  modalEl.querySelector('#modal-cancel').textContent = cancelLabel;
  onConfirm = () => { if (cb) cb(); };
  backdropEl.dataset.open = 'true';
  modalEl.dataset.open = 'true';
}


