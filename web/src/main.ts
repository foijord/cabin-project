/// <reference types="vite/client" />
import type { Scene } from "./types";
import { createViewer, type Viewer } from "./viewer";

const base = import.meta.env.BASE_URL;

async function main() {
  const loader = document.querySelector<HTMLElement>("#loader");
  const error = document.querySelector<HTMLElement>("#error");
  const canvas = document.querySelector<HTMLCanvasElement>("#view");
  if (!canvas) throw new Error("Missing canvas");
  try {
    setStatus("Fetching the Kartverket terrain extract…");
    const scene = await fetchJson<Scene>(`${base}data/scene.json`);
    setStatus("Reading the 1 m elevation grid…");
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
      <p class="lede">Public terrain, the registered parcel, and building points. A planning picture, not a survey and not a legal map.</p>
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
    list.innerHTML = onParcel
      .map((building) => {
        const posture = building.standingInRegister ? "Drawn as a post" : "Drawn as a ring, not as a standing building";
        return `<li>
          <strong>${escapeHtml(building.bygningstypeNavn)}</strong>
          <span>${escapeHtml(building.bygningsstatus)} · ${escapeHtml(building.bygningsstatusNavn)}</span>
          <span>No. ${escapeHtml(building.bygningsnummer)} · position verified: ${building.stedfestingVerifisert ? "yes" : "no"}</span>
          <span>${posture}. No footprint and no roof height in the open data.</span>
        </li>`;
      })
      .join("");
  }
  const otherCount = scene.buildings.length - onParcel.length;
  const other = document.querySelector("#other-buildings");
  if (other) {
    other.textContent = `${otherCount} other Matrikkelen points in this 600 m view are shown smaller. Status GR is approved demolished or burned.`;
  }
  const sources = document.querySelector("#sources");
  if (sources) {
    const when = scene.generatedAt.slice(0, 10);
    sources.innerHTML = `
      <p><strong>Terrain.</strong> Kartverket national bare-earth DTM, coverage <code>nhm_dtm_topo_25832</code>, 1 m cell centres, downloaded ${when}. Horizontal ${escapeHtml(scene.terrain.crsName)} (${escapeHtml(scene.terrain.crs)}). Vertical ${escapeHtml(scene.terrain.verticalDatum)} (${escapeHtml(scene.terrain.verticalDatumEpsg)}). Land in this extract runs from ${scene.terrain.minLandM} m to ${scene.terrain.maxLandM} m. ${scene.terrain.seaCellCount.toLocaleString("en-GB")} edge-connected cells were exactly 0 and are drawn as sea. ${scene.terrain.inlandZeroCellsFilled} inland zeros were filled from neighbouring measured cells.</p>
      <p><strong>Acquisition.</strong> The only height project polygon flagged <code>BEST_OPEN=1</code> here is Søgne 2013, last flight 30 April 2013, ordered density 3 points/m², natural-neighbour DTM. The WCS grid does not stamp a project id on each cell. Kristiansand 2020 intersects the point but is not flagged as the open model and was not downloaded separately.</p>
      <p><strong>Address.</strong> Kartverket address API, one hit for Kalsneset 27. ${property.lat.toFixed(6)}° N, ${property.lon.toFixed(6)}° E in ${escapeHtml(scene.terrain.geographicCrsName)}. Register id ${escapeHtml(property.adresseid)}. Position verified: ${property.stedfestingVerifisert ? "yes" : "no"}.</p>
      <p><strong>Parcel.</strong> Matrikkelen eiendomskart teig, id ${escapeHtml(teig.teigId)}. datafangstdato ${escapeHtml(teig.datafangstdato ?? "not stated")}. Updated ${escapeHtml(teig.oppdateringsdato ?? "not stated")}. Neighbouring lines are the other teigs returned for this extract. No owner names are shown.</p>
      <p><strong>Buildings and photos.</strong> Open data here is building points, not outlines. FKB-Bygning footprints and Norge i bilder orthophotos are under the Norge digitalt licence and are not included. The published INSPIRE building WFS returned “unknown application” on ${when}. Nothing in the model is a measured roof height.</p>
      <p><strong>Licence.</strong> Height data is published as open data with no conditions on access and use. Address, parcel and building points are CC BY 4.0. © Kartverket.</p>
    `;
  }
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
  document.querySelector("#frame-property")?.addEventListener("click", () => viewer.frameProperty());
  document.querySelector("#frame-context")?.addEventListener("click", () => viewer.frameContext());
  document.querySelector("#reset-view")?.addEventListener("click", () => {
    if (exag) exag.value = "1";
    syncExaggeration();
    viewer.frameProperty();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "r" || event.key === "R") viewer.frameProperty();
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
