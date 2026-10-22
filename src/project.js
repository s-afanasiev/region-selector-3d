import { Emitter } from './core/emitter.js';
import { distance } from './geometry/polygon.js';
import { Grid } from './zones/grid.js';
import { cellsFromMatrix } from './zones/zone-map.js';

// Проект — подложка, масштаб и карта зон, которые живут вместе. Сценарии: открыть изображение,
// загрузить разметку, откалибровать масштаб, сменить размер клетки. Правки зон идут через history.
export class Project {
  #events = new Emitter();
  backdrop = null; // { name, width, height, source: CanvasImageSource | null }
  metersPerPixel = null;

  constructor(zones, history, { cellLimits }) {
    this.zones = zones;
    this.history = history;
    this.cellLimits = cellLimits;
  }

  subscribe(listener) {
    return this.#events.subscribe(listener);
  }

  // Изображение того же размера заменяет подложку и сохраняет зоны: так к загруженной разметке подкладывают картинку.
  open(backdrop, { cell }) {
    const sameSize = this.backdrop && this.backdrop.width === backdrop.width && this.backdrop.height === backdrop.height;
    this.backdrop = backdrop;
    if (sameSize) {
      this.#events.emit({ type: 'backdrop' });
      return { ok: true, kept: this.zones.zones().length };
    }
    this.metersPerPixel = null;
    this.zones.replace({ grid: Grid.forImage(backdrop.width, backdrop.height, cell) });
    this.history.clear();
    this.#events.emit({ type: 'opened' });
    return { ok: true, kept: 0 };
  }

  // value — результат decodeProject. Подложка другого размера заменяется пустой нужного размера.
  load(value) {
    const grid = Grid.forImage(value.image.width, value.image.height, value.cell);
    const verdict = this.zones.replace({ grid, zones: value.zones, cells: cellsFromMatrix(value.matrix) });
    if (!verdict.ok) return verdict;
    if (!this.backdrop || this.backdrop.width !== value.image.width || this.backdrop.height !== value.image.height) {
      this.backdrop = { name: value.image.name, width: value.image.width, height: value.image.height, source: null };
    }
    this.metersPerPixel = value.metersPerPixel;
    this.history.clear();
    this.#events.emit({ type: 'opened' });
    return { ok: true, zones: value.zones.length };
  }

  calibrate(a, b, meters) {
    const px = distance(a, b);
    if (px < 1) return { ok: false, code: 'calibration_too_short', detail: { px } };
    if (!(meters > 0)) return { ok: false, code: 'bad_length', detail: { meters } };
    this.metersPerPixel = meters / px;
    this.#events.emit({ type: 'scale' });
    return { ok: true, metersPerPixel: this.metersPerPixel };
  }

  changeCell(cell) {
    const { min, max } = this.cellLimits;
    if (!Number.isInteger(cell) || cell < min || cell > max) return { ok: false, code: 'bad_cell', detail: { cell, min, max } };
    if (!this.backdrop) return { ok: false, code: 'no_backdrop' };
    return this.history.run((zones) => zones.regrid(Grid.forImage(this.backdrop.width, this.backdrop.height, cell)));
  }

  // Площадь в м², если масштаб известен; иначе null.
  squareMeters(pxArea) {
    return this.metersPerPixel ? pxArea * this.metersPerPixel ** 2 : null;
  }
}
