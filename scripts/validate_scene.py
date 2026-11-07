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


def scene_cell(scene: dict, grid: np.ndarray, easting: float, northing: float) -> tuple[float, float, float]:
    """Return bin elevation plus local x (east) and z (north)."""
    terrain = scene["terrain"]
    if terrain.get("axes") != {"x": "east", "y": "up", "z": "north"}:
        raise SystemExit(f"unexpected axes {terrain.get('axes')}")
    if terrain.get("row0") != "north":
        raise SystemExit("row 0 must be north")
    x = easting - terrain["westCellCenterEasting"]
    z = northing - terrain["southCellCenterNorthing"]
    col = int(round(x))
    row = int(round((grid.shape[0] - 1) - z))
    if not (0 <= row < grid.shape[0] and 0 <= col < grid.shape[1]):
        raise SystemExit(f"control point {(easting, northing)} falls outside the view")
    return float(grid[row, col]), x, z


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
        if dataset.transform.e >= 0:
            raise SystemExit("GeoTIFF row 0 is not north")
        west = scene["terrain"]["westCellCenterEasting"]
        north = scene["terrain"]["northCellCenterNorthing"]
        for row in range(height):
            for col in range(width):
                easting = west + col
                northing = north - row
                source_row, source_col = dataset.index(easting, northing)
                source = float(raw[source_row, source_col])
                value = float(grid[row, col])
                if source == 0.0:
                    continue
                if not np.isclose(value, source, atol=1e-4):
                    raise SystemExit(f"cell {row},{col} {value} != GeoTIFF {source}")
    sea = ~np.isfinite(grid)
    if int(sea.sum()) != scene["terrain"]["seaCellCount"]:
        raise SystemExit("sea cell count does not match the scene")
    if abs(float(np.nanmin(grid)) - scene["terrain"]["minLandM"]) > 0.02:
        raise SystemExit("minimum land elevation drifted")
    if abs(float(np.nanmax(grid)) - scene["terrain"]["maxLandM"]) > 0.02:
        raise SystemExit("maximum land elevation drifted")
    # Asymmetric control points. West of the cabin is higher than east.
    # North is sea (Søviggfjorden); south is higher land. Swapping either axis fails this.
    anchor_e = scene["property"]["easting"]
    anchor_n = scene["property"]["northing"]
    with rasterio.open(TIF_PATH) as dataset:
        raw = dataset.read(1)

        def source_at(easting: float, northing: float) -> float:
            row, col = dataset.index(easting, northing)
            return float(raw[row, col])

        east = source_at(anchor_e + 80, anchor_n)
        west = source_at(anchor_e - 80, anchor_n)
        north_sea = source_at(anchor_e, anchor_n + 80)
        south_land = source_at(anchor_e, anchor_n - 80)
    if not west > east + 1:
        raise SystemExit(f"expected higher ground to the west ({west}) than the east ({east})")
    if north_sea != 0.0 or south_land < 8:
        raise SystemExit(f"expected sea to the north ({north_sea}) and land to the south ({south_land})")
    east_value, east_x, east_z = scene_cell(scene, grid, anchor_e + 80, anchor_n)
    west_value, west_x, west_z = scene_cell(scene, grid, anchor_e - 80, anchor_n)
    _north_value, north_x, north_z = scene_cell(scene, grid, anchor_e, anchor_n + 80)
    south_value, south_x, south_z = scene_cell(scene, grid, anchor_e, anchor_n - 80)
    if not (east_x > west_x and abs(east_z - west_z) < 1):
        raise SystemExit("local x does not increase to the east")
    if not (north_z > south_z and abs(north_x - south_x) < 1):
        raise SystemExit("local z does not increase to the north")
    if not (np.isnan(_north_value) and np.isclose(south_value, south_land, atol=0.05)):
        raise SystemExit("viewer grid swapped north and south")
    if not (np.isclose(east_value, east, atol=0.05) and np.isclose(west_value, west, atol=0.05)):
        raise SystemExit("viewer grid swapped east and west")
    if width > 280 or height > 280:
        raise SystemExit(f"display window is still too large: {width}x{height}")
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
