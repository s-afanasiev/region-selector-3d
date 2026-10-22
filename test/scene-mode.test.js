import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '../src/zones/grid.js';
import { ZoneMap } from '../src/zones/zone-map.js';
import { guessSceneMode } from '../src/scene/scene-mode.js';

const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];

function project({ width, height, metersPerPixel = null, drawn = false, legacy = false }) {
  const grid = Grid.forImage(width, height, 20);
  const zones = new ZoneMap(grid);
  if (drawn) zones.add(square);
  if (legacy) zones.replace({ grid, cells: Int32Array.from({ length: grid.size }, (_, i) => (i === 0 ? 4 : 0)) });
  return { backdrop: { width, height }, metersPerPixel, zones };
}

test('guessSceneMode: масштаб — план, хотспоты без контуров — панорама, иначе по пропорциям', () => {
  assert.equal(guessSceneMode({ backdrop: null }), 'rooms');
  assert.equal(guessSceneMode(project({ width: 3840, height: 2160, metersPerPixel: 0.01 })), 'rooms');
  assert.equal(guessSceneMode(project({ width: 1200, height: 800, legacy: true })), 'panorama');
  assert.equal(guessSceneMode(project({ width: 4096, height: 2048 })), 'panorama');
  assert.equal(guessSceneMode(project({ width: 3840, height: 2160, drawn: true })), 'panorama');
  assert.equal(guessSceneMode(project({ width: 1200, height: 800, drawn: true })), 'rooms');
});
