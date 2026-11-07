/** Metres between samples along a parcel edge. At or below the 1 m DTM cell. */
export const BOUNDARY_SAMPLE_M = 0.5;

/** Metres the boundary is lifted above the terrain surface. Tune this one value. */
export const BOUNDARY_CLEARANCE_M = 0.5;

export interface DrapedVertex {
  x: number;
  z: number;
  /** Terrain height before the clearance lift. */
  terrain: number;
  /** terrain + clearance. */
  y: number;
}

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

/** Insert points along each edge so no span is longer than `spacing` metres. */
export function densifyClosedRing(ring: number[][], spacing: number): number[][] {
  if (ring.length < 2) return ring.map(([x, z]) => [x, z]);
  const out: number[][] = [];
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x0, z0] = ring[index];
    const [x1, z1] = ring[index + 1];
    const length = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.ceil(length / spacing));
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      out.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
    }
  }
  const [x1, z1] = ring[ring.length - 1];
  out.push([x1, z1]);
  return out;
}

export function drapeBoundary(
  ring: number[][],
  terrainAt: (x: number, z: number) => number,
  spacing = BOUNDARY_SAMPLE_M,
  clearance = BOUNDARY_CLEARANCE_M,
): DrapedVertex[] {
  return densifyClosedRing(ring, spacing).map(([x, z]) => {
    const terrain = terrainAt(x, z);
    return { x, z, terrain, y: terrain + clearance };
  });
}
