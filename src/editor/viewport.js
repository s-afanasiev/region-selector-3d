// Окно на план: масштаб колесом к курсору, панорама средней кнопкой или пробелом с левой.
// Остальной ввод отдаёт активному инструменту в координатах изображения.
export class Viewport {
  #host;
  #canvas = document.createElement('canvas');
  #ctx = this.#canvas.getContext('2d');
  #painter;
  #onCursor;
  #tool = null;
  #frame = 0;
  #pan = null;
  #space = false;
  #size = { w: 0, h: 0 };
  #off = [];
  scale = 1;
  ox = 0;
  oy = 0;
  showGrid = false;

  constructor(host, painter, { zoomLimits, onCursor }) {
    this.#host = host;
    this.#painter = painter;
    this.zoomLimits = zoomLimits;
    this.#onCursor = onCursor;
  }

  run() {
    this.#host.append(this.#canvas);
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this.#off.push(() => target.removeEventListener(type, fn, opts));
    };
    const c = this.#canvas;
    on(c, 'pointerdown', (e) => this.#pointerDown(e));
    on(c, 'pointermove', (e) => this.#pointerMove(e));
    on(c, 'pointerup', (e) => this.#pointerUp(e));
    on(c, 'pointerleave', () => this.#onCursor(null));
    on(c, 'dblclick', (e) => this.#tool?.doubleClick?.(this.toImage(e), this));
    on(c, 'contextmenu', (e) => e.preventDefault());
    on(c, 'wheel', (e) => this.#wheel(e), { passive: false });
    on(window, 'keydown', (e) => { if (e.code === 'Space' && !isTyping(e)) { this.#space = true; this.#updateCursor(); } });
    on(window, 'keyup', (e) => { if (e.code === 'Space') { this.#space = false; this.#updateCursor(); } });
    const resize = new ResizeObserver(() => this.#resize());
    resize.observe(this.#host);
    this.#off.push(() => resize.disconnect());
    this.#resize();
    return this;
  }

  stop() {
    cancelAnimationFrame(this.#frame);
    this.#off.splice(0).forEach((off) => off());
    this.#canvas.remove();
  }

  setTool(tool) {
    this.#tool?.cancel?.();
    this.#tool = tool;
    this.#updateCursor();
    this.invalidate();
  }

  get tool() {
    return this.#tool;
  }

  toImage(e) {
    const r = this.#canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.ox) / this.scale, y: (e.clientY - r.top - this.oy) / this.scale };
  }

  toScreen(p) {
    return { x: p.x * this.scale + this.ox, y: p.y * this.scale + this.oy };
  }

  // Вписать изображение в окно с полями.
  fit(width, height) {
    const { w, h } = this.#size;
    if (!w || !h || !width || !height) return;
    const margin = 24;
    this.scale = Math.min((w - margin * 2) / width, (h - margin * 2) / height);
    this.ox = (w - width * this.scale) / 2;
    this.oy = (h - height * this.scale) / 2;
    this.invalidate();
  }

  zoomBy(factor, at = { x: this.#size.w / 2, y: this.#size.h / 2 }) {
    const { min, max } = this.zoomLimits;
    const next = Math.min(max, Math.max(min, this.scale * factor));
    const k = next / this.scale;
    this.ox = at.x - (at.x - this.ox) * k;
    this.oy = at.y - (at.y - this.oy) * k;
    this.scale = next;
    this.invalidate();
  }

  invalidate() {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#render();
    });
  }

  #render() {
    const dpr = window.devicePixelRatio || 1;
    const ctx = this.#ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    const css = getComputedStyle(this.#host);
    const theme = {
      placeholder: css.getPropertyValue('--placeholder'),
      grid: css.getPropertyValue('--grid-line'),
      text: css.getPropertyValue('--label'),
      halo: css.getPropertyValue('--label-halo'),
      muted: css.getPropertyValue('--muted'),
    };
    this.#painter.paint(ctx, { scale: this.scale, ox: this.ox, oy: this.oy, dpr, showGrid: this.showGrid, theme });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.#tool?.drawOverlay(ctx, this);
  }

  #resize() {
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = this.#host;
    const first = !this.#size.w;
    this.#size = { w, h };
    this.#canvas.width = Math.round(w * dpr);
    this.#canvas.height = Math.round(h * dpr);
    this.#canvas.style.width = `${w}px`;
    this.#canvas.style.height = `${h}px`;
    if (first) this.#host.dispatchEvent(new CustomEvent('viewport-ready'));
    this.invalidate();
  }

  #pointerDown(e) {
    this.#canvas.focus();
    if (e.button === 1 || (e.button === 0 && this.#space)) {
      e.preventDefault();
      this.#pan = { x: e.clientX, y: e.clientY, ox: this.ox, oy: this.oy };
      this.#canvas.setPointerCapture(e.pointerId);
      this.#updateCursor();
      return;
    }
    this.#tool?.pointerDown(this.toImage(e), e, this);
  }

  #pointerMove(e) {
    const p = this.toImage(e);
    this.#onCursor(p);
    if (this.#pan) {
      this.ox = this.#pan.ox + e.clientX - this.#pan.x;
      this.oy = this.#pan.oy + e.clientY - this.#pan.y;
      this.invalidate();
      return;
    }
    this.#tool?.pointerMove(p, e, this);
  }

  #pointerUp(e) {
    if (!this.#pan) return;
    this.#pan = null;
    this.#canvas.releasePointerCapture(e.pointerId);
    this.#updateCursor();
  }

  #wheel(e) {
    e.preventDefault();
    const r = this.#canvas.getBoundingClientRect();
    this.zoomBy(Math.exp(-e.deltaY * 0.0015), { x: e.clientX - r.left, y: e.clientY - r.top });
  }

  #updateCursor() {
    this.#canvas.style.cursor = this.#pan ? 'grabbing' : this.#space ? 'grab' : this.#tool?.cursor ?? 'default';
  }
}

export function isTyping(e) {
  const t = e.target;
  return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
}
