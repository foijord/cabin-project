# Photo models of the cabin buildings

Planning shapes for Kalsneset 27. They sit on the Søgne 2013 DTM already in the viewer. They are not a survey, not a construction model, and not a legal boundary.

The numbers that can be edited without hunting through the mesh code are in [`web/src/photo-buildings.json`](../web/src/photo-buildings.json). Each building is marked `dimensionsAreEstimates: true`. The floor height is computed from the DTM when the viewer loads. Wall height, roof rise, colours and the boathouse identity are the estimates.

## What is official, and what is not

| Fact | Source | Status |
| --- | --- | --- |
| Address and parcel 4204–437/109 | Kartverket address API and Matrikkelen eiendomskart teig, CC BY 4.0 | Already in the viewer. Not replaced. |
| Building points and status | Matrikkelen bygningspunkt, CC BY 4.0 | Already in the viewer. Points are not position-verified. |
| Bare-earth height | Kartverket Søgne 2013 DTM, native 0.5 m, NN2000 | Already in the viewer. Not replaced. The project/raster access labels still disagree. See [PROVENANCE.md](PROVENANCE.md). |
| Outline in local metres | OpenStreetMap ways tagged with the same `ref:bygningsnr` | Community outline, ODbL. Not a surveyed footprint. |
| Wall height, roof rise, roof form, colour | Family overhead photo, public orthophoto view, and a few surface-model point samples | Estimates. |
| Which outbuilding is the annex, and which is the boathouse | Positional match to the family description | Guesses. The register does not call either one a naust, and both are status GR. |

FKB-Bygning footprints were not added. The Norge i bilder orthophoto was not downloaded and is not in the site.

## The three models

Local x is metres east and local z is metres north, the same frame as `scene.json`.

