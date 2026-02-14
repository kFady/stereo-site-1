
import { PhysicalProperties, Molecule, SearchResult, Atom, Bond } from "../types";

/**
 * Fetches physical properties and structural data from PubChem.
 */
export async function fetchPubChemData(smiles: string): Promise<PhysicalProperties> {
  try {
    const encodedSmiles = encodeURIComponent(smiles);
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodedSmiles}/property/MolecularWeight,XLogP,HBondDonorCount,HBondAcceptorCount,IUPACName,MolecularFormula/JSON`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error("PubChem lookup failed");
    
    const json = await response.json();
    const props = json.PropertyTable.Properties[0];

    return {
      molecularWeight: props.MolecularWeight ? `${props.MolecularWeight} g/mol` : "N/A",
      logP: props.XLogP?.toString() || "N/A",
      hBondDonors: props.HBondDonorCount || 0,
      hBondAcceptors: props.HBondAcceptorCount || 0,
      boilingPoint: "See PubChem Record",
      meltingPoint: "See PubChem Record"
    };
  } catch (error) {
    console.error("PubChem fetch error:", error);
    return {};
  }
}

/**
 * Resolves a chemical name or SMILES to a full Molecule object using PubChem.
 * This is the primary fallback for Gemini 429 errors.
 */
export async function resolveMoleculeFromPubChem(query: string): Promise<SearchResult> {
  // 1. Get CID
  const nameUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(query)}/cids/JSON`;
  const cidRes = await fetch(nameUrl);
  if (!cidRes.ok) throw new Error("Could not find molecule in PubChem");
  const cidJson = await cidRes.json();
  const cid = cidJson.IdentifierList.CID[0];

  // 2. Get properties and SMILES
  const propUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/IUPACName,CanonicalSMILES,MolecularFormula/JSON`;
  const propRes = await fetch(propUrl);
  const propJson = await propRes.json();
  const meta = propJson.PropertyTable.Properties[0];

  // 3. Get 2D JSON for coordinates/graph
  const jsonUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/JSON`;
  const jsonRes = await fetch(jsonUrl);
  const data = await jsonRes.json();
  
  const compound = data.PC_Compounds[0];
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];

  // Parse Atoms
  const aid = compound.atoms.aid;
  const elements = compound.atoms.element;
  const coords = compound.coords[0].conformers[0];
  const x = coords.x;
  const y = coords.y;

  for (let i = 0; i < aid.length; i++) {
    // Map atomic numbers to symbols
    const symMap: Record<number, string> = { 6:'C', 1:'H', 8:'O', 7:'N', 9:'F', 17:'Cl', 35:'Br', 53:'I', 15:'P', 16:'S' };
    const element = (symMap[elements[i]] || 'C') as any;
    
    atoms.push({
      id: `pc-${aid[i]}`,
      element,
      // Scale and center PubChem coords
      x: (x[i] * 40) + 500,
      y: (y[i] * -40) + 400,
      formalCharge: 0,
      lonePairs: 0
    });
  }

  // Parse Bonds
  if (compound.bonds) {
    const b_aid1 = compound.bonds.aid1;
    const b_aid2 = compound.bonds.aid2;
    const b_order = compound.bonds.order;
    for (let i = 0; i < b_aid1.length; i++) {
      const typeMap: Record<number, any> = { 1: 'single', 2: 'double', 3: 'triple' };
      bonds.push({
        id: `pc-b-${i}`,
        from: `pc-${b_aid1[i]}`,
        to: `pc-${b_aid2[i]}`,
        type: typeMap[b_order[i]] || 'single'
      });
    }
  }

  return {
    molecule: { atoms, bonds },
    metadata: {
      smiles: meta.CanonicalSMILES,
      iupacName: meta.IUPACName,
      commonName: query,
      formula: meta.MolecularFormula
    }
  };
}

/**
 * Fetches 3D coordinates (SDF) for a given CID or Name.
 */
export async function fetch3DSdfFromPubChem(query: string): Promise<string> {
  try {
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(query)}/SDF?record_type=3d`;
    const res = await fetch(url);
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}
