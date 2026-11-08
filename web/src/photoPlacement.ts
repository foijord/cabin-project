/**
 * Floor placement for the photo-estimated buildings.
 *
 * The footprint is a community outline. The floor height is a sample of the
 * existing DTM, not a surveyed finished-floor level. Wall and roof metres live
 * in the config and are estimates.
 */

export interface FloorSpec {
  /** 0–1. The floor sits at this height percentile under the footprint. */
  percentile: number;
  /** 0–1. The foundation skirt tries to reach down to this percentile. */
  foundationPercentile: number;
  maxFoundationM: number;
  /** Optional NN2000 floor that the percentile is not allowed to undercut. */
  minFloorM: number | null;
}

export interface FloorPlacement {
  floorM: number;
  foundationM: number;
  minM: number;
  maxM: number;
  sampleCount: number;
}

export interface PhotoFeature {
  kind: "skylight" | "vent";
  /** Local east, north. Approximate position on the roof. */
  at: [number, number];
  /** East-west, up, north-south size in metres. Estimates. */
  sizeM: [number, number, number];
  color: string;
}

export interface PhotoBuildingSpec {
  id: string;
  label: string;
  role: "cabin" | "annex" | "boathouse";
  registerBygningsnummer: string;
  osmWayId: number;
  /** Local metres: x east, z north. Open ring, not closed. */
  footprint: number[][];
  wallColor: string;
  roofColor: string;
  foundationColor: string;
  /** Estimate. Metres from the placed floor to the eave. */
  wallHeightM: number;
  /** Estimate. Extra metres from the eave to the high part of the roof. */
  roofRiseM: number;
  roofForm: "shed-north" | "gable";
  roofOverhangM: number;
  floor: FloorSpec;
  dimensionsAreEstimates: true;
  identification: string;
  estimates: {
    footprint: string;
    height: string;
    color: string;
  };
  features?: PhotoFeature[];
}

export interface PhotoBuildingFile {
  disclaimer: string;
  generatedNote: string;
  buildings: PhotoBuildingSpec[];
}

export function ringContains(x: number, z: number, ring: number[][]): boolean {
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

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0];
  const clamped = Math.min(1, Math.max(0, p));
  const index = (sorted.length - 1) * clamped;
  const low = Math.floor(index);
  const high = Math.min(sorted.length - 1, low + 1);
  const t = index - low;
  return sorted[low] * (1 - t) + sorted[high] * t;
}

export function placeFloor(samples: number[], spec: FloorSpec): FloorPlacement {
  const finite = samples.filter((value) => Number.isFinite(value));
  if (finite.length === 0) {
    return { floorM: Number.NaN, foundationM: 0, minM: Number.NaN, maxM: Number.NaN, sampleCount: 0 };
  }
  const sorted = [...finite].sort((a, b) => a - b);
  let floor = percentile(sorted, spec.percentile);
  if (spec.minFloorM !== null && Number.isFinite(spec.minFloorM)) {
    floor = Math.max(floor, spec.minFloorM);
  }
  const low = percentile(sorted, spec.foundationPercentile);
  const foundation = Math.min(spec.maxFoundationM, Math.max(0, floor - low));
  return {
    floorM: floor,
    foundationM: foundation,
    minM: sorted[0],
    maxM: sorted[sorted.length - 1],
    sampleCount: sorted.length,
  };
}

export function collectFloorSamples(
  ring: number[][],
  sampleAt: (x: number, z: number) => number,
  step = 0.5,
): number[] {
  if (ring.length < 3) return [];
  const xs = ring.map((point) => point[0]);
  const zs = ring.map((point) => point[1]);
  const samples: number[] = [];
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const z0 = Math.min(...zs);
  const z1 = Math.max(...zs);
  for (let x = x0; x <= x1 + 1e-6; x += step) {
    for (let z = z0; z <= z1 + 1e-6; z += step) {
      if (!ringContains(x, z, ring)) continue;
      const value = sampleAt(x, z);
      if (Number.isFinite(value)) samples.push(value);
    }
  }
  return samples;
}

/** How the placed shell meets the DTM samples. Positive gap is floating. */
export function groundFit(
  samples: number[],
  floorM: number,
  foundationM: number,
  roofTopM: number,
): { samples: number; floating: number; throughRoof: number } {
  let floating = 0;
  let throughRoof = 0;
  for (const sample of samples) {
    if (sample < floorM - foundationM - 0.35) floating += 1;
    if (sample > roofTopM + 0.15) throughRoof += 1;
  }
  return { samples: samples.length, floating, throughRoof };
}
