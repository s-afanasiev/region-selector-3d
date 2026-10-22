// Геометрия многоугольника на плоскости. Только чистые функции: вход — точки {x, y}, выход — числа и данные.
// Ориентация считается по формуле шнурка: signedArea > 0 и signedArea < 0 — две противоположные стороны обхода.

const EPS = 1e-9;

export class GeometryError extends Error {
  constructor(code, detail) {
    super(`${code}: ${JSON.stringify(detail)}`);
    this.name = 'GeometryError';
    this.code = code;
    this.detail = detail;
  }
}

// Векторное произведение (a - o) × (b - o): знак — с какой стороны от o→a лежит b.
export function cross(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function signedArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function area(points) {
  return Math.abs(signedArea(points));
}

export function perimeter(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) sum += distance(points[i], points[(i + 1) % points.length]);
  return sum;
}

export function bounds(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// Центр масс площади (не среднее вершин): для подписи зоны и центра 3D-комнаты.
export function centroid(points) {
  const a = signedArea(points);
  if (Math.abs(a) < EPS) {
    const n = points.length;
    return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

// Обход в заданную сторону: sign = 1 или -1 — знак signedArea результата.
export function withOrientation(points, sign) {
  return Math.sign(signedArea(points)) === sign ? points.slice() : points.slice().reverse();
}

// Чётно-нечётное правило: луч вправо от точки пересекает контур нечётное число раз.
export function pointInPolygon(p, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function onSegment(a, b, p) {
  return Math.min(a.x, b.x) - EPS <= p.x && p.x <= Math.max(a.x, b.x) + EPS &&
         Math.min(a.y, b.y) - EPS <= p.y && p.y <= Math.max(a.y, b.y) + EPS;
}

// Пересекаются ли отрезки ab и cd, включая касание и наложение на одной прямой.
export function segmentsIntersect(a, b, c, d) {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
      ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) return true;
  if (Math.abs(d1) <= EPS && onSegment(c, d, a)) return true;
  if (Math.abs(d2) <= EPS && onSegment(c, d, b)) return true;
  if (Math.abs(d3) <= EPS && onSegment(a, b, c)) return true;
  if (Math.abs(d4) <= EPS && onSegment(a, b, d)) return true;
  return false;
}

// Первая пара несоседних рёбер, которые пересекаются, или null. O(n²) — для контуров, нарисованных рукой, этого хватает.
export function findSelfIntersection(points) {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // соседние рёбра делят вершину
      const c = points[j], d = points[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d)) return { edges: [i, j], at: [a, b, c, d] };
    }
  }
  return null;
}

// Годится ли контур как зона или комната: вердикт с причиной, а не голый bool.
export function checkPolygon(points, { minArea = 1 } = {}) {
  if (points.length < 3) return { ok: false, code: 'too_few_points', detail: { points: points.length } };
  const hit = findSelfIntersection(points);
  if (hit) return { ok: false, code: 'self_intersecting', detail: { edges: hit.edges } };
  const a = area(points);
  if (a < minArea) return { ok: false, code: 'zero_area', detail: { area: a } };
  return { ok: true };
}

function pointInTriangle(p, a, b, c) {
  const d1 = cross(a, b, p);
  const d2 = cross(b, c, p);
  const d3 = cross(c, a, p);
  const hasNeg = d1 < -EPS || d2 < -EPS || d3 < -EPS;
  const hasPos = d1 > EPS || d2 > EPS || d3 > EPS;
  return !(hasNeg && hasPos); // граница считается внутренней: такое «ухо» не режем
}

function samePoint(a, b) {
  return Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS;
}

// Триангуляция простого многоугольника отсечением ушей.
// Возвращает тройки индексов исходного массива; каждый треугольник обходится в ту же сторону, что и контур.
// Вершины, лежащие на одной прямой с соседями, площади не дают и в треугольники не попадают.
export function triangulate(points) {
  const n = points.length;
  if (n < 3) throw new GeometryError('too_few_points', { points: n });
  const sign = Math.sign(signedArea(points));
  if (sign === 0) throw new GeometryError('zero_area', {});

  const ring = [...points.keys()];
  const isEar = (pos) => {
    const m = ring.length;
    const ia = ring[(pos - 1 + m) % m], ib = ring[pos], ic = ring[(pos + 1) % m];
    const a = points[ia], b = points[ib], c = points[ic];
    if (cross(a, b, c) * sign <= EPS) return false; // вогнутая или вырожденная вершина
    for (const k of ring) {
      if (k === ia || k === ib || k === ic) continue;
      const p = points[k];
      if (samePoint(p, a) || samePoint(p, b) || samePoint(p, c)) continue;
      if (pointInTriangle(p, a, b, c)) return false;
    }
    return true;
  };
  const isCollinear = (pos) => {
    const m = ring.length;
    return Math.abs(cross(points[ring[(pos - 1 + m) % m]], points[ring[pos]], points[ring[(pos + 1) % m]])) <= EPS;
  };

  const triangles = [];
  let pos = 0;
  let misses = 0; // сколько вершин подряд не оказались ухом: полный круг без уха — контур не простой
  while (ring.length > 3) {
    const m = ring.length;
    pos %= m;
    if (isEar(pos)) {
      triangles.push([ring[(pos - 1 + m) % m], ring[pos], ring[(pos + 1) % m]]);
      ring.splice(pos, 1);
      misses = 0;
    } else if (isCollinear(pos)) {
      ring.splice(pos, 1);
      misses = 0;
    } else {
      pos++;
      if (++misses > m) throw new GeometryError('no_ear', { left: m });
    }
  }
  if (Math.abs(cross(points[ring[0]], points[ring[1]], points[ring[2]])) > EPS) triangles.push(ring);
  return triangles;
}
