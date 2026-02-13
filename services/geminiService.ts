
import { GoogleGenAI, Type } from "@google/genai";
import { Molecule, AnalysisResult, SearchResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const explanationCache: Record<string, string> = {};
const resolutionCache: Record<string, SearchResult> = {};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(fn: () => Promise<T>, retries = 5, delay = 3500): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorString = JSON.stringify(error).toLowerCase();
    const isRateLimit = 
      error?.message?.includes('429') || 
      error?.status === 'RESOURCE_EXHAUSTED' ||
      errorString.includes('429') ||
      errorString.includes('quota');

    if (retries > 0 && isRateLimit) {
      const jitter = Math.floor(Math.random() * 1500) + 1000;
      console.warn(`Gemini API Quota alert. Cooling down... Retrying in ${delay + jitter}ms.`);
      await wait(delay + jitter);
      return withRetry(fn, retries - 1, delay * 1.8);
    }
    throw error;
  }
}

export async function getSuggestions(input: string): Promise<string[]> {
  if (input.length < 2) return [];
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `List 5 chemical names/SMILES for input "${input}". Return JSON array.`,
      config: { responseMimeType: "application/json" }
    });
    try {
      const data = JSON.parse(response.text);
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }, 2, 1500);
}

export async function analyzeMolecule(molecule: Molecule): Promise<AnalysisResult> {
  return withRetry(async () => {
    const prompt = `Act as an expert chemical logic engine. 
    Analyze this structure: ${JSON.stringify({ atoms: molecule.atoms, bonds: molecule.bonds })}
    Output: IUPAC name, SMILES, R/S configurations for all centers, VSEPR for non-H atoms, Predicted LogP/MW, and a valid 3D SDF string.`;

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
      rawData.vsepr.forEach((item: any) => vseprRecord[item.atomId] = item);
    }
    return { ...rawData, vsepr: vseprRecord };
  });
}

export async function resolveMolecule(query: string): Promise<SearchResult> {
  const normalized = query.trim().toLowerCase();
  if (resolutionCache[normalized]) return resolutionCache[normalized];

  return withRetry(async () => {
    const prompt = `Convert chemical "${query}" to a 2D graph with atoms and bonds. Center coordinates at (500,400). Standard bond length 55. Return SearchResult JSON.`;
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
    const result = JSON.parse(response.text);
    resolutionCache[normalized] = result;
    return result;
  });
}

export async function getExplanation(topic: string): Promise<string> {
  if (explanationCache[topic]) return explanationCache[topic];
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Explain "${topic}" for a chemist in 2 sentences.`,
    });
    const txt = response.text || "Reference unavailable.";
    explanationCache[topic] = txt;
    return txt;
  });
}
