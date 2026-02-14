
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MoleculeCanvas, MoleculeCanvasHandle } from './components/MoleculeCanvas';
import { AnalysisPanel } from './components/AnalysisPanel';
import { Visualizer3D } from './components/Visualizer3D';
import { MoleculeSearch } from './components/MoleculeSearch';
import { Molecule, AnalysisResult, ElementType, SearchResult } from './types';
import { analyzeMolecule, resolveMolecule } from './services/geminiService';
import { fetchPubChemData, resolveMoleculeFromPubChem, fetch3DSdfFromPubChem } from './services/pubchemService';

const App: React.FC = () => {
  const [molecule, setMolecule] = useState<Molecule>({ atoms: [], bonds: [] });
  const [metadata, setMetadata] = useState<SearchResult['metadata'] | null>(null);
  const [activeElement, setActiveElement] = useState<ElementType>('C');
  const [activeTool, setActiveTool] = useState<'atom' | 'bond' | 'eraser' | 'select-central' | 'pan' | 'benzene' | 'double' | 'triple'>('atom');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [selectedCentralAtom, setSelectedCentralAtom] = useState<string | null>(null);

  const canvasRef = useRef<MoleculeCanvasHandle>(null);

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
    setIsFallbackMode(false);

    try {
      // 1. Attempt Gemini Analysis
      const result = await analyzeMolecule(targetMol);
      
      // Enrich with PubChem
      if (result.metadata?.smiles) {
        fetchPubChemData(result.metadata.smiles).then(realProps => {
          setAnalysis(prev => prev ? { ...prev, properties: { ...prev.properties, ...realProps } } : prev);
        }).catch(() => {});
      }
      
      setAnalysis(result);
      if (result.metadata) setMetadata(result.metadata);
    } catch (error: any) {
      console.warn("Gemini Analysis failed, attempting PubChem fallback...", error);
      
      // 2. Fallback: If we have a name or smiles, get baseline data from PubChem
      const query = metadata?.iupacName || metadata?.smiles || "";
      if (query) {
        try {
          setIsFallbackMode(true);
          const [props, sdf] = await Promise.all([
            fetchPubChemData(query),
            fetch3DSdfFromPubChem(query)
          ]);
          
          // Construct a partial analysis result
          const fallbackResult: AnalysisResult = {
            stereocenters: [],
            vsepr: {},
            dipoleMoment: "Available in PubChem record",
            educationalNote: "AI analysis currently restricted due to quota. Displaying baseline structural and physical data from NIH PubChem databases.",
            sdfData: sdf,
            isomers: [],
            conformations: [],
            properties: props,
            metadata: metadata!
          };
          setAnalysis(fallbackResult);
          setErrorMsg("AI Analysis Limit Reached. Showing Baseline PubChem Data.");
        } catch (fallbackError) {
          setErrorMsg("Analysis failed. Quota reached and fallback resolution failed.");
        }
      } else {
        setErrorMsg("Analysis failed. Quota reached and no reference name found for fallback.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [molecule, metadata]);

  const onSearchResult = useCallback((result: SearchResult) => {
    if (!result || !result.molecule) return;
    setMolecule(result.molecule);
    setMetadata(result.metadata || null);
    setAnalysis(null);
    setSelectedCentralAtom(null);
    setErrorMsg(null);
    setIsFallbackMode(false);
    
    setTimeout(() => {
      canvasRef.current?.centerMolecule();
      handleRunAnalysis(result.molecule);
    }, 300);
  }, [handleRunAnalysis]);

  const handleSearchSubmit = useCallback(async (query: string) => {
    setIsAnalyzing(true);
    setErrorMsg(null);
    try {
      // Try Gemini first
      const result = await resolveMolecule(query);
      onSearchResult(result);
    } catch (e) {
      console.warn("Search via Gemini failed, trying PubChem direct...");
      try {
        const result = await resolveMoleculeFromPubChem(query);
        onSearchResult(result);
        setErrorMsg("Gemini Offline. Molecule resolved via PubChem.");
      } catch (pcError) {
        setErrorMsg("Molecule not found in AI or PubChem databases.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [onSearchResult]);

  // Fix: Added handleViewAlternative to process isomer/conformer SMILES navigation
  const handleViewAlternative = useCallback((smiles: string) => {
    handleSearchSubmit(smiles);
  }, [handleSearchSubmit]);

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] select-none text-slate-800">
      <nav className="bg-[#e2e8f0] border-b border-slate-300 h-9 flex items-center px-4 space-x-6 text-[10px] font-bold text-slate-600 uppercase tracking-widest z-[100] shrink-0">
        <div className="flex items-center space-x-2 mr-4">
          <div className="w-3.5 h-3.5 bg-blue-600 rounded-sm"></div>
          <span className="text-slate-900 tracking-tight">{siteName}</span>
        </div>
        <div className="flex space-x-4 h-full">
          <MenuDropdown label="File">
             <button onClick={() => { setMolecule({atoms:[], bonds:[]}); setAnalysis(null); setMetadata(null); }} className="w-full text-left px-4 py-2 hover:bg-blue-600 hover:text-white border-b border-slate-100 transition-colors">New Structure</button>
             <button onClick={() => window.print()} className="w-full text-left px-4 py-2 hover:bg-blue-600 hover:text-white transition-colors">Print View</button>
          </MenuDropdown>
          <MenuDropdown label="Edit">
             <button onClick={() => {
               const name = prompt("Rename Project:", siteName);
               if(name) setSiteName(name);
             }} className="w-full text-left px-4 py-2 hover:bg-blue-600 hover:text-white border-b border-slate-100 transition-colors">Rename Project</button>
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

      <div className="flex-grow flex flex-col overflow-y-auto">
        {errorMsg && (
          <div className={`${isFallbackMode ? 'bg-amber-600' : 'bg-red-600'} text-white text-[10px] font-black uppercase px-6 py-3 flex justify-between items-center shadow-lg animate-in slide-in-from-top duration-300 sticky top-0 z-[120]`}>
            <div className="flex items-center space-x-4">
              <span className="flex items-center">
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {errorMsg}
              </span>
              {!isFallbackMode && <button onClick={() => handleRunAnalysis()} className="bg-white text-red-600 px-4 py-1.5 rounded-lg font-bold">Retry AI</button>}
            </div>
            <button onClick={() => setErrorMsg(null)} className="p-1 hover:bg-black/10 rounded-md">✕</button>
          </div>
        )}

        <header className="bg-white border-b border-slate-200 px-4 md:px-12 py-6 flex flex-col md:flex-row items-center gap-6 shadow-sm shrink-0">
          <MoleculeSearch onSearchResult={onSearchResult} />
          <button 
            onClick={() => handleRunAnalysis()}
            disabled={isAnalyzing || molecule.atoms.length === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-10 py-3 rounded-2xl text-[11px] font-black uppercase tracking-[0.1em] shadow-xl shadow-blue-200 flex items-center transition-all active:scale-95 shrink-0"
          >
            {isAnalyzing ? (
              <>
                <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full mr-3"></div>
                Computing...
              </>
            ) : "Run Analysis"}
          </button>
        </header>

        <main className="p-4 md:p-8 space-y-8 max-w-[1600px] mx-auto w-full">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-auto xl:h-[700px]">
            {show2D && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xl flex flex-col overflow-hidden h-[600px] xl:h-full relative transition-all">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                  <div className="flex items-center space-x-3">
                    <h2 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Skeletal Editor</h2>
                    {isFallbackMode && <span className="bg-amber-100 text-amber-700 text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter">PubChem Source</span>}
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
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xl flex flex-col overflow-hidden h-[600px] xl:h-full transition-all">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">3D Dynamics</span>
                  {isAnalyzing && <div className="animate-pulse text-[10px] text-blue-500 font-bold">GENERATING COORDINATES...</div>}
                </div>
                <div className="flex-grow">
                  <Visualizer3D sdfData={analysis?.sdfData} />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pb-20">
             <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
               <h3 className="text-xs font-black uppercase text-blue-600 mb-6 tracking-widest border-b border-blue-50 pb-2">Identification</h3>
               <div className="grid grid-cols-2 gap-x-10 gap-y-6">
                 <InfoItem label="IUPAC Name" value={metadata?.iupacName} full />
                 <InfoItem label="Formula" value={metadata?.formula} />
                 <InfoItem label="SMILES" value={metadata?.smiles} full code />
               </div>
             </div>

             {showProperties && (
               <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
                  <h3 className="text-xs font-black uppercase text-blue-600 mb-6 tracking-widest border-b border-blue-50 pb-2">Properties</h3>
                  <div className="space-y-4">
                     <PropertyRow label="Mol. Weight" value={analysis?.properties?.molecularWeight} />
                     <PropertyRow label="LogP" value={analysis?.properties?.logP} />
                     <PropertyRow label="Melting Point" value={analysis?.properties?.meltingPoint} />
                     <PropertyRow label="Boiling Point" value={analysis?.properties?.boilingPoint} />
                  </div>
               </div>
             )}

             <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
                <h3 className="text-xs font-black uppercase text-blue-600 mb-6 tracking-widest border-b border-blue-50 pb-2">Topology</h3>
                <div className="space-y-4">
                   <PropertyRow label="Atoms" value={molecule.atoms.length.toString()} />
                   <PropertyRow label="Bonds" value={molecule.bonds.length.toString()} />
                   <PropertyRow label="Stereocenters" value={analysis?.stereocenters?.length?.toString() || '0'} />
                   <PropertyRow label="Dipole" value={analysis?.dipoleMoment} />
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
          <span>{molecule.atoms.length} Atoms detected</span>
          <span className="flex items-center">
            {isFallbackMode ? "Mode: PubChem Baseline (NIH)" : "Mode: Gemini AI-Flash"}
          </span>
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
    <div className={`w-2.5 h-2.5 rounded-full ${active ? 'bg-blue-600' : 'bg-slate-200'}`}></div>
  </button>
);

const InfoItem: React.FC<{ label: string; value?: string; full?: boolean; code?: boolean }> = ({ label, value, full, code }) => (
  <div className={`${full ? 'col-span-2' : ''} border-b border-slate-50 pb-2`}>
    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
    <p className={`text-xs font-bold text-slate-700 leading-tight ${code ? 'chem-font break-all text-blue-600' : ''}`}>{value || '--'}</p>
  </div>
);

const PropertyRow: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div className="flex justify-between items-center border-b border-slate-50 py-1.5">
    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">{label}</span>
    <span className="text-[11px] text-slate-800 font-black">{value || '--'}</span>
  </div>
);

export default App;
