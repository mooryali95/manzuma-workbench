/**
 * components/drag-drop.js
 * Lightweight drag-and-drop wiring using HTML5 DnD API.
 *
 * Usage:
 *   - Call wireDraggable(el, payload) on each draggable card
 *   - Call wireDropZone(el, acceptedTypes, onDrop) on each drop zone
 *   - payload is an object { type, id, source } available in onDrop
 */

let currentDrag = null;

export function wireDraggable(el, payload) {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    currentDrag = payload;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', JSON.stringify(payload)); } catch {}
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    currentDrag = null;
    document.querySelectorAll('[data-drag-over="true"], [data-drag-invalid="true"]').forEach(z => {
      z.dataset.dragOver = 'false';
      z.dataset.dragInvalid = 'false';
    });
  });
}

export function wireDropZone(el, acceptedTypes, onDrop) {
  const types = Array.isArray(acceptedTypes) ? acceptedTypes : [acceptedTypes];

  el.addEventListener('dragover', (e) => {
    if (!currentDrag) return;
    if (!types.includes(currentDrag.type)) {
      el.dataset.dragInvalid = 'true';
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.dataset.dragOver = 'true';
  });

  el.addEventListener('dragleave', (e) => {
    /* only reset when leaving the element itself (not children) */
    if (e.target !== el && el.contains(e.relatedTarget)) return;
    el.dataset.dragOver = 'false';
    el.dataset.dragInvalid = 'false';
  });

  el.addEventListener('drop', (e) => {
    if (!currentDrag) return;
    e.preventDefault();
    el.dataset.dragOver = 'false';
    el.dataset.dragInvalid = 'false';
    if (!types.includes(currentDrag.type)) return;
    const payload = currentDrag;
    currentDrag = null;
    try { onDrop(payload, e); } catch (err) { console.error('drop handler', err); }
  });
}

export function getCurrentDrag() {
  return currentDrag;
}
