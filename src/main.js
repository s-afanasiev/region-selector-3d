import './styles.css';
import { Grid } from './zones/grid.js';
import { ZoneMap } from './zones/zone-map.js';
import { History } from './zones/history.js';
import { Project } from './project.js';
import { Selection } from './editor/selection.js';
import { PlanPainter } from './editor/plan-painter.js';
import { Viewport } from './editor/viewport.js';
import { SelectTool, DrawTool, CalibrateTool } from './editor/tools.js';
import { Commands } from './editor/commands.js';
import { Editor } from './editor/editor.js';
import { Scene3D } from './scene/scene3d.js';
import { RoomsView } from './scene/rooms-view.js';
import { PanoramaView } from './scene/panorama-view.js';
import { guessSceneMode } from './scene/scene-mode.js';
import { ZoneRaster } from './ui/zone-raster.js';
import { StatusBar } from './ui/status-bar.js';
import { ZoneList } from './ui/zone-list.js';
import { lengthDialog } from './ui/length-dialog.js';
import { zoneColor } from './ui/palette.js';
import { download, baseName } from './ui/files.js';

// Точка сборки: всё приложение и все числа поведения — здесь.
const SETTINGS = {
  cell: 20,                        // px, размер клетки по умолчанию
  cellLimits: { min: 2, max: 200 },
  zoomLimits: { min: 0.02, max: 16 },
  minPointDistance: 4,             // px изображения: ближе — точка контура не ставится
  snapRadius: 10,                  // px экрана: клик ближе — контур замыкается в первую точку
  historyDepth: 100,
  walls: { wallHeight: 2.7, wallThickness: 0.12 }, // м
  fallbackMetersPerPixel: 0.01,    // пока масштаб не задан: 1 px = 1 см
  zoneAlpha: { normal: 0.32, active: 0.6 },
  panorama: { fov: { initial: 75, min: 30, max: 100 }, turnMs: 450 }, // угол обзора в градусах
};
const BASE = import.meta.env.BASE_URL;
const SAMPLES = {
  plan: { title: 'План квартиры', image: `${BASE}samples/plan.svg`, markup: `${BASE}samples/plan.zones.json` },
  panorama: { title: 'Панорама 360°', image: `${BASE}samples/aarfontein_dirt_road-2.jpg`, markup: `${BASE}samples/aarfontein_dirt_road-2.zones.json` },
};

const $ = (selector) => document.querySelector(selector);

const zones = new ZoneMap(Grid.forImage(1, 1, SETTINGS.cell));
const project = new Project(zones, new History(zones, { depth: SETTINGS.historyDepth }), { cellLimits: SETTINGS.cellLimits });
const selection = new Selection(zones);
const status = new StatusBar($('#statusbar'));
const raster = new ZoneRaster({ zones, selection, colorOf: zoneColor, alpha: SETTINGS.zoneAlpha });
const painter = new PlanPainter({ project, selection, raster, colorOf: zoneColor });
const viewport = new Viewport($('#plan'), painter, {
  zoomLimits: SETTINGS.zoomLimits,
  onCursor: (p) => status.cursor(p ? `${Math.round(p.x)}, ${Math.round(p.y)} px` : ''),
});
const commands = new Commands({
  project, selection, status, viewport, painter,
  askLength: lengthDialog($('#length-dialog')),
  samples: SAMPLES,
  defaultCell: SETTINGS.cell,
});
const measure = (px) => (project.metersPerPixel ? `${(px * project.metersPerPixel).toFixed(2)} м` : `${Math.round(px)} px`);
const editor = new Editor({
  viewport,
  status,
  tools: {
    select: new SelectTool({ zones, selection, onDelete: (id) => commands.removeZone(id) }),
    draw: new DrawTool({
      minPointDistance: SETTINGS.minPointDistance, snapRadius: SETTINGS.snapRadius, measure,
      onClose: (points) => commands.addZone(points),
    }),
    calibrate: new CalibrateTool({ measure, onSegment: (a, b) => commands.calibrate(a, b) }),
  },
  shortcuts: {
    v: () => editor.use('select'),
    p: () => editor.use('draw'),
    m: () => editor.use('calibrate'),
    g: () => toggleGrid(),
    f: () => fit(),
    'ctrl+z': () => commands.undo(),
    'ctrl+shift+z': () => commands.redo(),
    'ctrl+y': () => commands.redo(),
  },
  onToolChange: (name) => {
    document.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === name)));
  },
});
const scene = new Scene3D($('#scene'), { onHover: (id) => selection.hover(id), onPick: (id) => selection.select(id) });
const rooms = new RoomsView(scene, {
  project, selection, colorOf: zoneColor,
  notice: (text) => { $('#scene-notice').textContent = text; },
  params: SETTINGS.walls,
  fallbackMetersPerPixel: SETTINGS.fallbackMetersPerPixel,
});
const panorama = new PanoramaView($('#panorama'), { project, selection, raster, ...SETTINGS.panorama });
const zoneList = new ZoneList($('#zone-list'), {
  summary: $('#zone-summary'), project, selection, colorOf: zoneColor,
  commands: {
    rename: (id, name) => commands.renameZone(id, name),
    renumber: (id, to) => commands.renumberZone(id, to),
    remove: (id) => commands.removeZone(id),
  },
});

