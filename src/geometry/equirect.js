// Эквидистантная (equirectangular) панорама: x изображения — долгота 0…360°, y — угол от зенита 0…180°.
// Пиксель с неквадратной стороной (картинка 16:9 вместо 2:1) ложится так же: долгота и широта берутся
// из долей ширины и высоты, а не из пикселей.
//
// Оси совпадают с THREE.SphereGeometry, отражённой по X (scale(-1, 1, 1)) для взгляда изнутри:
//   направление = (cos φ · sin θ, cos θ, sin φ · sin θ), φ = 2π·x/W, θ = π·y/H.
// Камера в центре сферы: луч из камеры — уже направление, пересекать сферу не нужно.

export function imageToDirection({ x, y }, width, height) {
  const phi = (x / width) * 2 * Math.PI;
  const theta = (y / height) * Math.PI;
  return { x: Math.cos(phi) * Math.sin(theta), y: Math.cos(theta), z: Math.sin(phi) * Math.sin(theta) };
}

// Обратное: в полюсах долгота не определена, x берётся по atan2 без ошибки.
export function directionToImage(d, width, height) {
  const len = Math.hypot(d.x, d.y, d.z);
  let u = Math.atan2(d.z, d.x) / (2 * Math.PI);
  if (u < 0) u += 1;
  const v = Math.acos(Math.max(-1, Math.min(1, d.y / len))) / Math.PI;
  return { x: u * width, y: v * height };
}

// Камера three.js смотрит в −Z; поворот YXZ: сначала рыскание (yaw) вокруг Y, затем тангаж (pitch) вокруг X.
export function directionOf(yaw, pitch) {
  return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
}

export function yawPitchOf(d) {
  const len = Math.hypot(d.x, d.y, d.z);
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(d.y / len) };
}

// Кратчайший поворот от одного угла рыскания к другому: −π…π
export function shortestTurn(from, to) {
  const d = (to - from) % (2 * Math.PI);
  return d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d;
}
