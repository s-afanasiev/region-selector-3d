// Коды вердиктов ядра → текст для человека. Ядро говорит кодами, язык живёт только здесь.
const TEXT = {
  too_few_points: (d) => `Нужно минимум 3 точки, сейчас ${d.points}`,
  self_intersecting: () => 'Контур пересекает сам себя — уберите точку (Backspace) и обойдите иначе',
  zero_area: () => 'У контура нет площади',
  no_cells: (d) => `Контур не накрывает ни одной клетки ${d.cell}px — нарисуйте крупнее или уменьшите клетку`,
  overlap: (d) => `Пересекается с зоной ${ids(d.zones)}${d.cells ? ` (${d.cells} кл.)` : ''}`,
  not_found: (d) => `Зоны ${d.id} нет`,
  bad_id: () => 'Номер — целое число от 1',
  taken: (d) => `Номер ${d.id} уже занят`,
  cells_only_zones: (d) => `Зоны ${ids(d.zones)} пришли из arr_*.js без контура — их нельзя пересчитать на другую сетку`,
  zones_without_cells: (d) => `В файле описаны зоны без клеток: ${ids(d.zones)}`,
  grid_mismatch: (d) => `Матрица ${d.cols ?? ''}×${d.rows ?? ''} не совпадает с размером изображения`,
  ragged_matrix: () => 'Строки матрицы разной длины',
  bad_cell: (d) => (d.min ? `Размер клетки — целое от ${d.min} до ${d.max}` : 'В файле нет размера клетки'),
  bad_json: (d) => `Файл повреждён: ${d.message}`,
  unknown_format: () => 'Это не файл разметки (ни JSON Region Selector, ни arr_*.js плеера тура)',
  unsupported_version: (d) => `Версия файла ${d.version} не поддерживается`,
  nothing_to_undo: () => 'Отменять нечего',
  nothing_to_redo: () => 'Повторять нечего',
  calibration_too_short: () => 'Точки калибровки слишком близко',
  bad_length: () => 'Длина должна быть больше нуля',
  no_backdrop: () => 'Сначала откройте изображение или пример',
  not_an_image: (d) => `Не удалось открыть «${d.name}» как изображение`,
  no_polygon_zones: () => 'Нет зон с контуром — в 3D строятся только нарисованные зоны',
};

// Длинный перечень номеров сворачивается: «1, 2, 3, 4, 5 и ещё 31»
export function ids(list, max = 5) {
  return list.length <= max ? list.join(', ') : `${list.slice(0, max).join(', ')} и ещё ${list.length - max}`;
}

export function describe(verdict) {
  const text = TEXT[verdict.code];
  return text ? text(verdict.detail ?? {}) : `Ошибка: ${verdict.code}`;
}
