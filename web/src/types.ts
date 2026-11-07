export interface RingPolygon {
  exterior: number[][];
  holes: number[][][];
}

export interface BuildingRecord {
  bygningsnummer: string;
  bygningstype: string;
  bygningstypeNavn: string;
  bygningsstatus: string;
  bygningsstatusNavn: string;
  standingInRegister: boolean;
  stedfestingVerifisert: boolean;
  oppdateringsdato: string;
  onSubjectParcel: boolean;
  x: number;
  z: number;
  terrainM: number | null;
}

export interface Scene {
  generatedAt: string;
  disclaimer: string;
  property: {
    adressetekst: string;
    postnummer: string;
    poststed: string;
    kommunenummer: string;
    kommunenavn: string;
    matrikkelnummer: string;
    bruksnavn: string;
    matrikkelenhetstype: string;
    adresseid: string;
    addressUpdated: string;
    stedfestingVerifisert: boolean;
    lat: number;
    lon: number;
    easting: number;
    northing: number;
    x: number;
    z: number;
    terrainM: number | null;
  };
  teig: {
    teigId: string;
    lagretBeregnetArealM2: number;
    arealmerknadTekst: string | null;
    noyaktighetsklasseTeig: string | null;
    datafangstdato: string | null;
    oppdateringsdato: string | null;
    terrainMinM: number | null;
    terrainMaxM: number | null;
    polygons: RingPolygon[];
  };
  contextParcels: Array<{
    matrikkelnummer: string;
    noyaktighetsklasseTeig: string | null;
    polygons: RingPolygon[];
  }>;
  buildings: BuildingRecord[];
  terrain: {
    width: number;
    height: number;
    cellSizeM: number;
    registration: string;
    row0: string;
    westCellCenterEasting: number;
    southCellCenterNorthing: number;
    northCellCenterNorthing: number;
    crs: string;
    crsName: string;
    geographicCrs: string;
    geographicCrsName: string;
    verticalDatum: string;
    verticalDatumEpsg: string;
    minLandM: number;
    maxLandM: number;
    seaCellCount: number;
    inlandZeroCellsFilled: number;
    landCellCount: number;
    seaEncoding: string;
    binary: string;
    binaryDtype: string;
    binarySha256: string;
  };
}
