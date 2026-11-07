import * as THREE from "three";
import type { Scene } from "./types";

export interface TerrainBundle {
  mesh: THREE.Mesh;
  baseY: Float32Array;
  grid: Float32Array;
}

const LAND_STOPS: Array<[number, [number, number, number]]> = [
  [0, [214, 196, 164]],
  [1.5, [186, 170, 126]],
  [4, [142, 158, 104]],
  [10, [86, 132, 92]],
  [22, [70, 108, 90]],
  [40, [122, 118, 110]],
  [58, [168, 164, 156]],
];

const WATER: [number, number, number] = [62, 122, 140];

export function sampleNearest(
  grid: Float32Array,
  width: number,
  height: number,
  x: number,
  z: number,
): number {
  const col = Math.round(x);
  const row = Math.round(height - 1 - z);
  if (col < 0 || row < 0 || col >= width || row >= height) return Number.NaN;
  return grid[row * width + col];
}

/** Bilinear land height, then the nearest cell, then 0 on sea-coded cells. */
export function sampleSurface(
  grid: Float32Array,
  width: number,
  height: number,
  x: number,
  z: number,
): number {
  const bilinear = sampleElevation(grid, width, height, x, z);
  if (Number.isFinite(bilinear)) return bilinear;
  const nearest = sampleNearest(grid, width, height, x, z);
  return Number.isFinite(nearest) ? nearest : 0;
}

export function sampleElevation(
  grid: Float32Array,
  width: number,
  height: number,
  x: number,
  z: number,
): number {
  const col = x;
  const row = height - 1 - z;
  if (col < 0 || row < 0 || col > width - 1 || row > height - 1) return Number.NaN;
  const c0 = Math.floor(col);
  const r0 = Math.floor(row);
  const c1 = Math.min(c0 + 1, width - 1);
  const r1 = Math.min(r0 + 1, height - 1);
  const tx = col - c0;
  const ty = row - r0;
  const v00 = grid[r0 * width + c0];
  const v10 = grid[r0 * width + c1];
  const v01 = grid[r1 * width + c0];
  const v11 = grid[r1 * width + c1];
  if (![v00, v10, v01, v11].every(Number.isFinite)) return Number.NaN;
  return (
    v00 * (1 - tx) * (1 - ty) +
    v10 * tx * (1 - ty) +
    v01 * (1 - tx) * ty +
    v11 * tx * ty
  );
}

function landRgb(elevation: number): [number, number, number] {
  let lower = LAND_STOPS[0];
  let upper = LAND_STOPS[LAND_STOPS.length - 1];
  for (let i = 0; i < LAND_STOPS.length - 1; i += 1) {
    if (elevation >= LAND_STOPS[i][0] && elevation <= LAND_STOPS[i + 1][0]) {
      lower = LAND_STOPS[i];
      upper = LAND_STOPS[i + 1];
      break;
    }
  }
  const span = upper[0] - lower[0] || 1;
  const t = THREE.MathUtils.clamp((elevation - lower[0]) / span, 0, 1);
  return [
    lower[1][0] + (upper[1][0] - lower[1][0]) * t,
    lower[1][1] + (upper[1][1] - lower[1][1]) * t,
    lower[1][2] + (upper[1][2] - lower[1][2]) * t,
  ];
}

function shadeAt(
  grid: Float32Array,
  width: number,
  height: number,
  col: number,
  row: number,
  elevation: number,
): number {
  const at = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= width || r >= height) return elevation;
    const value = grid[r * width + c];
    return Number.isFinite(value) ? value : 0;
  };
  const dx = (at(col + 1, row) - at(col - 1, row)) / 2;
  const dz = (at(col, row - 1) - at(col, row + 1)) / 2;
  const nx = -dx;
  const ny = 1;
  const nz = -dz;
  const length = Math.hypot(nx, ny, nz) || 1;
  const lx = 0.25;
  const ly = 0.86;
  const lz = -0.44;
  const light = Math.hypot(lx, ly, lz);
  const dot = (nx / length) * (lx / light) + (ny / length) * (ly / light) + (nz / length) * (lz / light);
  return THREE.MathUtils.clamp(0.62 + dot * 0.48, 0.45, 1.18);
}

