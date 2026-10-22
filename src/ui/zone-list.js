import { area } from '../geometry/polygon.js';

// Панель зон: цвет, номер, имя, площадь, удаление. Правки уходят командами наверх, панель только показывает.
export class ZoneList {
  #root;
  #summary;
  #project;
  #selection;
  #colorOf;
  #commands;

  constructor(root, { summary, project, selection, colorOf, commands }) {
    this.#root = root;
    this.#summary = summary;
    this.#project = project;
    this.#selection = selection;
    this.#colorOf = colorOf;
    this.#commands = commands;
  }

  run() {
    this.#project.zones.subscribe(() => this.#render());
    this.#project.subscribe(() => this.#render());
    this.#selection.subscribe(() => this.#markActive());
    this.#render();
    return this;
  }

  #render() {
    const { zones, metersPerPixel } = this.#project;
    const list = zones.zones();
    const cellArea = zones.grid.cell ** 2;
    this.#root.replaceChildren();
    if (!list.length) {
      const empty = document.createElement('li');
      empty.className = 'zone-empty';
      empty.textContent = 'Зон пока нет. Включите «Контур» (P) и обведите область на плане.';
      this.#root.append(empty);
    }
    let total = 0;
    for (const zone of list) {
      const pxArea = zone.polygon ? area(zone.polygon) : zone.cells * cellArea;
      total += pxArea;
      this.#root.append(this.#row(zone, pxArea, metersPerPixel));
    }
    this.#summary.textContent = list.length
      ? `${list.length} ${plural(list.length, 'зона', 'зоны', 'зон')} · ${formatArea(total, metersPerPixel)}`
      : '';
    this.#markActive();
  }

  #row(zone, pxArea, metersPerPixel) {
    const li = document.createElement('li');
    li.className = 'zone-row';
    li.dataset.id = zone.id;
    li.addEventListener('click', (e) => {
      if (!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) this.#selection.select(zone.id);
    });
    li.addEventListener('pointerenter', () => this.#selection.hover(zone.id));
    li.addEventListener('pointerleave', () => this.#selection.hover(0));

    const swatch = document.createElement('span');
    swatch.className = 'zone-swatch';
    swatch.style.background = this.#colorOf(zone.id).css;

    const id = document.createElement('input');
    id.className = 'zone-id';
    id.type = 'number';
    id.min = '1';
    id.value = zone.id;
    id.title = 'Номер зоны';
    id.setAttribute('aria-label', `Номер зоны ${zone.id}`);
    id.addEventListener('change', () => {
      const verdict = this.#commands.renumber(zone.id, Number(id.value));
      if (!verdict.ok) id.value = zone.id;
    });

    const name = document.createElement('input');
    name.className = 'zone-name';
    name.value = zone.name;
    name.placeholder = zone.polygon ? 'Без имени' : 'Без контура';
    if (!zone.polygon) name.title = 'Зона из arr_*.js: есть клетки, нет контура';
    name.setAttribute('aria-label', `Имя зоны ${zone.id}`);
    name.addEventListener('change', () => this.#commands.rename(zone.id, name.value.trim()));
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });

    const size = document.createElement('span');
    size.className = 'zone-area';
    size.textContent = formatArea(pxArea, metersPerPixel);

    const remove = document.createElement('button');
    remove.className = 'icon-button zone-remove';
    remove.type = 'button';
    remove.title = 'Удалить зону';
    remove.setAttribute('aria-label', `Удалить зону ${zone.id}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => this.#commands.remove(zone.id));

    li.append(swatch, id, name, size, remove);
    return li;
  }

  #markActive() {
    for (const li of this.#root.querySelectorAll('.zone-row')) {
      const id = Number(li.dataset.id);
      li.classList.toggle('is-selected', id === this.#selection.selected);
      li.classList.toggle('is-hovered', id === this.#selection.hovered);
      if (id === this.#selection.selected) li.scrollIntoView({ block: 'nearest' });
    }
  }
}

export function formatArea(pxArea, metersPerPixel) {
  if (metersPerPixel) return `${(pxArea * metersPerPixel ** 2).toFixed(1)} м²`;
  return `${Math.round(pxArea).toLocaleString('ru-RU')} px²`;
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