// Перерисовка плана — реакция на факты модели; растр зон общий для плана и панорамы
zones.subscribe(() => { raster.invalidate({ layout: true }); viewport.invalidate(); });
selection.subscribe(() => { raster.invalidate(); viewport.invalidate(); });
project.subscribe((e) => {
  raster.invalidate({ layout: true });
  viewport.invalidate();
  $('#cell-size').value = zones.grid.cell;
  document.body.classList.toggle('is-empty', !project.backdrop);
  $('#scale-value').textContent = project.metersPerPixel ? `1 м = ${Math.round(1 / project.metersPerPixel)} px` : 'не задан';
  if (e.type === 'opened') {
    selection.select(0);
    setSceneMode(guessSceneMode(project));
  }
});

function setSceneMode(mode) {
  document.body.dataset.scene = mode;
  document.querySelectorAll('[data-scene-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sceneMode === mode)));
}

function toggleGrid() {
  viewport.showGrid = !viewport.showGrid;
  $('[data-action="grid"]').setAttribute('aria-pressed', String(viewport.showGrid));
  viewport.invalidate();
}

function fit() {
  if (project.backdrop) viewport.fit(project.backdrop.width, project.backdrop.height);
}

function syncSceneTheme() {
  scene.setTheme({ background: getComputedStyle(document.body).getPropertyValue('--scene-bg').trim() });
}

const actions = {
  open: () => $('#file-input').click(),
  sample: (el) => commands.openSample(el.dataset.sample),
  tool: (el) => editor.use(el.dataset.tool),
  undo: () => commands.undo(),
  redo: () => commands.redo(),
  grid: () => toggleGrid(),
  fit: () => fit(),
  'zoom-in': () => viewport.zoomBy(1.25),
  'zoom-out': () => viewport.zoomBy(0.8),
  'export-json': () => commands.exportJson(),
  'export-legacy': () => commands.exportLegacy(),
  'export-png': () => commands.exportPng(),
  'export-glb': async () => {
    const glb = await scene.exportGLB();
    if (glb) download(`${baseName(project.backdrop?.name)}.glb`, new Blob([glb], { type: 'model/gltf-binary' }));
  },
  'frame-3d': () => (document.body.dataset.scene === 'panorama' ? panorama.reset() : scene.frame()),
  'scene-mode': (el) => setSceneMode(el.dataset.sceneMode),
  'toggle-3d': (el) => {
    const hidden = document.body.classList.toggle('no-3d');
    el.setAttribute('aria-pressed', String(!hidden));
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  actions[el.dataset.action]?.(el);
  el.closest('details')?.removeAttribute('open');
});
$('#file-input').addEventListener('change', (e) => {
  commands.openFiles(e.target.files);
  e.target.value = '';
});
$('#cell-size').addEventListener('change', (e) => {
  if (!commands.changeCell(Number(e.target.value)).ok) e.target.value = zones.grid.cell;
});
$('#walls-form').addEventListener('input', (e) => {
  const value = Number(e.target.value);
  if (value > 0) rooms.setParams({ [e.target.name]: value });
});
document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('is-dragging'); });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('is-dragging'); });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('is-dragging');
  if (e.dataTransfer?.files.length) commands.openFiles(e.dataTransfer.files);
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncSceneTheme);

if (import.meta.env.DEV) window.__app = { project, selection, viewport, commands, editor, scene, panorama }; // для проверок из консоли

viewport.run();
scene.run();
syncSceneTheme();
rooms.run();
panorama.run();
setSceneMode('rooms');
zoneList.run();
editor.run('draw');
const requested = new URLSearchParams(location.search).get('sample'); // ссылка вида ?sample=panorama
commands.openSample(SAMPLES[requested] ? requested : 'plan');