export function buildTerrain(grid: Float32Array, scene: Scene): TerrainBundle {
  const { width, height } = scene.terrain;
  const count = width * height;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const baseY = new Float32Array(count);

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const index = row * width + col;
      const elevation = grid[index];
      const water = !Number.isFinite(elevation);
      const y = water ? 0 : elevation;
      baseY[index] = y;
      positions[index * 3] = col;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = height - 1 - row;
      const rgb = water ? WATER : landRgb(y);
      const shade = water ? 1 : shadeAt(grid, width, height, col, row, y);
      colors[index * 3] = (rgb[0] / 255) * shade;
      colors[index * 3 + 1] = (rgb[1] / 255) * shade;
      colors[index * 3 + 2] = (rgb[2] / 255) * shade;
    }
  }

  const quads = (width - 1) * (height - 1);
  const indices = new Uint32Array(quads * 6);
  let offset = 0;
  for (let row = 0; row < height - 1; row += 1) {
    for (let col = 0; col < width - 1; col += 1) {
      const a = row * width + col;
      const b = a + 1;
      const c = a + width;
      const d = c + 1;
      indices[offset++] = a;
      indices[offset++] = b;
      indices[offset++] = d;
      indices[offset++] = a;
      indices[offset++] = d;
      indices[offset++] = c;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "terrain";
  return { mesh, baseY, grid };
}

export function applyExaggeration(mesh: THREE.Mesh, baseY: Float32Array, exaggeration: number): void {
  const position = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < baseY.length; i += 1) {
    position.setY(i, baseY[i] * exaggeration);
  }
  position.needsUpdate = true;
}

type EdgeName = "top" | "right" | "bottom" | "left";

const CONTOUR_LINES: Record<number, Array<[EdgeName, EdgeName]>> = {
  1: [["left", "top"]],
  2: [["top", "right"]],
  3: [["left", "right"]],
  4: [["right", "bottom"]],
  5: [["left", "top"], ["right", "bottom"]],
  6: [["top", "bottom"]],
  7: [["left", "bottom"]],
  8: [["bottom", "left"]],
  9: [["top", "bottom"]],
  10: [["top", "right"], ["left", "bottom"]],
  11: [["right", "bottom"]],
  12: [["left", "right"]],
  13: [["top", "right"]],
  14: [["top", "left"]],
};

export interface HeightOverlay {
  line: THREE.LineSegments;
  baseY: Float32Array;
  lift: number;
}

export function applyOverlayScale(overlay: HeightOverlay, exaggeration: number): void {
  const position = overlay.line.geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < overlay.baseY.length; index += 1) {
    position.setY(index, overlay.baseY[index] * exaggeration + overlay.lift);
  }
  position.needsUpdate = true;
}

