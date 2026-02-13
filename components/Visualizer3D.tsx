
import React, { useEffect, useRef, useState } from 'react';

interface Visualizer3DProps {
  sdfData: string | undefined;
}

export const Visualizer3D: React.FC<Visualizer3DProps> = ({ sdfData }) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [viewStyle, setViewStyle] = useState<'ball' | 'sphere' | 'stick'>('ball');
  const glViewer = useRef<any>(null);

  useEffect(() => {
    if (!viewerRef.current || !sdfData) return;

    const interval = setInterval(() => {
      if ((window as any).$3Dmol) {
        clearInterval(interval);
        initViewer();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [sdfData]);

  const initViewer = () => {
    if (!viewerRef.current) return;
    viewerRef.current.innerHTML = '';
    const viewer = (window as any).$3Dmol.createViewer(viewerRef.current, {
      backgroundColor: '#ffffff'
    });
    glViewer.current = viewer;
    viewer.addModel(sdfData, "sdf");
    updateStyles();
    viewer.zoomTo();
    viewer.render();
  };

  const updateStyles = () => {
    const viewer = glViewer.current;
    if (!viewer) return;
    const styleMap = {
      ball: { stick: { radius: 0.15 }, sphere: { scale: 0.25 } },
      sphere: { sphere: { scale: 1.0 } },
      stick: { stick: { radius: 0.2 } }
    };
    viewer.setStyle({}, styleMap[viewStyle]);
    viewer.render();
  };

  useEffect(() => { updateStyles(); }, [viewStyle]);

  if (!sdfData) {
    return (
      <div className="w-full h-full bg-slate-50 flex items-center justify-center text-slate-400 italic text-sm">
        Compute Analysis to generate 3D Model
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-white">
      <div ref={viewerRef} className="w-full h-full" />
      <div className="absolute bottom-4 right-4 flex flex-col space-y-2">
        <div className="bg-white/90 backdrop-blur-sm p-2 rounded-xl border border-slate-200 shadow-lg flex space-x-2">
          {['ball', 'sphere', 'stick'].map(s => (
            <button 
              key={s} 
              onClick={() => setViewStyle(s as any)} 
              className={`px-3 py-1.5 text-[10px] rounded-lg font-black uppercase transition-all ${viewStyle === s ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
