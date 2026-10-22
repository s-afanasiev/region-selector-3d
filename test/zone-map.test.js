import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '../src/zones/grid.js';
import { ZoneMap } from '../src/zones/zone-map.js';
import { History } from '../src/zones/history.js';

const P = (pairs) => pairs.map(([x, y]) => ({ x, y }));
const rect = (x0, y0, x1, y1) => P([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
const fresh = () => new ZoneMap(Grid.forImage(200, 100, 10)); // 20 × 10 клеток

// Замок инвариантов: число клеток каждой зоны в снимке совпадает с матрицей, пустых зон нет.
function assertConsistent(map) {
  const counts = new Map();
  for (const row of map.matrix()) for (const id of row) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  const zones = map.zones();
  assert.deepEqual(zones.map((z) => z.id), [...counts.keys()].sort((a, b) => a - b));
  for (const z of zones) assert.equal(z.cells, counts.get(z.id));
}

test('Grid: клетка под точкой — floor, а не ceil (иначе граница клетки уезжает на соседнюю)', () => {
  const g = Grid.forImage(200, 100, 10);
  assert.deepEqual(g.cellAt({ x: 10, y: 0 }), { col: 1, row: 0 });
  assert.deepEqual(g.cellAt({ x: 9.99, y: 9.99 }), { col: 0, row: 0 });
  assert.equal(g.cellAt({ x: 200, y: 5 }), null);
  assert.equal(g.cover(rect(0, 0, 30, 20)).length, 6);
});

test('add: зона получает клетки и номер больше последнего', () => {
  const map = fresh();
  assert.deepEqual(map.add(rect(0, 0, 30, 20)), { ok: true, id: 1 });
  assert.deepEqual(map.add(rect(50, 0, 70, 20)), { ok: true, id: 2 });
  assert.equal(map.zoneAt({ x: 5, y: 5 }), 1);
  assert.equal(map.zoneAt({ x: 55, y: 5 }), 2);
  assertConsistent(map);
});

test('add: наложение на чужую зону — отказ с причиной, карта не меняется', () => {
  const map = fresh();
  map.add(rect(0, 0, 30, 20));
  const before = map.matrix();
  const verdict = map.add(rect(20, 0, 60, 20));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'overlap');
  assert.deepEqual(verdict.detail, { zones: [1], cells: 2 });
  assert.deepEqual(map.matrix(), before);
});

test('add: самопересечение и контур без клеток — отказ', () => {
  const map = fresh();
  assert.equal(map.add(P([[0, 0], [50, 50], [50, 0], [0, 50]])).code, 'self_intersecting');
  assert.equal(map.add(rect(1, 1, 4, 4)).code, 'no_cells');
});

test('remove: клетки освобождаются (иначе удалённая зона остаётся в экспорте)', () => {
  const map = fresh();
  map.add(rect(0, 0, 30, 20));
  assert.deepEqual(map.remove(1), { ok: true });
  assert.ok(map.matrix().flat().every((v) => v === 0));
  assert.equal(map.remove(1).code, 'not_found');
});

test('renumber: клетки переезжают; занятый номер — отказ; новая зона берёт номер выше максимального', () => {
  const map = fresh();
  map.add(rect(0, 0, 30, 20));
  map.add(rect(50, 0, 70, 20));
  assert.equal(map.renumber(1, 2).code, 'taken');
  assert.deepEqual(map.renumber(1, 7), { ok: true });
  assert.equal(map.zoneAt({ x: 5, y: 5 }), 7);
  // Счётчик, не знающий о перенумерации, выдал бы новой зоне тот же номер 7
  assert.deepEqual(map.add(rect(100, 0, 120, 20)), { ok: true, id: 8 });
  assertConsistent(map);
});

test('regrid: клетки пересчитываются из контуров; зона только из клеток блокирует', () => {
  const map = fresh();
  map.add(rect(0, 0, 40, 40));
  assert.deepEqual(map.regrid(Grid.forImage(200, 100, 20)), { ok: true });
  assert.equal(map.zone(1).cells, 4);
  const legacy = new ZoneMap(Grid.forImage(20, 10, 10));
  legacy.replace({ grid: legacy.grid, cells: Int32Array.from([3, 0]) });
  assert.equal(legacy.regrid(Grid.forImage(20, 10, 5)).code, 'cells_only_zones');
});

test('события: каждая успешная запись объявляет факт ровно один раз, отказ — молчит', () => {
  const map = fresh();
  const events = [];
  const off = map.subscribe((e) => events.push(e.type));
  map.add(rect(0, 0, 30, 20));
  map.add(rect(0, 0, 30, 20));
  map.rename(1, 'Кухня');
  map.remove(1);
  off();
  map.add(rect(0, 0, 30, 20));
  assert.deepEqual(events, ['added', 'renamed', 'removed']);
});

test('History: отмена и повтор восстанавливают матрицу и имена; отказ не попадает в историю', () => {
  const map = fresh();
  const history = new History(map, { depth: 10 });
  history.run((m) => m.add(rect(0, 0, 30, 20), { name: 'A' }));
  const afterAdd = map.matrix();
  history.run((m) => m.add(rect(0, 0, 30, 20)));
  history.run((m) => m.remove(1));
  assert.ok(history.undo().ok);
  assert.deepEqual(map.matrix(), afterAdd);
  assert.equal(map.zone(1).name, 'A');
  assert.ok(history.undo().ok);
  assert.equal(history.undo().code, 'nothing_to_undo');
  assert.ok(history.redo().ok);
  assert.deepEqual(map.matrix(), afterAdd);
});
