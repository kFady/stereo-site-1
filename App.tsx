
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
  const [activeTool, setActiveTool] = useState<'atom' | 'bond' | 'eraser' | 'select-central' | 'pan'>('atom');
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
        setErrorMsg("Quota Exceeded. Please wait a few seconds and try 'Manual Retry'.");
      } else {
        setErrorMsg("Analysis failed. Try simplifying the structure.");
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
    // Use a short delay to allow canvas component to update state before centering
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
      setErrorMsg("Failed to load alternative structure.");
    } finally {
      setIsAnalyzing(false);
    }
  }, [onSearchResult]);

  return (
    <div className="min-h-screen flex flex-col bg-[#f0f2f5] select-none text-slate-800">
      {/* Menu Bar - Functional & z-indexed */}
      <nav className="bg-[#e1e4e8] border-b border-[#bdc3c7] h-8 flex items-center px-4 space-x-6 text-[10px] font-bold text-slate-600 uppercase tracking-widest overflow-visible z-[100]">
        <div className="flex items-center space-x-2 mr-4">
          <div className="w-3 h-3 bg-blue-600 rounded-sm"></div>
          <span className="text-slate-900">{siteName}</span>
        </div>
        <div className="flex space-x-4 h-full">
          <MenuDropdown label="File">
             <button onClick={() => { setMolecule({atoms:[], bonds:[]}); setAnalysis(null); }} className="w-full text-left px-4 py-2 hover:bg-blue-600 hover:text-white border-b border-slate-100 transition-colors">New Structure</button>
             <button onClick={() => window.print()} className="w-full text-left px-4 py-2 hover:bg-blue-600 hover:text-white transition-colors">Print View</button>
          </MenuDropdown>
          <MenuDropdown label="View">
             <button onClick={() => canvasRef.current?.centerMolecule()} className="w-full text-left px-4 py-2 hover:bg-blue-600 hover:text-white border-b border-slate-100 transition-colors">Center Drawing</button>
             <button onClick={() => canvasRef.current?.zoomIn()} className="w-full text-left px-4 py-2 hover:bg-blue-600 hover:text-white border-b border-slate-100 transition-colors">Zoom In (+)</button>
             <button onClick={() => canvasRef.current?.zoomOut()} className="w-full text-left px-4 py-2 hover:bg-blue-600 hover:text-white transition-colors">Zoom Out (-)</button>
          </MenuDropdown>
          <MenuDropdown label="Display">
             <WindowToggle label="Editor" active={show2D} onClick={() => setShow2D(!show2D)} />
             <WindowToggle label="3D Viewer" active={show3D} onClick={() => setShow3D(!show3D)} />
             <WindowToggle label="Analysis" active={showAnalysis} onClick={() => setShowAnalysis(!showAnalysis)} />
             <WindowToggle label="Stats" active={showProperties} onClick={() => setShowProperties(!showProperties)} />
          </MenuDropdown>
        </div>
      </nav>

      {errorMsg && (
        <div className="bg-red-600 text-white text-[10px] font-black uppercase px-4 py-2 flex justify-between items-center shadow-xl sticky top-8 z-[90]">
          <div className="flex items-center space-x-4">
            <span className="animate-pulse">⚠ {errorMsg}</span>
            <button 
              onClick={() => handleRunAnalysis()}
              className="bg-white text-red-600 px-3 py-1 rounded-md hover:bg-slate-100 active:scale-95 transition-all"
            >
              Manual Retry
            </button>
          </div>
          <button onClick={() => setErrorMsg(null)} className="p-1 hover:bg-red-500 rounded">✕</button>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-3 flex flex-col md:flex-row items-center gap-4 sticky top-8 z-40 shadow-sm">
        <MoleculeSearch onSearchResult={onSearchResult} />
        <button 
          onClick={() => handleRunAnalysis()}
          disabled={isAnalyzing || molecule.atoms.length === 0}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-100 flex items-center transition-all active:scale-95"
        >
          {isAnalyzing && <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full mr-2"></div>}
          Compute Logic
        </button>
      </header>

      <main className="flex-grow flex flex-col p-4 space-y-4 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-auto lg:h-[600px]">
          {show2D && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-[500px] lg:h-full relative transition-all">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center">
                <h2 className="text-[10px] font-black uppercase text-slate-500 tracking-tighter">Academic Skeletal Editor</h2>
                <div className="flex space-x-1">
                   <div className="w-1.5 h-1.5 rounded-full bg-slate-200"></div>
                   <div className="w-1.5 h-1.5 rounded-full bg-slate-200"></div>
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
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-[500px] lg:h-full transition-all">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Molecular Space Visualization</span>
              </div>
              <div className="flex-grow">
                <Visualizer3D sdfData={analysis?.sdfData} />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pb-12">
           <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
             <h3 className="text-[10px] font-black uppercase text-blue-600 mb-4 tracking-widest">Chemical Metadata</h3>
             <div className="grid grid-cols-2 gap-x-6 gap-y-4">
               <InfoItem label="IUPAC Name" value={metadata?.iupacName} full />
               <InfoItem label="Common Alias" value={metadata?.commonName} />
               <InfoItem label="Empirical Formula" value={metadata?.formula} />
               <InfoItem label="SMILES Notation" value={metadata?.smiles} full code />
             </div>
           </div>

           {showProperties && (
             <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h3 className="text-[10px] font-black uppercase text-blue-600 mb-4 tracking-widest">Analytic Constants</h3>
                <div className="space-y-2">
                   <PropertyRow label="Molar Mass" value={analysis?.properties?.molecularWeight} />
                   <PropertyRow label="Lipinski logP" value={analysis?.properties?.logP} />
                   <PropertyRow label="Transition Temp (M)" value={analysis?.properties?.meltingPoint} />
                   <PropertyRow label="Transition Temp (B)" value={analysis?.properties?.boilingPoint} />
                </div>
             </div>
           )}

           <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-[10px] font-black uppercase text-blue-600 mb-4 tracking-widest">Topology Details</h3>
              <div className="space-y-2">
                 <PropertyRow label="Nodes (Atoms)" value={molecule.atoms.length.toString()} />
                 <PropertyRow label="Edges (Bonds)" value={molecule.bonds.length.toString()} />
                 <PropertyRow label="Chirality Count" value={analysis?.stereocenters.length.toString()} />
                 <PropertyRow label="Electric Dipole" value={analysis?.dipoleMoment} />
              </div>
           </div>

           {showAnalysis && analysis && (
             <div className="lg:col-span-4 mt-2">
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
      
      <footer className="h-6 bg-slate-900 text-white flex items-center px-4 justify-between text-[8px] font-bold fixed bottom-0 w-full z-50 uppercase tracking-widest">
        <div className="flex space-x-8">
          <span>Engine: StereoChem 4.5.6</span>
          <span>Status: Quota Monitoring Active</span>
        </div>
        <div>{molecule.atoms.length} Elements mapped</div>
      </footer>
    </div>
  );
};

const MenuDropdown: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="relative group px-4 h-full flex items-center hover:bg-white transition-colors cursor-pointer border-r border-slate-200 last:border-0">
    {label}
    <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 absolute left-0 top-full w-48 bg-white border border-[#bdc3c7] shadow-2xl z-[110] py-1 font-medium normal-case transition-all duration-200">
      {children}
    </div>
  </div>
);

const WindowToggle: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button onClick={onClick} className="w-full text-left px-4 py-2 hover:bg-blue-600 hover:text-white flex justify-between items-center text-xs border-b border-slate-50 last:border-0 transition-colors">
    {label}
    <div className={`w-3 h-3 rounded-full ${active ? 'bg-blue-600 border-2 border-white' : 'bg-slate-200'}`}></div>
  </button>
);

const InfoItem: React.FC<{ label: string; value?: string; full?: boolean; code?: boolean }> = ({ label, value, full, code }) => (
  <div className={`${full ? 'col-span-2' : ''} border-b border-slate-50 pb-1`}>
    <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
    <p className={`text-xs font-bold text-slate-700 leading-tight ${code ? 'chem-font break-all text-blue-600' : ''}`}>{value || '--'}</p>
  </div>
);

const PropertyRow: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div className="flex justify-between items-center border-b border-slate-50 py-1 flex-wrap">
    <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">{label}</span>
    <span className="text-[10px] text-slate-800 font-black">{value || '--'}</span>
  </div>
);

export default App;
