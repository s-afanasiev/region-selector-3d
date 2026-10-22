import { isTyping } from './viewport.js';

// Ввод с клавиатуры и выбор инструмента. Горячие клавиши — таблица; всё, что не в ней, получает активный инструмент.
export class Editor {
  #viewport;
  #tools;
  #status;
  #onToolChange;
  #shortcuts;
  #off = null;

  constructor({ viewport, tools, status, shortcuts, onToolChange }) {
    this.#viewport = viewport;
    this.#tools = tools;
    this.#status = status;
    this.#shortcuts = shortcuts;
    this.#onToolChange = onToolChange;
  }

  run(initialTool) {
    const onKey = (e) => this.#keyDown(e);
    window.addEventListener('keydown', onKey);
    this.#off = () => window.removeEventListener('keydown', onKey);
    this.use(initialTool);
    return this;
  }

  stop() {
    this.#off?.();
  }

  use(name) {
    const tool = this.#tools[name];
    this.#viewport.setTool(tool);
    this.#status.hint(tool.hint);
    this.#onToolChange(name);
  }

  #keyDown(e) {
    if (isTyping(e) || document.querySelector('dialog[open]')) return;
    const combo = [e.ctrlKey || e.metaKey ? 'ctrl' : '', e.shiftKey ? 'shift' : '', e.key.toLowerCase()].filter(Boolean).join('+');
    const tool = this.#viewport.tool;
    // инструмент первым: Backspace и Enter у него значат своё
    if (tool?.keyDown(e, this.#viewport)) {
      e.preventDefault();
      this.#status.hint(tool.hint);
      return;
    }
    const action = this.#shortcuts[combo] ?? this.#shortcuts[e.code];
    if (action) {
      e.preventDefault();
      action();
    }
  }
}
