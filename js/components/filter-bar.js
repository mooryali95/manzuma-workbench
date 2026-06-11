/**
 * components/filter-bar.js
 * Reusable filter bar with text search + chip filters.
 */

export function renderFilterBar(root, { search, chipGroups = [], onChange }) {
  root.innerHTML = '';
  root.classList.add('filter-bar');

  const state = {
    search: search?.value || '',
    chips: Object.fromEntries(chipGroups.map(g => [g.key, g.value || 'all']))
  };

  /* Search input */
  if (search) {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'filter-search';
    inp.placeholder = search.placeholder || 'بحث…';
    inp.value = state.search;
    inp.addEventListener('input', () => {
      state.search = inp.value;
      onChange?.(state);
    });
    root.appendChild(inp);
  }

  /* Chip groups */
  chipGroups.forEach(group => {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.gap = '8px';
    wrap.style.alignItems = 'center';
    wrap.style.flexWrap = 'wrap';

    if (group.label) {
      const lbl = document.createElement('span');
      lbl.className = 'filter-label';
      lbl.textContent = group.label;
      wrap.appendChild(lbl);
    }

    const chips = document.createElement('div');
    chips.style.display = 'flex'; chips.style.gap = '5px'; chips.style.flexWrap = 'wrap';

    group.options.forEach(opt => {
      const chip = document.createElement('button');
      chip.className = 'chip sm';
      chip.textContent = opt.label;
      chip.dataset.value = opt.value;
      chip.dataset.active = String(state.chips[group.key] === opt.value);
      chip.addEventListener('click', () => {
        state.chips[group.key] = opt.value;
        chips.querySelectorAll('.chip').forEach(c => {
          c.dataset.active = String(c.dataset.value === opt.value);
        });
        onChange?.(state);
      });
      chips.appendChild(chip);
    });
    wrap.appendChild(chips);
    root.appendChild(wrap);
  });

  return state;
}
