import { RoomModel } from './room-model.js';
import { ids } from '../ui/messages.js';

// План → 3D: на каждое изменение зон, масштаба или параметров стен собирает новую RoomModel и отдаёт сцене.
// Сборка откладывается до кадра: серия правок подряд даёт одну перестройку.
export class RoomsView {
  #scene;
  #project;
  #selection;
  #colorOf;
  #notice;
  #params;
  #fallbackMetersPerPixel;
  #model = null;
  #frame = 0;

  constructor(scene, { project, selection, colorOf, notice, params, fallbackMetersPerPixel }) {
    this.#scene = scene;
    this.#project = project;
    this.#selection = selection;
    this.#colorOf = colorOf;
    this.#notice = notice;
    this.#params = params;
    this.#fallbackMetersPerPixel = fallbackMetersPerPixel;
  }

  run() {
    this.#project.zones.subscribe(() => this.#schedule()); // имя тоже: оно в подписи комнаты
    this.#project.subscribe(() => this.#schedule());
    this.#selection.subscribe(() => this.#highlight());
    this.#schedule();
    return this;
  }

  setParams(params) {
    this.#params = { ...this.#params, ...params };
    this.#schedule();
  }

  #schedule() {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#rebuild();
    });
  }

  #rebuild() {
    const mpp = this.#project.metersPerPixel ?? this.#fallbackMetersPerPixel;
    this.#model = RoomModel.build(this.#project.zones.zones(), {
      metersPerPixel: mpp,
      wallHeight: this.#params.wallHeight,
      wallThickness: this.#params.wallThickness,
      colorOf: this.#colorOf,
    });
    this.#scene.show(this.#model);
    this.#highlight();
    this.#notice(this.#describe());
  }

  #highlight() {
    this.#model?.highlight(this.#selection.selected, this.#selection.hovered);
    this.#scene.invalidate();
  }

  // Что сцена не показала и почему — пустота тоже названа.
  #describe() {
    const notes = [];
    if (!this.#project.backdrop) return 'Откройте план или пример, обведите комнаты — здесь появится 3D';
    if (!this.#model.floors.length) notes.push('Обведите комнаты на плане (P) — стены и пол построятся здесь');
    if (!this.#project.metersPerPixel) notes.push(`Масштаб не задан, принято 1 px = ${this.#fallbackMetersPerPixel * 100} см · задайте его (M)`);
    const noPolygon = this.#model.skipped.filter((s) => s.code === 'no_polygon').map((s) => s.id);
    const broken = this.#model.skipped.filter((s) => s.code !== 'no_polygon').map((s) => s.id);
    if (noPolygon.length) notes.push(`Зоны без контура (из arr_*.js) в 3D не строятся: ${ids(noPolygon)}`);
    if (broken.length) notes.push(`Не удалось построить: ${ids(broken)}`);
    return notes.join(' · ');
  }
}
