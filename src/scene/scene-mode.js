// Какой 3D-вид показать для только что открытого проекта: «комнаты» по плану или «панорама» 360°.
// Это догадка по признакам, человек переключает вручную; переключение действует до следующего открытия.
export function guessSceneMode({ backdrop, metersPerPixel, zones }) {
  if (!backdrop) return 'rooms';
  if (metersPerPixel) return 'rooms'; // масштаб задают у плана, у панорамы метров нет
  const list = zones.zones();
  if (list.length && list.every((z) => !z.polygon)) return 'panorama'; // хотспоты из arr_*.js: клетки без контуров
  return backdrop.width / backdrop.height >= 1.7 ? 'panorama' : 'rooms'; // 2:1 и 16:9 — панорамы, планы ближе к квадрату
}
