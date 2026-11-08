/// <reference types="vite/client" />
import { photoBuildings } from "./photoBuildings";
import type { Scene } from "./types";
import { createViewer, type Viewer } from "./viewer";

const base = import.meta.env.BASE_URL;

async function main() {
  wirePanelToggle();
  const loader = document.querySelector<HTMLElement>("#loader");
  const error = document.querySelector<HTMLElement>("#error");
  const canvas = document.querySelector<HTMLCanvasElement>("#view");
  if (!canvas) throw new Error("Missing canvas");
  try {
    setStatus("Fetching the Kartverket terrain extract…");
    const scene = await fetchJson<Scene>(`${base}data/scene.json`);
    setStatus("Reading the 0.5 m elevation grid…");
    const gridBuffer = await fetchBuffer(`${base}data/${scene.terrain.binary}`);
    const grid = new Float32Array(gridBuffer);
    const expected = scene.terrain.width * scene.terrain.height;
    if (grid.length !== expected) {
      throw new Error(`Terrain grid has ${grid.length} cells, expected ${expected}`);
    }
    fillPanel(scene);
    const viewer = createViewer(canvas, scene, grid);
    wireControls(viewer);
    loader?.classList.add("hidden");
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "The terrain model could not be loaded.";
    if (error) {
      error.hidden = false;
      error.textContent = message;
    }
    loader?.classList.add("hidden");
  }
}

function setStatus(text: string) {
  const node = document.querySelector("#loader p");
  if (node) node.textContent = text;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  return response.json() as Promise<T>;
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  return response.arrayBuffer();
}

function fillPanel(scene: Scene) {
  const property = scene.property;
  const teig = scene.teig;
  const onParcel = scene.buildings.filter((building) => building.onSubjectParcel);
  const facts = document.querySelector("#facts");
  if (facts) {
    const elevation =
      property.terrainM === null ? "not on measured land" : `${property.terrainM.toFixed(2)} m NN2000`;
    facts.innerHTML = `
      <p class="eyebrow">${escapeHtml(property.postnummer)} ${escapeHtml(property.poststed)} · ${escapeHtml(titleCase(property.kommunenavn))}</p>
      <h1>${escapeHtml(property.adressetekst)}</h1>
      <p class="lede">Public terrain, the registered parcel, building points, and approximate models of the cabin, the annex and the water-side outbuilding. A planning picture, not a survey and not a legal map.</p>
      <dl>
        <div><dt>Matrikkel</dt><dd>${escapeHtml(property.kommunenummer)}–${escapeHtml(property.matrikkelnummer)}</dd></div>
        <div><dt>Bruksnavn</dt><dd>${escapeHtml(property.bruksnavn)}</dd></div>
        <div><dt>Registered area</dt><dd>${formatArea(teig.lagretBeregnetArealM2)}</dd></div>
        <div><dt>Address height</dt><dd>${elevation}</dd></div>
        <div><dt>On the parcel</dt><dd>${teig.terrainMinM?.toFixed(1)} to ${teig.terrainMaxM?.toFixed(1)} m</dd></div>
      </dl>
      <p class="note">Quality class <strong>${escapeHtml(teig.noyaktighetsklasseTeig ?? "not stated")}</strong>. Register remark: ${escapeHtml(teig.arealmerknadTekst ?? "none")}. Yellow means a boundary is a shoreline or road helper line, or of lesser quality. The address point is not marked as position-verified.</p>
    `;
  }
  const list = document.querySelector("#buildings");
  if (list) {
    const modeled = new Map(photoBuildings.buildings.map((model) => [model.registerBygningsnummer, model]));
    list.innerHTML = onParcel
      .map((building) => {
        const model = modeled.get(building.bygningsnummer);
        const posture = model
          ? `Photo model “${escapeHtml(model.label)}”, role ${escapeHtml(model.role)}. Outline follows OpenStreetMap way ${model.osmWayId}. Wall ${model.wallHeightM.toFixed(1)} m and roof rise ${model.roofRiseM.toFixed(2)} m are estimates, not measured heights.`
          : building.standingInRegister
            ? "Drawn as a post. No footprint and no roof height in the open data."
            : "Drawn as a ring, not as a standing building. No footprint and no roof height in the open data.";
        const guess = model ? `<span>${escapeHtml(model.identification)}</span>` : "";
        return `<li>
          <strong>${escapeHtml(building.bygningstypeNavn)}</strong>
          <span>${escapeHtml(building.bygningsstatus)} · ${escapeHtml(building.bygningsstatusNavn)}</span>
          <span>No. ${escapeHtml(building.bygningsnummer)} · position verified: ${building.stedfestingVerifisert ? "yes" : "no"}</span>
          <span>${posture}</span>
          ${guess}
        </li>`;
      })
      .join("");
  }
  const otherCount = scene.buildings.length - onParcel.length;
  const other = document.querySelector("#other-buildings");
  if (other) {
    const span = Math.max(scene.terrain.width, scene.terrain.height);
    other.textContent = `${otherCount} other Matrikkelen points in this ${span} m view are shown smaller. Status GR is approved demolished or burned.`;
  }
  const sources = document.querySelector("#sources");
  if (sources) {
    const when = scene.generatedAt.slice(0, 10);
    sources.innerHTML = `
      <p><strong>Terrain.</strong> Søgne 2013 project DTM, Kartverket laser project 30, native ${scene.terrain.cellSizeM} m cells, nearest-neighbour export, downloaded ${when}. This is not a resample of the national 1 m model. Last flight 30 April 2013. Ordered density 3 points/m². The ${scene.terrain.cellSizeM} m spacing is the grid resolution, not a surveyed accuracy. Horizontal ${escapeHtml(scene.terrain.crsName)} (${escapeHtml(scene.terrain.crs)}). Vertical ${escapeHtml(scene.terrain.verticalDatum)} (${escapeHtml(scene.terrain.verticalDatumEpsg)}). Land in this window runs from ${scene.terrain.minLandM} m to ${scene.terrain.maxLandM} m. ${scene.terrain.seaCellCount.toLocaleString("en-GB")} edge-connected cells were exactly 0 and are drawn as sea. ${scene.terrain.inlandZeroCellsFilled} inland zeros were filled from neighbouring measured cells.</p>
      <p><strong>Acquisition.</strong> The grid is filtered to Søgne 2013, laser project 30, the intersecting project flagged <code>BEST_OPEN=1</code>. Last flight 30 April 2013, ordered density 3 points/m², natural-neighbour DTM. Kristiansand 2020 also intersects the point and was not used.</p>
      <p><strong>Address.</strong> Kartverket address API, one hit for Kalsneset 27. ${property.lat.toFixed(6)}° N, ${property.lon.toFixed(6)}° E in ${escapeHtml(scene.terrain.geographicCrsName)}. Register id ${escapeHtml(property.adresseid)}. Position verified: ${property.stedfestingVerifisert ? "yes" : "no"}.</p>
      <p><strong>Parcel.</strong> Matrikkelen eiendomskart teig, id ${escapeHtml(teig.teigId)}. datafangstdato ${escapeHtml(teig.datafangstdato ?? "not stated")}. Updated ${escapeHtml(teig.oppdateringsdato ?? "not stated")}. Neighbouring lines are the other teigs returned for this extract. No owner names are shown.</p>
      <p><strong>Buildings and photos.</strong> Open Matrikkelen data here is still building points, not official footprints. FKB-Bygning was not added. The three photo models use OpenStreetMap outlines that carry the same building numbers, draped on this DTM. Wall heights, roof shapes and colours are estimates. The orthophoto was looked at in the public Norge i bilder viewer and is not bundled: that imagery is Norge digitalt. See docs/BUILDINGS.md. Nothing in the model is a surveyed roof height.</p>
      <p><strong>Licence.</strong> Address, parcel and building points are CC BY 4.0. The terrain is © Kartverket, Søgne 2013. Project metadata marks that project TILGANG 1. The raster catalogue row for the same 0.5 m grid marks TILGANG 2, which the høydedata FAQ describes as closed. Those labels disagree, so this grid is not treated as cleared open data. © Kartverket.</p>
    `;
  }
}

