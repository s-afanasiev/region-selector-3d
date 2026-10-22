// Цвет зоны выводится из номера: шаг по кругу оттенков на золотой угол не даёт соседним номерам похожих цветов.
const GOLDEN_ANGLE = 137.508;

export function zoneColor(id) {
  const h = (id * GOLDEN_ANGLE + 200) % 360;
  const [r, g, b] = hslToRgb(h / 360, 0.65, 0.5);
  return { r, g, b, css: `rgb(${r} ${g} ${b})`, hex: (r << 16) | (g << 8) | b };
}

function hslToRgb(h, s, l) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)].map((v) => Math.round(v * 255));
}
