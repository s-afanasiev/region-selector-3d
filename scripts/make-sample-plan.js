// Генерирует пример: план квартиры (SVG) и его разметку (JSON) из одного описания комнат.
// Запуск: node scripts/make-sample-plan.js
import { writeFileSync } from 'node:fs';
import { Grid } from '../src/zones/grid.js';
import { ZoneMap } from '../src/zones/zone-map.js';
import { encodeProject } from '../src/zones/zone-file.js';

const PX_PER_M = 100;
const ORIGIN = 100; // px: поле вокруг плана
const W = 1200, H = 800;
const px = (m) => ORIGIN + m * PX_PER_M;

// Внутренние контуры комнат в метрах; стены — 0.2 м между ними и по периметру 10 × 6 м
const ROOMS = [
  { name: 'Гостиная', m: [[0.2, 0.2], [5.9, 0.2], [5.9, 5.8], [4.1, 5.8], [4.1, 3.9], [0.2, 3.9]] },
  { name: 'Прихожая', m: [[0.2, 4.1], [3.9, 4.1], [3.9, 5.8], [0.2, 5.8]] },
  { name: 'Кухня', m: [[6.1, 0.2], [9.8, 0.2], [9.8, 3.0], [6.1, 3.0]] },
  { name: 'Санузел', m: [[6.1, 3.2], [7.9, 3.2], [7.9, 5.8], [6.1, 5.8]] },
  { name: 'Спальня', m: [[8.1, 3.2], [9.8, 3.2], [9.8, 5.8], [8.1, 5.8]] },
];
// Проёмы: [x0, y0, x1, y1] в метрах, вырезаются в стенах; окна рисуются в наружных стенах
const DOORS = [[1.0, 5.8, 1.9, 6.0], [2.0, 3.9, 2.9, 4.1], [5.9, 1.0, 6.1, 1.9], [5.9, 4.6, 6.1, 5.4], [8.4, 3.0, 9.3, 3.2]];
const WINDOWS = [[1.2, 0, 3.4, 0.2], [7.0, 0, 9.0, 0.2], [0, 1.0, 0.2, 2.8], [9.8, 3.9, 10.0, 5.2]];

const rect = ([x0, y0, x1, y1], attrs) =>
  `<rect x="${px(x0)}" y="${px(y0)}" width="${(x1 - x0) * PX_PER_M}" height="${(y1 - y0) * PX_PER_M}" ${attrs}/>`;
const poly = (m, attrs) => `<polygon points="${m.map(([x, y]) => `${px(x)},${px(y)}`).join(' ')}" ${attrs}/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, sans-serif">
  <rect width="${W}" height="${H}" fill="#fbfaf7"/>
  <text x="${ORIGIN}" y="60" font-size="22" fill="#333">План квартиры · пример · 1 : 100</text>
  ${rect([0, 0, 10, 6], 'fill="#3b3b3b"')}
  ${ROOMS.map((r) => poly(r.m, 'fill="#fbfaf7"')).join('\n  ')}
  ${DOORS.map((d) => rect(d, 'fill="#fbfaf7"')).join('\n  ')}
  ${WINDOWS.map((w) => rect(w, 'fill="#bcd7ef" stroke="#3b3b3b" stroke-width="2"')).join('\n  ')}
  ${ROOMS.map((r) => `<text x="${px(r.m[0][0]) + 12}" y="${px(r.m[0][1]) + 26}" font-size="16" fill="#8a8a8a">${r.name}</text>`).join('\n  ')}
  <g stroke="#333" stroke-width="2">
    <line x1="${px(0)}" y1="750" x2="${px(3)}" y2="750"/>
    ${[0, 1, 2, 3].map((m) => `<line x1="${px(m)}" y1="742" x2="${px(m)}" y2="758"/>`).join('')}
  </g>
  <text x="${px(3) + 10}" y="756" font-size="16" fill="#333">3 м</text>
</svg>
`;
writeFileSync(new URL('../public/samples/plan.svg', import.meta.url), svg);

const grid = Grid.forImage(W, H, 10);
const zones = new ZoneMap(grid);
for (const room of ROOMS) {
  const verdict = zones.add(room.m.map(([x, y]) => ({ x: px(x), y: px(y) })), { name: room.name });
  if (!verdict.ok) throw new Error(`${room.name}: ${verdict.code}`);
}
const backdrop = { name: 'plan.svg', width: W, height: H };
writeFileSync(new URL('../public/samples/plan.zones.json', import.meta.url), encodeProject({ backdrop, metersPerPixel: 1 / PX_PER_M, zoneMap: zones }));
console.log(`plan.svg ${W}×${H}, ${ROOMS.length} комнат, сетка ${grid.cols}×${grid.rows}`);
