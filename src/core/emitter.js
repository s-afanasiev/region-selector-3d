// Единственный механизм уведомлений в приложении: модель объявляет факт, виды подписываются в точке сборки.
export class Emitter {
  #listeners = new Set();

  // Подписка и отписка — пара у одного владельца: subscribe возвращает функцию отписки.
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  emit(event) {
    for (const listener of this.#listeners) listener(event);
  }
}