function wirePanelToggle() {
  const button = document.querySelector<HTMLButtonElement>("#panel-toggle");
  const body = document.querySelector<HTMLElement>("#panel-body");
  const sync = () => {
    const collapsed = document.documentElement.classList.contains("panel-collapsed");
    if (body) body.hidden = collapsed;
    if (!button) return;
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    button.textContent = collapsed ? "Info" : "Close";
  };
  button?.addEventListener("click", () => {
    document.documentElement.classList.toggle("panel-collapsed");
    sync();
  });
  sync();
}

function wireControls(viewer: Viewer) {
  const exag = document.querySelector<HTMLInputElement>("#exaggeration");
  const exagValue = document.querySelector("#exaggeration-value");
  const relief = document.querySelector<HTMLInputElement>("#relief");
  const contours = document.querySelector<HTMLInputElement>("#contours");
  const interval = document.querySelector<HTMLSelectElement>("#contour-interval");
  const wire = document.querySelector<HTMLInputElement>("#wire");
  const grid = document.querySelector<HTMLInputElement>("#grid");
  const parcels = document.querySelector<HTMLInputElement>("#parcels");
  const buildings = document.querySelector<HTMLInputElement>("#show-buildings");
  const photo = document.querySelector<HTMLInputElement>("#photo-models");

  const syncExaggeration = () => {
    const value = Number(exag?.value ?? 1);
    if (exagValue) exagValue.textContent = `${value.toFixed(1)}×`;
    viewer.setExaggeration(value);
  };
  exag?.addEventListener("input", syncExaggeration);
  relief?.addEventListener("change", () => viewer.setRelief(relief.checked));
  const syncContours = () => viewer.setContours(contours?.checked ?? false, Number(interval?.value ?? 5));
  contours?.addEventListener("change", syncContours);
  interval?.addEventListener("change", syncContours);
  wire?.addEventListener("change", () => viewer.setWireframe(wire.checked));
  grid?.addEventListener("change", () => viewer.setGrid(grid.checked));
  parcels?.addEventListener("change", () => viewer.setParcels(parcels.checked));
  buildings?.addEventListener("change", () => viewer.setBuildings(buildings.checked));
  photo?.addEventListener("change", () => viewer.setPhotoModels(photo.checked));
  document.querySelector("#frame-property")?.addEventListener("click", () => viewer.frameProperty());
  document.querySelector("#frame-context")?.addEventListener("click", () => viewer.frameContext());
  document.querySelector("#reset-view")?.addEventListener("click", () => {
    if (exag) exag.value = "1";
    syncExaggeration();
viewer.frameContext();
});
  window.addEventListener("keydown", (event) => {
    if (event.key === "r" || event.key === "R") viewer.frameContext();
    if (!exag) return;
    if (event.key === "+" || event.key === "=") {
      exag.value = String(Math.min(4, Number(exag.value) + 0.5));
      syncExaggeration();
    }
    if (event.key === "-" || event.key === "_") {
      exag.value = String(Math.max(1, Number(exag.value) - 0.5));
      syncExaggeration();
    }
  });
  syncContours();
}

function formatArea(value: number): string {
  return `${value.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m<sup>2</sup>`;
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function escapeHtml(value: string | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

void main();
