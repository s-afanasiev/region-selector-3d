// Файлы разметки. Свой формат — JSON; arr_*.js (код на JS с матрицей) читается и пишется для совместимости
// с плеером виртуального тура, который его потребляет.
//
// Что сохраняет перевод между форматами: матрица клеток переносится один в один (номера зон, размеры, порядок строк).
// Что теряет arr_*.js: контуры, имена зон и масштаб — их там нет. Зона из такого файла остаётся
// «только клетками»: её видно и можно перенумеровать, но не пересчитать на другую сетку и не построить в 3D.

const FORMAT = 'region-selector';
const VERSION = 1;

// Одна зона и одна строка матрицы — одна строка файла: файл читается глазами и даёт внятный diff.
export function encodeProject({ backdrop, metersPerPixel, zoneMap }) {
  const grid = zoneMap.grid;
  const J = JSON.stringify;
  const zones = zoneMap.zones().map(({ id, name, polygon }) => ({
    id, name, polygon: polygon && polygon.map(({ x, y }) => [round(x), round(y)]),
  }));
  return [
    '{',
    `  "format": ${J(FORMAT)},`,
    `  "version": ${VERSION},`,
    `  "image": ${J({ name: backdrop.name, width: backdrop.width, height: backdrop.height })},`,
    `  "grid": ${J({ cell: grid.cell, cols: grid.cols, rows: grid.rows })},`,
    `  "metersPerPixel": ${J(metersPerPixel)},`,
    '  "zones": [',
    zones.map((z) => `    ${J(z)}`).join(',\n'),
    '  ],',
    '  "matrix": [',
    zoneMap.matrix().map((r) => `    ${J(r)}`).join(',\n'),
    '  ]',
    '}',
    '',
  ].join('\n');
}

// Разбор любого известного формата → { ok, value: { image, cell, metersPerPixel, zones, matrix } }.
export function decodeProject(rawText) {
  const text = rawText.replace(/\r\n/g, '\n');
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return decodeJson(trimmed);
  if (text.includes("data_sructure['structure']")) return decodeLegacy(text);
  return { ok: false, code: 'unknown_format', detail: { head: trimmed.slice(0, 40) } };
}

function decodeJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, code: 'bad_json', detail: { message: e.message } };
  }
  if (data.format !== FORMAT) return { ok: false, code: 'unknown_format', detail: { format: data.format } };
  if (data.version !== VERSION) return { ok: false, code: 'unsupported_version', detail: { version: data.version } };
  return checkedValue({
    image: data.image,
    cell: data.grid.cell,
    metersPerPixel: data.metersPerPixel ?? null,
    zones: data.zones.map(({ id, name, polygon }) => ({ id, name, polygon: polygon && polygon.map(([x, y]) => ({ x, y })) })),
    matrix: data.matrix,
  });
}

const LEGACY_ANCHOR = "data_sructure['structure'] =\n";

function decodeLegacy(text) {
  const header = (key) => text.match(new RegExp(`data_sructure\\['header'\\]\\['${key}'\\] = '?([^';\\n]*)'?;`))?.[1];
  const start = text.indexOf(LEGACY_ANCHOR);
  if (start < 0) return { ok: false, code: 'unknown_format', detail: { missing: 'structure' } };
  let matrix;
  try {
    matrix = JSON.parse(text.slice(start + LEGACY_ANCHOR.length).trim().replace(/;$/, ''));
  } catch (e) {
    return { ok: false, code: 'bad_json', detail: { message: e.message } };
  }
  const image = { name: header('image_src') ?? '', width: Number(header('image_width')), height: Number(header('image_height')) };
  const cell = Number(header('sq_size'));
  if (image.width > 0 && image.height > 0 && cell > 0) matrix = trimLegacyPadding(matrix, image, cell);
  const ids = [...new Set(matrix.flat().filter(Boolean))].sort((a, b) => a - b);
  return checkedValue({
    image,
    cell,
    metersPerPixel: null,
    zones: ids.map((id) => ({ id, name: '', polygon: null })),
    matrix,
  });
}

// Причуда формата arr_*.js: матрица в нём floor(W/cell)+1 × floor(H/cell)+1 —
// при W, кратном клетке, это лишняя пустая колонка и строка за краем изображения. Внутри приложения
// сетка всегда ceil(W/cell); край срезается при чтении (только если он пуст) и возвращается при записи.
function legacySize(length, cell) {
  return Math.floor(length / cell) + 1;
}

function trimLegacyPadding(matrix, image, cell) {
  const rows = Math.ceil(image.height / cell);
  const cols = Math.ceil(image.width / cell);
  const padded = matrix.length === legacySize(image.height, cell) && matrix[0]?.length === legacySize(image.width, cell);
  if (!padded || (matrix.length === rows && matrix[0].length === cols)) return matrix;
  const edgeIsEmpty = matrix.every((r, i) => (i < rows ? r.slice(cols) : r).every((v) => v === 0));
  return edgeIsEmpty ? matrix.slice(0, rows).map((r) => r.slice(0, cols)) : matrix;
}

function padLegacy(matrix, width, height, cell) {
  const cols = legacySize(width, cell);
  const rows = legacySize(height, cell);
  const out = matrix.map((r) => [...r, ...Array(Math.max(0, cols - r.length)).fill(0)]);
  while (out.length < rows) out.push(Array(cols).fill(0));
  return out;
}

function checkedValue(value) {
  const { matrix, cell, image } = value;
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  if (!rows || matrix.some((r) => r.length !== cols)) return { ok: false, code: 'ragged_matrix', detail: { rows } };
  if (!(cell > 0)) return { ok: false, code: 'bad_cell', detail: { cell } };
  // Старый файл без размеров изображения: восстанавливаем их по сетке
  if (!(image.width > 0)) image.width = cols * cell;
  if (!(image.height > 0)) image.height = rows * cell;
  if (Math.ceil(image.width / cell) !== cols || Math.ceil(image.height / cell) !== rows) {
    return { ok: false, code: 'grid_mismatch', detail: { cols, rows, width: image.width, height: image.height, cell } };
  }
  return { ok: true, value };
}

// Формат arr_*.js байт в байт: те же строки и разделители, что читает плеер тура.
export function encodeLegacy({ backdrop, zoneMap }) {
  const lines = [
    'var data_sructure = new Array();',
    "data_sructure['header'] = new Array();",
  ];
  if (backdrop.name !== '') {
    lines.push(`data_sructure['header']['image_src'] = '${backdrop.name}';`);
    lines.push(`data_sructure['header']['image_width'] = ${backdrop.width};`);
    lines.push(`data_sructure['header']['image_height'] = ${backdrop.height};`);
  }
  lines.push(`data_sructure['header']['sq_size'] = ${zoneMap.grid.cell};`);
  lines.push("data_sructure['structure'] = new Array();");
  lines.push("data_sructure['structure'] =");
  lines.push('[');
  const cell = zoneMap.grid.cell;
  const rows = padLegacy(zoneMap.matrix(), backdrop.width, backdrop.height, cell).map((r) => `[${r.join(',')}]`);
  lines.push(rows.join(',\n'));
  lines.push('];');
  return lines.join('\n') + '\n';
}

function round(v) {
  return Math.round(v * 100) / 100;
}
