import * as THREE from "three";
import { ShapeUtils, Vector2 } from "three";
import type { Scene } from "./types";
import { sampleSurface, worldZFromNorth } from "./terrain";
import photoFile from "./photo-buildings.json";
import {
  collectFloorSamples,
  placeFloor,
  type FloorPlacement,
  type PhotoBuildingFile,
  type PhotoBuildingSpec,
} from "./photoPlacement";

export const photoBuildings = photoFile as PhotoBuildingFile;

export interface PhotoBase {
  object: THREE.Object3D;
  base: number;
}

export interface PhotoModelSet {
  group: THREE.Group;
  bases: PhotoBase[];
  modeledNumbers: Set<string>;
  placements: Array<FloorPlacement & { id: string }>;
}

export function buildPhotoModels(sceneData: Scene, grid: Float32Array): PhotoModelSet {
  const width = sceneData.terrain.width;
  const height = sceneData.terrain.height;
  const cell = sceneData.terrain.cellSizeM || 1;
  const group = new THREE.Group();
  group.name = "photo-buildings";
  const bases: PhotoBase[] = [];
  const placements: PhotoModelSet["placements"] = [];
  const modeledNumbers = new Set<string>();

  for (const spec of photoBuildings.buildings) {
    const samples = collectFloorSamples(spec.footprint, (x, z) =>
      sampleSurface(grid, width, height, x, z, cell),
    );
    const placed = placeFloor(samples, spec.floor);
    const floor = Number.isFinite(placed.floorM) ? placed.floorM : 0;
    const building = new THREE.Group();
    building.name = spec.id;
    building.position.y = floor;
    building.userData.estimate = true;
    building.userData.placement = placed;
    addShell(building, spec, placed.foundationM);
    group.add(building);
    bases.push({ object: building, base: floor });
    placements.push({ id: spec.id, ...placed, floorM: floor });
    modeledNumbers.add(spec.registerBygningsnummer);
  }

  return { group, bases, modeledNumbers, placements };
}

function addShell(group: THREE.Group, spec: PhotoBuildingSpec, foundation: number): void {
  const ring = spec.footprint.map((point) => [point[0], point[1]] as [number, number]);
  const split = splitShell(spec, ring, foundation);
  group.add(painted(split.walls, spec.wallColor, "walls"));
  group.add(painted(split.roof, spec.roofColor, "roof"));
  if (split.foundation.length > 0) group.add(painted(split.foundation, spec.foundationColor, "foundation"));
  for (const feature of spec.features ?? []) {
    const [width, height, depth] = feature.sizeM;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshBasicMaterial({ color: feature.color }),
    );
    const [x, z] = feature.at;
    const roofY = roofHeightAt(spec, ring, z) + height / 2;
    box.position.set(x, roofY, worldZFromNorth(z));
    box.name = feature.kind;
    group.add(box);
  }
}

interface SplitShell {
  walls: number[];
  roof: number[];
  foundation: number[];
}

function splitShell(spec: PhotoBuildingSpec, ring: Array<[number, number]>, foundation: number): SplitShell {
  const walls: number[] = [];
  const roof: number[] = [];
  const foundationPositions: number[] = [];
  if (spec.roofForm === "gable" && ring.length === 4) {
    const offset = offsetRing(ring, spec.roofOverhangM);
    addGableWalls(walls, ring, spec.wallHeightM);
    addGableEnds(walls, ring, spec.wallHeightM, spec.roofRiseM);
    addGableRoof(roof, offset, spec.wallHeightM, spec.roofRiseM);
  } else {
    const zmin = Math.min(...ring.map((point) => point[1]));
    const zmax = Math.max(...ring.map((point) => point[1]));
    const roofAt = (z: number) => {
      const span = Math.max(zmax - zmin, 0.001);
      return spec.wallHeightM + spec.roofRiseM * (1 - (z - zmin) / span);
    };
    addSlopedWalls(walls, ring, roofAt);
    addSlopedCap(roof, offsetRing(ring, spec.roofOverhangM), roofAt);
  }
  if (foundation > 0) {
    addWalls(foundationPositions, ring, -foundation, 0);
    addCap(foundationPositions, ring, 0);
  }
  return { walls, roof, foundation: foundationPositions };
}

function roofHeightAt(spec: PhotoBuildingSpec, ring: Array<[number, number]>, z: number): number {
  if (spec.roofForm === "gable") return spec.wallHeightM + spec.roofRiseM * 0.55;
  const zmin = Math.min(...ring.map((point) => point[1]));
  const zmax = Math.max(...ring.map((point) => point[1]));
  const span = Math.max(zmax - zmin, 0.001);
  return spec.wallHeightM + spec.roofRiseM * (1 - (z - zmin) / span);
}

function painted(positions: number[], color: string, name: string): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
  );
  mesh.name = name;
  return mesh;
}

function pushTri(
  out: number[],
  x0: number,
  z0: number,
  y0: number,
  x1: number,
  z1: number,
  y1: number,
  x2: number,
  z2: number,
  y2: number,
): void {
  out.push(x0, y0, worldZFromNorth(z0), x1, y1, worldZFromNorth(z1), x2, y2, worldZFromNorth(z2));
}

