import { signedArea } from './polygon.js';

const EPS = 1e-12;

// Смещение контура наружу (distance > 0) или внутрь (distance < 0) с острыми стыками (miter).
// Сохраняет: число и порядок вершин — i-я вершина результата соответствует i-й исходной,
// поэтому стена между контурами собирается полосами по рёбрам.
// Теряет: на углах острее ~2·asin(1/miterLimit) (при 4 — около 29°) стык обрезается до miterLimit·|distance|,
// а при толщине больше коротких рёбер внешний контур может самопересечься — это проверяет вызывающий.
export function offsetPolygon(points, distance, { miterLimit = 4 } = {}) {
  const sign = Math.sign(signedArea(points));
  const n = points.length;
  const outwardNormal = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return sign > 0 ? { x: dy / len, y: -dx / len } : { x: -dy / len, y: dx / len };
  };

  return points.map((p, i) => {
    const n1 = outwardNormal(points[(i - 1 + n) % n], p);
    const n2 = outwardNormal(p, points[(i + 1) % n]);
    const mx = n1.x + n2.x, my = n1.y + n2.y;
    const mlen = Math.hypot(mx, my);
    if (mlen < EPS) return { x: p.x + n1.x * distance, y: p.y + n1.y * distance }; // разворот на 180°
    // Длина биссектрисы-стыка: d / cos(θ/2) = d·|n1+n2| / (1 + n1·n2)
    let len = (distance * mlen) / (1 + n1.x * n2.x + n1.y * n2.y);
    const limit = miterLimit * Math.abs(distance);
    if (Math.abs(len) > limit) len = Math.sign(len) * limit;
    return { x: p.x + (mx / mlen) * len, y: p.y + (my / mlen) * len };
  });
}
