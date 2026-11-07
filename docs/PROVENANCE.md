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

- Service: [WCS national DTM, UTM zone 32](https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25832?service=WCS&version=1.0.0&request=GetCapabilities)
- Requested coverage: `nhm_dtm_topo_25832`
- Catalogue: [Nasjonal høydemodell Digital terrengmodell 25832 WCS](https://kartkatalog.geonorge.no/metadata/uuid/05821c51-2f5b-411f-9098-924d13dbea9a)
- Dataset: [Høydedata - laser](https://kartkatalog.geonorge.no/metadata/uuid/f297e948-8a34-4e6c-9740-54b3a657f8d5)
- Licence statement in Geonorge: open data, no conditions apply to access and use. This site still credits © Kartverket.
- File: `data/raw/dtm.tif` (1,508,662 bytes)
- SHA-256: `e504ba4b12ba43e825c1c447673837b8b5d67ec9262ea0cca41bca63223b8141`
- Grid: 600 × 600 cells, 1 m, cell-centre registration, GeoTIFF tag `AREA_OR_POINT=Area`
- Bounding box, EPSG:25832: easting 424721–425321, northing 6435382–6435982
- Horizontal datum: ETRS89 / UTM zone 32N (EPSG:25832)
- Vertical datum: NN2000 height (EPSG:5941), taken from the project metadata code 5941 and confirmed with the EPSG registry name
- The GeoTIFF has no nodata tag. Elevations in the file run from −0.41 m to 57.45 m.
- Exact value 0.0 occurs on 150,563 cells. 150,551 of those connect to the edge of the extract and are stored as NaN and drawn as sea. 12 inland zeros were filled from neighbouring measured cells. The raw TIFF is unchanged.
- Bilinear sample at the address: 3.56 m NN2000. That is a sample of the 1 m grid, not a surveyed spot height.
- Measured cells inside the registered parcel: about −0.14 m to 8.29 m. 128 sea-coded cells fall inside the polygon, along the shore.

### Which laser project

Project polygons come from [Høydedata metadata prosjekt WFS](https://wfs.geonorge.no/skwms1/wfs.hoyde-hoydedata-metadata-prosjekt?service=WFS&request=GetCapabilities). Four published projects contain the address:

| Project | Last flight | Density | BEST_OPEN | Note |
| --- | --- | --- | --- | --- |
| Søgne 2013 | 2013-04-30 | 3 points/m² | 1 | Natural-neighbour DTM. Horizontal 25832, vertical code 5941. This is the open-model flag. |
| Trysnes 2010 | 2010-01-01 | 2 points/m² | 0 | The flight date is the year stamp in the service, not a verified day. |
| Kristiansand 2020 | 2020-04-06 | 5 points/m² | 0 | Flagged BEST=1 but not BEST_OPEN. Not downloaded. |
| Bilde Agder og Telemark 2021 Del 8 av 8 | 2021-01-01 | 4 points/m² | 0 | Image-matching point cloud, not the open DTM used here. |

The WCS grid does not stamp a project id on each cell. Søgne 2013 is the acquisition this viewer attributes because it is the only intersecting project with `BEST_OPEN=1`.

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

No roof height, storey count, or footprint is in this open extract. None is invented. The post height is a map symbol.

## Not included

- **Orthophoto.** Norge i bilder is under the Norge digitalt licence and requires a token. It is not rehosted. Relief colour is calculated from the terrain.
- **Building footprints.** FKB-Bygning is Norge digitalt-restricted. The INSPIRE Buildings WFS URL still listed by Geonorge, `https://wfs.geonorge.no/skwms1/wfs.inspire-bu-core2d`, returned “UKJENT APPLIKASJON” on 7 November 2026.
- **Zoning or regulation.** No plan map is used.
- **Commercial satellite imagery.** None.

## Orientation

The GeoTIFF is north-up. In the scene file, local x is metres east and local z is metres north. Those file coordinates are not swapped.

Three.js is right-handed and Y-up. East × up is south, not north, so storing world Z as north makes a left-handed basis. A north-up camera then draws east on the left of the screen. The rendered fix is `world Z = -local north`. A top-down view with geographic north at the top of the screen then has the east control on the right.

The parcel and the terrain use the same local metres. In map space, 62 of 66 parcel vertices are within 8 m of a DTM zero cell (median distance 0 m), and about 90% of the polygon is on land. The address point is inside the polygon. That is registration, not a second axis swap. The water edge is the Matrikkelen helper line `Hjelpelinje vannkant`; it follows the DTM water closely on this teig, with a fringe of sea cells inside the polygon.

Checked on this extract, 80 m from 425021.002 E, 6435682.001 N: north is sea (0.0 m), south is 9.86 m, west is 6.21 m, and east is 3.37 m.

## Processing

`scripts/fetch_scene.py` does the downloads and the coordinate conversion. Heights in the viewer are metres. Local x is east and local z is north, both in metres from the south-west cell centre of the grid (424721.5 E, 6435382.5 N). Vertical exaggeration is a display scale and defaults to 1.