function addWalls(out: number[], ring: Array<[number, number]>, y0: number, y1: number): void {
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    pushTri(out, a[0], a[1], y0, b[0], b[1], y0, b[0], b[1], y1);
    pushTri(out, a[0], a[1], y0, b[0], b[1], y1, a[0], a[1], y1);
  }
}

function addSlopedWalls(
  out: number[],
  ring: Array<[number, number]>,
  roofAt: (z: number) => number,
): void {
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    pushTri(out, a[0], a[1], 0, b[0], b[1], 0, b[0], b[1], roofAt(b[1]));
    pushTri(out, a[0], a[1], 0, b[0], b[1], roofAt(b[1]), a[0], a[1], roofAt(a[1]));
  }
}

function orient(ring: Array<[number, number]>): Array<[number, number]> {
  return signedArea(ring) < 0 ? [...ring].reverse() : ring;
}

function addCap(out: number[], ring: Array<[number, number]>, y: number): void {
  const ordered = orient(ring);
  const contour = ordered.map((point) => new Vector2(point[0], point[1]));
  for (const [a, b, c] of ShapeUtils.triangulateShape(contour, [])) {
    const pa = ordered[a];
    const pb = ordered[b];
    const pc = ordered[c];
    pushTri(out, pa[0], pa[1], y, pb[0], pb[1], y, pc[0], pc[1], y);
  }
}

function addSlopedCap(out: number[], ring: Array<[number, number]>, roofAt: (z: number) => number): void {
  const ordered = orient(ring);
  const contour = ordered.map((point) => new Vector2(point[0], point[1]));
  for (const [a, b, c] of ShapeUtils.triangulateShape(contour, [])) {
    const pa = ordered[a];
    const pb = ordered[b];
    const pc = ordered[c];
    pushTri(out, pa[0], pa[1], roofAt(pa[1]), pb[0], pb[1], roofAt(pb[1]), pc[0], pc[1], roofAt(pc[1]));
  }
}

function longEdgeStart(ring: Array<[number, number]>): number {
  const length = (index: number) => {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  };
  return length(0) + length(2) >= length(1) + length(3) ? 0 : 1;
}

function addGableWalls(out: number[], ring: Array<[number, number]>, wall: number): void {
  addWalls(out, ring, 0, wall);
}

function addGableEnds(out: number[], ring: Array<[number, number]>, wall: number, rise: number): void {
  const start = longEdgeStart(ring);
  for (const short of [start + 1, start + 3]) {
    const a = ring[short % 4];
    const b = ring[(short + 1) % 4];
    const ridge: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    pushTri(out, a[0], a[1], wall, b[0], b[1], wall, ridge[0], ridge[1], wall + rise);
  }
}

function addGableRoof(out: number[], ring: Array<[number, number]>, wall: number, rise: number): void {
  const start = longEdgeStart(ring);
  const eaveA0 = ring[start];
  const eaveA1 = ring[(start + 1) % 4];
  const eaveB0 = ring[(start + 2) % 4];
  const eaveB1 = ring[(start + 3) % 4];
  const ridge0: [number, number] = [
    (eaveA1[0] + eaveB0[0]) / 2,
    (eaveA1[1] + eaveB0[1]) / 2,
  ];
  const ridge1: [number, number] = [
    (eaveB1[0] + eaveA0[0]) / 2,
    (eaveB1[1] + eaveA0[1]) / 2,
  ];
  const peak = wall + rise;
  pushTri(out, eaveA0[0], eaveA0[1], wall, eaveA1[0], eaveA1[1], wall, ridge0[0], ridge0[1], peak);
  pushTri(out, eaveA0[0], eaveA0[1], wall, ridge0[0], ridge0[1], peak, ridge1[0], ridge1[1], peak);
  pushTri(out, eaveB0[0], eaveB0[1], wall, eaveB1[0], eaveB1[1], wall, ridge1[0], ridge1[1], peak);
  pushTri(out, eaveB0[0], eaveB0[1], wall, ridge1[0], ridge1[1], peak, ridge0[0], ridge0[1], peak);
}

function signedArea(ring: Array<[number, number]>): number {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

function outward(a: [number, number], b: [number, number], ccw: boolean): [number, number] {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz) || 1;
  return ccw ? [dz / length, -dx / length] : [-dz / length, dx / length];
}

function offsetRing(ring: Array<[number, number]>, overhang: number): Array<[number, number]> {
  if (overhang <= 0) return ring;
  const ccw = signedArea(ring) > 0;
  return ring.map((point, index) => {
    const previous = ring[(index - 1 + ring.length) % ring.length];
    const next = ring[(index + 1) % ring.length];
    const n0 = outward(previous, point, ccw);
    const n1 = outward(point, next, ccw);
    return [point[0] + (n0[0] + n1[0]) * overhang, point[1] + (n0[1] + n1[1]) * overhang];
  });
}
