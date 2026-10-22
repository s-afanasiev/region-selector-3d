import { describe } from './messages.js';

// Нижняя строка: подсказка активного инструмента, итог последнего действия, координаты курсора.
export class StatusBar {
  #hint;
  #message;
  #cursor;
  #timer = 0;

  constructor(root) {
    this.#hint = root.querySelector('[data-status="hint"]');
    this.#message = root.querySelector('[data-status="message"]');
    this.#cursor = root.querySelector('[data-status="cursor"]');
  }

  hint(text) {
    this.#hint.textContent = text;
  }

  // Итог действия: при отказе — причина из ядра, при успехе — okText, если он есть.
  report(verdict, okText) {
    if (verdict.ok) {
      if (okText) this.#show(okText, 'ok');
    } else {
      this.#show(describe(verdict), 'error');
    }
    return verdict;
  }

  info(text) {
    this.#show(text, 'ok');
  }

  cursor(text) {
    this.#cursor.textContent = text;
  }

  #show(text, kind) {
    clearTimeout(this.#timer);
    this.#message.textContent = text;
    this.#message.dataset.kind = kind;
    this.#timer = setTimeout(() => { this.#message.textContent = ''; }, kind === 'error' ? 7000 : 4000);
  }
}
