import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  area, signedArea, centroid, checkPolygon, pointInPolygon, triangulate, findSelfIntersection, GeometryError,
} from '../src/geometry/polygon.js';

const P = (pairs) => pairs.map(([x, y]) => ({ x, y }));
const triArea = (pts, [i, j, k]) => signedArea([pts[i], pts[j], pts[k]]);

// Замок триангуляции: треугольники покрывают ровно площадь контура и обходятся в ту же сторону.
function assertTriangulation(pts) {
  const tris = triangulate(pts);
  const sum = tris.reduce((s, t) => s + Math.abs(triArea(pts, t)), 0);
  assert.ok(Math.abs(sum - area(pts)) < 1e-6 * Math.max(1, area(pts)), `площадь ${sum} ≠ ${area(pts)}`);
  const sign = Math.sign(signedArea(pts));
  for (const t of tris) assert.equal(Math.sign(triArea(pts, t)), sign, `треугольник ${t} вывернут`);
  return tris;
}

const SHAPES = {
  square: [[0, 0], [100, 0], [100, 100], [0, 100]],
  L: [[0, 0], [200, 0], [200, 100], [100, 100], [100, 200], [0, 200]],
  // U-образный контур и звезда ловят ошибку переноса индекса по кругу (`> points.length` вместо `>=`)
  U: [[0, 0], [300, 0], [300, 200], [200, 200], [200, 100], [100, 100], [100, 200], [0, 200]],
  star: [[150, 0], [180, 100], [300, 110], [200, 170], [240, 300], [150, 220], [60, 300], [100, 170], [0, 110], [120, 100]],
  comb: [[0, 0], [500, 0], [500, 300], [400, 300], [400, 100], [300, 100], [300, 300], [200, 300], [200, 100], [100, 100], [100, 300], [0, 300]],
};

for (const [name, pairs] of Object.entries(SHAPES)) {
  test(`triangulate: ${name} в обе стороны обхода`, () => {
    const pts = P(pairs);
    // n − 2 треугольника, если по ходу отсечения не появились вершины на одной прямой (их треугольник вырожден)
    assert.ok(assertTriangulation(pts).length <= pts.length - 2);
    assert.ok(assertTriangulation(pts.slice().reverse()).length <= pts.length - 2);
  });
}

test('triangulate: вершина на прямой между соседями не даёт вырожденных треугольников', () => {
  const pts = P([[0, 0], [50, 0], [100, 0], [100, 100], [0, 100]]);
  const tris = assertTriangulation(pts);
  for (const t of tris) assert.ok(Math.abs(triArea(pts, t)) > 0);
});

test('triangulate: случайные звёздные многоугольники (500 штук)', () => {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let k = 0; k < 500; k++) {
    const n = 3 + Math.floor(rnd() * 30);
    const angles = Array.from({ length: n }, () => rnd() * Math.PI * 2).sort((a, b) => a - b);
    const pts = angles.map((a) => ({ x: Math.cos(a) * (20 + rnd() * 80), y: Math.sin(a) * (20 + rnd() * 80) }));
    if (!checkPolygon(pts).ok) continue;
    assertTriangulation(pts);
  }
});

test('triangulate: самопересекающийся контур — именованная ошибка, а не зависание', () => {
  assert.throws(() => triangulate(P([[0, 0], [100, 100], [100, 0], [0, 100]])), GeometryError);
});

test('checkPolygon: вердикт с причиной', () => {
  assert.deepEqual(checkPolygon(P([[0, 0], [1, 1]])), { ok: false, code: 'too_few_points', detail: { points: 2 } });
  assert.equal(checkPolygon(P([[0, 0], [100, 100], [100, 0], [0, 100]])).code, 'self_intersecting');
  assert.equal(checkPolygon(P([[0, 0], [10, 0], [20, 0]])).code, 'zero_area');
  assert.deepEqual(checkPolygon(P(SHAPES.U)), { ok: true });
});

test('findSelfIntersection: касание ребра вершиной — тоже пересечение', () => {
  assert.ok(findSelfIntersection(P([[0, 0], [100, 0], [100, 100], [50, 0], [0, 100]])));
});

test('pointInPolygon и centroid', () => {
  const U = P(SHAPES.U);
  assert.equal(pointInPolygon({ x: 50, y: 150 }, U), true);
  assert.equal(pointInPolygon({ x: 150, y: 150 }, U), false); // вырез буквы U
  assert.deepEqual(centroid(P(SHAPES.square)), { x: 50, y: 50 });
});
