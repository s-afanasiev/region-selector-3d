import { bounds, pointInPolygon } from '../geometry/polygon.js';

// Сетка клеток поверх изображения. Клетка принадлежит контуру, если её центр внутри контура.
export class Grid {
  constructor({ cols, rows, cell }) {
    this.cols = cols;
    this.rows = rows;
    this.cell = cell;
  }

  static forImage(width, height, cell) {
    return new Grid({ cols: Math.ceil(width / cell), rows: Math.ceil(height / cell), cell });
  }

  get size() {
    return this.cols * this.rows;
  }

  index(col, row) {
    return row * this.cols + col;
  }

  // Клетка под точкой изображения или null за пределами сетки.
  cellAt({ x, y }) {
    const col = Math.floor(x / this.cell);
    const row = Math.floor(y / this.cell);
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return null;
    return { col, row };
  }

  cellCenter(col, row) {
    return { x: (col + 0.5) * this.cell, y: (row + 0.5) * this.cell };
  }

  // Индексы клеток, покрытых контуром; перебор только внутри габарита контура.
  cover(polygon) {
    const b = bounds(polygon);
    const c0 = Math.max(0, Math.floor(b.minX / this.cell));
    const c1 = Math.min(this.cols - 1, Math.floor(b.maxX / this.cell));
    const r0 = Math.max(0, Math.floor(b.minY / this.cell));
    const r1 = Math.min(this.rows - 1, Math.floor(b.maxY / this.cell));
    const out = [];
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (pointInPolygon(this.cellCenter(col, row), polygon)) out.push(this.index(col, row));
      }
    }
    return out;
  }
}
