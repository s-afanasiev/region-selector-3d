import { Emitter } from '../core/emitter.js';

// Выбранная зона и зона под курсором — общие для плана, списка и 3D-сцены.
// Следит за судьбой зоны: удалённая снимается с выбора, перенумерованная остаётся выбранной под новым номером.
export class Selection {
  #events = new Emitter();
  selected = 0;
  hovered = 0;

  constructor(zones) {
    zones.subscribe((e) => {
      if (e.type === 'removed' && e.id === this.selected) this.select(0);
      if (e.type === 'renumbered' && e.from === this.selected) this.select(e.to);
      if (e.type === 'reset' && !zones.zone(this.selected)) this.select(0);
    });
  }

  subscribe(listener) {
    return this.#events.subscribe(listener);
  }

  select(id) {
    if (id === this.selected) return;
    this.selected = id;
    this.#events.emit({ type: 'selected', id });
  }

  hover(id) {
    if (id === this.hovered) return;
    this.hovered = id;
    this.#events.emit({ type: 'hovered', id });
  }
}
