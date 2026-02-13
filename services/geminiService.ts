
import { GoogleGenAI, Type } from "@google/genai";
import { Molecule, AnalysisResult, SearchResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Client-side caches to avoid redundant API calls and save quota.
 */
const explanationCache: Record<string, string> = {};
const resolutionCache: Record<string, SearchResult> = {};

/**
 * Utility to wait for a specified number of milliseconds.
 */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Helper to retry a function with exponential backoff if a 429 error is encountered.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 4, delay = 2500): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorString = JSON.stringify(error).toLowerCase();
    const isRateLimit = 
      error?.message?.includes('429') || 
      error?.status === 'RESOURCE_EXHAUSTED' ||
      errorString.includes('429') ||
      errorString.includes('resource_exhausted') ||
      errorString.includes('quota');

    if (retries > 0 && isRateLimit) {
      console.warn(`Quota limit hit. Retrying in ${delay}ms... (${retries} retries left)`);
      await wait(delay);
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * Get suggestions for chemical names/SMILES based on input.
 * Uses Flash model to minimize costs.
 */
export async function getSuggestions(input: string): Promise<string[]> {
  if (input.length < 2) return [];
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `List 5 common chemical names or SMILES matching "${input}". Return ONLY a JSON array of strings.`,
      config: {
        responseMimeType: "application/json",
      }
    });
    try {
      const data = JSON.parse(response.text);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  });
}

/**
 * Performs a comprehensive molecular analysis using Gemini.
 * High-accuracy Pro model used for stereochemistry logic.
 */
export async function analyzeMolecule(molecule: Molecule): Promise<AnalysisResult> {
  return withRetry(async () => {
    const prompt = `Act as an advanced chemical informatics service.
    Input Molecule: ${JSON.stringify({ atoms: molecule.atoms, bonds: molecule.bonds })}
    
    Analysis required:
    1. SMILES generation and IUPAC naming.
    2. Complete stereochemistry (R/S, E/Z).
    3. Detailed VSEPR geometries for all non-hydrogen atoms.
    4. Predict physical properties (MW, logP, BP, MP, Density).
    5. Variations (Isomers & Conformations).
    6. High-quality SDF string for 3D visualization.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            stereocenters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  atomId: { type: Type.STRING },
                  configuration: { type: Type.STRING },
                  logic: { type: Type.STRING }
                }
              }
            },
            vsepr: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  atomId: { type: Type.STRING },
                  axeNotation: { type: Type.STRING },
                  lonePairs: { type: Type.NUMBER },
                  electronicGeometry: { type: Type.STRING },
                  molecularGeometry: { type: Type.STRING },
                  bondAngles: { type: Type.STRING }
                }
              }
            },
            dipoleMoment: { type: Type.STRING },
            educationalNote: { type: Type.STRING },
            sdfData: { type: Type.STRING },
            isomers: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  smiles: { type: Type.STRING },
                  type: { type: Type.STRING },
                  description: { type: Type.STRING }
                }
              }
            },
            conformations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  smiles: { type: Type.STRING },
                  energyScore: { type: Type.STRING },
                  description: { type: Type.STRING }
                }
              }
            },
            properties: {
              type: Type.OBJECT,
              properties: {
                molecularWeight: { type: Type.STRING },
                logP: { type: Type.STRING },
                boilingPoint: { type: Type.STRING },
                meltingPoint: { type: Type.STRING },
                density: { type: Type.STRING }
              }
            },
            metadata: {
              type: Type.OBJECT,
              properties: {
                smiles: { type: Type.STRING },
                iupacName: { type: Type.STRING },
                commonName: { type: Type.STRING },
                formula: { type: Type.STRING }
              }
            }
          }
        }
      }
    });

    const rawData = JSON.parse(response.text);
    const vseprRecord: Record<string, any> = {};
    if (Array.isArray(rawData.vsepr)) {
      rawData.vsepr.forEach((item: any) => {
        vseprRecord[item.atomId] = item;
      });
    }

    return { ...rawData, vsepr: vseprRecord };
  });
}

/**
 * Resolves a query string into a molecule structure.
 * Uses Flash model and resolutionCache.
 */
export async function resolveMolecule(query: string): Promise<SearchResult> {
  const normalized = query.trim().toLowerCase();
  if (resolutionCache[normalized]) return resolutionCache[normalized];

  const result = await withRetry(async () => {
    const prompt = `Convert the chemical name or SMILES "${query}" into a 2D graph.
    Position the molecule centrally. Return a SearchResult JSON object.`;
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            molecule: {
              type: Type.OBJECT,
              properties: {
                atoms: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      element: { type: Type.STRING },
                      x: { type: Type.NUMBER },
                      y: { type: Type.NUMBER },
                      formalCharge: { type: Type.NUMBER },
                      lonePairs: { type: Type.NUMBER }
                    }
                  }
                },
                bonds: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      from: { type: Type.STRING },
                      to: { type: Type.STRING },
                      type: { type: Type.STRING }
                    }
                  }
                }
              }
            },
            metadata: {
              type: Type.OBJECT,
              properties: {
                smiles: { type: Type.STRING },
                iupacName: { type: Type.STRING },
                commonName: { type: Type.STRING },
                formula: { type: Type.STRING }
              }
            }
          }
        }
      }
    });
    return JSON.parse(response.text);
  });

  resolutionCache[normalized] = result;
  return result;
}

/**
 * Fetches academic explanations for chemical concepts.
 */
export async function getExplanation(topic: string): Promise<string> {
  if (explanationCache[topic]) return explanationCache[topic];
  const result = await withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Concise academic explanation of "${topic}" for a stereochemistry student.`,
    });
    return response.text || "Explanation unavailable.";
  });
  explanationCache[topic] = result;
  return result;
}
