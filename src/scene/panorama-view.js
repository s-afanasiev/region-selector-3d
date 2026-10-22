import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { directionOf, directionToImage, imageToDirection, shortestTurn, yawPitchOf } from '../geometry/equirect.js';

const RADIUS = 10;

// Подложка как 360° панорама: изображение на сфере, камера в центре, зоны — вторая полупрозрачная сфера
// с той же картинкой «клетка = пиксель», что и на плане. Осмотр — перетаскиванием, приближение — колесом.
// Выбор зоны без пересечения со сферой: луч из камеры — уже направление, из него долгота и широта → пиксель → клетка.
export class PanoramaView {
  #host;
  #project;
  #selection;
  #raster;
  #fov;
  #turnMs;
  #renderer;
  #labelRenderer;
  #scene = new THREE.Scene();
  #camera;
  #base;
  #overlay;
  #labels = new THREE.Group();
  #raycaster = new THREE.Raycaster();
  #yaw = Math.PI / 2; // центр изображения — прямо перед камерой
  #pitch = 0;
  #drag = null;
  #picked = 0;
  #frame = 0;
  #turn = null;
  #shownBackdrop = null;
  #shownVersion = -1;
  #shownSize = '';
  #shownLayout = -1;
  #off = [];

  constructor(host, { project, selection, raster, fov, turnMs }) {
    this.#host = host;
    this.#project = project;
    this.#selection = selection;
    this.#raster = raster;
    this.#fov = fov;
    this.#turnMs = turnMs;
  }

