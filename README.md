# Kalsneset 27 terrain viewer

A static 3D view of the cabin property at **Kalsneset 27, 4641 Søgne, Kristiansand**. The land surface is a real Kartverket bare-earth terrain model. The amber patch is the registered Matrikkelen parcel. Posts and rings are building *points* from the same register.

This is a planning picture for a family project. It is not a survey, not a construction model, and not a legal boundary plan.

The grey cabin, the red annex on the rock, and the smaller water-side outbuilding are photo models. Their outlines follow OpenStreetMap ways that carry the same Matrikkelen building numbers, and they sit on the Søgne 2013 terrain. Wall heights, roof shapes and colours are estimates. The water-side building is a guess for the boathouse: the register does not call it a naust, and the neighbour’s registered boathouse is not used. Details, imagery dates and the elevation samples are in [docs/BUILDINGS.md](docs/BUILDINGS.md).

## What the model uses

| Layer | Source | What it is |
| --- | --- | --- |
| Terrain | Kartverket Søgne 2013 DTM, native 0.5 m grid | Bare earth, NN2000. Grid spacing is not a surveyed accuracy |
| Address | Kartverket address API | One official hit |
| Parcel | Matrikkelen eiendomskart teig | Registered polygon 4204-437/109 |
| Buildings | Matrikkelen building points | Points only, no official roof heights |
| Photo models | OpenStreetMap outlines for three on-parcel numbers, plus the family overhead photo | Estimated walls, roofs and colours. See [docs/BUILDINGS.md](docs/BUILDINGS.md) |

Orthophotos and building footprints are not in the model. Norge i bilder and FKB-Bygning are not open for republishing. See [docs/PROVENANCE.md](docs/PROVENANCE.md).

## View it locally

```bash
cd web
npm ci
npm run dev
```

Open `http://localhost:5173/cabin-project/`.

The view opens on the headland, looking north toward the fjord, with the whole shore in frame. Drag to orbit, right-drag or two fingers to pan, and scroll to zoom. Vertical exaggeration starts at 1×. Reset returns to that overview. The model is about 200 m across, not the full 600 m download. East is +x. North is stored as local z and drawn as world −z, so the view is right-handed: with north at the top of the screen, east is on the right. Open water is north and east of the cabin.

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

The script downloads the native 0.5 m Søgne 2013 DTM for the existing viewer window and rewrites `web/public/data`. It stops if the address search is not exactly Kalsneset 27, kommune 4204, gnr/bnr 437/109. The 0.5 m spacing is the raster resolution, not a claim of vertical accuracy.

## Publish on GitHub Pages

The workflow in `.github/workflows/pages.yml` builds `web/dist` and deploys with GitHub Actions. It is not on `main` yet, and this integration cannot turn Pages on.

`GET /repos/foijord/cabin-project/pages` returns HTTP 403 with `X-Accepted-GitHub-Permissions: pages=read` and body `Resource not accessible by integration`. GitHub documents that header as the permission the app token lacks. A missing Pages site would be HTTP 404 after the app had `pages=read`. The repository record itself says `has_pages: false`. The workflow file is absent from `main` (contents API 404) and present on `cursor/terrain-viewer-81cc`. GitHub only runs `workflow_dispatch` once that file exists on the default branch, so this branch cannot be dispatched into a Pages deploy.

Owner steps, with the repository kept private:

1. On a personal account, GitHub Pages for a private repository requires GitHub Pro or a higher plan. GitHub Free includes Pages only for public repositories. This token cannot see the account plan. Do not make the repository public, and do not change the plan from here.
2. As the repository admin, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**. The app token is not an admin and cannot do this.
3. Merge the pull request into `main`. That push is what starts the workflow. Merge has not been requested yet.

After the workflow succeeds, check `https://foijord.github.io/cabin-project/` in a browser, including `/cabin-project/assets/`. The site is public on the internet even though the repository stays private. A privately visible Pages site would require GitHub Enterprise Cloud on an organization, which this user-owned repository is not.

## Credit

© Kartverket. Address, parcel and building points are CC BY 4.0. The terrain shown here is the Søgne 2013 project DTM. Project metadata marks it TILGANG 1 and the raster catalogue marks the same grid TILGANG 2, so it is not described here as cleared open data. See [docs/PROVENANCE.md](docs/PROVENANCE.md).
