const list = document.querySelector('[data-project-list]');
const search = document.querySelector('#project-search');
const sort = document.querySelector('#project-sort');
const count = document.querySelector('[data-result-count]');
const empty = document.querySelector('[data-empty]');

if (list && search && sort) {
  const rows = [...list.querySelectorAll('[data-project]')];
  const update = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const sorted = [...rows].sort((a, b) => {
      if (sort.value === 'name') return a.dataset.name.localeCompare(b.dataset.name);
      const field = sort.value === 'stars' ? 'stars' : 'updated';
      return Number(b.dataset[field]) - Number(a.dataset[field]) || a.dataset.name.localeCompare(b.dataset.name);
    });
    let visible = 0;
    for (const row of sorted) {
      row.hidden = !row.dataset.search.includes(query);
      if (!row.hidden) visible++;
      list.append(row);
    }
    count.textContent = query ? `${visible} of ${rows.length} projects` : `${rows.length} projects`;
    empty.hidden = visible !== 0;
  };
  search.addEventListener('input', update);
  sort.addEventListener('change', update);
  document.querySelector('[data-clear-search]')?.addEventListener('click', () => {
    search.value = '';
    update();
    search.focus();
  });
  document.querySelector('[data-project-controls]').hidden = false;
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
for (const time of document.querySelectorAll('time[data-relative]')) {
  const seconds = (new Date(time.dateTime).getTime() - Date.now()) / 1000;
  if (!Number.isFinite(seconds)) continue;
  const magnitude = Math.abs(seconds);
  let unit = 'second';
  let divisor = 1;
  for (const [nextUnit, nextDivisor] of [['minute', 60], ['hour', 3600], ['day', 86400], ['month', 2629800], ['year', 31557600]]) {
    if (magnitude >= nextDivisor) { unit = nextUnit; divisor = nextDivisor; }
  }
  time.textContent = magnitude < 60 ? 'Just now' : relative.format(Math.round(seconds / divisor), unit);
}
