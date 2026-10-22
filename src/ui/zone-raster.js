import { centroid } from '../geometry/polygon.js';

// Картинка зон «одна клетка — один пиксель» и точки подписей. Одна на приложение:
// план растягивает её поверх подложки, панорама натягивает на сферу как текстуру.
// Пересобирается лениво — при первом обращении после invalidate().
//   version       — растёт при любой пересборке (в том числе подсветке): пора обновить текстуру;
//   layoutVersion — растёт, когда менялись сами зоны: пора переставить подписи.
// Подпись зоны без контура стоит в среднем её клеток; зона через шов панорамы (x = 0 и x = W)
// получила бы подпись посередине изображения — в примерах таких нет.
export class ZoneRaster {
  canvas = document.createElement('canvas');
  anchors = new Map(); // id → точка изображения
  version = 0;
  layoutVersion = 0;
  #zones;
  #selection;
  #colorOf;
  #alpha;
  #dirty = true;
  #layoutDirty = true;

  constructor({ zones, selection, colorOf, alpha }) {
    this.#zones = zones;
    this.#selection = selection;
    this.#colorOf = colorOf;
    this.#alpha = alpha;
  }

  invalidate({ layout = false } = {}) {
    this.#dirty = true;
    if (layout) this.#layoutDirty = true;
  }

  current() {
    if (this.#dirty) this.#rebuild();
    return this;
  }

  #rebuild() {
    const zones = this.#zones;
    const { cols, rows, cell } = zones.grid;
    this.canvas.width = cols;
    this.canvas.height = rows;
    const ctx = this.canvas.getContext('2d');
    const image = ctx.createImageData(cols, rows);
    const active = new Set([this.#selection.selected, this.#selection.hovered]);
    const sums = new Map();
    zones.forEachCell((col, row, id) => {
      const { r, g, b } = this.#colorOf(id);
      const o = (row * cols + col) * 4;
      image.data[o] = r;
      image.data[o + 1] = g;
      image.data[o + 2] = b;
      image.data[o + 3] = 255 * (active.has(id) ? this.#alpha.active : this.#alpha.normal);
      const s = sums.get(id) ?? { x: 0, y: 0, n: 0 };
      s.x += col; s.y += row; s.n++;
      sums.set(id, s);
    });
    ctx.putImageData(image, 0, 0);

    if (this.#layoutDirty) {
      this.anchors.clear();
      for (const zone of zones.zones()) {
        const s = sums.get(zone.id);
        this.anchors.set(zone.id, zone.polygon ? centroid(zone.polygon) : { x: (s.x / s.n + 0.5) * cell, y: (s.y / s.n + 0.5) * cell });
      }
      this.layoutVersion++;
      this.#layoutDirty = false;
    }
    this.version++;
    this.#dirty = false;
  }
}
