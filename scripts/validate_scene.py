#!/usr/bin/env python3
"""Check the processed terrain scene against the raw DTM. No network."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import rasterio

ROOT = Path(__file__).resolve().parents[1]
SCENE_PATH = ROOT / "web" / "public" / "data" / "scene.json"
BIN_PATH = ROOT / "web" / "public" / "data" / "terrain.bin"
TIF_PATH = ROOT / "data" / "raw" / "dtm.tif"


def point_in_ring(x: float, z: float, ring: list[list[float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i, (xi, zi) in enumerate(ring):
        xj, zj = ring[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            inside = not inside
        j = i
    return inside


def main() -> None:
    scene = json.loads(SCENE_PATH.read_text(encoding="utf-8"))
    grid = np.fromfile(BIN_PATH, dtype="<f4")
    width = scene["terrain"]["width"]
    height = scene["terrain"]["height"]
    if grid.size != width * height:
        raise SystemExit(f"grid length {grid.size} != {width * height}")
    grid = grid.reshape(height, width)
    with rasterio.open(TIF_PATH) as dataset:
        raw = dataset.read(1)
        if dataset.crs.to_epsg() != 25832:
            raise SystemExit(f"raw CRS {dataset.crs}")
        if raw.shape != grid.shape:
            raise SystemExit("raw DTM shape does not match the viewer grid")
    sea = ~np.isfinite(grid)
    if int(sea.sum()) != scene["terrain"]["seaCellCount"]:
        raise SystemExit("sea cell count does not match the scene")
    if abs(float(np.nanmin(grid)) - scene["terrain"]["minLandM"]) > 0.02:
        raise SystemExit("minimum land elevation drifted")
    if abs(float(np.nanmax(grid)) - scene["terrain"]["maxLandM"]) > 0.02:
        raise SystemExit("maximum land elevation drifted")
    # Measured non-zero raw cells must survive unchanged.
    measured = raw != 0
    if not np.allclose(grid[measured], raw[measured], atol=1e-5):
        raise SystemExit("measured DTM cells were modified")
    property_ = scene["property"]
    if property_["adressetekst"] != "Kalsneset 27" or property_["matrikkelnummer"] != "437/109":
        raise SystemExit("scene is not Kalsneset 27, 437/109")
    if property_["stedfestingVerifisert"] is not False:
        raise SystemExit("address verification flag changed")
    ring = scene["teig"]["polygons"][0]["exterior"]
    if not point_in_ring(property_["x"], property_["z"], ring):
        raise SystemExit("address point is outside the parcel ring")
    if property_["terrainM"] is None or not 2.5 < property_["terrainM"] < 6:
        raise SystemExit(f"unexpected address elevation {property_['terrainM']}")
    standing = [
        item
        for item in scene["buildings"]
        if item["onSubjectParcel"] and item["standingInRegister"]
    ]
    if [item["bygningsnummer"] for item in standing] != ["169165513"]:
        raise SystemExit("expected one standing cabin point on the parcel")
    if any(item["bygningstype"] != "161" for item in standing):
        raise SystemExit("standing building is not type 161")
    print(
        json.dumps(
            {
                "ok": True,
                "seaCells": int(sea.sum()),
                "addressM": property_["terrainM"],
                "parcel": property_["matrikkelnummer"],
            }
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
