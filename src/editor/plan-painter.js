import { area } from '../geometry/polygon.js';

// Рисует проект в 2D-контекст при заданном виде: подложка, клетки зон, контуры, подписи.
// Не знает про мышь и инструменты — им пользуются и вьюпорт, и экспорт картинки.
export class PlanPainter {
  #project;
  #selection;
  #raster;
  #colorOf;

  constructor({ project, selection, raster, colorOf }) {
    this.#project = project;
    this.#selection = selection;
    this.#raster = raster;
    this.#colorOf = colorOf;
  }

  // view: { scale, ox, oy, dpr, showGrid, theme: { placeholder, grid, text, halo, muted } }
  paint(ctx, view) {
    const { backdrop, zones } = this.#project;
    if (!backdrop) return;
    const raster = this.#raster.current();
    const k = view.scale * view.dpr;
    ctx.setTransform(k, 0, 0, k, view.ox * view.dpr, view.oy * view.dpr);

    if (backdrop.source) {
      ctx.imageSmoothingEnabled = view.scale < 1;
      ctx.drawImage(backdrop.source, 0, 0, backdrop.width, backdrop.height);
    } else {
      ctx.fillStyle = view.theme.placeholder;
      ctx.fillRect(0, 0, backdrop.width, backdrop.height);
    }

    const grid = zones.grid;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(raster.canvas, 0, 0, grid.cols * grid.cell, grid.rows * grid.cell);

    if (view.showGrid && grid.cell * view.scale >= 6) this.#paintGrid(ctx, grid, view);

    for (const zone of zones.zones()) {
      if (!zone.polygon) continue;
      const active = zone.id === this.#selection.selected || zone.id === this.#selection.hovered;
      ctx.beginPath();
      zone.polygon.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.lineWidth = (active ? 3 : 1.5) / view.scale;
      ctx.strokeStyle = this.#colorOf(zone.id).css;
      ctx.stroke();
    }

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    if (!backdrop.source) this.#paintPlaceholderText(ctx, backdrop, view);
    this.#paintLabels(ctx, view, raster.anchors);
  }

  #paintGrid(ctx, grid, view) {
    ctx.beginPath();
    for (let c = 0; c <= grid.cols; c++) {
      ctx.moveTo(c * grid.cell, 0);
      ctx.lineTo(c * grid.cell, grid.rows * grid.cell);
    }
    for (let r = 0; r <= grid.rows; r++) {
      ctx.moveTo(0, r * grid.cell);
      ctx.lineTo(grid.cols * grid.cell, r * grid.cell);
    }
    ctx.lineWidth = 1 / view.scale;
    ctx.strokeStyle = view.theme.grid;
    ctx.stroke();
  }

  // Подпись в две строки — «номер имя» и площадь: узкие соседние комнаты не налезают друг на друга.
  #paintLabels(ctx, view, anchors) {
    const { zones, metersPerPixel } = this.#project;
    const cellArea = zones.grid.cell ** 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const line = (text, x, y, font) => {
      ctx.font = font;
      ctx.lineWidth = 4;
      ctx.strokeStyle = view.theme.halo;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = view.theme.text;
      ctx.fillText(text, x, y);
    };
    for (const zone of zones.zones()) {
      const at = anchors.get(zone.id);
      if (!at) continue;
      const x = at.x * view.scale + view.ox;
      const y = at.y * view.scale + view.oy;
      const title = `${zone.id}${zone.name ? ` ${zone.name}` : ''}`;
      if (!metersPerPixel) {
        line(title, x, y, '600 12px Inter, system-ui, sans-serif');
        continue;
      }
      const pxArea = zone.polygon ? area(zone.polygon) : zone.cells * cellArea;
      line(title, x, y - 7, '600 12px Inter, system-ui, sans-serif');
      line(`${(pxArea * metersPerPixel ** 2).toFixed(1)} м²`, x, y + 8, '11px Inter, system-ui, sans-serif');
    }
  }

  #paintPlaceholderText(ctx, backdrop, view) {
    ctx.font = '14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = view.theme.muted;
    const name = backdrop.name ? `«${backdrop.name}» ` : '';
    ctx.fillText(`Изображение ${name}не загружено — перетащите его сюда, зоны сохранятся`, view.ox + 12, view.oy + 12);
  }
}