function overlayFromRuns(
  runs: Array<Array<[number, number, number]>>,
  color: number,
  opacity: number,
  lift: number,
  name: string,
): HeightOverlay {
  const positions: number[] = [];
  const base: number[] = [];
  for (const run of runs) {
    for (let index = 1; index < run.length; index += 1) {
      const previous = run[index - 1];
      const current = run[index];
      positions.push(previous[0], previous[1] + lift, previous[2], current[0], current[1] + lift, current[2]);
      base.push(previous[1], current[1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
  });
  const line = new THREE.LineSegments(geometry, material);
  line.name = name;
  return { line, baseY: Float32Array.from(base), lift };
}

export function buildContours(
  grid: Float32Array,
  width: number,
  height: number,
  interval: number,
): HeightOverlay {
  const positions: number[] = [];
  const base: number[] = [];
  for (let level = interval; level < 60; level += interval) {
    for (let row = 0; row < height - 1; row += 1) {
      for (let col = 0; col < width - 1; col += 1) {
        const v00 = grid[row * width + col];
        const v10 = grid[row * width + col + 1];
        const v01 = grid[(row + 1) * width + col];
        const v11 = grid[(row + 1) * width + col + 1];
        if (![v00, v10, v01, v11].every(Number.isFinite)) continue;
        let mask = 0;
        if (v00 >= level) mask |= 1;
        if (v10 >= level) mask |= 2;
        if (v11 >= level) mask |= 4;
        if (v01 >= level) mask |= 8;
        const lines = CONTOUR_LINES[mask];
        if (!lines) continue;
        const x0 = col;
        const x1 = col + 1;
        const z0 = height - 1 - row;
        const z1 = z0 - 1;
        const point = (edge: EdgeName): [number, number] => {
          if (edge === "top") return [lerp(x0, x1, level, v00, v10), z0];
          if (edge === "bottom") return [lerp(x0, x1, level, v01, v11), z1];
          if (edge === "left") return [x0, lerp(z0, z1, level, v00, v01)];
          return [x1, lerp(z0, z1, level, v10, v11)];
        };
        for (const [start, end] of lines) {
          const a = point(start);
          const b = point(end);
          positions.push(a[0], level, a[1], b[0], level, b[1]);
          base.push(level, level);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0xf4efe4,
    transparent: true,
    opacity: 0.72,
  });
  const line = new THREE.LineSegments(geometry, material);
  line.name = "contours";
  return { line, baseY: Float32Array.from(base), lift: 0.45 };
}

function lerp(start: number, end: number, level: number, valueStart: number, valueEnd: number): number {
  const denom = valueEnd - valueStart;
  if (denom === 0) return start;
  const t = (level - valueStart) / denom;
  return start + (end - start) * t;
}

function heightRuns(
  grid: Float32Array,
  width: number,
  height: number,
  lines: Array<Array<[number, number]>>,
): Array<Array<[number, number, number]>> {
  return lines.map((line) =>
    line.map(([x, z]) => {
      return [x, sampleSurface(grid, width, height, x, z), z];
    }),
  );
}

export function buildWireframe(
  grid: Float32Array,
  width: number,
  height: number,
  step: number,
): HeightOverlay {
  const lines: Array<Array<[number, number]>> = [];
  for (let x = 0; x < width; x += step) {
    const coords: Array<[number, number]> = [];
    for (let z = 0; z < height; z += 4) coords.push([x, z]);
    coords.push([x, height - 1]);
    lines.push(coords);
  }
  for (let z = 0; z < height; z += step) {
    const coords: Array<[number, number]> = [];
    for (let x = 0; x < width; x += 4) coords.push([x, z]);
    coords.push([width - 1, z]);
    lines.push(coords);
  }
  return overlayFromRuns(heightRuns(grid, width, height, lines), 0xf7f1e4, 0.55, 0.35, "wireframe");
}

export function buildGrid(grid: Float32Array, width: number, height: number): HeightOverlay {
  const lines: Array<Array<[number, number]>> = [];
  for (let x = 0; x <= width; x += 100) {
    const clampedX = Math.min(x, width - 1);
    const coords: Array<[number, number]> = [];
    for (let z = 0; z < height; z += 8) coords.push([clampedX, z]);
    coords.push([clampedX, height - 1]);
    lines.push(coords);
  }
  for (let z = 0; z <= height; z += 100) {
    const clampedZ = Math.min(z, height - 1);
    const coords: Array<[number, number]> = [];
    for (let x = 0; x < width; x += 8) coords.push([x, clampedZ]);
    coords.push([width - 1, clampedZ]);
    lines.push(coords);
  }
  return overlayFromRuns(heightRuns(grid, width, height, lines), 0xfffaf3, 0.45, 0.55, "grid");
}
