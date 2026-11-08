#!/usr/bin/env python3
"""The photo models stay tied to the register points and the existing DTM.

Footprints must contain their own Matrikkelen point and stay inside parcel
437/109. Neighbour buildings are not modelled. Floors come from the DTM
sample already in the viewer. A shell that floats clear of that sample, or
that is buried through the roof on more than a small rocky fraction, fails.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

NODE = r"""
import { readFileSync } from "node:fs";
import { sampleSurface } from "./web/src/drape.ts";
import {
  collectFloorSamples,
  groundFit,
  placeFloor,
  ringContains,
} from "./web/src/photoPlacement.ts";

const config = JSON.parse(readFileSync("./web/src/photo-buildings.json", "utf8"));
const scene = JSON.parse(readFileSync("./web/public/data/scene.json", "utf8"));
const bin = readFileSync("./web/public/data/terrain.bin");
const grid = new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4);
const width = scene.terrain.width;
const height = scene.terrain.height;
const cell = scene.terrain.cellSizeM;
const parcel = scene.teig.polygons[0].exterior;
const byNumber = new Map(scene.buildings.map((building) => [building.bygningsnummer, building]));
const wanted = ["169165513", "19514692", "169165505"];
const banned = ["169165521", "9037489", "169165548"];
const ids = config.buildings.map((building) => building.registerBygningsnummer);
if (ids.length !== 3 || ids.some((id, index) => id !== wanted[index])) {
  throw new Error(`expected the three on-parcel targets, got ${ids.join(",")}`);
}
for (const id of banned) {
  if (ids.includes(id)) throw new Error(`neighbour ${id} must not be modelled`);
}

const slope = [1, 2, 3, 4, 8];
const placedSlope = placeFloor(slope, {
  percentile: 0.5,
  foundationPercentile: 0,
  maxFoundationM: 2,
  minFloorM: null,
});
if (placedSlope.floorM !== 3 || placedSlope.foundationM !== 2) {
  throw new Error(`percentile floor mismatch ${JSON.stringify(placedSlope)}`);
}
const raised = placeFloor(slope, {
  percentile: 0,
  foundationPercentile: 0,
  maxFoundationM: 0.4,
  minFloorM: 2.5,
});
if (raised.floorM !== 2.5 || raised.foundationM !== 0.4) {
  throw new Error(`min floor was not capped by the foundation limit ${JSON.stringify(raised)}`);
}

const report = [];
for (const spec of config.buildings) {
  if (spec.dimensionsAreEstimates !== true) throw new Error(`${spec.id} is not marked as an estimate`);
  for (const key of ["footprint", "height", "color"]) {
    if (!spec.estimates[key] || spec.estimates[key].length < 40) {
      throw new Error(`${spec.id} is missing a real ${key} estimate note`);
    }
  }
  if (spec.role === "boathouse" && !spec.identification.startsWith("Guess")) {
    throw new Error("the water-side building must stay labelled as a guess");
  }
  if (!(spec.wallHeightM > 1.5 && spec.wallHeightM < 4 && spec.roofRiseM > 0 && spec.roofRiseM < 2)) {
    throw new Error(`${spec.id} height is outside the photo-estimate range`);
  }
  const register = byNumber.get(spec.registerBygningsnummer);
  if (!register || !register.onSubjectParcel) throw new Error(`${spec.id} is not an on-parcel register point`);
  if (!ringContains(register.x, register.z, spec.footprint)) {
    throw new Error(`${spec.id} footprint does not contain register point ${register.x},${register.z}`);
  }
  for (const [x, z] of spec.footprint) {
    if (!ringContains(x, z, parcel)) throw new Error(`${spec.id} vertex ${x},${z} is outside 437/109`);
  }
  for (const feature of spec.features ?? []) {
    if (!ringContains(feature.at[0], feature.at[1], spec.footprint)) {
      throw new Error(`${spec.id} ${feature.kind} is outside the footprint`);
    }
  }
  const samples = collectFloorSamples(
    spec.footprint,
    (x, z) => sampleSurface(grid, width, height, x, z, cell),
    0.5,
  );
  const floor = placeFloor(samples, spec.floor);
  if (!(floor.sampleCount > 20) || !Number.isFinite(floor.floorM)) {
    throw new Error(`${spec.id} has no DTM floor`);
  }
  if (floor.floorM > floor.maxM + 1e-6 || floor.foundationM > spec.floor.maxFoundationM + 1e-6) {
    throw new Error(`${spec.id} floor leaves the sampled ground ${JSON.stringify(floor)}`);
  }
  const roofTop = floor.floorM + spec.wallHeightM + spec.roofRiseM;
  const fit = groundFit(samples, floor.floorM, floor.foundationM, roofTop);
  const floatShare = fit.floating / fit.samples;
  const buriedShare = fit.throughRoof / fit.samples;
  if (floatShare > 0.1) throw new Error(`${spec.id} floats on ${(floatShare * 100).toFixed(0)}% of samples`);
  if (buriedShare > 0.08) throw new Error(`${spec.id} is buried on ${(buriedShare * 100).toFixed(0)}% of samples`);
  report.push({
    id: spec.id,
    role: spec.role,
    register: spec.registerBygningsnummer,
    floorM: Number(floor.floorM.toFixed(2)),
    foundationM: Number(floor.foundationM.toFixed(2)),
    groundMinM: Number(floor.minM.toFixed(2)),
    groundMaxM: Number(floor.maxM.toFixed(2)),
    roofTopM: Number(roofTop.toFixed(2)),
    samples: fit.samples,
    floating: fit.floating,
    throughRoof: fit.throughRoof,
  });
}
console.log(JSON.stringify({ ok: true, buildings: report }));
"""


def main() -> None:
    subprocess.run(
        ["node", "--experimental-strip-types", "--input-type=module", "-e", NODE],
        cwd=ROOT,
        check=True,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
