import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { area, bounds, centroid, GeometryError } from '../geometry/polygon.js';
import { floorMesh, wallMesh } from '../geometry/room-mesh.js';

// 3D-модель помещений из зон с контуром. Рождается на каждое изменение плана, умирает в dispose() при замене.
// Метры: точка изображения × metersPerPixel; план центрируется в начале координат.
// Зоны без контура (из файла arr_*.js) и контуры, которые не удалось построить, перечислены в skipped с причиной.
export class RoomModel {
  object = new THREE.Group(); // то, что уходит в GLB
  labels = new THREE.Group(); // подписи — только для экрана
  floors = [];
  skipped = [];
  size = 0;
  #floorMaterials = new Map();
  #wallMaterial;

  static build(zones, { metersPerPixel, wallHeight, wallThickness, colorOf }) {
    const model = new RoomModel();
    model.#wallMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f3ef, roughness: 0.85 });
    const rooms = zones.filter((z) => {
      if (!z.polygon) model.skipped.push({ id: z.id, code: 'no_polygon' });
      return z.polygon;
    });
    if (!rooms.length) return model;

    const all = bounds(rooms.flatMap((z) => z.polygon));
    const cx = (all.minX + all.maxX) / 2, cy = (all.minY + all.maxY) / 2;
    const toMeters = (p) => ({ x: (p.x - cx) * metersPerPixel, y: (p.y - cy) * metersPerPixel });
    model.size = Math.max(all.maxX - all.minX, all.maxY - all.minY) * metersPerPixel;

    for (const zone of rooms) {
      const contour = zone.polygon.map(toMeters);
      try {
        model.#addRoom(zone, contour, { wallHeight, wallThickness, color: colorOf(zone.id) });
      } catch (e) {
        if (!(e instanceof GeometryError)) throw e;
        model.skipped.push({ id: zone.id, code: e.code });
      }
    }
    model.object.name = 'Plan';
    return model;
  }

  #addRoom(zone, contour, { wallHeight, wallThickness, color }) {
    const floorColor = new THREE.Color(color.hex).lerp(new THREE.Color(0xffffff), 0.35);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.7, emissive: 0x000000 });
    const floor = new THREE.Mesh(geometryOf(floorMesh(contour).positions), floorMaterial);
    floor.name = `Floor ${zone.id}${zone.name ? ` ${zone.name}` : ''}`;
    floor.receiveShadow = true;
    floor.userData.zoneId = zone.id;

    const walls = new THREE.Mesh(geometryOf(wallMesh(contour, { thickness: wallThickness, height: wallHeight }).positions), this.#wallMaterial);
    walls.name = `Walls ${zone.id}`;
    walls.castShadow = true;
    walls.receiveShadow = true;

    const room = new THREE.Group();
    room.name = zone.name || `Room ${zone.id}`;
    room.userData = { zoneId: zone.id, area: area(contour) };
    room.add(floor, walls);
    this.object.add(room);
    this.floors.push(floor);
    this.#floorMaterials.set(zone.id, floorMaterial);

    const c = centroid(contour);
    const tag = document.createElement('div');
    tag.className = 'room-label';
    tag.textContent = `${zone.name || `Зона ${zone.id}`} · ${area(contour).toFixed(1)} м²`;
    const label = new CSS2DObject(tag);
    label.position.set(c.x, 0.05, c.y);
    this.labels.add(label);
  }

  highlight(selected, hovered) {
    for (const [id, material] of this.#floorMaterials) {
      material.emissive.setHex(id === selected ? 0x2f6fed : id === hovered ? 0x335577 : 0x000000);
      material.emissiveIntensity = id === selected ? 0.35 : 0.25;
    }
  }

  dispose() {
    this.object.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
    for (const m of this.#floorMaterials.values()) m.dispose();
    this.#wallMaterial?.dispose();
    this.labels.traverse((o) => o.element?.remove());
  }
}

function geometryOf(positions) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.computeVertexNormals(); // вершины у граней не общие — нормали получаются плоскими
  return g;
}
