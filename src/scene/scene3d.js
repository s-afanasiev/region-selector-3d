import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const VIEW_DIRECTION = new THREE.Vector3(0.35, 0.85, 0.55).normalize(); // сверху-сбоку, со стороны низа плана

// Сцена three.js: рендер по требованию (перерисовка только при изменении), орбитальная камера,
// свет с тенями, выбор комнаты лучом из камеры. Модель приходит снаружи и подменяется целиком.
export class Scene3D {
  #host;
  #onHover;
  #onPick;
  #renderer;
  #labels;
  #scene = new THREE.Scene();
  #camera = new THREE.PerspectiveCamera(45, 1, 0.05, 1000);
  #controls;
  #sun = new THREE.DirectionalLight(0xffffff, 1.3);
  #ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.18 }));
  #model = null;
  #frame = 0;
  #framedSize = 0;
  #raycaster = new THREE.Raycaster();
  #down = null;
  #off = [];

  constructor(host, { onHover, onPick }) {
    this.#host = host;
    this.#onHover = onHover;
    this.#onPick = onPick;
  }

  run() {
    this.#renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap убран в r18x
    this.#labels = new CSS2DRenderer();
    this.#labels.domElement.className = 'scene-labels';
    this.#host.append(this.#renderer.domElement, this.#labels.domElement);

    this.#scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.1));
    this.#sun.castShadow = true;
    this.#sun.shadow.mapSize.set(2048, 2048);
    this.#sun.shadow.bias = -0.0005;
    this.#scene.add(this.#sun, this.#sun.target);
    this.#ground.rotation.x = -Math.PI / 2;
    this.#ground.position.y = -0.002;
    this.#ground.receiveShadow = true;
    this.#scene.add(this.#ground);

    this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement);
    this.#controls.enableDamping = true;
    this.#controls.maxPolarAngle = Math.PI / 2 - 0.05; // не уходить под пол
    this.#controls.addEventListener('change', () => this.invalidate());

    const el = this.#renderer.domElement;
    const on = (target, type, fn) => {
      target.addEventListener(type, fn);
      this.#off.push(() => target.removeEventListener(type, fn));
    };
    on(el, 'pointermove', (e) => this.#onHover(this.#roomAt(e)));
    on(el, 'pointerleave', () => this.#onHover(0));
    on(el, 'pointerdown', (e) => { this.#down = { x: e.clientX, y: e.clientY }; });
    on(el, 'pointerup', (e) => {
      // клик без протягивания — выбор; протягивание — вращение камеры
      if (this.#down && Math.hypot(e.clientX - this.#down.x, e.clientY - this.#down.y) < 4) this.#onPick(this.#roomAt(e));
      this.#down = null;
    });
    const resize = new ResizeObserver(() => this.#resize());
    resize.observe(this.#host);
    this.#off.push(() => resize.disconnect());
    this.#resize();
    return this;
  }

  stop() {
    cancelAnimationFrame(this.#frame);
    this.#off.splice(0).forEach((off) => off());
    this.#setModel(null);
    this.#controls.dispose();
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
    this.#labels.domElement.remove();
  }

  setTheme({ background }) {
    this.#scene.background = new THREE.Color(background);
    this.invalidate();
  }

  // Новая модель вместо старой; камера перестраивается, только если план заметно изменил размер.
  show(model) {
    this.#setModel(model);
    // пока комнат нет, камера не закреплена: первая же комната получит кадр под себя
    if (!this.#framedSize || Math.abs(model.size - this.#framedSize) / this.#framedSize > 0.5) this.frame();
    this.#fitShadows(model.size || 10);
    this.invalidate();
  }

  // Камера смотрит на ограничивающую сферу модели с расстояния, при котором сфера влезает в кадр
  // по самому узкому из углов обзора (вертикальному или горизонтальному).
  frame() {
    const sphere = new THREE.Sphere(new THREE.Vector3(), 5);
    if (this.#model?.floors.length) new THREE.Box3().setFromObject(this.#model.object).getBoundingSphere(sphere);
    this.#framedSize = this.#model?.floors.length ? this.#model.size : 0;
    const vfov = THREE.MathUtils.degToRad(this.#camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.#camera.aspect);
    const dist = (sphere.radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.05;
    this.#controls.target.copy(sphere.center);
    this.#camera.position.copy(sphere.center).addScaledVector(VIEW_DIRECTION, dist);
    this.#camera.near = dist / 100;
    this.#camera.far = dist * 10;
    this.#camera.updateProjectionMatrix();
    this.#controls.update();
    this.invalidate();
  }

  async exportGLB() {
    if (!this.#model) return null;
    return new GLTFExporter().parseAsync(this.#model.object, { binary: true });
  }

  invalidate() {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#controls.update(); // при затухании сам вызовет change → следующий кадр
      this.#renderer.render(this.#scene, this.#camera);
      this.#labels.render(this.#scene, this.#camera);
    });
  }

  #setModel(model) {
    if (this.#model) {
      this.#scene.remove(this.#model.object, this.#model.labels);
      this.#model.dispose();
    }
    this.#model = model;
    if (model) this.#scene.add(model.object, model.labels);
  }

  #fitShadows(size) {
    const half = size * 0.8;
    const cam = this.#sun.shadow.camera;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.near = 0.1; cam.far = size * 4;
    cam.updateProjectionMatrix();
    this.#sun.position.set(size * 0.6, size * 1.4, size * 0.4);
    this.#ground.scale.set(size * 4, size * 4, 1);
  }

  #roomAt(e) {
    if (!this.#model) return 0;
    const r = this.#renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.#raycaster.setFromCamera(ndc, this.#camera);
    const hit = this.#raycaster.intersectObjects(this.#model.floors, false)[0];
    return hit ? hit.object.userData.zoneId : 0;
  }

  #resize() {
    const { clientWidth: w, clientHeight: h } = this.#host;
    if (!w || !h) return;
    this.#renderer.setSize(w, h);
    this.#labels.setSize(w, h);
    this.#camera.aspect = w / h;
    this.#camera.updateProjectionMatrix();
    this.invalidate();
  }
}
