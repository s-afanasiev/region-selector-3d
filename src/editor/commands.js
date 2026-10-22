import { distance } from '../geometry/polygon.js';
import { decodeProject, encodeLegacy, encodeProject } from '../zones/zone-file.js';
import { baseName, download, isImageFile, loadBackdrop } from '../ui/files.js';

// Намерения пользователя → сценарии проекта, итог каждого — в строку состояния.
// Сюда сходятся кнопки, горячие клавиши и инструменты; сами они решений не принимают.
export class Commands {
  #project;
  #selection;
  #status;
  #viewport;
  #painter;
  #askLength;
  #samples;
  #defaultCell;

  constructor({ project, selection, status, viewport, painter, askLength, samples, defaultCell }) {
    this.#project = project;
    this.#selection = selection;
    this.#status = status;
    this.#viewport = viewport;
    this.#painter = painter;
    this.#askLength = askLength;
    this.#samples = samples;
    this.#defaultCell = defaultCell;
  }

  addZone(points) {
    const verdict = this.#project.history.run((zones) => zones.add(points));
    this.#status.report(verdict, verdict.ok && `Зона ${verdict.id} добавлена`);
    if (verdict.ok) this.#selection.select(verdict.id);
    return verdict;
  }

  removeZone(id) {
    return this.#status.report(this.#project.history.run((zones) => zones.remove(id)), `Зона ${id} удалена · Ctrl+Z — вернуть`);
  }

  renameZone(id, name) {
    return this.#status.report(this.#project.history.run((zones) => zones.rename(id, name)));
  }

  renumberZone(id, to) {
    return this.#status.report(this.#project.history.run((zones) => zones.renumber(id, to)), `Зона ${id} теперь ${to}`);
  }

  undo() {
    return this.#status.report(this.#project.history.undo(), 'Отменено');
  }

  redo() {
    return this.#status.report(this.#project.history.redo(), 'Повторено');
  }

  changeCell(cell) {
    return this.#status.report(this.#project.changeCell(cell), `Клетка ${cell} px — зоны пересчитаны`);
  }

  async calibrate(a, b) {
    const meters = await this.#askLength(distance(a, b));
    if (meters === null) return this.#status.info('Калибровка отменена');
    const verdict = this.#project.calibrate(a, b, meters);
    return this.#status.report(verdict, verdict.ok && `Масштаб: 1 м = ${Math.round(1 / verdict.metersPerPixel)} px`);
  }

  // Изображения раньше файлов разметки: разметка того же размера ляжет на только что открытую подложку.
  async openFiles(files) {
    const list = [...files];
    for (const file of list.filter(isImageFile)) {
      const url = URL.createObjectURL(file);
      await this.#openImage(url, file.name);
    }
    for (const file of list.filter((f) => !isImageFile(f))) {
      this.#loadMarkup(await file.text(), file.name);
    }
  }

  async openSample(key) {
    const sample = this.#samples[key];
    await this.#openImage(sample.image, sample.image.split('/').pop());
    if (sample.markup) {
      const response = await fetch(sample.markup);
      if (response.ok) this.#loadMarkup(await response.text(), sample.title);
    }
  }

  exportJson() {
    if (!this.#requireBackdrop()) return;
    const { backdrop, metersPerPixel, zones } = this.#project;
    download(`${baseName(backdrop.name)}.zones.json`, encodeProject({ backdrop, metersPerPixel, zoneMap: zones }), 'application/json');
  }

  exportLegacy() {
    if (!this.#requireBackdrop()) return;
    const { backdrop, zones } = this.#project;
    download(`arr_${baseName(backdrop.name)}.js`, encodeLegacy({ backdrop, zoneMap: zones }), 'text/javascript');
  }

  // Разметка поверх изображения в его полном размере.
  exportPng() {
    if (!this.#requireBackdrop()) return;
    const { backdrop } = this.#project;
    const canvas = document.createElement('canvas');
    canvas.width = backdrop.width;
    canvas.height = backdrop.height;
    const css = getComputedStyle(document.documentElement);
    this.#painter.paint(canvas.getContext('2d'), {
      scale: 1, ox: 0, oy: 0, dpr: 1, showGrid: false,
      theme: { placeholder: '#ffffff', grid: 'transparent', text: '#111', halo: '#fff', muted: css.getPropertyValue('--muted') },
    });
    canvas.toBlob((blob) => download(`markuped__${baseName(backdrop.name)}.png`, blob), 'image/png');
  }

  async #openImage(src, name) {
    const loaded = await loadBackdrop(src, name);
    if (!this.#status.report(loaded).ok) return loaded;
    const verdict = this.#project.open(loaded.value, { cell: this.#defaultCell });
    this.#status.report(verdict, verdict.kept ? `Подложка заменена, зоны сохранены (${verdict.kept})` : `Открыто: ${name}`);
    this.#viewport.fit(loaded.value.width, loaded.value.height);
    return verdict;
  }

  #loadMarkup(text, name) {
    const decoded = decodeProject(text);
    if (!this.#status.report(decoded).ok) return decoded;
    const verdict = this.#project.load(decoded.value);
    this.#status.report(verdict, verdict.ok && `Разметка «${name}»: ${verdict.zones} зон`);
    const { backdrop } = this.#project;
    this.#viewport.fit(backdrop.width, backdrop.height);
    return verdict;
  }

  #requireBackdrop() {
    if (this.#project.backdrop) return true;
    this.#status.report({ ok: false, code: 'no_backdrop' });
    return false;
  }
}
