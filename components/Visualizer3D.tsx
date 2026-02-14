
import React, { useEffect, useRef, useState, useCallback } from 'react';

interface Visualizer3DProps {
  sdfData: string | undefined;
}

export const Visualizer3D: React.FC<Visualizer3DProps> = ({ sdfData }) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [viewStyle, setViewStyle] = useState<'ball' | 'sphere' | 'stick'>('ball');
  const [error, setError] = useState<string | null>(null);
  const glViewer = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);

  // Poll for 3Dmol library availability
  useEffect(() => {
    const checkLib = setInterval(() => {
      if ((window as any).$3Dmol) {
        clearInterval(checkLib);
        setIsReady(true);
      }
    }, 150);
    return () => clearInterval(checkLib);
  }, []);

  const render3D = useCallback(() => {
    const $3Dmol = (window as any).$3Dmol;
    if (!$3Dmol || !viewerRef.current || !sdfData) return;

    try {
      setError(null);
      
      // Strict SDF cleaning: strip possible AI code-block wrapping
      let cleanSdf = sdfData.trim();
      if (cleanSdf.includes('```')) {
        const matches = cleanSdf.match(/```(?:sdf|mol)?\n?([\s\S]*?)```/);
        if (matches && matches[1]) {
          cleanSdf = matches[1].trim();
        } else {
          cleanSdf = cleanSdf.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
        }
      }

      if (cleanSdf.length < 10) {
        setError("Invalid coordinates received.");
        return;
      }

      // Re-initialize viewer container
      viewerRef.current.innerHTML = '';
      const viewer = $3Dmol.createViewer(viewerRef.current, {
        backgroundColor: '#ffffff',
        antialias: true
      });
      glViewer.current = viewer;

      viewer.addModel(cleanSdf, "sdf");
      
      const styleMap = {
        ball: { stick: { radius: 0.14 }, sphere: { scale: 0.28 } },
        sphere: { sphere: { scale: 1.0 } },
        stick: { stick: { radius: 0.22 } }
      };
      
      viewer.setStyle({}, styleMap[viewStyle]);
      viewer.zoomTo();
      viewer.render();
      
      // Force a resize after rendering to fix initial hidden parent container bugs
      requestAnimationFrame(() => {
        if (viewer) {
          viewer.resize();
          viewer.render();
        }
      });
    } catch (err) {
      console.error("3D Render Exception:", err);
      setError("Model parsing error.");
    }
  }, [sdfData, viewStyle]);

  useEffect(() => {
    if (isReady && sdfData) {
      render3D();
    }
  }, [isReady, sdfData, render3D]);

  useEffect(() => {
    const handleResize = () => {
      if (glViewer.current) {
        glViewer.current.resize();
        glViewer.current.render();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!sdfData || sdfData.trim().length < 10) {
    return (
      <div className="w-full h-full bg-slate-50 flex items-center justify-center text-slate-400 italic text-sm border-t border-slate-100">
        <div className="flex flex-col items-center space-y-3 p-8 text-center animate-in fade-in duration-700">
          <svg className="w-10 h-10 opacity-20 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}/>
          </svg>
          <span className="font-bold text-[10px] uppercase tracking-widest text-slate-300">Awaiting 3D Data</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-white flex flex-col group">
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600/90 backdrop-blur-md text-white px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest z-20 shadow-xl">
          {error}
        </div>
      )}
      <div ref={viewerRef} className="flex-grow w-full h-full" />
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center bg-white/90 backdrop-blur-xl p-1 rounded-2xl border border-slate-200 shadow-2xl space-x-1 z-10 transition-opacity opacity-40 group-hover:opacity-100">
        {(['ball', 'sphere', 'stick'] as const).map(s => (
          <button 
            key={s} 
            onClick={() => setViewStyle(s)} 
            className={`px-4 py-2 text-[10px] rounded-xl font-black uppercase transition-all ${viewStyle === s ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            {s}
          </button>
        ))}
        <div className="w-px h-4 bg-slate-200 mx-1"></div>
        <button 
          onClick={() => { if (glViewer.current) { glViewer.current.zoomTo(); glViewer.current.render(); } }}
          className="p-2.5 text-slate-400 hover:text-blue-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>
    </div>
  );
};
