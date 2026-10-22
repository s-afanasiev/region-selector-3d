import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { directionOf, directionToImage, imageToDirection, shortestTurn, yawPitchOf } from '../src/geometry/equirect.js';

const W = 3840, H = 2160; // панорама лобби: 16:9, а не 2:1
const close = (a, b, eps, what) => assert.ok(Math.abs(a - b) < eps, `${what}: ${a} ≠ ${b}`);

test('пиксель → направление → пиксель: круговой тест (кроме самых полюсов)', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let i = 0; i < 1000; i++) {
    const p = { x: rnd() * W, y: 1 + rnd() * (H - 2) };
    const back = directionToImage(imageToDirection(p, W, H), W, H);
    close(back.x, p.x, 1e-6, 'x');
    close(back.y, p.y, 1e-6, 'y');
  }
});

test('формулы совпадают с текстурой THREE.SphereGeometry, отражённой для взгляда изнутри', () => {
  const sphere = new THREE.SphereGeometry(10, 64, 32);
  sphere.scale(-1, 1, 1);
  const pos = sphere.attributes.position;
  const uv = sphere.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const d = { x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) };
    const expected = { x: uv.getX(i) * W, y: (1 - uv.getY(i)) * H };
    const sinTheta = Math.hypot(d.x, d.z) / 10;
    if (sinTheta < 1e-6) continue; // в полюсе у вершины своя долгота для текстуры, направление одно
    const got = directionToImage(d, W, H);
    const dx = Math.min(Math.abs(got.x - expected.x), W - Math.abs(got.x - expected.x)); // шов: 0 и W — одно место
    assert.ok(dx < 1e-3, `вершина ${i}: x ${got.x} ≠ ${expected.x}`);
    close(got.y, expected.y, 1e-3, `вершина ${i}: y`);
  }
});

test('рыскание и тангаж совпадают с направлением взгляда камеры three.js', () => {
  const camera = new THREE.PerspectiveCamera();
  const out = new THREE.Vector3();
  for (const [yaw, pitch] of [[0, 0], [Math.PI / 2, 0], [-2, 0.4], [3, -1.2]]) {
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    camera.updateMatrixWorld();
    camera.getWorldDirection(out);
    const d = directionOf(yaw, pitch);
    close(out.x, d.x, 1e-9, 'x'); close(out.y, d.y, 1e-9, 'y'); close(out.z, d.z, 1e-9, 'z');
    const back = yawPitchOf(d);
    close(Math.cos(back.yaw), Math.cos(yaw), 1e-9, 'yaw');
    close(back.pitch, pitch, 1e-9, 'pitch');
  }
});

test('центр изображения — прямо перед камерой при yaw = π/2', () => {
  const d = directionOf(Math.PI / 2, 0);
  const p = directionToImage(d, W, H);
  close(p.x, W / 2, 1e-6, 'x');
  close(p.y, H / 2, 1e-6, 'y');
});

test('кратчайший поворот через шов', () => {
  close(shortestTurn(3, -3), 2 * Math.PI - 6, 1e-12, 'через π');
  close(shortestTurn(-3, 3), 6 - 2 * Math.PI, 1e-12, 'обратно');
  close(shortestTurn(0, 1), 1, 1e-12, 'просто');
});
