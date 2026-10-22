import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offsetPolygon } from '../src/geometry/offset.js';
import { floorMesh, wallMesh } from '../src/geometry/room-mesh.js';
import { area, centroid } from '../src/geometry/polygon.js';

const P = (pairs) => pairs.map(([x, y]) => ({ x, y }));
const L = P([[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]]); // метры

function triangles(positions) {
  const out = [];
  for (let i = 0; i < positions.length; i += 9) {
    out.push([0, 3, 6].map((o) => [positions[i + o], positions[i + o + 1], positions[i + o + 2]]));
  }
  return out;
}

function normal([a, b, c]) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

test('offsetPolygon: квадрат на 1 наружу — квадрат больше на 1 с каждой стороны, в обе стороны обхода', () => {
  for (const sq of [P([[0, 0], [2, 0], [2, 2], [0, 2]]), P([[0, 0], [0, 2], [2, 2], [2, 0]])]) {
    const out = offsetPolygon(sq, 1);
    assert.ok(Math.abs(area(out) - 16) < 1e-9);
    out.forEach((p, i) => assert.ok(Math.abs(Math.abs(p.x - 1) - 2) < 1e-9 && Math.abs(Math.abs(p.y - 1) - 2) < 1e-9, `вершина ${i}`));
  }
});

test('offsetPolygon: острый угол обрезан до miterLimit', () => {
  const spike = P([[0, 0], [100, 1], [0, 2]]);
  const out = offsetPolygon(spike, 1, { miterLimit: 4 });
  const d = Math.hypot(out[1].x - 100, out[1].y - 1);
  assert.ok(d <= 4 + 1e-9, `стык ${d}`);
});

test('floorMesh: все треугольники смотрят вверх и покрывают площадь', () => {
  for (const contour of [L, L.slice().reverse()]) {
    const tris = triangles(floorMesh(contour).positions);
    let sum = 0;
    for (const t of tris) {
      const n = normal(t);
      assert.ok(n[1] > 0, 'нормаль пола вниз');
      sum += n[1] / 2;
    }
    assert.ok(Math.abs(sum - area(contour)) < 1e-6);
  }
});

test('wallMesh: внутренние грани смотрят в комнату, внешние — наружу, торец — вверх', () => {
  const c = centroid(L);
  for (const contour of [L, L.slice().reverse()]) {
    const tris = triangles(wallMesh(contour, { thickness: 0.2, height: 2.7 }).positions);
    assert.equal(tris.length, contour.length * 6);
    tris.forEach((t, k) => {
      const n = normal(t);
      const kind = Math.floor(k / 2) % 3; // по ребру: внутренняя, внешняя, торец
      if (kind === 2) { assert.ok(n[1] > 0, `торец ${k}`); return; }
      assert.ok(Math.abs(n[1]) < 1e-9, `грань ${k} не вертикальна`);
      // направление на середину грани от центра L — для выпуклых рёбер L этого достаточно, для вогнутого угла берём ребро
      const mid = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3];
      const edgeOutward = n[0] * (mid[0] - c.x) + n[2] * (mid[1] - c.y);
      if (Math.abs(edgeOutward) < 1e-9) return;
      if (kind === 0) assert.ok(isInward(contour, mid, n), `внутренняя грань ${k} смотрит наружу`);
      else assert.ok(!isInward(contour, mid, n), `внешняя грань ${k} смотрит внутрь`);
    });
  }
});

// Грань смотрит внутрь, если шаг от её середины вдоль нормали попадает внутрь контура.
function isInward(contour, mid, n) {
  const len = Math.hypot(n[0], n[2]);
  const p = { x: mid[0] + (n[0] / len) * 0.05, y: mid[1] + (n[2] / len) * 0.05 };
  let inside = false;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    const a = contour[i], b = contour[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
