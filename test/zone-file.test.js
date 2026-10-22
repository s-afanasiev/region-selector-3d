import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Grid } from '../src/zones/grid.js';
import { ZoneMap, cellsFromMatrix } from '../src/zones/zone-map.js';
import { decodeProject, encodeProject, encodeLegacy } from '../src/zones/zone-file.js';

const LEGACY = readFileSync(new URL('./fixtures/arr_04.js', import.meta.url), 'utf8');

function mapFrom(value) {
  const grid = Grid.forImage(value.image.width, value.image.height, value.cell);
  const map = new ZoneMap(grid);
  assert.deepEqual(map.replace({ grid, zones: value.zones, cells: cellsFromMatrix(value.matrix) }), { ok: true });
  return map;
}

test('формат arr_*.js: разбор совпадает с тем, что видит сам JS', () => {
  const ctx = {};
  vm.runInNewContext(LEGACY.slice(LEGACY.indexOf('var data_sructure')), ctx);
  const truth = ctx.data_sructure;
  const decoded = decodeProject(LEGACY);
  assert.equal(decoded.ok, true, JSON.stringify(decoded));
  const { image, cell, matrix, zones } = decoded.value;
  assert.deepEqual(image, { name: 'Lobby_04.jpg', width: 3840, height: 2160 });
  assert.equal(cell, truth.header.sq_size);
  // В файле 193 × 109: формат arr_*.js хранит пустую колонку и строку за краем изображения 3840 × 2160
  const structure = JSON.parse(JSON.stringify(truth.structure));
  assert.deepEqual([structure.length, structure[0].length], [109, 193]);
  assert.deepEqual(matrix, structure.slice(0, 108).map((r) => r.slice(0, 192)));
  assert.equal(zones.length, 36);
});

test('формат arr_*.js: запись обратно даёт тот же файл байт в байт', () => {
  const { value } = decodeProject(LEGACY);
  const map = mapFrom(value);
  const original = LEGACY.slice(LEGACY.indexOf('var data_sructure')).trimEnd();
  assert.equal(encodeLegacy({ backdrop: value.image, zoneMap: map }).trimEnd(), original);
});

test('свой JSON: decode(encode(x)) == x — матрица, имена, контуры, масштаб', () => {
  const grid = Grid.forImage(200, 100, 10);
  const map = new ZoneMap(grid);
  map.add([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 0, y: 20 }], { name: 'Кухня "[ 1 ]"' });
  map.add([{ x: 50.25, y: 0 }, { x: 70, y: 0 }, { x: 60, y: 30 }]);
  const backdrop = { name: 'plan.svg', width: 200, height: 100 };
  const text = encodeProject({ backdrop, metersPerPixel: 0.02, zoneMap: map });
  const decoded = decodeProject(text);
  assert.equal(decoded.ok, true, JSON.stringify(decoded));
  assert.equal(decoded.value.metersPerPixel, 0.02);
  const again = mapFrom(decoded.value);
  assert.deepEqual(again.matrix(), map.matrix());
  assert.deepEqual(again.zones(), map.zones());
  assert.equal(encodeProject({ backdrop, metersPerPixel: 0.02, zoneMap: again }), text);
});

test('битые и чужие файлы — отказ с причиной', () => {
  assert.equal(decodeProject('{ nope').code, 'bad_json');
  assert.equal(decodeProject('{"format":"other"}').code, 'unknown_format');
  assert.equal(decodeProject('hello').code, 'unknown_format');
  const wrongSize = JSON.stringify({
    format: 'region-selector', version: 1, image: { name: '', width: 100, height: 100 }, grid: { cell: 10 },
    zones: [], matrix: [[0, 0], [0, 0]],
  });
  assert.equal(decodeProject(wrongSize).code, 'grid_mismatch');
});
