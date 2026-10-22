// Разметка примера-панорамы (Poly Haven, CC0): несколько зон, чтобы в 360° было что выбрать.
// Контуры заданы на превью 2000 × 1000 и масштабируются к оригиналу 4096 × 2048.
// Запуск: node scripts/make-sample-panorama.js
import { writeFileSync } from 'node:fs';
import { Grid } from '../src/zones/grid.js';
import { ZoneMap } from '../src/zones/zone-map.js';
import { encodeProject } from '../src/zones/zone-file.js';

const W = 4096, H = 2048, PREVIEW = 2000;
const k = W / PREVIEW;
const CELL = 16;

const ellipse = (cx, cy, rx, ry, n = 16) =>
  Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((i / n) * 2 * Math.PI), cy + ry * Math.sin((i / n) * 2 * Math.PI)]);

const ZONES = [
  { name: 'Солнце', preview: ellipse(1200, 445, 42, 38) },
  { name: 'Облако', preview: ellipse(960, 428, 36, 12) },
  { name: 'Дорога', preview: [[705, 520], [735, 520], [830, 610], [960, 720], [1180, 860], [1350, 1000], [700, 1000], [760, 880], [790, 760], [770, 650]] },
  { name: 'Колея', preview: [[1740, 520], [1790, 520], [1880, 610], [1990, 720], [1990, 840], [1850, 720], [1760, 620]] },
  { name: 'Куст', preview: ellipse(318, 612, 40, 34) },
];

const zones = new ZoneMap(Grid.forImage(W, H, CELL));
for (const zone of ZONES) {
  const verdict = zones.add(zone.preview.map(([x, y]) => ({ x: x * k, y: y * k })), { name: zone.name });
  if (!verdict.ok) throw new Error(`${zone.name}: ${verdict.code}`);
}
const backdrop = { name: 'aarfontein_dirt_road-2.jpg', width: W, height: H };
writeFileSync(new URL('../public/samples/aarfontein_dirt_road-2.zones.json', import.meta.url), encodeProject({ backdrop, metersPerPixel: null, zoneMap: zones }));
console.log(zones.zones().map((z) => `${z.id} ${z.name}: ${z.cells} кл.`).join('\n'));
