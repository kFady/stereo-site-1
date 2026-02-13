
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MoleculeCanvas, MoleculeCanvasHandle } from './components/MoleculeCanvas';
import { AnalysisPanel } from './components/AnalysisPanel';
import { Visualizer3D } from './components/Visualizer3D';
import { MoleculeSearch } from './components/MoleculeSearch';
import { Molecule, AnalysisResult, ElementType, SearchResult } from './types';
import { analyzeMolecule, resolveMolecule } from './services/geminiService';
import { fetchPubChemData } from './services/pubchemService';

const App: React.FC = () => {
  const [molecule, setMolecule] = useState<Molecule>({ atoms: [], bonds: [] });
  const [metadata, setMetadata] = useState<SearchResult['metadata'] | null>(null);
  const [activeElement, setActiveElement] = useState<ElementType>('C');
  const [activeTool, setActiveTool] = useState<'atom' | 'bond' | 'eraser' | 'select-central' | 'pan' | 'benzene' | 'double' | 'triple'>('atom');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedCentralAtom, setSelectedCentralAtom] = useState<string | null>(null);

  const canvasRef = useRef<MoleculeCanvasHandle>(null);

  // UI State
  const [siteName, setSiteName] = useState('StereoChem PRO');
  const [show2D, setShow2D] = useState(true);
  const [show3D, setShow3D] = useState(true);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [showProperties, setShowProperties] = useState(true);

  const handleRunAnalysis = useCallback(async (mol?: Molecule) => {
    const targetMol = mol || molecule;
    if (targetMol.atoms.length === 0) return;
    setIsAnalyzing(true);
    setErrorMsg(null);
    try {
      const result = await analyzeMolecule(targetMol);
      if (result.metadata.smiles) {
        try {
          const realProps = await fetchPubChemData(result.metadata.smiles);
          result.properties = { ...result.properties, ...realProps };
        } catch (e) {
          console.warn("PubChem enrichment failed.", e);
        }
      }
      setAnalysis(result);
      if (result.metadata) setMetadata(result.metadata);
    } catch (error: any) {
      const errStr = JSON.stringify(error).toLowerCase();
      if (errStr.includes('429') || errStr.includes('quota')) {
        setErrorMsg("API Quota Exceeded. Gemini limits reached. Please try again in 60 seconds.");
      } else {
        setErrorMsg("Analysis failed. Try a simpler structure or check connectivity.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [molecule]);

  const onSearchResult = useCallback((result: SearchResult) => {
    setMolecule(result.molecule);
    setMetadata(result.metadata);
    setAnalysis(null);
    setSelectedCentralAtom(null);
    setErrorMsg(null);
    setTimeout(() => {
      canvasRef.current?.centerMolecule();
      handleRunAnalysis(result.molecule);
    }, 150);
  }, [handleRunAnalysis]);

  const handleViewAlternative = useCallback(async (smiles: string) => {
    try {
      setIsAnalyzing(true);
      setErrorMsg(null);
      const result = await resolveMolecule(smiles);
      onSearchResult(result);
    } catch (error: any) {
      setErrorMsg("Failed to resolve structure.");
    } finally {
      setIsAnalyzing(false);
    }
  }, [onSearchResult]);

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] select-none text-slate-800">
      {/* Menu Bar - Fixed Top */}
      <nav className="bg-[#e2e8f0] border-b border-slate-300 h-9 flex items-center px-4 space-x-6 text-[10px] font-bold text-slate-600 uppercase tracking-widest z-[100] shrink-0">
        <div className="flex items-center space-x-2 mr-4">
          <div className="w-3.5 h-3.5 bg-blue-600 rounded-sm"></div>
          <span className="text-slate-900 tracking-tight">{siteName}</span>
        </div>
        <div className="flex space-x-4 h-full">
          <MenuDropdown label="File">
             <button onClick={() => { setMolecule({atoms:[], bonds:[]}); setAnalysis(null); }} className="w-full text-left px-4 py-2 hover:bg-blue-600 hover:text-white border-b border-slate-100 transition-colors">New Structure</button>
             <button onClick={() => window.print()} className="w-full text-left px-4 py-2 hover:bg-blue-600 hover:text-white transition-colors">Print View</button>
          </MenuDropdown>
          <MenuDropdown label="Edit">
             <button onClick={() => {
               const name = prompt("Rename Project:", siteName);
               if(name) setSiteName(name);
             }} className="w-full text-left px-4 py-2 hover:bg-blue-600 hover:text-white border-b border-slate-100 transition-colors">Rename Project</button>
             <button className="w-full text-left px-4 py-2 text-slate-400 cursor-not-allowed border-b border-slate-50">Undo (Ctrl+Z)</button>
             <button className="w-full text-left px-4 py-2 text-slate-400 cursor-not-allowed">Redo (Ctrl+Y)</button>
          </MenuDropdown>
          <MenuDropdown label="View">
             <button onClick={() => canvasRef.current?.centerMolecule()} className="w-full text-left px-4 py-2 hover:bg-blue-600 hover:text-white border-b border-slate-100 transition-colors">Center View</button>
             <button onClick={() => canvasRef.current?.zoomIn()} className="w-full text-left px-4 py-2 hover:bg-blue-600 hover:text-white border-b border-slate-100 transition-colors">Zoom In (+)</button>
             <button onClick={() => canvasRef.current?.zoomOut()} className="w-full text-left px-4 py-2 hover:bg-blue-600 hover:text-white transition-colors">Zoom Out (-)</button>
          </MenuDropdown>
          <MenuDropdown label="Window">
             <WindowToggle label="Skeletal Editor" active={show2D} onClick={() => setShow2D(!show2D)} />
             <WindowToggle label="3D Conformer" active={show3D} onClick={() => setShow3D(!show3D)} />
             <WindowToggle label="Analysis Feed" active={showAnalysis} onClick={() => setShowAnalysis(!showAnalysis)} />
             <WindowToggle label="Constants Panel" active={showProperties} onClick={() => setShowProperties(!showProperties)} />
          </MenuDropdown>
        </div>
      </nav>

      {/* Main Container - Natural Scroll */}
      <div className="flex-grow flex flex-col overflow-y-auto">
        {/* Error Alert */}
        {errorMsg && (
          <div className="bg-red-600 text-white text-[10px] font-black uppercase px-6 py-3 flex justify-between items-center shadow-lg animate-in slide-in-from-top duration-300">
            <div className="flex items-center space-x-4">
              <span className="animate-pulse">⚠ {errorMsg}</span>
              <button 
                onClick={() => handleRunAnalysis()}
                className="bg-white text-red-600 px-4 py-1.5 rounded-lg hover:bg-slate-100 active:scale-95 transition-all shadow-sm"
              >
                Manual Retry
              </button>
            </div>
            <button onClick={() => setErrorMsg(null)} className="p-1 hover:bg-red-500 rounded-md transition-colors text-lg">✕</button>
          </div>
        )}

        {/* Header Section - Non-Sticky */}
        <header className="bg-white border-b border-slate-200 px-4 md:px-12 py-6 flex flex-col md:flex-row items-center gap-6 shadow-sm shrink-0">
          <MoleculeSearch onSearchResult={onSearchResult} />
          <button 
            onClick={() => handleRunAnalysis()}
            disabled={isAnalyzing || molecule.atoms.length === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-10 py-3 rounded-2xl text-[11px] font-black uppercase tracking-[0.1em] shadow-xl shadow-blue-200 flex items-center transition-all active:scale-95 shrink-0"
          >
            {isAnalyzing && <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full mr-3"></div>}
            {isAnalyzing ? "Processing..." : "Run Analysis"}
          </button>
        </header>

        {/* Viewports */}
        <main className="p-4 md:p-8 space-y-8 max-w-[1600px] mx-auto w-full">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-auto xl:h-[700px]">
            {show2D && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 flex flex-col overflow-hidden h-[600px] xl:h-full relative group transition-all">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                  <h2 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Skeletal Editor</h2>
                  <div className="flex space-x-2">
                     <span className="w-2.5 h-2.5 rounded-full bg-red-400"></span>
                     <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                     <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                  </div>
                </div>
                <MoleculeCanvas 
                  ref={canvasRef}
                  molecule={molecule} 
                  onMoleculeChange={setMolecule} 
                  activeElement={activeElement} 
                  setActiveElement={setActiveElement}
                  activeTool={activeTool} 
                  setActiveTool={setActiveTool}
                  onSelectAtom={setSelectedCentralAtom} 
                  onFillHydrogens={() => {}}
                />
              </div>
            )}

            {show3D && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 flex flex-col overflow-hidden h-[600px] xl:h-full transition-all">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">3D Spatial Projection</span>
                </div>
                <div className="flex-grow">
                  <Visualizer3D sdfData={analysis?.sdfData} />
                </div>
              </div>
            )}
          </div>

          {/* Analysis & Properties Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pb-20">
             <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
               <h3 className="text-xs font-black uppercase text-blue-600 mb-6 tracking-widest border-b border-blue-50 pb-2">Molecular Nomenclature</h3>
               <div className="grid grid-cols-2 gap-x-10 gap-y-6">
                 <InfoItem label="IUPAC Identifier" value={metadata?.iupacName} full />
                 <InfoItem label="Common Trivial Name" value={metadata?.commonName} />
                 <InfoItem label="Hill Formula" value={metadata?.formula} />
                 <InfoItem label="Canonical SMILES" value={metadata?.smiles} full code />
               </div>
             </div>

             {showProperties && (
               <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
                  <h3 className="text-xs font-black uppercase text-blue-600 mb-6 tracking-widest border-b border-blue-50 pb-2">Thermodynamics</h3>
                  <div className="space-y-4">
                     <PropertyRow label="Molecular Weight" value={analysis?.properties?.molecularWeight} />
                     <PropertyRow label="Hydrophobicity (logP)" value={analysis?.properties?.logP} />
                     <PropertyRow label="Melting Point (Est.)" value={analysis?.properties?.meltingPoint} />
                     <PropertyRow label="Boiling Point (Est.)" value={analysis?.properties?.boilingPoint} />
                  </div>
               </div>
             )}

             <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
                <h3 className="text-xs font-black uppercase text-blue-600 mb-6 tracking-widest border-b border-blue-50 pb-2">Topology Stats</h3>
                <div className="space-y-4">
                   <PropertyRow label="Node Count" value={molecule.atoms.length.toString()} />
                   <PropertyRow label="Edge Count" value={molecule.bonds.length.toString()} />
                   <PropertyRow label="Stereocenter Count" value={analysis?.stereocenters.length.toString()} />
                   <PropertyRow label="Dipole Vector" value={analysis?.dipoleMoment} />
                </div>
             </div>

             {showAnalysis && analysis && (
               <div className="lg:col-span-4 animate-in fade-in duration-500">
                  <AnalysisPanel 
                    result={analysis} 
                    loading={isAnalyzing} 
                    selectedCentralAtom={selectedCentralAtom} 
                    onViewAlternative={handleViewAlternative} 
                  />
               </div>
             )}
          </div>
        </main>
      </div>
      
      <footer className="h-7 bg-slate-900 text-white flex items-center px-6 justify-between text-[9px] font-bold uppercase tracking-widest shrink-0">
        <div className="flex space-x-10">
          <span className="text-slate-400">Project: {siteName}</span>
          <span>Status: AI Logic Engine Online</span>
        </div>
        <div className="flex space-x-4 items-center">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
          <span>v4.6.0 Stable</span>
        </div>
      </footer>
    </div>
  );
};

const MenuDropdown: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="relative group px-4 h-full flex items-center hover:bg-white transition-all cursor-pointer border-r border-slate-200 last:border-0">
    {label}
    <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 absolute left-0 top-full w-56 bg-white border border-slate-300 shadow-2xl z-[110] py-2 font-medium normal-case transition-all duration-200 rounded-b-lg">
      {children}
    </div>
  </div>
);

const WindowToggle: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button onClick={onClick} className="w-full text-left px-5 py-2.5 hover:bg-blue-600 hover:text-white flex justify-between items-center text-xs border-b border-slate-50 last:border-0 transition-colors">
    {label}
    <div className={`w-2.5 h-2.5 rounded-full ${active ? 'bg-blue-600 ring-2 ring-white ring-offset-1' : 'bg-slate-200'}`}></div>
  </button>
);

const InfoItem: React.FC<{ label: string; value?: string; full?: boolean; code?: boolean }> = ({ label, value, full, code }) => (
  <div className={`${full ? 'col-span-2' : ''} border-b border-slate-50 pb-2`}>
    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{label}</p>
    <p className={`text-xs font-bold text-slate-700 leading-tight ${code ? 'chem-font break-all text-blue-600 bg-slate-50 p-1 rounded border border-slate-100' : ''}`}>{value || '--'}</p>
  </div>
);

const PropertyRow: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div className="flex justify-between items-center border-b border-slate-50 py-1.5">
    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">{label}</span>
    <span className="text-[11px] text-slate-800 font-black">{value || '--'}</span>
  </div>
);

export default App;
