
export type ElementType = 'C' | 'H' | 'O' | 'N' | 'F' | 'Cl' | 'Br' | 'I' | 'P' | 'S';

export interface Atom {
  id: string;
  element: ElementType;
  x: number;
  y: number;
  formalCharge: number;
  lonePairs: number;
}

export interface Bond {
  id: string;
  from: string;
  to: string;
  type: 'single' | 'double' | 'triple' | 'wedge' | 'dash';
}

export interface Molecule {
  atoms: Atom[];
  bonds: Bond[];
  smiles?: string;
  iupacName?: string;
  commonName?: string;
  formula?: string;
}

export interface VSEPRInfo {
  axeNotation: string;
  lonePairs: number;
  electronicGeometry: string;
  molecularGeometry: string;
  bondAngles: string;
}

export interface PhysicalProperties {
  molecularWeight?: string;
  logP?: string;
  boilingPoint?: string;
  meltingPoint?: string;
  density?: string;
  hBondDonors?: number;
  hBondAcceptors?: number;
}

export interface IsomerInfo {
  name: string;
  smiles: string;
  type: 'enantiomer' | 'diastereomer' | 'constitutional';
  description: string;
}

export interface ConformationInfo {
  name: string;
  smiles: string;
  energyScore: string;
  description: string;
}

export interface AnalysisResult {
  stereocenters: Array<{
    atomId: string;
    configuration: 'R' | 'S' | 'None';
    logic: string;
  }>;
  vsepr: Record<string, VSEPRInfo>;
  dipoleMoment: string;
  educationalNote: string;
  sdfData?: string;
  isomers: IsomerInfo[];
  conformations: ConformationInfo[];
  properties: PhysicalProperties;
  metadata: {
    smiles: string;
    iupacName: string;
    commonName: string;
    formula: string;
  };
}

export interface SearchResult {
  molecule: Molecule;
  metadata: {
    smiles: string;
    iupacName: string;
    commonName: string;
    formula: string;
  };
}
