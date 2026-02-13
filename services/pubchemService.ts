
import { PhysicalProperties } from "../types";

/**
 * Fetches physical properties from PubChem using PUG REST.
 * Note: Some experimental properties require second calls to the PubChem JSON service.
 */
export async function fetchPubChemData(smiles: string): Promise<PhysicalProperties> {
  try {
    const encodedSmiles = encodeURIComponent(smiles);
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodedSmiles}/property/MolecularWeight,XLogP,HBondDonorCount,HBondAcceptorCount/JSON`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error("PubChem lookup failed");
    
    const json = await response.json();
    const props = json.PropertyTable.Properties[0];

    return {
      molecularWeight: props.MolecularWeight ? `${props.MolecularWeight} g/mol` : "N/A",
      logP: props.XLogP?.toString() || "N/A",
      hBondDonors: props.HBondDonorCount || 0,
      hBondAcceptors: props.HBondAcceptorCount || 0,
      // Boiling/Melting usually require a different section of the PubChem API
      boilingPoint: "Retrieving...",
      meltingPoint: "Retrieving..."
    };
  } catch (error) {
    console.error("PubChem fetch error:", error);
    return {};
  }
}
