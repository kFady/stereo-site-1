
import { PhysicalProperties, Molecule, SearchResult, Atom, Bond } from "../types";

/**
 * Fetches physical properties from PubChem using CID for maximum reliability.
 */
export async function fetchPubChemData(smiles: string): Promise<PhysicalProperties> {
  try {
    if (!smiles) return {};
    
    // Step 1: Resolve SMILES to CID first (more reliable than direct property lookup via SMILES)
    const cidLookupUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(smiles)}/cids/JSON`;
    const cidResponse = await fetch(cidLookupUrl);
    if (!cidResponse.ok) return {}; // Silently fail if not found
    
    const cidData = await cidResponse.json();
    const cid = cidData.IdentifierList?.CID?.[0];
    if (!cid) return {};

    // Step 2: Fetch properties using the CID
    const propUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/MolecularWeight,XLogP,HBondDonorCount,HBondAcceptorCount,IUPACName,MolecularFormula/JSON`;
    const propResponse = await fetch(propUrl);
    if (!propResponse.ok) return {};
    
    const json = await propResponse.json();
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
    // Return empty object instead of throwing to maintain app stability
    console.warn("PubChem enrichment skipped:", error);
    return {};
  }
}

/**
 * Resolves a chemical name or SMILES to a full Molecule object using PubChem.
 * This is the primary fallback for Gemini 429 errors.
 */
export async function resolveMoleculeFromPubChem(query: string): Promise<SearchResult> {
  let cid: number | null = null;
  
  // 1. Attempt lookup by Name
  try {
    const nameUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(query)}/cids/JSON`;
    const cidRes = await fetch(nameUrl);
    if (cidRes.ok) {
      const cidJson = await cidRes.json();
      cid = cidJson.IdentifierList?.CID?.[0];
    }
  } catch (e) {}

  // 2. Fallback to lookup by SMILES if CID not found
  if (!cid) {
    try {
      const smilesUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(query)}/cids/JSON`;
      const cidRes = await fetch(smilesUrl);
      if (cidRes.ok) {
        const cidJson = await cidRes.json();
        cid = cidJson.IdentifierList?.CID?.[0];
      }
    } catch (e) {}
  }

  if (!cid) {
    throw new Error("Could not find molecule in PubChem. Try a common name or a formal SMILES string.");
  }

  // 3. Get properties and SMILES
  const propUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/IUPACName,CanonicalSMILES,MolecularFormula/JSON`;
  const propRes = await fetch(propUrl);
  if (!propRes.ok) throw new Error("Could not fetch properties from PubChem");
  const propJson = await propRes.json();
  const meta = propJson.PropertyTable.Properties[0];

  // 4. Get 2D JSON for coordinates/graph
  const jsonUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/JSON`;
  const jsonRes = await fetch(jsonUrl);
  if (!jsonRes.ok) throw new Error("Could not fetch structure from PubChem");
  const data = await jsonRes.json();
  
  const compound = data.PC_Compounds[0];
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];

  // Parse Atoms
  const aid = compound.atoms.aid;
  const elements = compound.atoms.element;
  const coords = compound.coords?.[0]?.conformers?.[0];
  
  if (!aid || !elements || !coords) {
    throw new Error("PubChem record missing structural coordinates");
  }

  const x = coords.x;
  const y = coords.y;

  for (let i = 0; i < aid.length; i++) {
    const symMap: Record<number, string> = { 6:'C', 1:'H', 8:'O', 7:'N', 9:'F', 17:'Cl', 35:'Br', 53:'I', 15:'P', 16:'S' };
    const element = (symMap[elements[i]] || 'C') as any;
    
    atoms.push({
      id: `pc-${aid[i]}`,
      element,
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
      smiles: meta.CanonicalSMILES || "",
      iupacName: meta.IUPACName || query,
      commonName: query,
      formula: meta.MolecularFormula || ""
    }
  };
}

/**
 * Fetches 3D coordinates (SDF) for a given CID or Name.
 */
export async function fetch3DSdfFromPubChem(query: string): Promise<string> {
  try {
    // Try by name first
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(query)}/SDF?record_type=3d`;
    let res = await fetch(url);
    
    // If name fails, try direct SMILES SDF generation
    if (!res.ok) {
        const smilesUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(query)}/SDF?record_type=3d`;
        res = await fetch(smilesUrl);
    }
    
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}
