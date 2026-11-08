import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { BuildingRecord, RingPolygon, Scene } from "./types";
import {
  BOUNDARY_CLEARANCE_M,
  BOUNDARY_SAMPLE_M,
  densifyClosedRing,
} from "./drape";
import { buildPhotoModels } from "./photoBuildings";
import {
  applyExaggeration,
  applyOverlayScale,
  buildContours,
  buildGrid,
  buildTerrain,
  buildWireframe,
  sampleNearest,
  sampleSurface,
  worldZFromNorth,
  type HeightOverlay,
  type TerrainBundle,
} from "./terrain";

export interface Viewer {
  setExaggeration(value: number): void;
  setRelief(enabled: boolean): void;
  setContours(enabled: boolean, interval: number): void;
  setWireframe(enabled: boolean): void;
  setGrid(enabled: boolean): void;
  setParcels(enabled: boolean): void;
  setBuildings(enabled: boolean): void;
  setPhotoModels(enabled: boolean): void;
  frameProperty(): void;
  frameContext(): void;
  dispose(): void;
}

interface Marker {
  object: THREE.Object3D;
  building: BuildingRecord;
  base: number;
}

const CLAY = new THREE.Color("#cbbfaa");

export function createViewer(canvas: HTMLCanvasElement, sceneData: Scene, grid: Float32Array): Viewer {
  const width = sceneData.terrain.width;
  const height = sceneData.terrain.height;
  const cell = sceneData.terrain.cellSizeM || 1;
  const span = Math.max((width - 1) * cell, (height - 1) * cell);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0xc5d5da, 1);

  const scene = new THREE.Scene();
  // Fog starts beyond the far side of the model, so an overview stays clear.
  scene.fog = new THREE.Fog(0xc5d5da, span * 2.4, span * 3.6);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.35, 2500);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 12;
  controls.maxDistance = span * 2.6;
  controls.screenSpacePanning = true;

  const terrain: TerrainBundle = buildTerrain(grid, sceneData);
  scene.add(terrain.mesh);
  const gridOverlay = buildGrid(grid, width, height, cell);
  scene.add(gridOverlay.line);

  let contours: HeightOverlay | null = null;
  let contourInterval = 5;
  let wire: HeightOverlay | null = null;
  let exaggeration = 1;

  const parcelGroup = new THREE.Group();
  parcelGroup.name = "parcels";
  scene.add(parcelGroup);
  const subjectFill = buildParcelFill(sceneData.teig.polygons, grid, width, height, cell);
  parcelGroup.add(subjectFill);
  const subjectLines = buildBoundaryLines(
    sceneData.teig.polygons,
    grid,
    width,
    height,
    0x6a3a28,
    cell,
  );
  for (const line of subjectLines) parcelGroup.add(line);
  const contextLines = sceneData.contextParcels.flatMap((parcel) =>
    buildBoundaryLines(parcel.polygons, grid, width, height, 0xe4ddd2, cell),
  );
  for (const line of contextLines) parcelGroup.add(line);

  const buildingGroup = new THREE.Group();
  buildingGroup.name = "buildings";
  scene.add(buildingGroup);
  const markers = addBuildings(sceneData, buildingGroup);
  const photoModels = buildPhotoModels(sceneData, grid);
  buildingGroup.add(photoModels.group);
  const northMarker = addNorthMarker(grid, width, height, cell);
  scene.add(northMarker.object);

  const northArrow = document.querySelector<HTMLElement>("#north-arrow");
  const scaleBar = document.querySelector<HTMLElement>("#scale-bar");
  const scaleLabel = document.querySelector<HTMLElement>("#scale-label");
  const readout = document.querySelector<HTMLElement>("#readout");

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function resize() {
    const rect = canvas.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / Math.max(rect.height, 1);
    camera.updateProjectionMatrix();
  }

  function refreshHeights() {
    applyExaggeration(terrain.mesh, terrain.baseY, exaggeration);
    applyOverlayScale(gridOverlay, exaggeration);
    if (contours) applyOverlayScale(contours, exaggeration);
    if (wire) applyOverlayScale(wire, exaggeration);
    drapeObject(subjectFill, exaggeration);
    for (const line of subjectLines) drapeObject(line, exaggeration);
    for (const line of contextLines) drapeObject(line, exaggeration);
    for (const marker of markers) {
      marker.object.position.y = marker.base * exaggeration;
    }
    for (const model of photoModels.bases) {
      model.object.position.y = model.base * exaggeration;
    }
    northMarker.object.position.y = northMarker.base * exaggeration + 0.8;
    controls.target.y = (sceneData.property.terrainM ?? 4) * exaggeration;
  }

  function ensureContours(interval: number) {
    if (contours && contourInterval === interval) return;
    if (contours) {
      scene.remove(contours.line);
      contours.line.geometry.dispose();
      (contours.line.material as THREE.Material).dispose();
    }
    contours = buildContours(grid, width, height, interval, cell);
    contourInterval = interval;
    applyOverlayScale(contours, exaggeration);
    scene.add(contours.line);
  }

  function frameProperty() {
    const y = (sceneData.property.terrainM ?? 4) * exaggeration;
    controls.target.set(sceneData.property.x, y, worldZFromNorth(sceneData.property.z));
    // South of the cabin, on the land side, looking north toward the fjord.
    camera.position.set(sceneData.property.x - 8, y + 36, worldZFromNorth(sceneData.property.z) + 62);
    camera.lookAt(controls.target);
    controls.update();
  }

  function frameContext() {
    const y = (sceneData.property.terrainM ?? 4) * exaggeration;
    controls.target.set(sceneData.property.x, y, worldZFromNorth(sceneData.property.z));
    const distance = span * 0.92;
    camera.position.set(
      sceneData.property.x - span * 0.04,
      y + distance * 0.78,
      worldZFromNorth(sceneData.property.z) + distance * 0.72,
    );
    camera.lookAt(controls.target);
    controls.update();
  }

  function updateHud() {
    if (northArrow) {
      camera.updateMatrixWorld();
      const origin = controls.target.clone();
      const northPoint = origin.clone().add(new THREE.Vector3(0, 0, -40));
      origin.project(camera);
      northPoint.project(camera);
      const dx = northPoint.x - origin.x;
      const dy = northPoint.y - origin.y;
      const angle = Math.atan2(dx, dy);
      northArrow.style.transform = `rotate(${angle}rad)`;
    }
    if (scaleBar && scaleLabel) {
      const distance = camera.position.distanceTo(controls.target);
      const metresPerPixel =
        (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance) /
        Math.max(canvas.clientHeight, 1);
      const targetPx = 110;
      const raw = metresPerPixel * targetPx;
      const nice = niceLength(raw);
      const px = nice / metresPerPixel;
      scaleBar.style.width = `${px}px`;
      scaleLabel.textContent = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`;
    }
  }

  function describePointer(event: PointerEvent) {
    if (!readout) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = marchHeight(raycaster.ray);
    if (!hit) {
      readout.textContent = "Above the terrain";
      return;
    }
    const localNorth = -hit.z;
    const nearest = sampleNearest(grid, width, height, hit.x, localNorth, cell);
    const easting = sceneData.terrain.westCellCenterEasting + hit.x;
    const northing = sceneData.terrain.southCellCenterNorthing + localNorth;
    const inside = pointInPolygons(hit.x, localNorth, sceneData.teig.polygons);
    const place = inside ? "inside 437/109" : "outside 437/109";
    const heightText = Number.isFinite(nearest) ? `${nearest.toFixed(1)} m NN2000` : "sea (DTM value 0)";
    const building = nearestBuilding(hit.x, localNorth, sceneData.buildings);
    const buildingText = building ? ` · building ${building.bygningsnummer} ${building.bygningsstatus}` : "";
    readout.textContent = `${heightText} · ${Math.round(easting)} E, ${Math.round(northing)} N · ${place}${buildingText}`;
  }

  function marchHeight(ray: THREE.Ray): THREE.Vector3 | null {
    const direction = ray.direction;
    let distance = 0;
    for (let step = 0; step < 70; step += 1) {
      const x = ray.origin.x + direction.x * distance;
      const y = ray.origin.y + direction.y * distance;
      const z = ray.origin.z + direction.z * distance;
      const localNorth = -z;
      const inside = x >= 0 && localNorth >= 0 && x <= (width - 1) * cell && localNorth <= (height - 1) * cell;
      if (!inside) {
        if (distance > 30) return null;
        distance += 15;
        continue;
      }
      const surface = sampleSurface(grid, width, height, x, localNorth, cell) * exaggeration;
      if (y <= surface) return new THREE.Vector3(x, surface, z);
      distance += Math.min(30, Math.max(1.2, (y - surface) * 0.5));
    }
    return null;
  }

  canvas.addEventListener("pointermove", describePointer);

  let running = true;
  function animate() {
    if (!running) return;
    controls.update();
    updateHud();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  let showPhotoModels = true;
  function applyPhotoModels() {
    photoModels.group.visible = showPhotoModels;
    for (const marker of markers) {
      if (photoModels.modeledNumbers.has(marker.building.bygningsnummer)) {
        marker.object.visible = !showPhotoModels;
      }
    }
  }

  resize();
  refreshHeights();
  applyPhotoModels();
  frameContext();
  if (new URLSearchParams(window.location.search).get("topdown") === "1") {
    const px = sceneData.property.x;
    const pz = sceneData.property.z;
    const marker = (x: number, z: number, color: number, name: string) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(4, 20, 16),
        new THREE.MeshBasicMaterial({ color }),
      );
      mesh.position.set(x, 30, worldZFromNorth(z));
      mesh.name = name;
      scene.add(mesh);
    };
    marker(px + 50, pz, 0xff1744, "east");
    marker(px - 50, pz, 0xffea00, "west");
    marker(px, pz + 50, 0x2962ff, "north");
    marker(px, pz - 50, 0x00c853, "south");
    scene.fog = null;
    document.querySelectorAll<HTMLElement>(".panel, .hud").forEach((element) => {
      element.style.display = "none";
    });
    // Geographic north is -Z. Point the camera's up axis that way so north is at the top.
    camera.up.set(0, 0, -1);
    camera.fov = 14;
    camera.position.set(px, 520, worldZFromNorth(pz));
    camera.lookAt(px, 0, worldZFromNorth(pz));
    camera.updateProjectionMatrix();
    controls.enabled = false;
  }
  animate();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  return {
    setExaggeration(value: number) {
      const previous = exaggeration || 1;
      const offset = camera.position.clone().sub(controls.target);
      offset.y *= value / previous;
      exaggeration = value;
      refreshHeights();
      camera.position.copy(controls.target).add(offset);
    },
    setRelief(enabled: boolean) {
      const material = terrain.mesh.material as THREE.MeshBasicMaterial;
      material.vertexColors = enabled;
      material.color.copy(enabled ? new THREE.Color(0xffffff) : CLAY);
      material.needsUpdate = true;
    },
    setContours(enabled: boolean, interval: number) {
      if (enabled) ensureContours(interval);
      if (contours) contours.line.visible = enabled;
    },
    setWireframe(enabled: boolean) {
      if (enabled && !wire) {
        wire = buildWireframe(grid, width, height, 10, cell);
        applyOverlayScale(wire, exaggeration);
        scene.add(wire.line);
      }
      if (wire) wire.line.visible = enabled;
    },
    setGrid(enabled: boolean) {
      gridOverlay.line.visible = enabled;
    },
    setParcels(enabled: boolean) {
      parcelGroup.visible = enabled;
    },
    setBuildings(enabled: boolean) {
      buildingGroup.visible = enabled;
    },
    setPhotoModels(enabled: boolean) {
      showPhotoModels = enabled;
      applyPhotoModels();
    },
    frameProperty,
    frameContext,
    dispose() {
      running = false;
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
    },
  };
}

function drapeObject(object: THREE.Object3D, exaggeration: number) {
  const geometry = (object as THREE.Mesh | THREE.Line).geometry as THREE.BufferGeometry | undefined;
  const base = object.userData.baseY as Float32Array | undefined;
  const lift = (object.userData.lift as number | undefined) ?? 0;
  if (!geometry || !base) return;
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < base.length; index += 1) {
    position.setY(index, base[index] * exaggeration + lift);
  }
  position.needsUpdate = true;
}

function buildParcelFill(
  polygons: RingPolygon[],
  grid: Float32Array,
  width: number,
  height: number,
  cellSize: number,
): THREE.Mesh {
  const ring = openRing(densifyClosedRing(polygons[0]?.exterior ?? [], BOUNDARY_SAMPLE_M));
  const shape = new THREE.Shape();
  if (ring.length) {
    shape.moveTo(ring[0][0], ring[0][1]);
    for (const [x, z] of ring.slice(1)) shape.lineTo(x, z);
  }
  const geometry = new THREE.ShapeGeometry(shape);
  // Shape Y is metres north. rotateX(-90°) maps that to world Z = -north.
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const base = new Float32Array(position.count);
  for (let index = 0; index < position.count; index += 1) {
    base[index] = sampleSurface(grid, width, height, position.getX(index), -position.getZ(index), cellSize);
    position.setY(index, base[index] + 0.2);
  }
  const material = new THREE.MeshBasicMaterial({
    color: 0xe39a4a,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.baseY = base;
  mesh.userData.lift = 0.2;
  mesh.renderOrder = 2;
  return mesh;
}

function buildBoundaryLines(
  polygons: RingPolygon[],
  grid: Float32Array,
  width: number,
  height: number,
  color: number,
  cellSize: number,
): THREE.Line[] {
  const lines: THREE.Line[] = [];
  const material = new THREE.LineBasicMaterial({
    color,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  for (const polygon of polygons) {
    for (const ring of [polygon.exterior, ...polygon.holes]) {
      const samples = densifyClosedRing(ring, BOUNDARY_SAMPLE_M);
      if (samples.length < 2) continue;
      const positions: number[] = [];
      const base: number[] = [];
      for (const [x, z] of samples) {
        const elevation = sampleSurface(grid, width, height, x, z, cellSize);
        positions.push(x, elevation + BOUNDARY_CLEARANCE_M, worldZFromNorth(z));
        base.push(elevation);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const line = new THREE.Line(geometry, material);
      line.userData.baseY = Float32Array.from(base);
      line.userData.lift = BOUNDARY_CLEARANCE_M;
      line.renderOrder = 4;
      lines.push(line);
    }
  }
  return lines;
}

function addNorthMarker(
  grid: Float32Array,
  width: number,
  height: number,
  cellSize: number,
): { object: THREE.Group; base: number } {
  const x = ((width - 1) * cellSize) * 0.5;
  const z = (height - 1) * cellSize - 16;
  const base = sampleSurface(grid, width, height, x, z, cellSize);
  const group = new THREE.Group();
  const green = new THREE.MeshBasicMaterial({ color: 0x1e6a52 });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 12), green);
  shaft.position.z = -2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(3.1, 7, 4), green);
  // Cone points +Y. -90° about X aims it at -Z, which is north.
  head.rotation.x = -Math.PI / 2;
  head.position.z = -7;
  shaft.position.z = 2;
  group.add(shaft, head);
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#1e6a52";
    context.font = "bold 84px Palatino, Georgia, serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("N", 64, 70);
  }
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }),
  );
  sprite.position.set(0, 6, -8);
  sprite.scale.set(8, 8, 1);
  group.add(sprite);
  group.position.set(x, base + 0.8, worldZFromNorth(z));
  return { object: group, base };
}

function addBuildings(sceneData: Scene, group: THREE.Group): Marker[] {
  const markers: Marker[] = [];
  for (const building of sceneData.buildings) {
    const base = building.terrainM ?? 0;
    const subject = building.onSubjectParcel;
    let object: THREE.Object3D;
    if (building.standingInRegister) {
      const radius = subject ? 1.15 : 0.55;
      const pole = subject ? 8 : 3.4;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, pole, subject ? 20 : 10),
        new THREE.MeshBasicMaterial({ color: subject ? 0x1f6b52 : 0x8ea399 }),
      );
      mesh.position.y = pole / 2;
      object = new THREE.Group();
      object.add(mesh);
      if (subject) {
        const disc = new THREE.Mesh(
          new THREE.CylinderGeometry(2.3, 2.3, 0.25, 24),
          new THREE.MeshBasicMaterial({ color: 0xc46a32 }),
        );
        disc.position.y = 0.2;
        object.add(disc);
      }
    } else {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(subject ? 2.4 : 1.3, subject ? 0.18 : 0.1, 8, 28),
        new THREE.MeshBasicMaterial({ color: subject ? 0xa1623b : 0xb7a48f }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.4;
      object = ring;
    }
    object.position.set(building.x, base, worldZFromNorth(building.z));
    group.add(object);
    markers.push({ object, building, base });
  }
  return markers;
}

function openRing(ring: number[][]): number[][] {
  if (ring.length > 1) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
  }
  return ring;
}

function pointInRing(x: number, z: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const zi = ring[i][1];
    const xj = ring[j][0];
    const zj = ring[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygons(x: number, z: number, polygons: RingPolygon[]): boolean {
  return polygons.some((polygon) => {
    if (!pointInRing(x, z, polygon.exterior)) return false;
    return !polygon.holes.some((hole) => pointInRing(x, z, hole));
  });
}

function nearestBuilding(x: number, z: number, buildings: BuildingRecord[]): BuildingRecord | null {
  let best: BuildingRecord | null = null;
  let bestDistance = 8;
  for (const building of buildings) {
    const distance = Math.hypot(building.x - x, building.z - z);
    if (distance < bestDistance) {
      best = building;
      bestDistance = distance;
    }
  }
  return best;
}

function niceLength(metres: number): number {
  const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  for (const step of steps) {
    if (metres <= step) return step;
  }
  return 1000;
}