  run() {
    this.#renderer = new THREE.WebGLRenderer({ antialias: true });
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#labelRenderer = new CSS2DRenderer();
    this.#labelRenderer.domElement.className = 'scene-labels';
    this.#host.append(this.#renderer.domElement, this.#labelRenderer.domElement);

    this.#camera = new THREE.PerspectiveCamera(this.#fov.initial, 1, 0.1, RADIUS * 2);
    this.#camera.rotation.order = 'YXZ';
    this.#base = sphere(RADIUS, new THREE.MeshBasicMaterial({ color: 0x777777 }));
    this.#overlay = sphere(RADIUS * 0.995, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    this.#scene.add(this.#base, this.#overlay, this.#labels);

    const el = this.#renderer.domElement;
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this.#off.push(() => target.removeEventListener(type, fn, opts));
    };
    on(el, 'pointerdown', (e) => this.#pointerDown(e));
    on(el, 'pointermove', (e) => this.#pointerMove(e));
    on(el, 'pointerup', (e) => this.#pointerUp(e));
    on(el, 'pointerleave', () => this.#selection.hover(0));
    on(el, 'wheel', (e) => this.#wheel(e), { passive: false });
    el.style.cursor = 'grab';
    this.#off.push(
      // выбор в списке или на плане — повернуться к зоне; свой клик камеру не дёргает
      this.#selection.subscribe((e) => {
        if (e.type === 'selected' && e.id && e.id !== this.#picked) this.turnTo(e.id);
        this.invalidate();
      }),
      this.#project.subscribe((e) => {
        if (e.type === 'opened') this.reset();
        this.invalidate();
      }),
      this.#project.zones.subscribe(() => this.invalidate()),
    );
    const resize = new ResizeObserver(() => this.#resize());
    resize.observe(this.#host);
    this.#off.push(() => resize.disconnect());
    this.#resize();
    return this;
  }

  stop() {
    cancelAnimationFrame(this.#frame);
    this.#off.splice(0).forEach((off) => off());
    for (const mesh of [this.#base, this.#overlay]) {
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
    }
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
    this.#labelRenderer.domElement.remove();
  }

  // Камера в исходное положение: центр изображения на уровне горизонта.
  reset() {
    this.#turn = null;
    this.#yaw = Math.PI / 2;
    this.#pitch = 0;
    this.#camera.fov = this.#fov.initial;
    this.#camera.updateProjectionMatrix();
    this.invalidate();
  }

  // Плавно повернуться к подписи зоны.
  turnTo(id) {
    const anchor = this.#raster.current().anchors.get(id);
    const { backdrop } = this.#project;
    if (!anchor || !backdrop) return;
    const target = yawPitchOf(imageToDirection(anchor, backdrop.width, backdrop.height));
    this.#turn = {
      start: performance.now(),
      from: { yaw: this.#yaw, pitch: this.#pitch },
      by: { yaw: shortestTurn(this.#yaw, target.yaw), pitch: target.pitch - this.#pitch },
    };
    this.invalidate();
  }

  invalidate() {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#render();
    });
  }

  #render() {
    if (!this.#host.clientWidth) return; // вид спрятан — перерисуем, когда покажут
    this.#syncBackdrop();
    this.#syncZones();
    if (this.#turn) this.#stepTurn();
    this.#camera.rotation.set(this.#pitch, this.#yaw, 0);
    this.#renderer.render(this.#scene, this.#camera);
    this.#labelRenderer.render(this.#scene, this.#camera);
  }

  #stepTurn() {
    const t = Math.min(1, (performance.now() - this.#turn.start) / this.#turnMs);
    const k = 1 - (1 - t) ** 3; // замедление к концу
    this.#yaw = this.#turn.from.yaw + this.#turn.by.yaw * k;
    this.#pitch = this.#turn.from.pitch + this.#turn.by.pitch * k;
    if (t < 1) this.invalidate();
    else this.#turn = null;
  }

  #syncBackdrop() {
    const { backdrop } = this.#project;
    if (backdrop === this.#shownBackdrop) return;
    this.#shownBackdrop = backdrop;
    const material = this.#base.material;
    material.map?.dispose();
    material.map = backdrop?.source ? textureOf(backdrop.source, this.#renderer.capabilities.maxTextureSize) : null;
    material.color.setHex(material.map ? 0xffffff : 0x777777);
    material.needsUpdate = true;
  }

  #syncZones() {
    const raster = this.#raster.current();
    if (raster.version !== this.#shownVersion) {
      this.#shownVersion = raster.version;
      const material = this.#overlay.material;
      const old = material.map;
      // размер текстуры в WebGL неизменен: другая сетка — другая текстура (холст тот же, размер — нет)
      const size = `${raster.canvas.width}×${raster.canvas.height}`;
      if (!old || size !== this.#shownSize) {
        this.#shownSize = size;
        old?.dispose();
        material.map = new THREE.CanvasTexture(raster.canvas);
        material.map.magFilter = THREE.NearestFilter; // клетки — резкие, как их видит плеер
        material.map.minFilter = THREE.NearestFilter;
        material.map.generateMipmaps = false;
        material.map.colorSpace = THREE.SRGBColorSpace;
        material.needsUpdate = true;
      } else {
        old.needsUpdate = true;
      }
    }
    if (raster.layoutVersion !== this.#shownLayout) {
      this.#shownLayout = raster.layoutVersion;
      this.#placeLabels(raster.anchors);
    }
    for (const label of this.#labels.children) {
      label.element.classList.toggle('is-active', label.userData.id === this.#selection.selected || label.userData.id === this.#selection.hovered);
    }
  }

  #placeLabels(anchors) {
    for (const label of this.#labels.children) label.element.remove();
    this.#labels.clear();
    const { backdrop, zones } = this.#project;
    if (!backdrop) return;
    for (const zone of zones.zones()) {
      const at = anchors.get(zone.id);
      if (!at) continue;
      const d = imageToDirection(at, backdrop.width, backdrop.height);
      const tag = document.createElement('div');
      tag.className = 'pano-label';
      tag.textContent = zone.name ? `${zone.id} ${zone.name}` : String(zone.id);
      const label = new CSS2DObject(tag);
      label.position.set(d.x, d.y, d.z).multiplyScalar(RADIUS * 0.9);
      label.userData.id = zone.id;
      this.#labels.add(label);
    }
  }

  #zoneAt(e) {
    const { backdrop, zones } = this.#project;
    if (!backdrop) return 0;
    const r = this.#renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.#raycaster.setFromCamera(ndc, this.#camera);
    return zones.zoneAt(directionToImage(this.#raycaster.ray.direction, backdrop.width, backdrop.height));
  }

  #pointerDown(e) {
    if (e.button !== 0) return;
    this.#turn = null;
    this.#drag = { x: e.clientX, y: e.clientY, yaw: this.#yaw, pitch: this.#pitch, moved: false };
    this.#renderer.domElement.setPointerCapture(e.pointerId);
    this.#renderer.domElement.style.cursor = 'grabbing';
  }

  // Перетаскивание «тянет мир»: точка под курсором остаётся под курсором при любом угле обзора.
  #pointerMove(e) {
    if (!this.#drag) {
      this.#selection.hover(this.#zoneAt(e));
      return;
    }
    const dx = e.clientX - this.#drag.x, dy = e.clientY - this.#drag.y;
    if (Math.hypot(dx, dy) > 3) this.#drag.moved = true;
    const radPerPx = THREE.MathUtils.degToRad(this.#camera.fov) / this.#host.clientHeight;
    const limit = Math.PI / 2 - 0.01;
    this.#yaw = this.#drag.yaw + dx * radPerPx;
    this.#pitch = Math.max(-limit, Math.min(limit, this.#drag.pitch + dy * radPerPx));
    this.invalidate();
  }

  #pointerUp(e) {
    if (!this.#drag) return;
    const click = !this.#drag.moved;
    this.#drag = null;
    this.#renderer.domElement.releasePointerCapture(e.pointerId);
    this.#renderer.domElement.style.cursor = 'grab';
    if (!click) return;
    this.#picked = this.#zoneAt(e);
    this.#selection.select(this.#picked);
    this.#picked = 0;
  }

  #wheel(e) {
    e.preventDefault();
    const { min, max } = this.#fov;
    this.#camera.fov = Math.max(min, Math.min(max, this.#camera.fov * Math.exp(e.deltaY * 0.001)));
    this.#camera.updateProjectionMatrix();
    this.invalidate();
  }

  #resize() {
    const { clientWidth: w, clientHeight: h } = this.#host;
    if (!w || !h) return;
    this.#renderer.setSize(w, h);
    this.#labelRenderer.setSize(w, h);
    this.#camera.aspect = w / h;
    this.#camera.updateProjectionMatrix();
    this.invalidate();
  }
}

// Сфера изнутри: отражение по X разворачивает грани внутрь и снимает зеркальность картинки.
function sphere(radius, material) {
  const geometry = new THREE.SphereGeometry(radius, 96, 48);
  geometry.scale(-1, 1, 1);
  return new THREE.Mesh(geometry, material);
}

// Изображение больше предела видеокарты уменьшается, иначе WebGL откажется его загружать.
function textureOf(image, maxSize) {
  const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
  let source = image;
  if (w > maxSize || h > maxSize) {
    const k = maxSize / Math.max(w, h);
    source = document.createElement('canvas');
    source.width = Math.floor(w * k);
    source.height = Math.floor(h * k);
    source.getContext('2d').drawImage(image, 0, 0, source.width, source.height);
  }
  const texture = new THREE.Texture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
