import { Emitter } from '../core/emitter.js';
import { checkPolygon } from '../geometry/polygon.js';

// Карта зон — единственный владелец клеток. Инварианты держит дверь, а не уведомления:
//   клетка принадлежит не больше чем одной зоне;
//   у каждой зоны есть хотя бы одна клетка, и все её клетки — в матрице;
//   удаление зоны освобождает её клетки, смена номера переносит их.
// Каждая запись возвращает вердикт { ok, code, detail } и при отказе ничего не меняет.
// Зона либо нарисована (есть контур, клетки выведены из него), либо пришла из arr_*.js (только клетки).
export class ZoneMap {
  #grid;
  #cells;
  #zones = new Map(); // id → { id, name, polygon | null }
  #events = new Emitter();

  constructor(grid) {
    this.#grid = grid;
    this.#cells = new Int32Array(grid.size);
  }

  get grid() {
    return this.#grid;
  }

  subscribe(listener) {
    return this.#events.subscribe(listener);
  }

  // Номер новой зоны — больше самого большого из существующих.
  nextId() {
    let max = 0;
    for (const id of this.#zones.keys()) if (id > max) max = id;
    return max + 1;
  }

  add(polygon, { name = '' } = {}) {
    const check = checkPolygon(polygon);
    if (!check.ok) return check;
    const cells = this.#grid.cover(polygon);
    if (cells.length === 0) return { ok: false, code: 'no_cells', detail: { cell: this.#grid.cell } };
    const overlap = this.#owners(cells);
    if (overlap.size) {
      return { ok: false, code: 'overlap', detail: { zones: [...overlap.keys()], cells: sum(overlap.values()) } };
    }
    const id = this.nextId();
    for (const i of cells) this.#cells[i] = id;
    this.#zones.set(id, { id, name, polygon: polygon.map(({ x, y }) => ({ x, y })) });
    this.#events.emit({ type: 'added', id });
    return { ok: true, id };
  }

  remove(id) {
    if (!this.#zones.has(id)) return notFound(id);
    this.#replaceCells(id, 0);
    this.#zones.delete(id);
    this.#events.emit({ type: 'removed', id });
    return { ok: true };
  }

  renumber(id, to) {
    if (!this.#zones.has(id)) return notFound(id);
    if (!Number.isInteger(to) || to < 1) return { ok: false, code: 'bad_id', detail: { id: to } };
    if (to === id) return { ok: true };
    if (this.#zones.has(to)) return { ok: false, code: 'taken', detail: { id: to } };
    this.#replaceCells(id, to);
    const zone = this.#zones.get(id);
    this.#zones.delete(id);
    this.#zones.set(to, { ...zone, id: to });
    this.#events.emit({ type: 'renumbered', from: id, to });
    return { ok: true };
  }

  rename(id, name) {
    const zone = this.#zones.get(id);
    if (!zone) return notFound(id);
    this.#zones.set(id, { ...zone, name });
    this.#events.emit({ type: 'renamed', id });
    return { ok: true };
  }

  // Другая сетка: клетки нарисованных зон пересчитываются из контуров. Всё или ничего.
  regrid(grid) {
    const cellsOnly = [...this.#zones.values()].filter((z) => !z.polygon).map((z) => z.id);
    if (cellsOnly.length) return { ok: false, code: 'cells_only_zones', detail: { zones: cellsOnly } };
    const cells = new Int32Array(grid.size);
    for (const zone of this.#zones.values()) {
      const covered = grid.cover(zone.polygon);
      if (covered.length === 0) return { ok: false, code: 'no_cells', detail: { zones: [zone.id], cell: grid.cell } };
      for (const i of covered) {
        if (cells[i]) return { ok: false, code: 'overlap', detail: { zones: [cells[i], zone.id] } };
        cells[i] = zone.id;
      }
    }
    this.#grid = grid;
    this.#cells = cells;
    this.#events.emit({ type: 'reset' });
    return { ok: true };
  }

  // Полная замена состояния: открыть изображение, загрузить файл, отменить шаг.
  // Клетки — истина; зоны без записи в zones получают пустое имя и не имеют контура.
  replace({ grid, zones = [], cells = new Int32Array(grid.size) }) {
    if (cells.length !== grid.size) return { ok: false, code: 'grid_mismatch', detail: { cells: cells.length, grid: grid.size } };
    const present = new Set(cells.filter(Boolean));
    const known = new Map(zones.map((z) => [z.id, z]));
    const missing = [...known.keys()].filter((id) => !present.has(id));
    if (missing.length) return { ok: false, code: 'zones_without_cells', detail: { zones: missing } };
    this.#grid = grid;
    this.#cells = Int32Array.from(cells);
    this.#zones = new Map(
      [...present].sort((a, b) => a - b).map((id) => [id, {
        id, name: known.get(id)?.name ?? '', polygon: known.get(id)?.polygon ?? null,
      }]),
    );
    this.#events.emit({ type: 'reset' });
    return { ok: true };
  }

  snapshot() {
    return { grid: this.#grid, zones: [...this.#zones.values()], cells: Int32Array.from(this.#cells) };
  }

  zoneAt(point) {
    const c = this.#grid.cellAt(point);
    return c ? this.#cells[this.#grid.index(c.col, c.row)] : 0;
  }

  // Снимок для видов: зоны по возрастанию номера с числом клеток.
  zones() {
    const counts = new Map();
    for (const id of this.#cells) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...this.#zones.values()].sort((a, b) => a.id - b.id).map((z) => ({ ...z, cells: counts.get(z.id) ?? 0 }));
  }

  zone(id) {
    return this.zones().find((z) => z.id === id) ?? null;
  }

  forEachCell(fn) {
    const { cols } = this.#grid;
    this.#cells.forEach((id, i) => { if (id) fn(i % cols, Math.floor(i / cols), id); });
  }

  matrix() {
    const { cols, rows } = this.#grid;
    return Array.from({ length: rows }, (_, r) => Array.from(this.#cells.subarray(r * cols, (r + 1) * cols)));
  }

  #owners(cells) {
    const owners = new Map();
    for (const i of cells) {
      const id = this.#cells[i];
      if (id) owners.set(id, (owners.get(id) ?? 0) + 1);
    }
    return owners;
  }

  #replaceCells(from, to) {
    for (let i = 0; i < this.#cells.length; i++) if (this.#cells[i] === from) this.#cells[i] = to;
  }
}

export function cellsFromMatrix(matrix) {
  return Int32Array.from(matrix.flat());
}

function notFound(id) {
  return { ok: false, code: 'not_found', detail: { id } };
}

function sum(values) {
  let s = 0;
  for (const v of values) s += v;
  return s;
}
