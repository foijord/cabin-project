#!/usr/bin/env python3
"""Every densified boundary vertex must sit on or above the terrain.

The check uses the same sample spacing and clearance as web/src/drape.ts.
A ridge between two corners must not be bridged by a straight chord.
"""

from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCENE = ROOT / "web" / "public" / "data" / "scene.json"
BIN = ROOT / "web" / "public" / "data" / "terrain.bin"

NODE = r"""
import { readFileSync } from "node:fs";
import { densifyClosedRing, drapeBoundary, BOUNDARY_CLEARANCE_M, BOUNDARY_SAMPLE_M, sampleSurface } from "./web/src/drape.ts";

const clearance = BOUNDARY_CLEARANCE_M;
const spacing = BOUNDARY_SAMPLE_M;
if (spacing > 1) throw new Error("sample spacing is coarser than the 1 m DTM");

const width = 21;
const height = 21;
const grid = new Float32Array(width * height);
const row = (z) => height - 1 - z;
grid[row(10) * width + 10] = 12;
const terrain = (x, z) => sampleSurface(grid, width, height, x, z);
const ring = [[0, 10], [20, 10], [0, 10]];
const draped = drapeBoundary(ring, terrain, spacing, clearance);
if (draped.length < 40) throw new Error("edge was not densified");
for (let i = 1; i < draped.length; i++) {
  const step = Math.hypot(draped[i].x - draped[i - 1].x, draped[i].z - draped[i - 1].z);
  if (step > spacing + 1e-6) throw new Error(`span ${step} exceeds ${spacing}`);
}
let crossedRidge = false;
for (const vertex of draped) {
  const ground = terrain(vertex.x, vertex.z);
  if (vertex.y < ground + clearance - 1e-6) {
    throw new Error(`vertex ${vertex.x},${vertex.z} y=${vertex.y} is below terrain ${ground} + ${clearance}`);
  }
  if (Math.abs(vertex.x - 10) < 0.6 && vertex.terrain > 5) crossedRidge = true;
}
if (!crossedRidge) throw new Error("densified edge missed the ridge");

const scene = JSON.parse(readFileSync("./web/public/data/scene.json", "utf8"));
const bin = readFileSync("./web/public/data/terrain.bin");
const real = new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4);
const realTerrain = (x, z) => sampleSurface(real, scene.terrain.width, scene.terrain.height, x, z);
const parcel = scene.teig.polygons[0].exterior;
const realDraped = drapeBoundary(parcel, realTerrain, spacing, clearance);
for (const vertex of realDraped) {
  const ground = realTerrain(vertex.x, vertex.z);
  if (vertex.y < ground + clearance - 1e-4) {
    throw new Error(`parcel vertex below terrain at ${vertex.x}, ${vertex.z}`);
  }
}
const longest = parcel.slice(1).reduce((max, point, index) => {
  return Math.max(max, Math.hypot(point[0] - parcel[index][0], point[1] - parcel[index][1]));
}, 0);
console.log(JSON.stringify({
  ok: true,
  clearance,
  spacing,
  ridgeSamples: draped.length,
  parcelSamples: realDraped.length,
  longestSourceEdgeM: Number(longest.toFixed(2)),
}));
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