| Model | Register | OSM way | Register type and status | Where it sits |
| --- | --- | --- | --- | --- |
| Main cabin | 169165513 | [936839960](https://www.openstreetmap.org/way/936839960) | 161 leisure building, TB, in use | The grey stepped roof. The register point is inside the outline. |
| Annex on the rock | 19514692 | [936840733](https://www.openstreetmap.org/way/936840733) | 182 outbuilding, GR, approved demolished | Western outline, higher ground. Right of the cabin when looking inland from the water. |
| Water-side outbuilding | 169165505 | [936839961](https://www.openstreetmap.org/way/936839961) | 182 outbuilding, GR, approved demolished | Smaller outline further north, closer to the sea. Used as the boathouse guess. |

Neighbour cabin 169165521 is the long red roof to the east. That is the left-hand neighbour when looking inland from the water, and it is not modelled. Registered naust 9037489 is on a neighbouring parcel, beside a dock, and it is not used as this boathouse.

The family overhead photo shows the main cabin’s dark broad roof, a lower roof volume toward the road and the parked car, and a red-walled building with a dark roof on the rock. The lower volume is the southwest step of the main outline. It is not confirmed as an extension or as its own building, so it stays inside the cabin footprint. Two oblique waterfront photographs were described in the request and were not in the files available here. They were not used. One of them is said to show an unusually high sea. That waterline was not used to place the shore or the floor.

The annex and the water-side shed are both still drawn because the outlines, the overhead photo and the public orthophoto view show buildings there. Status GR remains the register’s own status. The model does not overrule it.

## Orthophoto that was looked at, and not copied

The public innsyn client [Norge i bilder](https://norgeibilder.no/?wkid=25833&x=71428&y=6458099&level=18) shows the property without a login. A click on the address on 8 November 2026 reported 58.05629° N, 7.72950° E, EUREF89 UTM zone 33, 71430 E, 6458100 N. The WMS at `https://wms.geonorge.no/skwms1/wms.nib` and `https://services.norgeibilder.no/wms/ortofoto` did not return a map without authentication. No token was requested and no image was saved into this repository. The licence is Norge digitalt. The viewer screenshot used for this check is not republished.

Projects the client listed for that point:

| Project | Photo date | Resolution | Type | Notes from the client |
| --- | --- | --- | --- | --- |
| Agder GSD10 MOF 2026 | 29 April 2026, project text also says 8 July 2026 | 0.10 m | Temporary orthophoto | Geovekst. Coverage FG-14696. Standard deviation 1.80 m. UTM 32. |
| Lindesnes-Kristiansand 2023 | 27 April 2023 | 0.10 m | Orthophoto | Geovekst / Hexagon. Coverage HX-13549, stripe 9, image 28. Standard deviation 0.70 m. Published 13 November 2023. |
| Agder og Telemark 2021 | 22 July 2021 / 23 August 2021 | 0.25 m | Orthophoto | Omløpsfoto. Standard deviation 1.50 m. |
| Mandal Søgne 2017 | 19 April 2017 | 0.10 m | Orthophoto | Geovekst. Coverage TT-14282. |
| Sørlandet 2014 | 29 May 2014 / 14 September 2014 | 0.25 m | Orthophoto | Omløpsfoto. |
| Sørlandet 2009 | 29 May 2009 | 0.50 m | Orthophoto | Omløpsfoto. |
| Søgne sentrum 2005, Søgne 2005, Søgne sør 2000, Kristiansand-Lindesnes 2000 | listed by the client | not all opened | older orthophoto | Present in the project list for the same click. Not measured from. |

Horizontal coordinates in the client were EUREF89 UTM. The standard-deviation figures are the project’s own reported values, not a check made on this roof. There is no open orthophoto of a few centimetres. The 0.10 m products are the finest the client listed, and they are not cleared for rehosting.

The open Kartverket WMTS cache (`https://cache.kartverket.no/v1/wmts/1.0.0/WMTSCapabilities.xml`) serves topo, toporaster and grey topo. It has no orthophoto layer. The national view in Norge i bilder is labelled Copernicus Sentinel-2 2018, which is far too coarse for a roof outline.

## Elevation

The floor of each model is a percentile of the existing 0.5 m DTM under that outline. The datum is NN2000, the same as the grid. A short foundation skirt reaches toward a lower percentile and is capped, so a rocky corner does not drop the whole building and a shore cell does not leave a large gap at 1× exaggeration. Vertical exaggeration still stretches the terrain and not the building, which is the same rule as the register posts.

Extra surface heights were sampled, not adopted as a new grid. The Høydedata DOM ImageServer catalogue row for Søgne 2013 (OBJECTID 1924, `LAS_PROJECT_ID` 30, category 1) returns `TILGANG` `"2"`. The [høydedata FAQ](https://test.hoydedata.no/LaserInnsyn2/help_no/topics/idh-topic230.htm) describes that as closed. The raster was not exported and is not in the repository. Unauthenticated `identify` calls on 8 November 2026 did return point values, horizontal EPSG:25832, vertical code 5941 (NN2000), flight year 2013:

| Place | DOM identify | DTM at the same register point | Difference |
| --- | --- | --- | --- |
| Cabin 169165513, 425021 E, 6435682 N | 7.18 m | about 3.63 m | about 3.5 m |
| Annex 19514692, 425002 E, 6435691 N | 7.70 m | about 4.18 m | about 3.5 m |
| Water-side 169165505, 425009 E, 6435696 N | 3.24 m | about 2.26 m | about 1.0 m |

The first two differences are in the same range as a low single-storey roof, and the wall-plus-rise estimates sit near them. They are still one cell each, not a ridge line. The water-side difference is too small to be a roof, so that building’s 2.1 m wall and 0.85 m rise are not taken from the surface model. The point-height API `https://ws.geonorge.no/hoyde/v1/punkt` again returned HTTP 403. Kristiansand 2020, which is a newer laser project and is flagged closed, was not downloaded.

The DTM under the cabin outline runs from roughly 2.8 m to 6.9 m because the southwest edge climbs onto rock. The placed floor follows the lower pad, so that rock can meet the wall. The water-side outline runs from about 0.1 m to 3.0 m. Its floor is kept at least 1.0 m NN2000. Exact zeros in this grid are the sea encoding. A temporary high-water line was not used.

## Orientation

North is the same axis as the rest of the viewer. From the water, looking inland, east is to the left and west is to the right. The red-roof neighbour is east. The annex guess is west, on higher ground. The boathouse guess is the on-parcel outline furthest north.

OpenStreetMap contributors mapped these ways and tagged the building numbers. © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright). That alignment with the register is a check, not a survey accuracy.