// Контур комнаты на плане → треугольники пола и стен. Без three.js: на выходе плоские массивы координат,
// их проверяют тесты в node и заворачивает в BufferGeometry сцена.
// Оси: точка плана (x, y) переходит в (X = x, Y = высота, Z = y), Y смотрит вверх.
import { triangulate, withOrientation } from './polygon.js';
import { offsetPolygon } from './offset.js';

// При signedArea < 0 на плане треугольник в 3D смотрит вверх (+Y): (B−A)×(C−A) по Y равно −cross2D.
const UP_FACING = -1;

function pushTriangle(out, a, b, c) {
  out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

function pushQuad(out, a, b, c, d) {
  pushTriangle(out, a, b, c);
  pushTriangle(out, a, c, d);
}

const at = (p, y) => [p.x, y, p.y];

export function floorMesh(points, { y = 0 } = {}) {
  const contour = withOrientation(points, UP_FACING);
  const out = [];
  for (const [i, j, k] of triangulate(contour)) {
    pushTriangle(out, at(contour[i], y), at(contour[j], y), at(contour[k], y));
  }
  return { positions: new Float32Array(out) };
}

// Стена растёт от контура пола наружу: контур — внутренняя грань стены.
export function wallMesh(points, { thickness, height }) {
  const inner = withOrientation(points, UP_FACING);
  const outer = offsetPolygon(inner, thickness);
  const out = [];
  const n = inner.length;
  for (let a = 0; a < n; a++) {
    const b = (a + 1) % n;
    const ia0 = at(inner[a], 0), ib0 = at(inner[b], 0), ia1 = at(inner[a], height), ib1 = at(inner[b], height);
    const oa0 = at(outer[a], 0), ob0 = at(outer[b], 0), oa1 = at(outer[a], height), ob1 = at(outer[b], height);
    pushQuad(out, ia0, ia1, ib1, ib0); // внутренняя грань — в комнату
    pushQuad(out, oa0, ob0, ob1, oa1); // внешняя грань — наружу
    pushQuad(out, ia1, oa1, ob1, ib1); // торец сверху
  }
  return { positions: new Float32Array(out), outer };
}
