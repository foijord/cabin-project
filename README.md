# Kalsneset 27 terrain viewer

A static 3D view of the cabin property at **Kalsneset 27, 4641 Søgne, Kristiansand**. The land surface is a real Kartverket bare-earth terrain model. The amber patch is the registered Matrikkelen parcel. Posts and rings are building *points* from the same register.

This is a planning picture for a family project. It is not a survey, not a construction model, and not a legal boundary plan.

## What the model uses

| Layer | Source | What it is |
| --- | --- | --- |
| Terrain | Kartverket national DTM, 1 m grid | Bare earth, NN2000 heights |
| Address | Kartverket address API | One official hit |
| Parcel | Matrikkelen eiendomskart teig | Registered polygon 4204-437/109 |
| Buildings | Matrikkelen building points | Points only, no roof heights |

Orthophotos and building footprints are not in the model. Norge i bilder and FKB-Bygning are not open for republishing. See [docs/PROVENANCE.md](docs/PROVENANCE.md).

## View it locally

```bash
cd web
npm ci
npm run dev
```

Open `http://localhost:5173/cabin-project/`.

Drag to orbit, right-drag or two fingers to pan, and scroll to zoom. Vertical exaggeration starts at 1×. Reset returns to that and frames the parcel.

## Rebuild the static site

```bash
cd web
npm ci
npm run build
npm run preview
```

The site is written to `web/dist` and is also served at `http://127.0.0.1:4173/cabin-project/`. Paths are prefixed with `/cabin-project/` for GitHub Pages.

## Refresh the map data

```bash
pip install -r scripts/requirements.txt
python3 scripts/fetch_scene.py
python3 scripts/validate_scene.py
```

The script downloads a 600 m extract from the public Geonorge services and rewrites `web/public/data`. It stops if the address search is not exactly Kalsneset 27, kommune 4204, gnr/bnr 437/109.

## Publish on GitHub Pages

The workflow in `.github/workflows/pages.yml` builds `web/dist` and deploys it with GitHub Actions. It runs from `main`.

1. Merge the pull request into `main`.
2. In the repository settings, open **Pages** and set the source to **GitHub Actions**.
3. Open `https://foijord.github.io/cabin-project/` after the workflow succeeds.

The repository stays private. A GitHub Pages site can still be public. The published files are only this terrain view and the public-source property location.

## Credit

© Kartverket. Address, parcel and building points are CC BY 4.0. The height dataset is published as open data with no conditions on access and use.
