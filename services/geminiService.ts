
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

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorStr = JSON.stringify(error).toLowerCase();
    const isRateLimit = errorStr.includes('429') || errorStr.includes('resource_exhausted');

    if (retries > 0 && isRateLimit) {
      const backoffDelay = delay + Math.floor(Math.random() * 1000);
      console.warn(`Quota limit reached. Retrying in ${backoffDelay}ms...`);
      await wait(backoffDelay);
      return withRetry(fn, retries - 1, delay * 2.5);
    }
    throw error;
  }
}

/**
 * Normalizes input into a string for React rendering safety.
 */
const stringify = (val: any): string => {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") return val.name || val.text || val.smiles || JSON.stringify(val);
  return String(val);
};

export async function getSuggestions(input: string): Promise<string[]> {
  const query = input.trim().toLowerCase();
  if (query.length < 2) return [];

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `List 5 chemical names/SMILES starting with "${input}". Respond ONLY with a JSON array of strings.`,
      config: { 
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    try {
      const text = response.text || '[]';
      let data = JSON.parse(text);
      
      // Handle various response formats (bare array, or wrapped object)
      let list = Array.isArray(data) ? data : (data.suggestions || data.names || []);
      
      // Force conversion to strings to prevent React Error #31
      return list.map((item: any) => stringify(item)).slice(0, 5);
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
      2. The primary 'sdfData' at the top level MUST be the MOST STABLE (lowest energy) 3D conformation.
      3. In the 'conformations' array, include ALL major distinct stable/metastable states (e.g. for cyclohexane, provide chair, boat, twist-boat). 
      4. EACH conformation in the array MUST have its own unique V2000 SDF string in its 'sdfData' property. Do not use the same coordinates for all.
      5. Rank conformations by relative energy.
      6. List stereocenters and VSEPR data for each heavy atom.`,
      config: {
        systemInstruction: "You are a professional chemical informatics engine. Always respond in valid JSON. The 'sdfData' field MUST contain a raw V2000 SDF string without markdown code blocks. Coordinate data MUST be distinct for each conformation to show spatial differences. Ensure high accuracy for R/S stereochemistry.",
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
            sdfData: { type: Type.STRING, description: "Raw V2000 SDF string (Most Stable)" },
            isomers: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  smiles: { type: Type.STRING },
                  type: { type: Type.STRING },
                  description: { type: Type.STRING },
                  sdfData: { type: Type.STRING, description: "3D SDF for this isomer" }
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
                  description: { type: Type.STRING },
                  sdfData: { type: Type.STRING, description: "Distinct 3D SDF coordinates for this specific state" }
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
      rawData.vsepr.forEach((item: any) => vseprRecord[stringify(item.atomId)] = item);
    }
    
    const result = { 
      ...rawData, 
      vsepr: vseprRecord,
      isomers: Array.isArray(rawData.isomers) ? rawData.isomers : [],
      conformations: Array.isArray(rawData.conformations) ? rawData.conformations : [],
      stereocenters: Array.isArray(rawData.stereocenters) ? rawData.stereocenters : []
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
