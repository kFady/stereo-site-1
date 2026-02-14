
import { GoogleGenAI, Type } from "@google/genai";
import { Molecule, AnalysisResult, SearchResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const CACHE_PREFIX = 'stereochem_v5_';

const cache = {
  get: (key: string) => {
    try {
      const item = localStorage.getItem(CACHE_PREFIX + key);
      return item ? JSON.parse(item) : null;
    } catch { return null; }
  },
  set: (key: string, val: any) => {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(val));
    } catch { }
  }
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Robust retry mechanism with exponential backoff specifically for 429 errors.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorStr = JSON.stringify(error).toLowerCase();
    const isRateLimit = errorStr.includes('429') || errorStr.includes('resource_exhausted');

    if (retries > 0 && isRateLimit) {
      // Use longer delays for quota limits
      const backoffDelay = delay + Math.floor(Math.random() * 1000);
      console.warn(`Quota limit reached. Retrying in ${backoffDelay}ms...`);
      await wait(backoffDelay);
      return withRetry(fn, retries - 1, delay * 2.5);
    }
    throw error;
  }
}

export async function getSuggestions(input: string): Promise<string[]> {
  const query = input.trim().toLowerCase();
  if (query.length < 2) return [];

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `List 5 chemical names/SMILES starting with "${input}".`,
      config: { 
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    try {
      const data = JSON.parse(response.text || '[]');
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }, 1, 1000);
}

export async function analyzeMolecule(molecule: Molecule): Promise<AnalysisResult> {
  const moleculeKey = btoa(JSON.stringify(molecule)).slice(0, 48);
  const cached = cache.get(`analysis_${moleculeKey}`);
  if (cached) return cached;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze 2D molecular graph: ${JSON.stringify({ atoms: molecule.atoms, bonds: molecule.bonds })}.
      
      MANDATORY:
      1. Provide accurate IUPAC/SMILES.
      2. For cyclic structures (e.g. cyclohexane), include stable conformations.
      3. Return a perfectly valid 3D SDF string in 'sdfData'.
      4. List stereocenters and VSEPR data for each heavy atom.`,
      config: {
        systemInstruction: "You are a professional chemical informatics engine. Always respond in valid JSON. The 'sdfData' field MUST contain a raw V2000 SDF string without markdown code blocks. Ensure coordinates reflect 3D geometry.",
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
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
            sdfData: { type: Type.STRING, description: "Raw V2000 SDF string" },
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
                meltingPoint: { type: Type.STRING }
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

    const rawData = JSON.parse(response.text || '{}');
    const vseprRecord: Record<string, any> = {};
    if (Array.isArray(rawData.vsepr)) {
      rawData.vsepr.forEach((item: any) => vseprRecord[item.atomId] = item);
    }
    
    const result = { 
      ...rawData, 
      vsepr: vseprRecord,
      isomers: rawData.isomers || [],
      conformations: rawData.conformations || [],
      stereocenters: rawData.stereocenters || []
    };

    cache.set(`analysis_${moleculeKey}`, result);
    return result;
  }, 2, 3000);
}

export async function resolveMolecule(query: string): Promise<SearchResult> {
  const normalized = query.trim().toLowerCase();
  const cached = cache.get(`resolve_${normalized}`);
  if (cached) return cached;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Convert chemical name or SMILES "${query}" to a 2D skeletal graph (JSON atoms/bonds).`,
      config: { 
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
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
                      y: { type: Type.NUMBER }
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
                formula: { type: Type.STRING }
              }
            }
          }
        }
      }
    });
    const result = JSON.parse(response.text || '{}');
    cache.set(`resolve_${normalized}`, result);
    return result;
  }, 1, 1000);
}

export async function getExplanation(topic: string): Promise<string> {
  const cached = cache.get(`explain_${topic}`);
  if (cached) return cached;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Briefly explain "${topic}".`,
      config: { thinkingConfig: { thinkingBudget: 0 } }
    });
    const txt = response.text || "Information unavailable.";
    cache.set(`explain_${topic}`, txt);
    return txt;
  });
}
