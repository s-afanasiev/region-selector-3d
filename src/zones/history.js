// Отмена и повтор правок карты зон. Правка идёт через run(): снимок до неё попадает в стек,
// только если дверь карты пропустила изменение.
export class History {
  #map;
  #depth;
  #undo = [];
  #redo = [];

  constructor(zoneMap, { depth }) {
    this.#map = zoneMap;
    this.#depth = depth;
  }

  run(change) {
    const before = this.#map.snapshot();
    const verdict = change(this.#map);
    if (verdict.ok) {
      this.#undo.push(before);
      if (this.#undo.length > this.#depth) this.#undo.shift();
      this.#redo = [];
    }
    return verdict;
  }

  undo() {
    return this.#step(this.#undo, this.#redo, 'nothing_to_undo');
  }

  redo() {
    return this.#step(this.#redo, this.#undo, 'nothing_to_redo');
  }

  clear() {
    this.#undo = [];
    this.#redo = [];
  }

  #step(from, to, emptyCode) {
    if (!from.length) return { ok: false, code: emptyCode };
    to.push(this.#map.snapshot());
    return this.#map.replace(from.pop());
  }
}
