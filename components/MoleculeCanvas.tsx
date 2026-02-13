
import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Atom, Bond, Molecule, ElementType } from '../types';
import { ELEMENTS, Icons } from '../constants';

interface MoleculeCanvasProps {
  onMoleculeChange: (molecule: Molecule) => void;
  activeElement: ElementType;
  setActiveElement: (el: ElementType) => void;
  activeTool: 'atom' | 'bond' | 'eraser' | 'select-central' | 'pan';
  setActiveTool: (tool: 'atom' | 'bond' | 'eraser' | 'select-central' | 'pan') => void;
  molecule: Molecule;
  onSelectAtom?: (atomId: string) => void;
  onFillHydrogens: () => void;
}

export interface MoleculeCanvasHandle {
  centerMolecule: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

const HIT_RADIUS = 20;
const BOND_LENGTH = 50;

export const MoleculeCanvas = forwardRef<MoleculeCanvasHandle, MoleculeCanvasProps>(({ 
  onMoleculeChange, 
  activeElement, 
  setActiveElement,
  activeTool,
  setActiveTool,
  molecule,
  onSelectAtom,
  onFillHydrogens
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredAtom, setHoveredAtom] = useState<string | null>(null);
  const [hoveredBond, setHoveredBond] = useState<string | null>(null);
  const [dragStartAtom, setDragStartAtom] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  // Viewport state
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  useImperativeHandle(ref, () => ({
    centerMolecule: () => {
      if (molecule.atoms.length === 0) return;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      molecule.atoms.forEach(a => {
        minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x);
        minY = Math.min(minY, a.y); maxY = Math.max(maxY, a.y);
      });
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const canvas = canvasRef.current;
      if (canvas) {
        setOffset({ x: (canvas.width / 2) - centerX * scale, y: (canvas.height / 2) - centerY * scale });
      }
    },
    zoomIn: () => setScale(prev => Math.min(prev * 1.2, 5)),
    zoomOut: () => setScale(prev => Math.max(prev / 1.2, 0.2)),
  }));

  const getRelativePos = useCallback((e: React.MouseEvent | MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const rawY = (e.clientY - rect.top) * (canvas.height / rect.height);
    return {
      x: (rawX - offset.x) / scale,
      y: (rawY - offset.y) / scale
    };
  }, [offset, scale]);

  const getAtomAt = useCallback((pos: { x: number, y: number }) => {
    return molecule.atoms.find(a => {
      const dx = a.x - pos.x;
      const dy = a.y - pos.y;
      return Math.sqrt(dx * dx + dy * dy) < (HIT_RADIUS / scale);
    });
  }, [molecule.atoms, scale]);

  const getBondAt = useCallback((pos: { x: number, y: number }) => {
    return molecule.bonds.find(b => {
      const from = molecule.atoms.find(a => a.id === b.from);
      const to = molecule.atoms.find(a => a.id === b.to);
      if (!from || !to) return false;
      const L2 = (to.x - from.x) ** 2 + (to.y - from.y) ** 2;
      if (L2 === 0) return false;
      const t = ((pos.x - from.x) * (to.x - from.x) + (pos.y - from.y) * (to.y - from.y)) / L2;
      if (t < 0 || t > 1) return false;
      const dist = Math.sqrt((pos.x - (from.x + t * (to.x - from.x))) ** 2 + (pos.y - (from.y + t * (to.y - from.y))) ** 2);
      return dist < (8 / scale);
    });
  }, [molecule.atoms, molecule.bonds, scale]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // Draw Grid (Lightly)
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1 / scale;
    const step = 40;
    const gridBound = 3000;
    for (let i = -gridBound; i < gridBound; i += step) {
      ctx.beginPath(); ctx.moveTo(i, -gridBound); ctx.lineTo(i, gridBound); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-gridBound, i); ctx.lineTo(gridBound, i); ctx.stroke();
    }

    // Preview for new bond
    if (activeTool === 'bond' && dragStartAtom) {
      const from = molecule.atoms.find(a => a.id === dragStartAtom);
      if (from) {
        ctx.strokeStyle = '#94a3b8';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.5 / scale;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(mousePos.x, mousePos.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw Bonds - Skeletal style
    molecule.bonds.forEach(bond => {
      const from = molecule.atoms.find(a => a.id === bond.from);
      const to = molecule.atoms.find(a => a.id === bond.to);
      if (from && to) {
        ctx.strokeStyle = hoveredBond === bond.id ? '#3b82f6' : '#1e293b';
        ctx.lineWidth = (hoveredBond === bond.id ? 3 : 1.5) / scale;
        
        if (bond.type === 'single') {
          ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
        } else if (bond.type === 'double') {
          const dx = to.x - from.x; const dy = to.y - from.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const gap = 3 / scale;
          const ox = (-dy / len) * gap; const oy = (dx / len) * gap;
          ctx.beginPath(); ctx.moveTo(from.x + ox, from.y + oy); ctx.lineTo(to.x + ox, to.y + oy); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(from.x - ox, from.y - oy); ctx.lineTo(to.x - ox, to.y - oy); ctx.stroke();
        } else if (bond.type === 'triple') {
          const dx = to.x - from.x; const dy = to.y - from.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const gap = 5 / scale;
          const ox = (-dy / len) * gap; const oy = (dx / len) * gap;
          ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(from.x + ox, from.y + oy); ctx.lineTo(to.x + ox, to.y + oy); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(from.x - ox, from.y - oy); ctx.lineTo(to.x - ox, to.y - oy); ctx.stroke();
        }
      }
    });

    // Draw Atoms - Skeletal style (No carbon letters, no circles)
    molecule.atoms.forEach(atom => {
      const isSelected = activeTool === 'select-central' && hoveredAtom === atom.id;
      
      if (isSelected) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.beginPath(); ctx.arc(atom.x, atom.y, 10 / scale, 0, Math.PI * 2); ctx.fill();
      }

      // Hide 'C' for skeletal structures
      if (atom.element === 'C') return;

      // Draw non-carbon letters without circles
      ctx.fillStyle = 'white';
      ctx.beginPath(); ctx.arc(atom.x, atom.y, 6 / scale, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = ELEMENTS[atom.element]?.color || '#000';
      ctx.font = `bold ${12 / scale}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(atom.element, atom.x, atom.y);
    });

    ctx.restore();
  }, [molecule, hoveredAtom, hoveredBond, dragStartAtom, mousePos, activeTool, offset, scale]);

  useEffect(() => { draw(); }, [draw]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === 'pan') {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    const pos = getRelativePos(e);
    const atom = getAtomAt(pos);
    const bond = getBondAt(pos);

    if (activeTool === 'eraser') {
      if (atom) {
        onMoleculeChange({
          atoms: molecule.atoms.filter(a => a.id !== atom.id),
          bonds: molecule.bonds.filter(b => b.from !== atom.id && b.to !== atom.id)
        });
      } else if (bond) {
        onMoleculeChange({ ...molecule, bonds: molecule.bonds.filter(b => b.id !== bond.id) });
      }
      return;
    }

    if (activeTool === 'select-central' && atom) {
      onSelectAtom?.(atom.id);
      return;
    }

    if (activeTool === 'bond') {
      if (bond) {
        const types: Bond['type'][] = ['single', 'double', 'triple'];
        const nextType = types[(types.indexOf(bond.type) + 1) % types.length];
        onMoleculeChange({ ...molecule, bonds: molecule.bonds.map(b => b.id === bond.id ? { ...b, type: nextType } : b) });
      } else if (atom) {
        setDragStartAtom(atom.id);
      } else {
        const newId = `atom-${Date.now()}`;
        onMoleculeChange({ ...molecule, atoms: [...molecule.atoms, { id: newId, element: activeElement, ...pos, formalCharge: 0, lonePairs: 0 }] });
        setDragStartAtom(newId);
      }
    } else if (activeTool === 'atom') {
      if (atom) {
        onMoleculeChange({ ...molecule, atoms: molecule.atoms.map(a => a.id === atom.id ? { ...a, element: activeElement } : a) });
      } else {
        onMoleculeChange({ ...molecule, atoms: [...molecule.atoms, { id: `atom-${Date.now()}`, element: activeElement, ...pos, formalCharge: 0, lonePairs: 0 }] });
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    const pos = getRelativePos(e);
    setMousePos(pos);
    setHoveredAtom(getAtomAt(pos)?.id || null);
    setHoveredBond(getBondAt(pos)?.id || null);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isPanning) { setIsPanning(false); return; }

    if (activeTool === 'bond' && dragStartAtom) {
      const rawPos = getRelativePos(e);
      const startAtom = molecule.atoms.find(a => a.id === dragStartAtom);
      if (!startAtom) return;

      const targetAtom = getAtomAt(rawPos);
      if (targetAtom && targetAtom.id !== dragStartAtom) {
        const exists = molecule.bonds.some(b => (b.from === dragStartAtom && b.to === targetAtom.id) || (b.to === dragStartAtom && b.from === targetAtom.id));
        if (!exists) {
          onMoleculeChange({ ...molecule, bonds: [...molecule.bonds, { id: `bond-${Date.now()}`, from: dragStartAtom, to: targetAtom.id, type: 'single' }] });
        }
      } else if (!targetAtom) {
        // Implement "less than 4 atoms attached" 60-degree snap logic
        const degree = molecule.bonds.filter(b => b.from === dragStartAtom || b.to === dragStartAtom).length;
        
        const dx = rawPos.x - startAtom.x;
        const dy = rawPos.y - startAtom.y;
        let angle = Math.atan2(dy, dx);
        
        // If degree < 4, snap to 60-degree increments
        if (degree < 4) {
          const snap = Math.PI / 3; // 60 degrees
          angle = Math.round(angle / snap) * snap;
        }

        const finalPos = {
          x: startAtom.x + Math.cos(angle) * BOND_LENGTH,
          y: startAtom.y + Math.sin(angle) * BOND_LENGTH
        };

        const newId = `atom-${Date.now()}`;
        onMoleculeChange({
          atoms: [...molecule.atoms, { id: newId, element: activeElement, ...finalPos, formalCharge: 0, lonePairs: 0 }],
          bonds: [...molecule.bonds, { id: `bond-${Date.now()}`, from: dragStartAtom, to: newId, type: 'single' }]
        });
      }
    }
    setDragStartAtom(null);
  };

  return (
    <div className="relative w-full h-full flex overflow-hidden bg-white">
      {/* Sidebar Controls */}
      <div className="absolute left-2 top-2 bottom-2 w-12 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl z-20 flex flex-col items-center py-4 space-y-3 shadow-sm overflow-y-auto">
        <ToolButton active={activeTool === 'pan'} onClick={() => setActiveTool('pan')} icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11"/></svg>} label="Hand" />
        <ToolButton active={activeTool === 'atom'} onClick={() => setActiveTool('atom')} icon={<Icons.Atom />} label="Atom" />
        <ToolButton active={activeTool === 'bond'} onClick={() => setActiveTool('bond')} icon={<Icons.Bond />} label="Bond" />
        <ToolButton active={activeTool === 'select-central'} onClick={() => setActiveTool('select-central')} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/></svg>} label="Target" />
        <ToolButton active={activeTool === 'eraser'} onClick={() => setActiveTool('eraser')} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>} label="Erase" />
        <div className="h-px w-6 bg-slate-200 my-1"></div>
        <button onClick={() => setScale(prev => Math.min(prev * 1.2, 5))} className="p-2 text-slate-400 hover:text-blue-600 rounded-lg flex flex-col items-center transition-all" title="Zoom In">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
        </button>
        <button onClick={() => setScale(prev => Math.max(prev / 1.2, 0.2))} className="p-2 text-slate-400 hover:text-blue-600 rounded-lg flex flex-col items-center transition-all" title="Zoom Out">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6"/></svg>
        </button>
      </div>

      {/* Element Picker */}
      <div className="absolute right-2 top-2 w-10 bg-white/95 backdrop-blur border border-slate-200 rounded-xl z-20 flex flex-col items-center py-2 space-y-1 shadow-sm overflow-y-auto">
        {['C', 'H', 'O', 'N', 'P', 'S', 'F', 'Cl', 'Br', 'I'].map(el => (
          <button 
            key={el} 
            onClick={() => { setActiveElement(el as ElementType); setActiveTool('atom'); }} 
            className={`w-7 h-7 rounded-lg text-[10px] font-black transition-all ${activeElement === el && activeTool === 'atom' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-100'}`}
          >
            {el}
          </button>
        ))}
      </div>

      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={`w-full h-full block touch-none ${activeTool === 'pan' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-crosshair'}`}
      />
    </div>
  );
});

const ToolButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} className={`p-2 rounded-lg flex flex-col items-center justify-center transition-all ${active ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>
    {icon}
    <span className="text-[7px] font-black mt-1 uppercase tracking-tighter">{label}</span>
  </button>
);
