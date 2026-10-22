import { checkPolygon, distance } from '../geometry/polygon.js';

// Инструменты плана — одна семья с общим контрактом:
//   pointerDown(p, e, view) · pointerMove(p, e, view) · keyDown(e, view) → обработал ли · drawOverlay(ctx, view) · cancel()
// Точки p — в координатах изображения. Инструмент сообщает факт (контур замкнут, отрезок задан) родителю,
// а решение и вердикт — у родителя.

const ACCENT = '#2f6fed';
const DANGER = '#e5484d';

export class SelectTool {
  name = 'select';
  cursor = 'default';
  hint = 'Клик — выбрать зону · Delete — удалить выбранную';
  #zones;
  #selection;
  #onDelete;

  constructor({ zones, selection, onDelete }) {
    this.#zones = zones;
    this.#selection = selection;
    this.#onDelete = onDelete;
  }

  pointerDown(p, e) {
    if (e.button === 0) this.#selection.select(this.#zones.zoneAt(p));
  }

  pointerMove(p) {
    this.#selection.hover(this.#zones.zoneAt(p));
  }

  keyDown(e) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.#selection.selected) {
      this.#onDelete(this.#selection.selected);
      return true;
    }
    return false;
  }

  drawOverlay() {}

  cancel() {
    this.#selection.hover(0);
  }
}

export class DrawTool {
  name = 'draw';
  cursor = 'crosshair';
  #points = [];
  #cursor = null;
  #minPointDistance;
  #snapRadius;
  #measure;
  #onClose;

  // minPointDistance — в пикселях изображения, snapRadius — в пикселях экрана
  constructor({ minPointDistance, snapRadius, measure, onClose }) {
    this.#minPointDistance = minPointDistance;
    this.#snapRadius = snapRadius;
    this.#measure = measure;
    this.#onClose = onClose;
  }

  get hint() {
    return this.#points.length === 0
      ? 'Кликайте вершины контура · Shift — шаг 45°'
      : 'Enter, правый клик или клик в первую точку — замкнуть · Backspace — убрать точку · Esc — отменить';
  }

  pointerDown(raw, e, view) {
    if (e.button === 2) return this.#close(view);
    if (e.button !== 0) return;
    const p = this.#constrain(raw, e);
    if (this.#nearFirst(p, view)) return this.#close(view);
    if (this.#points.some((q) => distance(p, q) < this.#minPointDistance)) return;
    this.#points.push(p);
    this.#cursor = p;
    view.invalidate();
  }

  doubleClick(p, view) {
    // первый клик двойного уже добавил точку, второй совпал с ней и отброшен
    if (this.#points.length >= 3) this.#close(view);
  }

  pointerMove(raw, e, view) {
    this.#cursor = this.#constrain(raw, e);
    view.invalidate();
  }

  keyDown(e, view) {
    if (e.key === 'Enter') return this.#close(view), true;
    if (e.key === 'Escape' && this.#points.length) return this.cancel(), view.invalidate(), true;
    if (e.key === 'Backspace' && this.#points.length) return this.#points.pop(), view.invalidate(), true;
    return false;
  }

  cancel() {
    this.#points = [];
  }

  drawOverlay(ctx, view) {
    const pts = this.#points.map((p) => view.toScreen(p));
    const cur = this.#cursor && view.toScreen(this.#cursor);
    if (!pts.length) {
      if (cur) dot(ctx, cur, 3, ACCENT);
      return;
    }
    const snapping = cur && this.#nearFirst(this.#cursor, view);
    const preview = snapping || !cur ? this.#points : [...this.#points, this.#cursor];
    const valid = preview.length < 3 || checkPolygon(preview).ok;
    const color = valid ? ACCENT : DANGER;

    if (preview.length >= 3) {
      ctx.beginPath();
      preview.map((p) => view.toScreen(p)).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = valid ? 'rgb(47 111 237 / 0.12)' : 'rgb(229 72 77 / 0.12)';
      ctx.fill();
    }
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (cur && !snapping) ctx.lineTo(cur.x, cur.y);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
    if (pts.length >= 2 && cur) {
      ctx.beginPath();
      ctx.moveTo(snapping ? pts.at(-1).x : cur.x, snapping ? pts.at(-1).y : cur.y);
      ctx.lineTo(pts[0].x, pts[0].y);
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    pts.forEach((p, i) => dot(ctx, p, i === 0 ? (snapping ? 8 : 5) : 3.5, color));
    if (cur && !snapping) {
      const last = this.#points.at(-1);
      label(ctx, { x: cur.x + 12, y: cur.y - 12 }, this.#measure(distance(last, this.#cursor)));
    }
  }

  #nearFirst(p, view) {
    if (this.#points.length < 3) return false;
    return distance(view.toScreen(p), view.toScreen(this.#points[0])) <= this.#snapRadius;
  }

  // Shift: отрезок от последней точки — по горизонтали, вертикали или под 45°
  #constrain(p, e) {
    const last = this.#points.at(-1);
    if (!e.shiftKey || !last) return p;
    const step = Math.PI / 4;
    const angle = Math.round(Math.atan2(p.y - last.y, p.x - last.x) / step) * step;
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    const len = (p.x - last.x) * dir.x + (p.y - last.y) * dir.y;
    return { x: last.x + dir.x * len, y: last.y + dir.y * len };
  }

  #close(view) {
    if (!this.#points.length) return;
    const verdict = this.#onClose(this.#points.slice());
    if (verdict.ok) this.#points = [];
    view.invalidate();
  }
}

export class CalibrateTool {
  name = 'calibrate';
  cursor = 'crosshair';
  #a = null;
  #cursor = null;
  #busy = false;
  #measure;
  #onSegment;

  constructor({ measure, onSegment }) {
    this.#measure = measure;
    this.#onSegment = onSegment;
  }

  get hint() {
    return this.#a
      ? 'Второй клик — конец отрезка известной длины · Esc — отменить'
      : 'Масштаб: кликните начало отрезка известной длины (например, масштабной линейки)';
  }

  async pointerDown(p, e, view) {
    if (e.button !== 0 || this.#busy) return;
    if (!this.#a) {
      this.#a = p;
      view.invalidate();
      return;
    }
    this.#busy = true;
    const a = this.#a;
    this.#cursor = p;
    await this.#onSegment(a, p);
    this.#busy = false;
    this.#a = null;
    view.invalidate();
  }

  pointerMove(p, e, view) {
    this.#cursor = p;
    if (this.#a) view.invalidate();
  }

  keyDown(e, view) {
    if (e.key === 'Escape' && this.#a) return this.cancel(), view.invalidate(), true;
    return false;
  }

  cancel() {
    this.#a = null;
  }

  drawOverlay(ctx, view) {
    if (!this.#a || !this.#cursor) return;
    const a = view.toScreen(this.#a);
    const b = view.toScreen(this.#cursor);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#e8a33d';
    ctx.stroke();
    dot(ctx, a, 4, '#e8a33d');
    dot(ctx, b, 4, '#e8a33d');
    label(ctx, { x: b.x + 12, y: b.y - 12 }, this.#measure(distance(this.#a, this.#cursor)));
  }
}

function dot(ctx, p, r, color) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function label(ctx, p, text) {
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = 'rgb(20 22 28 / 0.85)';
  ctx.beginPath();
  ctx.roundRect(p.x, p.y - 10, w, 20, 4);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(text, p.x + 5, p.y);
}
