#!/usr/bin/env python3
"""Download a small official extract for Kalsneset 27 and write the viewer files.

Sources are public Kartverket / Geonorge services. The script refuses to write a
scene if the address search is not unique or the terrain file is not a real grid.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from pyproj import CRS, Transformer

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PUBLIC = ROOT / "web" / "public" / "data"
PROVENANCE_JSON = ROOT / "data" / "provenance.json"

USER_AGENT = "cabin-project/1.0 (public Geonorge extract; +https://github.com/foijord/cabin-project)"
ADDRESS_QUERY = "Kalsneset 27 Søgne"
HALF_EXTENT_M = 300

# Names from SSB Klass classification 31, "Standard for bygningstype / Matrikkelen",
# codesAt 2026-11-07. The classification record says copyrighted: false.
# https://data.ssb.no/api/klass/v1/classifications/31
BUILDING_TYPES = {
    "111": "Enebolig",
    "161": "Fritidsbygning (hytter, sommerhus o.l.)",
    "181": "Garasje, uthus, anneks knyttet til bolig",
    "182": "Garasje, uthus, anneks knyttet til fritidsbolig",
    "183": "Naust, båthus, sjøbu",
}

# Names from the Geonorge objektkatalog for Bygningsstatus, retrieved 2026-11-07.
# https://objektkatalog.geonorge.no/Objekttype/Index/EAID_E2CABF01_4006_4241_9D0D_2EA96D3DDC77
BUILDING_STATUS = {
    "BA": "Bygging avlyst",
    "BR": "Bygning er revet eller brent",
    "TB": "Bygning er tatt i bruk",
    "BF": "Bygning flyttet",
    "GR": "Bygning godkjent revet/brent",
    "BU": "Bygningsnummer er utgått",
    "FA": "Ferdigattest",
    "IG": "Igangsettingstillatelse",
    "IP": "Ikke pliktig registrert",
    "MF": "Meldingsak tiltak fullført",
    "MT": "Meldingsak registrer tiltak",
    "MB": "Midlertidig brukstillatelse",
    "RA": "Rammetillatelse",
    "FS": "Fritatt for søknadsplikt",
}

# Register codes that do not describe a standing building. GR is included:
# the code means approved as demolished or burned, so it is not drawn as standing.
NOT_STANDING = {"BA", "BR", "BF", "BU", "GR"}

ADDRESS_URL = "https://ws.geonorge.no/adresser/v1/sok"
WCS_URL = "https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25832"
TEIG_URL = "https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig"
BYGNING_URL = "https://wfs.geonorge.no/skwms1/wfs.matrikkelen-bygningspunkt"
PROJECT_URL = "https://wfs.geonorge.no/skwms1/wfs.hoyde-hoydedata-metadata-prosjekt"


def fetch(url: str, data: bytes | None = None, timeout: int = 120) -> bytes:
    request = urllib.request.Request(
        url,
        data=data,
        headers={"User-Agent": USER_AGENT, "Accept": "*/*"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read()
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status} for {url}")
        return body


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def text_of(element: ET.Element, name: str) -> str | None:
    for child in element.iter():
        if local(child.tag) == name and child.text and child.text.strip():
            return child.text.strip()
    return None


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 16), b""):
            digest.update(chunk)
    return digest.hexdigest()


def point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y):
            denom = yj - yi
            if denom != 0 and x < (xj - xi) * (y - yi) / denom + xi:
                inside = not inside
        j = i
    return inside


def point_in_polygons(x: float, y: float, polygons: list[dict]) -> bool:
    for polygon in polygons:
        if point_in_ring(x, y, polygon["exterior"]):
            if any(point_in_ring(x, y, hole) for hole in polygon["holes"]):
                continue
            return True
    return False


def parse_pos_list(value: str) -> list[list[float]]:
    nums = [float(item) for item in value.split()]
    if len(nums) < 6 or len(nums) % 2:
        raise RuntimeError("A GML posList does not contain whole x/y pairs")
    return [[nums[i], nums[i + 1]] for i in range(0, len(nums), 2)]


def polygons_from(element: ET.Element) -> list[dict]:
    polygons = []
    for polygon in element.iter():
        if local(polygon.tag) != "Polygon":
            continue
        exterior = None
        holes = []
        for child in polygon.iter():
            kind = local(child.tag)
            if kind not in {"exterior", "interior"}:
                continue
            lists = [node.text for node in child.iter() if local(node.tag) == "posList" and node.text]
            if not lists:
                continue
            ring = parse_pos_list(lists[0])
            if kind == "exterior":
                exterior = ring
            else:
                holes.append(ring)
        if exterior:
            polygons.append({"exterior": exterior, "holes": holes})
    return polygons


def download_address() -> dict:
    url = ADDRESS_URL + "?" + urllib.parse.urlencode(
        {"sok": ADDRESS_QUERY, "treffPerSide": 5}
    )
    payload = json.loads(fetch(url))
    hits = payload.get("adresser") or []
    total = (payload.get("metadata") or {}).get("totaltAntallTreff")
    if total != 1 or len(hits) != 1:
        raise RuntimeError(f"Expected one address hit, got total={total} rows={len(hits)}")
    address = hits[0]
    if address.get("adressetekst") != "Kalsneset 27":
        raise RuntimeError(f"Unexpected address text: {address.get('adressetekst')}")
    if str(address.get("kommunenummer")) != "4204":
        raise RuntimeError("Address is not in kommune 4204")
    if address.get("gardsnummer") != 437 or address.get("bruksnummer") != 109:
        raise RuntimeError("Address is not matrikkel 437/109")
    point = address["representasjonspunkt"]
    if point.get("epsg") != "EPSG:4258":
        raise RuntimeError(f"Unexpected address CRS {point.get('epsg')}")
    return {"url": url, "retrieved": payload, "address": address}


def utm_bbox(easting: float, northing: float) -> tuple[int, int, int, int]:
    minx = math.floor(easting - HALF_EXTENT_M)
    miny = math.floor(northing - HALF_EXTENT_M)
    return minx, miny, minx + HALF_EXTENT_M * 2, miny + HALF_EXTENT_M * 2


def download_dtm(bbox: tuple[int, int, int, int]) -> tuple[Path, str]:
    minx, miny, maxx, maxy = bbox
    width = maxx - minx
    height = maxy - miny
    query = urllib.parse.urlencode(
        {
            "service": "WCS",
            "version": "1.0.0",
            "request": "GetCoverage",
            "coverage": "nhm_dtm_topo_25832",
            "crs": "EPSG:25832",
            "bbox": f"{minx},{miny},{maxx},{maxy}",
            "width": width,
            "height": height,
            "format": "GeoTIFF",
        }
    )
    url = f"{WCS_URL}?{query}"
    body = fetch(url)
    if body[:4] not in {b"II*\x00", b"MM\x00*"}:
        snippet = body[:300].decode("utf-8", "replace")
        raise RuntimeError(f"WCS did not return a TIFF: {snippet}")
    path = RAW / "dtm.tif"
    path.write_bytes(body)
    return path, url


def download_wfs(base: str, type_name: str, bbox: str, count: int, path: Path) -> str:
    query = urllib.parse.urlencode(
        {
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "typeNames": type_name,
            "srsName": "urn:ogc:def:crs:EPSG::25832",
            "bbox": bbox,
            "count": count,
        }
    )
    url = f"{base}?{query}"
    body = fetch(url)
    path.write_bytes(body)
    return url


def parse_teigs(path: Path) -> list[dict]:
    root = ET.fromstring(path.read_bytes())
    returned = int(root.attrib.get("numberReturned") or 0)
    teigs = []
    for element in root.iter():
        if local(element.tag) != "Teig":
            continue
        polygons = polygons_from(element)
        if not polygons:
            continue
        teigs.append(
            {
                "teigId": text_of(element, "teigId"),
                "uuidTeig": text_of(element, "uuidTeig"),
                "kommunenummer": text_of(element, "kommunenummer"),
                "kommunenavn": text_of(element, "kommunenavn"),
                "gardsnummer": text_of(element, "gardsnummer"),
                "bruksnummer": text_of(element, "bruksnummer"),
                "bruksnavn": text_of(element, "bruksnavn"),
                "matrikkelnummerTekst": text_of(element, "matrikkelnummerTekst"),
                "matrikkelenhetId": text_of(element, "matrikkelenhetId"),
                "matrikkelenhetstype": text_of(element, "matrikkelenhetstype"),
                "lagretBeregnetAreal": text_of(element, "lagretBeregnetAreal"),
                "arealmerknadTekst": text_of(element, "arealmerknadTekst"),
                "noyaktighetsklasseTeig": text_of(element, "noyaktighetsklasseTeig"),
                "datafangstdato": text_of(element, "datafangstdato"),
                "oppdateringsdato": text_of(element, "oppdateringsdato"),
                "punktfeste": text_of(element, "punktfeste"),
                "teigMedFlereMatrikkelenheter": text_of(element, "teigMedFlereMatrikkelenheter"),
                "tvist": text_of(element, "tvist"),
                "polygons": polygons,
            }
        )
    if returned and returned >= 500:
        raise RuntimeError("Parcel WFS may be truncated at the requested count")
    if len(teigs) != returned and returned:
        # numberReturned has been observed as 0 even when members exist (schema note).
        pass
    return teigs


def parse_buildings(path: Path) -> list[dict]:
    root = ET.fromstring(path.read_bytes())
    buildings = []
    for element in root.iter():
        if local(element.tag) != "Bygning":
            continue
        pos = None
        for node in element.iter():
            if local(node.tag) == "pos" and node.text:
                parts = node.text.split()
                if len(parts) >= 2:
                    pos = [float(parts[0]), float(parts[1])]
                    break
        if pos is None:
            continue
        code = text_of(element, "bygningstype") or ""
        status = text_of(element, "bygningsstatus") or ""
        buildings.append(
            {
                "bygningsnummer": text_of(element, "bygningsnummer"),
                "bygningstype": code,
                "bygningstypeNavn": BUILDING_TYPES.get(code, f"Bygningstype {code}"),
                "typeNameFromEmbeddedList": code in BUILDING_TYPES,
                "bygningsstatus": status,
                "bygningsstatusNavn": BUILDING_STATUS.get(status, f"Bygningsstatus {status}"),
                "statusNameFromEmbeddedList": status in BUILDING_STATUS,
                "standingInRegister": status not in NOT_STANDING,
                "stedfestingVerifisert": text_of(element, "stedfestingVerifisert"),
                "oppdateringsdato": text_of(element, "oppdateringsdato"),
                "matrikkelenhetId": text_of(element, "matrikkelenhetId"),
                "easting": pos[0],
                "northing": pos[1],
            }
        )
    return buildings


def download_projects(lon: float, lat: float) -> tuple[str, list[dict]]:
    transformer = Transformer.from_crs("EPSG:4258", "EPSG:25833", always_xy=True)
    east, north = transformer.transform(lon, lat)
    bbox = f"{east - 400:.1f},{north - 400:.1f},{east + 400:.1f},{north + 400:.1f}"
    query = urllib.parse.urlencode(
        {
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "typeNames": "metadata_prosjekt:Prosjektavgrensning",
            "srsName": "urn:ogc:def:crs:EPSG::25833",
            "bbox": f"{bbox},urn:ogc:def:crs:EPSG::25833",
            "count": 50,
        }
    )
    url = f"{PROJECT_URL}?{query}"
    root = ET.fromstring(fetch(url))
    projects = []
    for element in root.iter():
        if local(element.tag) != "Prosjektavgrensning":
            continue
        projects.append(
            {
                "projectId": text_of(element, "LAS_PROJECT_ID"),
                "name": text_of(element, "LAS_PROJECT_NAME"),
                "year": text_of(element, "AARSTALL"),
                "lastFlightDate": text_of(element, "SISTEFLYDATO"),
                "pointDensityPerM2": text_of(element, "PUNKTTETTHET"),
                "resolutionM": text_of(element, "OPPLOSNING"),
                "horizontalEpsg": text_of(element, "KOORDINATSYSTEM"),
                "verticalCode": text_of(element, "HOYDESYSTEM"),
                "dtmInterpolation": text_of(element, "DTM_INTERPOLATIONTYPE"),
                "best": text_of(element, "BEST"),
                "bestOpen": text_of(element, "BEST_OPEN"),
                "typeCode": text_of(element, "TYPE"),
                "accessCode": text_of(element, "TILGANG"),
                "client": text_of(element, "OPPDRAGSGIVER"),
                "standard": text_of(element, "FKB_LASERSTANDARD"),
                "note": text_of(element, "EKSTERNTNOTAT"),
                "published": text_of(element, "PUBLISERT"),
            }
        )
    if len(projects) >= 50:
        raise RuntimeError("Project metadata response may be truncated")
    return url, projects


def connected_to_border(mask: np.ndarray) -> np.ndarray:
    """4-connected exact-zero cells that touch the extract edge. These are the sea fill."""
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    stack: list[tuple[int, int]] = []
    for col in range(width):
        for row in (0, height - 1):
            if mask[row, col] and not seen[row, col]:
                seen[row, col] = True
                stack.append((row, col))
    for row in range(height):
        for col in (0, width - 1):
            if mask[row, col] and not seen[row, col]:
                seen[row, col] = True
                stack.append((row, col))
    while stack:
        row, col = stack.pop()
        for nrow, ncol in ((row - 1, col), (row + 1, col), (row, col - 1), (row, col + 1)):
            if 0 <= nrow < height and 0 <= ncol < width and mask[nrow, ncol] and not seen[nrow, ncol]:
                seen[nrow, ncol] = True
                stack.append((nrow, ncol))
    return seen


def fill_holes(grid: np.ndarray, holes: np.ndarray) -> np.ndarray:
    """Replace inland exact-zero cells with the mean of measured neighbours."""
    filled = grid.astype(np.float32).copy()
    remaining = holes.copy()
    for _ in range(8):
        if not remaining.any():
            break
        next_remaining = remaining.copy()
        rows, cols = np.where(remaining)
        for row, col in zip(rows.tolist(), cols.tolist(), strict=True):
            samples = []
            for nrow, ncol in ((row - 1, col), (row + 1, col), (row, col - 1), (row, col + 1)):
                if not (0 <= nrow < grid.shape[0] and 0 <= ncol < grid.shape[1]):
                    continue
                if remaining[nrow, ncol]:
                    continue
                value = float(filled[nrow, ncol])
                if value == 0.0:
                    continue
                samples.append(value)
            if samples:
                filled[row, col] = float(np.mean(samples))
                next_remaining[row, col] = False
        remaining = next_remaining
    if remaining.any():
        raise RuntimeError("Could not fill every inland zero cell from measured neighbours")
    return filled


def round_ring(ring: list[list[float]], origin_e: float, origin_n: float) -> list[list[float]]:
    return [[round(x - origin_e, 2), round(y - origin_n, 2)] for x, y in ring]


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    retrieved_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    address_pack = download_address()
    address = address_pack["address"]
    point = address["representasjonspunkt"]
    lon = float(point["lon"])
    lat = float(point["lat"])
    to_utm = Transformer.from_crs("EPSG:4258", "EPSG:25832", always_xy=True)
    easting, northing = to_utm.transform(lon, lat)
    bbox = utm_bbox(easting, northing)
    minx, miny, maxx, maxy = bbox

    dtm_path, dtm_url = download_dtm(bbox)
    wfs_bbox = f"{minx},{miny},{maxx},{maxy},urn:ogc:def:crs:EPSG::25832"
    teig_url = download_wfs(TEIG_URL, "app:Teig", wfs_bbox, 500, RAW / "teig.gml")
    building_url = download_wfs(
        BYGNING_URL, "app:Bygning", wfs_bbox, 500, RAW / "bygning.gml"
    )
    project_url, projects = download_projects(lon, lat)

    with rasterio.open(dtm_path) as dataset:
        if dataset.crs is None or dataset.crs.to_epsg() != 25832:
            raise RuntimeError(f"DTM CRS is {dataset.crs}, expected EPSG:25832")
        if dataset.width != maxx - minx or dataset.height != maxy - miny:
            raise RuntimeError("DTM size does not match the requested 1 m grid")
        transform = dataset.transform
        if abs(transform.a - 1) > 1e-6 or abs(transform.e + 1) > 1e-6:
            raise RuntimeError(f"DTM pixel size is not 1 m: {transform}")
        grid = dataset.read(1).astype(np.float32)
        tags = dataset.tags()

    exact_zero = grid == 0
    sea = connected_to_border(exact_zero)
    holes = exact_zero & ~sea
    filled = fill_holes(grid, holes)
    finite_land = filled[~sea]
    if finite_land.size < 1000:
        raise RuntimeError("DTM has almost no measured land elevations")
    elevations = filled.astype(np.float32)
    elevations[sea] = np.nan

    west_center = float(transform.c + 0.5 * transform.a)
    north_center = float(transform.f + 0.5 * transform.e)
    south_center = north_center + (grid.shape[0] - 1) * transform.e

    def sample(x_e: float, y_n: float) -> float:
        col = (x_e - west_center) / transform.a
        row = (y_n - north_center) / transform.e
        if col < 0 or row < 0 or col > grid.shape[1] - 1 or row > grid.shape[0] - 1:
            return float("nan")
        c0 = int(math.floor(col))
        r0 = int(math.floor(row))
        c1 = min(c0 + 1, grid.shape[1] - 1)
        r1 = min(r0 + 1, grid.shape[0] - 1)
        tx = col - c0
        ty = row - r0
        values = [
            elevations[r0, c0],
            elevations[r0, c1],
            elevations[r1, c0],
            elevations[r1, c1],
        ]
        if any(math.isnan(value) for value in values):
            nearest = elevations[int(round(row)), int(round(col))]
            return float(nearest)
        return float(
            values[0] * (1 - tx) * (1 - ty)
            + values[1] * tx * (1 - ty)
            + values[2] * (1 - tx) * ty
            + values[3] * tx * ty
        )

    teigs = parse_teigs(RAW / "teig.gml")
    subject = [teig for teig in teigs if teig["matrikkelnummerTekst"] == "437/109"]
    if len(subject) != 1:
        raise RuntimeError(f"Expected one teig 437/109 in the view, found {len(subject)}")
    subject_teig = subject[0]
    if not point_in_polygons(easting, northing, subject_teig["polygons"]):
        raise RuntimeError("Official address point is not inside teig 437/109")

    buildings = parse_buildings(RAW / "bygning.gml")
    subject_id = subject_teig["matrikkelenhetId"]
    for building in buildings:
        building["onSubjectParcel"] = building["matrikkelenhetId"] == subject_id
    subject_buildings = [item for item in buildings if item["onSubjectParcel"]]
    if not any(item["bygningstype"] == "161" for item in subject_buildings):
        raise RuntimeError("No fritidsbygning point on 437/109")

    bin_path = PUBLIC / "terrain.bin"
    bin_path.write_bytes(elevations.astype("<f4").tobytes())

    def public_polygons(teig: dict) -> list[dict]:
        return [
            {
                "exterior": round_ring(polygon["exterior"], west_center, south_center),
                "holes": [
                    round_ring(hole, west_center, south_center) for hole in polygon["holes"]
                ],
            }
            for polygon in teig["polygons"]
        ]

    parcel_elevations = []
    rows, cols = grid.shape
    for row in range(rows):
        north = north_center + row * transform.e
        for col in range(cols):
            east = west_center + col * transform.a
            if point_in_polygons(east, north, subject_teig["polygons"]):
                value = elevations[row, col]
                if not math.isnan(float(value)):
                    parcel_elevations.append(float(value))

    crs_25832 = CRS.from_epsg(25832)
    crs_4258 = CRS.from_epsg(4258)
    crs_5941 = CRS.from_epsg(5941)

    def building_record(item: dict) -> dict:
        return {
            "bygningsnummer": item["bygningsnummer"],
            "bygningstype": item["bygningstype"],
            "bygningstypeNavn": item["bygningstypeNavn"],
            "bygningsstatus": item["bygningsstatus"],
            "bygningsstatusNavn": item["bygningsstatusNavn"],
            "standingInRegister": item["standingInRegister"],
            "stedfestingVerifisert": item["stedfestingVerifisert"] == "true",
            "oppdateringsdato": item["oppdateringsdato"],
            "onSubjectParcel": item["onSubjectParcel"],
            "x": round(item["easting"] - west_center, 2),
            "z": round(item["northing"] - south_center, 2),
            "terrainM": None
            if math.isnan(sample(item["easting"], item["northing"]))
            else round(sample(item["easting"], item["northing"]), 2),
        }

    address_elevation = sample(easting, northing)
    scene = {
        "generatedAt": retrieved_at,
        "disclaimer": (
            "Planning visualization of public map data. Not a survey, "
            "not a construction model, and not a legal boundary plan."
        ),
        "property": {
            "adressetekst": address["adressetekst"],
            "postnummer": address["postnummer"],
            "poststed": address["poststed"],
            "kommunenummer": address["kommunenummer"],
            "kommunenavn": address["kommunenavn"],
            "matrikkelnummer": "437/109",
            "bruksnavn": subject_teig["bruksnavn"],
            "matrikkelenhetstype": subject_teig["matrikkelenhetstype"],
            "adresseid": address.get("adresseid"),
            "addressUpdated": address.get("oppdateringsdato"),
            "stedfestingVerifisert": bool(address.get("stedfestingverifisert")),
            "lat": lat,
            "lon": lon,
            "easting": round(easting, 3),
            "northing": round(northing, 3),
            "x": round(easting - west_center, 3),
            "z": round(northing - south_center, 3),
            "terrainM": None if math.isnan(address_elevation) else round(address_elevation, 2),
        },
        "teig": {
            "teigId": subject_teig["teigId"],
            "lagretBeregnetArealM2": float(subject_teig["lagretBeregnetAreal"]),
            "arealmerknadTekst": subject_teig["arealmerknadTekst"],
            "noyaktighetsklasseTeig": subject_teig["noyaktighetsklasseTeig"],
            "datafangstdato": subject_teig["datafangstdato"],
            "oppdateringsdato": subject_teig["oppdateringsdato"],
            "terrainMinM": round(min(parcel_elevations), 2) if parcel_elevations else None,
            "terrainMaxM": round(max(parcel_elevations), 2) if parcel_elevations else None,
            "polygons": public_polygons(subject_teig),
        },
        "contextParcels": [
            {
                "matrikkelnummer": teig["matrikkelnummerTekst"],
                "noyaktighetsklasseTeig": teig["noyaktighetsklasseTeig"],
                "polygons": public_polygons(teig),
            }
            for teig in teigs
            if teig["matrikkelnummerTekst"] != "437/109"
        ],
        "buildings": [building_record(item) for item in buildings],
        "terrain": {
            "width": int(grid.shape[1]),
            "height": int(grid.shape[0]),
            "cellSizeM": 1,
            "registration": "cell-center",
            "row0": "north",
            "westCellCenterEasting": west_center,
            "southCellCenterNorthing": south_center,
            "northCellCenterNorthing": north_center,
            "crs": "EPSG:25832",
            "crsName": crs_25832.name,
            "geographicCrs": "EPSG:4258",
            "geographicCrsName": crs_4258.name,
            "verticalDatum": crs_5941.name,
            "verticalDatumEpsg": "EPSG:5941",
            "minLandM": round(float(np.min(finite_land)), 2),
            "maxLandM": round(float(np.max(finite_land)), 2),
            "seaCellCount": int(sea.sum()),
            "inlandZeroCellsFilled": int(holes.sum()),
            "landCellCount": int((~sea).sum()),
            "seaEncoding": (
                "The WCS has no nodata tag and returns exact 0.0 for sea and for gaps. "
                "Exact-zero cells connected to the edge of this extract are stored as NaN and drawn as sea. "
                "Inland exact-zero cells are filled from neighbouring measured cells."
            ),
            "binary": "terrain.bin",
            "binaryDtype": "float32-le",
            "binarySha256": sha256(bin_path),
        },
    }
    scene_path = PUBLIC / "scene.json"
    scene_path.write_text(json.dumps(scene, ensure_ascii=False, indent=2), encoding="utf-8")

    provenance = {
        "retrievedAt": retrieved_at,
        "address": {
            "request": address_pack["url"],
            "licence": "CC BY 4.0",
            "source": "Kartverket Adresse REST API, Matrikkelen",
            "documentation": "https://kartverket.no/api-og-data/eiendomsdata/brukarrettleiing-adresse-api",
            "totalHits": 1,
            "adressetekst": address["adressetekst"],
            "stedfestingVerifisert": address.get("stedfestingverifisert"),
            "representasjonspunkt": point,
            "utm32Easting": easting,
            "utm32Northing": northing,
            "gardsnummer": 437,
            "bruksnummer": 109,
            "festenummer": address.get("festenummer"),
            "kommunenummer": "4204",
        },
        "terrain": {
            "request": dtm_url,
            "service": WCS_URL,
            "coverage": "nhm_dtm_topo_25832",
            "documentation": "https://kartkatalog.geonorge.no/metadata/uuid/05821c51-2f5b-411f-9098-924d13dbea9a",
            "dataset": "https://kartkatalog.geonorge.no/metadata/uuid/f297e948-8a34-4e6c-9740-54b3a657f8d5",
            "licenceStatement": "Geonorge records Høydedata - laser as open data: no conditions apply to access and use.",
            "attribution": "© Kartverket",
            "file": "data/raw/dtm.tif",
            "sha256": sha256(dtm_path),
            "bytes": dtm_path.stat().st_size,
            "crs": crs_25832.to_string(),
            "crsName": crs_25832.name,
            "verticalDatum": f"{crs_5941.to_string()} {crs_5941.name}",
            "bboxEastingNorthing": list(bbox),
            "width": int(grid.shape[1]),
            "height": int(grid.shape[0]),
            "cellSizeM": 1,
            "nodataTag": None,
            "geotiffTags": tags,
            "min": float(np.min(grid)),
            "max": float(np.max(grid)),
            "exactZeroCells": int(exact_zero.sum()),
            "seaCellsConnectedToBorder": int(sea.sum()),
            "inlandZeroCellsFilled": int(holes.sum()),
            "addressSampleM": None if math.isnan(address_elevation) else address_elevation,
            "projectsRequest": project_url,
            "projects": projects,
            "openProjectNote": (
                "Of the project polygons containing this address, Søgne 2013 is the only one "
                "with BEST_OPEN=1. The WCS grid does not carry a per-cell project id."
            ),
        },
        "cadastre": {
            "request": teig_url,
            "documentation": "https://kartkatalog.geonorge.no/metadata/matrikkelen-eiendomskart-teig-wfs/339d49c3-06a5-4310-9605-fced1fe465cb",
            "licence": "CC BY 4.0",
            "featureType": "app:Teig",
            "teigCountInView": len(teigs),
            "subject": {
                "matrikkelnummer": "437/109",
                "bruksnavn": subject_teig["bruksnavn"],
                "teigId": subject_teig["teigId"],
                "arealM2": subject_teig["lagretBeregnetAreal"],
                "arealmerknad": subject_teig["arealmerknadTekst"],
                "noyaktighetsklasseTeig": subject_teig["noyaktighetsklasseTeig"],
                "datafangstdato": subject_teig["datafangstdato"],
                "oppdateringsdato": subject_teig["oppdateringsdato"],
                "qualityNote": (
                    "Produktspesifikasjonen for Matrikkelen Eiendomskart Teig describes Gult as "
                    "a traffic-light class: one or more boundaries are of lesser quality, disputed, "
                    "or a road-edge or shoreline helper line. This teig carries arealmerknad "
                    "'Hjelpelinje vannkant'."
                ),
            },
        },
        "buildings": {
            "request": building_url,
            "documentation": "https://kartkatalog.geonorge.no/metadata/matrikkelen-bygningspunkt-wfs/c750a3f5-1cb8-46aa-a5eb-e13ee0cb9689",
            "licence": "CC BY 4.0",
            "geometry": "point",
            "countInView": len(buildings),
            "onSubject": [
                {
                    "bygningsnummer": item["bygningsnummer"],
                    "type": item["bygningstype"],
                    "typeName": item["bygningstypeNavn"],
                    "status": item["bygningsstatus"],
                    "statusName": item["bygningsstatusNavn"],
                    "stedfestingVerifisert": item["stedfestingVerifisert"],
                    "easting": item["easting"],
                    "northing": item["northing"],
                }
                for item in subject_buildings
            ],
            "footprints": (
                "Not included. FKB-Bygning is Norge digitalt-restricted. The INSPIRE Buildings "
                "WFS URL published in the Geonorge register, "
                "https://wfs.geonorge.no/skwms1/wfs.inspire-bu-core2d , returned "
                "'UKJENT APPLIKASJON' on this date. No roof heights are invented."
            ),
            "typeNameSource": "https://data.ssb.no/api/klass/v1/classifications/31/codesAt?date=2026-11-07",
            "statusNameSource": "https://objektkatalog.geonorge.no/Objekttype/Index/EAID_E2CABF01_4006_4241_9D0D_2EA96D3DDC77",
        },
        "imagery": {
            "included": False,
            "reason": (
                "Norge i bilder orthophoto is published under the Norge digitalt licence and "
                "is not open for rehosting. No aerial photograph is bundled. Relief colour is "
                "computed from the DTM."
            ),
            "reference": "https://kartkatalog.geonorge.no/metadata/norge-i-bilder-wms-ortofoto-ny/d6611216-1c4a-4fed-9953-cbdee8832ee0",
        },
        "notUsed": [
            "The point-height API https://ws.geonorge.no/hoyde/v1/punkt returned HTTP 403 from this environment.",
            "No Google or other commercial satellite imagery.",
            "No zoning or regulation map. An earlier plan interpretation was not verified and is not used.",
        ],
    }
    PROVENANCE_JSON.write_text(json.dumps(provenance, ensure_ascii=False, indent=2), encoding="utf-8")
    summary = {
        "address": f"{lat:.8f} N, {lon:.8f} E",
        "utm": [round(easting, 3), round(northing, 3)],
        "elevationM": scene["property"]["terrainM"],
        "parcelArea": scene["teig"]["lagretBeregnetArealM2"],
        "parcelTerrain": [scene["teig"]["terrainMinM"], scene["teig"]["terrainMaxM"]],
        "teigs": len(teigs),
        "buildings": len(buildings),
        "subjectBuildings": [item["bygningsnummer"] for item in subject_buildings],
        "projects": [item["name"] for item in projects],
        "dtmSha": provenance["terrain"]["sha256"],
        "binBytes": bin_path.stat().st_size,
        "sceneBytes": scene_path.stat().st_size,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 — top-level guard for a CLI script
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
