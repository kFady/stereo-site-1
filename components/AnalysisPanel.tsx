
import React from 'react';
import { AnalysisResult } from '../types';
import { InfoTooltip } from './InfoTooltip';

interface AnalysisPanelProps {
  result: AnalysisResult | null;
  loading: boolean;
  selectedCentralAtom: string | null;
  onViewAlternative: (item: any) => void;
}

/**
 * Enhanced safeStr to handle nested LLM objects (e.g. { name: { value: "x" } })
 */
const safeStr = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    // Try to extract common LLM nested fields if they exist
    if (val.text) return String(val.text);
    if (val.value) return String(val.value);
    if (val.name) return String(val.name);
    return JSON.stringify(val);
  }
  return String(val);
};

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ result, loading, selectedCentralAtom, onViewAlternative }) => {
  if (loading || !result) return null;

  const vseprKeys = Object.keys(result.vsepr || {});
  const displayAtomId = selectedCentralAtom && result.vsepr && result.vsepr[selectedCentralAtom] ? selectedCentralAtom : (vseprKeys.length > 0 ? vseprKeys[0] : null);
  const activeVSEPR = displayAtomId ? result.vsepr[displayAtomId] : null;

  const isomers = Array.isArray(result.isomers) ? result.isomers : [];
  const conformations = Array.isArray(result.conformations) ? result.conformations : [];
  const hasAlternatives = isomers.length > 0 || conformations.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-12">
      {/* Geometries */}
      <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest">Geometry & VSEPR</h3>
          <span className="bg-blue-50 text-blue-700 text-[10px] font-black px-3 py-1 rounded-full uppercase">
            {displayAtomId ? `Atom ${safeStr(displayAtomId)}` : 'Main'}
          </span>
        </div>
        {activeVSEPR ? (
          <div className="grid grid-cols-2 gap-4">
             <GeometryBlock label="AXE Notation" val={safeStr(activeVSEPR.axeNotation)} highlight />
             <GeometryBlock label="Lone Pairs" val={safeStr(activeVSEPR.lonePairs)} />
             <GeometryBlock label="Electronic Geo" val={safeStr(activeVSEPR.electronicGeometry)} full />
             <GeometryBlock label="Molecular Geo" val={safeStr(activeVSEPR.molecularGeometry)} full blue />
             <GeometryBlock label="Bond Angles" val={safeStr(activeVSEPR.bondAngles)} full />
          </div>
        ) : <p className="text-xs text-slate-400 italic">Target an atom for VSEPR data.</p>}
      </section>

      {/* Chirality */}
      <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest mb-6">Stereochemical Logic</h3>
        <div className="space-y-3">
          {!result.stereocenters || result.stereocenters.length === 0 ? (
            <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-400 italic font-bold">Achiral Molecule</div>
          ) : (
            result.stereocenters.map((sc, i) => (
              <div key={i} className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start space-x-4">
                 <div className="bg-indigo-600 text-white w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs">
                   {safeStr(sc.configuration)}
                 </div>
                 <div className="flex-1">
                    <p className="text-[10px] font-black text-indigo-700 uppercase">Atom {safeStr(sc.atomId)}</p>
                    <p className="text-[11px] text-slate-600 leading-tight">{safeStr(sc.logic)}</p>
                 </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Structural Alternatives */}
      {hasAlternatives && (
        <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2">
          <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest mb-6">Structural Alternatives</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isomers.map((iso, i) => (
              <div key={`iso-${i}`} className="p-4 border border-slate-100 rounded-xl bg-slate-50 flex justify-between items-center hover:border-blue-200 transition-colors">
                 <div className="flex-1 mr-4">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{safeStr(iso.type)}</p>
                   <p className="text-xs font-bold text-slate-800">{safeStr(iso.name)}</p>
                 </div>
                 <button 
                  onClick={() => onViewAlternative(iso)}
                  className="shrink-0 px-3 py-1 bg-blue-50 text-[10px] font-black text-blue-600 rounded-lg uppercase hover:bg-blue-600 hover:text-white transition-all"
                 >
                   Load
                 </button>
              </div>
            ))}
            {conformations.map((conf, i) => (
              <div key={`conf-${i}`} className="p-4 border border-slate-100 rounded-xl bg-slate-50 flex justify-between items-center hover:border-blue-200 transition-colors">
                 <div className="flex-1 mr-4">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Conformational State ({safeStr(conf.energyScore)})</p>
                   <p className="text-xs font-bold text-slate-800">{safeStr(conf.name)}</p>
                 </div>
                 <button 
                  onClick={() => onViewAlternative(conf)}
                  className="shrink-0 px-3 py-1 bg-indigo-50 text-[10px] font-black text-indigo-600 rounded-lg uppercase hover:bg-indigo-600 hover:text-white transition-all"
                 >
                   Apply
                 </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Educational Context */}
      <section className="bg-amber-50 p-6 rounded-2xl border border-amber-100 lg:col-span-2">
         <h4 className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-2">Faculty Commentary</h4>
         <p className="text-xs text-amber-700 leading-relaxed italic">{safeStr(result.educationalNote || 'Standard chemical analysis complete.')}</p>
      </section>
    </div>
  );
};

const GeometryBlock: React.FC<{ label: string; val: string; full?: boolean; highlight?: boolean; blue?: boolean }> = ({ label, val, full, highlight, blue }) => (
  <div className={`${full ? 'col-span-2' : ''} p-3 rounded-xl bg-slate-50 border border-slate-100`}>
    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
    <p className={`text-xs font-black ${highlight ? 'text-2xl chem-font text-blue-600' : (blue ? 'text-blue-700' : 'text-slate-800')}`}>{val || 'N/A'}</p>
  </div>
);
