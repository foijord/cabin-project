# Provenance

Retrieved 7 November 2026. Machine-readable copy: [`data/provenance.json`](../data/provenance.json). Raw responses: `data/raw/`. The viewer reads `web/public/data/scene.json` and `web/public/data/terrain.bin`.

The spoken name “Carlsnesa 27” was not used. The official address API returns one hit for “Kalsneset 27 Søgne”.

## Address

- Service: [Kartverket Adresse REST API](https://ws.geonorge.no/adresser/v1/sok?sok=Kalsneset+27+S%C3%B8gne&treffPerSide=5)
- Documentation: [Brukarrettleiing for adresse-API](https://kartverket.no/api-og-data/eiendomsdata/brukarrettleiing-adresse-api)
- Licence: CC BY 4.0
- Result: Kalsneset 27, 4641 SØGNE, Kristiansand, kommunenummer 4204, gårdsnummer 437, bruksnummer 109, festenummer 0
- Address id: 215546100
- Updated in the register: 2023-03-01
- Representation point, EPSG:4258: 58.05628457° N, 7.72947755° E
- Transformed with PROJ to EPSG:25832: 425021.002 E, 6435682.001 N
- `stedfestingVerifisert`: false. The coordinate is the official representation point, and the register does not mark it as field-verified.

The earlier approximate coordinate 58.05628° N, 7.72948° E matches this point. It was only a lead until this lookup.

## Terrain

- Source: Kartverket høydedata DTM ImageServer, Søgne 2013, `LAS_PROJECT_ID=30`, primary raster `CATEGORY=1`
- Export: `exportImage`, Float32, nearest neighbour, `rasterFunction` None, mosaic filter `LAS_PROJECT_ID=30 AND CATEGORY=1`
- This is the project DTM at its native 0.5 m cell size. It is not a resample or upsample of the national 1 m WCS (`nhm_dtm_topo_25832`)
- Project metadata, retrieved 7 November 2026: resolution 0.5 m, horizontal EPSG:25832, vertical code 5941 (NN2000), last flight 2013-04-30, ordered density 3 points/m², natural-neighbour DTM, commissioner Kartverket, `BEST_OPEN=1`, `TILGANG=1`
- The ordered density is the project specification, not a count of ground returns at this parcel, and the 0.5 m spacing is the grid resolution. Neither number is a vertical accuracy
- Viewer window, outer cell edges, EPSG:25832: easting 424894–425131, northing 6435574–6435812. Same extent as the previous 1 m window. Native cell centres are at *.25 / *.75, 0.25 m from the old 1 m centres, and were not snapped onto those centres
- GeoTIFF tag `AREA_OR_POINT=Area`. Cell centre is half a pixel in from the corner. No extra half-pixel shift is applied
- The GeoTIFF has no nodata tag. Exact 0.0 cells that touch the edge of the window are stored as NaN and drawn as sea. Other samples, including negative shore values, are kept
- Bilinear sample at the address is a sample of this grid, not a surveyed spot height

### Access labels

Checked 7 November 2026, without logging in:

- [ProjectMetadata.ashx](https://hoydedata.no/LaserServices/REST/ProjectMetadata.ashx) for “Søgne 2013” returns `TILGANG` `"1"`
- The [høydedata FAQ](https://test.hoydedata.no/LaserInnsyn2/help_no/topics/idh-topic230.htm) says to read `TILGANG` from that call, and that `"2"` means the project is closed and cannot be downloaded
- DTM ImageServer catalogue row OBJECTID 1924, the primary 0.5 m raster named Søgne 2013, returns `TILGANG` `"2"`. The overview tiles for the same project do too
- The same day, NDH 2018 projects with project `TILGANG` `"1"` also have raster `TILGANG` `"1"`. Kristiansand 2020 is `"2"` on both. Søgne 2013 is the mismatch
- The export URL returns a GeoTIFF with no token. That shows the service does not enforce the raster flag. It is not a licence

The owner directed this viewer to publish the grid for cabin planning. The two official labels still disagree. Publishing it does not resolve that conflict and is not a definitive licence clearance. © Kartverket.

### Which laser project

Project polygons come from [Høydedata metadata prosjekt WFS](https://wfs.geonorge.no/skwms1/wfs.hoyde-hoydedata-metadata-prosjekt?service=WFS&request=GetCapabilities). Four published projects contain the address:

| Project | Last flight | Density | BEST_OPEN | Note |
| --- | --- | --- | --- | --- |
| Søgne 2013 | 2013-04-30 | 3 points/m² | 1 | Natural-neighbour DTM. Horizontal 25832, vertical code 5941. This is the open-model flag. |
| Trysnes 2010 | 2010-01-01 | 2 points/m² | 0 | The flight date is the year stamp in the service, not a verified day. |
| Kristiansand 2020 | 2020-04-06 | 5 points/m² | 0 | Flagged BEST=1 but not BEST_OPEN. Not downloaded. |
| Bilde Agder og Telemark 2021 Del 8 av 8 | 2021-01-01 | 4 points/m² | 0 | Image-matching point cloud, not the open DTM used here. |

The viewer grid is filtered to Søgne 2013 only. It is not a blend with Trysnes 2010, Kristiansand 2020, or the image-matching projects.

The point-height API `https://ws.geonorge.no/hoyde/v1/punkt` returned HTTP 403 from the build environment, so the address height is the DTM sample above.

## Parcel

- Service: [Matrikkelen eiendomskart teig WFS](https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig?service=WFS&request=GetCapabilities)
- Catalogue: [Matrikkelen - Eiendomskart Teig WFS](https://kartkatalog.geonorge.no/metadata/matrikkelen-eiendomskart-teig-wfs/339d49c3-06a5-4310-9605-fced1fe465cb)
- Licence: CC BY 4.0
- Feature: `app:Teig`, requested in EPSG:25832
- 55 teigs intersect the 600 m extract
- Subject teig id 215975187, matrikkelnummer 437/109, bruksnavn SJØSTRAND, grunneiendom
- Registered calculated area: 1,258.5 m²
- Area remark: `Hjelpelinje vannkant`
- Quality class: `Gult`
- datafangstdato: 1999-03-25T23:00:00
- Register update: 2020-06-16

Kartverket’s product specification for this dataset describes the yellow class as a traffic-light summary: one or more boundaries are of lesser quality, disputed, or a road-edge or shoreline helper line. This teig’s own remark is the shoreline helper line. The class is not a new accuracy measurement made for this viewer. The boundary is the register polygon. It is drawn exactly from that polygon and is not a surveyed line produced here.

The official address point falls inside this polygon. Neighbouring parcels are shown as pale lines, with matrikkel numbers kept in the data file and not listed as a directory of neighbours. Owner names are not in the extract and are not shown.

## Buildings

- Service: [Matrikkelen bygningspunkt WFS](https://wfs.geonorge.no/skwms1/wfs.matrikkelen-bygningspunkt?service=WFS&request=GetCapabilities)
- Catalogue: [Matrikkelen - Bygningspunkt WFS](https://kartkatalog.geonorge.no/metadata/matrikkelen-bygningspunkt-wfs/c750a3f5-1cb8-46aa-a5eb-e13ee0cb9689)
- Licence: CC BY 4.0
- Geometry: point. 75 points in the extract.
- Type names: [SSB Klass 31, Standard for bygningstype](https://data.ssb.no/api/klass/v1/classifications/31), which the API marks as not copyrighted
- Status names: [Geonorge objektkatalog, Bygningsstatus](https://objektkatalog.geonorge.no/Objekttype/Index/EAID_E2CABF01_4006_4241_9D0D_2EA96D3DDC77)

On matrikkelenhet 215462560 (437/109):

| Bygningsnummer | Type | Status | Position verified | Drawn as |
| --- | --- | --- | --- | --- |
| 169165513 | 161 Fritidsbygning (hytter, sommerhus o.l.) | TB, bygning er tatt i bruk | no | A post. The point is the same metre as the address point. |
| 19514692 | 182 Garasje, uthus, anneks knyttet til fritidsbolig | GR, bygning godkjent revet/brent | no | A ring, not a standing building |
| 169165505 | 182 Garasje, uthus, anneks knyttet til fritidsbolig | GR, bygning godkjent revet/brent | no | A ring, not a standing building |

GR is the register’s own status. This viewer does not decide whether those buildings are still on the ground.

No roof height, storey count, or footprint is in this open extract. The posts and rings are still map symbols.

Photo models added on 8 November 2026 sit on this same DTM. They use OpenStreetMap outlines tagged with the three on-parcel building numbers. Wall and roof metres are estimates, written in `web/src/photo-buildings.json` and explained in [BUILDINGS.md](BUILDINGS.md). The DTM grid was not replaced. Official footprints were not added. The two outbuildings stay status GR in the register; the models do not change that.

## Not included

- **Orthophoto raster.** Norge i bilder WMS requires a token and is under the Norge digitalt licence. It is not rehosted. On 8 November 2026 the public innsyn client was used to look at the roofs; the image was not copied into this repository. Relief colour is still calculated from the terrain. See [BUILDINGS.md](BUILDINGS.md).
- **Building footprints.** FKB-Bygning is Norge digitalt-restricted. The INSPIRE Buildings WFS URL still listed by Geonorge, `https://wfs.geonorge.no/skwms1/wfs.inspire-bu-core2d`, returned “UKJENT APPLIKASJON” on 7 November 2026.
- **Zoning or regulation.** No plan map is used.
- **Commercial satellite imagery.** None.

## Orientation

The GeoTIFF is north-up. In the scene file, local x is metres east and local z is metres north. Those file coordinates are not swapped.

Three.js is right-handed and Y-up. East × up is south, not north, so storing world Z as north makes a left-handed basis. A north-up camera then draws east on the left of the screen. The rendered fix is `world Z = -local north`. A top-down view with geographic north at the top of the screen then has the east control on the right.

The parcel and the terrain use the same local metres. In map space, 62 of 66 parcel vertices are within 8 m of a DTM zero cell (median distance 0 m), and about 90% of the polygon is on land. The address point is inside the polygon. That is registration, not a second axis swap. The water edge is the Matrikkelen helper line `Hjelpelinje vannkant`; it follows the DTM water closely on this teig, with a fringe of sea cells inside the polygon.

Checked on the native 0.5 m grid, the cell nearest 80 m from 425021.002 E, 6435682.001 N: north is sea (0.0 m), south is about 9.0 m, west is about 6.4 m, and east is about 3.5 m. These are grid samples, not surveyed spot heights, and they are not an accuracy statement.

## Processing

`scripts/fetch_scene.py` does the downloads and the coordinate conversion. Heights in the viewer are metres. Local x is east and local z is north, both in metres from the south-west cell centre of the 0.5 m grid (424894.25 E, 6435574.25 N). Vertical exaggeration is a display scale and defaults to 1.
