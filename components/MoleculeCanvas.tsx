
import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Atom, Bond, Molecule, ElementType } from '../types';
import { ELEMENTS, Icons } from '../constants';

interface MoleculeCanvasProps {
  onMoleculeChange: (molecule: Molecule) => void;
  activeElement: ElementType;
  setActiveElement: (el: ElementType) => void;
  activeTool: 'atom' | 'bond' | 'eraser' | 'select-central' | 'pan' | 'benzene' | 'double' | 'triple';
  setActiveTool: (tool: 'atom' | 'bond' | 'eraser' | 'select-central' | 'pan' | 'benzene' | 'double' | 'triple') => void;
  molecule: Molecule;
  onSelectAtom?: (atomId: string) => void;
  onFillHydrogens: () => void;
}

export interface MoleculeCanvasHandle {
  centerMolecule: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

const HIT_RADIUS = 18;
const BOND_LENGTH = 55;

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
      return dist < (10 / scale);
    });
  }, [molecule.atoms, molecule.bonds, scale]);

  const addBenzene = (centerX: number, centerY: number) => {
    const angleStep = Math.PI / 3;
    const newAtoms: Atom[] = [];
    const newBonds: Bond[] = [];
    const timestamp = Date.now();

    for (let i = 0; i < 6; i++) {
      const id = `bz-${timestamp}-${i}`;
      newAtoms.push({
        id,
        element: 'C',
        x: centerX + Math.cos(i * angleStep) * BOND_LENGTH,
        y: centerY + Math.sin(i * angleStep) * BOND_LENGTH,
        formalCharge: 0,
        lonePairs: 0
      });
    }

    for (let i = 0; i < 6; i++) {
      newBonds.push({
        id: `bz-bond-${timestamp}-${i}`,
        from: newAtoms[i].id,
        to: newAtoms[(i + 1) % 6].id,
        type: i % 2 === 0 ? 'double' : 'single'
      });
    }

    onMoleculeChange({
      atoms: [...molecule.atoms, ...newAtoms],
      bonds: [...molecule.bonds, ...newBonds]
    });
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // Drawing Grid
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1 / scale;
    const step = 50;
    const gridBound = 5000;
    for (let i = -gridBound; i < gridBound; i += step) {
      ctx.beginPath(); ctx.moveTo(i, -gridBound); ctx.lineTo(i, gridBound); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-gridBound, i); ctx.lineTo(gridBound, i); ctx.stroke();
    }

    // Ghost Preview
    if (['bond', 'double', 'triple'].includes(activeTool) && dragStartAtom) {
      const from = molecule.atoms.find(a => a.id === dragStartAtom);
      if (from) {
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.5 / scale;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(mousePos.x, mousePos.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Bonds
    molecule.bonds.forEach(bond => {
      const from = molecule.atoms.find(a => a.id === bond.from);
      const to = molecule.atoms.find(a => a.id === bond.to);
      if (from && to) {
        ctx.strokeStyle = hoveredBond === bond.id ? '#3b82f6' : '#334155';
        ctx.lineWidth = (hoveredBond === bond.id ? 3 : 1.6) / scale;
        
        if (bond.type === 'single') {
          ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
        } else if (bond.type === 'double') {
          const dx = to.x - from.x; const dy = to.y - from.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const gap = 3.5 / scale;
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

    // Atoms (Skeletal Carbon logic)
    molecule.atoms.forEach(atom => {
      const bondsCount = molecule.bonds.filter(b => b.from === atom.id || b.to === atom.id).length;
      const isSelected = activeTool === 'select-central' && hoveredAtom === atom.id;
      
      if (isSelected || hoveredAtom === atom.id) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
        ctx.beginPath(); ctx.arc(atom.x, atom.y, 12 / scale, 0, Math.PI * 2); ctx.fill();
      }

      // Hide Carbon ('C') if it is bonded to something (Skeletal)
      // Show Carbon ('C') ONLY if it is isolated (0 bonds)
      if (atom.element === 'C' && bondsCount > 0) return;

      // Labels (Textbook Style: No circle around letter)
      ctx.fillStyle = 'white'; // White background for the letter only to break the bond lines
      ctx.font = `bold ${14 / scale}px "Inter", sans-serif`;
      const txt = atom.element;
      const m = ctx.measureText(txt);
      const w = m.width + (2 / scale);
      const h = 10 / scale;
      ctx.fillRect(atom.x - w / 2, atom.y - h / 2, w, h);

      ctx.fillStyle = ELEMENTS[atom.element]?.color || '#000';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, atom.x, atom.y);
    });

    ctx.restore();
  }, [molecule, hoveredAtom, hoveredBond, dragStartAtom, mousePos, activeTool, offset, scale]);

  useEffect(() => { draw(); }, [draw]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getRelativePos(e);
    if (activeTool === 'pan') {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (activeTool === 'benzene') {
      addBenzene(pos.x, pos.y);
      setActiveTool('pan');
      return;
    }

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

    if (['bond', 'double', 'triple'].includes(activeTool)) {
      if (bond) {
        const typeMap: Record<string, Bond['type']> = { 'bond': 'single', 'double': 'double', 'triple': 'triple' };
        onMoleculeChange({ ...molecule, bonds: molecule.bonds.map(b => b.id === bond.id ? { ...b, type: typeMap[activeTool] } : b) });
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
      setOffset(prev => ({ x: prev.x + (e.clientX - panStart.x), y: prev.y + (e.clientY - panStart.y) }));
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

    if (['bond', 'double', 'triple'].includes(activeTool) && dragStartAtom) {
      const rawPos = getRelativePos(e);
      const startAtom = molecule.atoms.find(a => a.id === dragStartAtom);
      if (!startAtom) return;

      const targetAtom = getAtomAt(rawPos);
      if (targetAtom && targetAtom.id !== dragStartAtom) {
        const exists = molecule.bonds.some(b => (b.from === dragStartAtom && b.to === targetAtom.id) || (b.to === dragStartAtom && b.from === targetAtom.id));
        if (!exists) {
          const typeMap: Record<string, Bond['type']> = { 'bond': 'single', 'double': 'double', 'triple': 'triple' };
          onMoleculeChange({ ...molecule, bonds: [...molecule.bonds, { id: `bond-${Date.now()}`, from: dragStartAtom, to: targetAtom.id, type: typeMap[activeTool] }] });
        }
      } else if (!targetAtom) {
        const attached = molecule.bonds.filter(b => b.from === dragStartAtom || b.to === dragStartAtom).length;
        const dx = rawPos.x - startAtom.x;
        const dy = rawPos.y - startAtom.y;
        let angle = Math.atan2(dy, dx);
        
        // 60-degree snap for first 4 bonds
        if (attached < 4) {
          const snap = Math.PI / 3;
          angle = Math.round(angle / snap) * snap;
        }

        const finalPos = {
          x: startAtom.x + Math.cos(angle) * BOND_LENGTH,
          y: startAtom.y + Math.sin(angle) * BOND_LENGTH
        };

        const newId = `atom-${Date.now()}`;
        const typeMap: Record<string, Bond['type']> = { 'bond': 'single', 'double': 'double', 'triple': 'triple' };
        onMoleculeChange({
          atoms: [...molecule.atoms, { id: newId, element: activeElement, ...finalPos, formalCharge: 0, lonePairs: 0 }],
          bonds: [...molecule.bonds, { id: `bond-${Date.now()}`, from: dragStartAtom, to: newId, type: typeMap[activeTool] }]
        });
      }
    }
    setDragStartAtom(null);
  };

  return (
    <div className="relative w-full h-full flex overflow-hidden bg-white">
      {/* TOOLBAR LEFT */}
      <div className="absolute left-4 top-4 bottom-4 w-12 bg-white/95 border border-slate-200 rounded-2xl z-20 flex flex-col items-center py-5 space-y-4 shadow-xl">
        <ToolButton active={activeTool === 'pan'} onClick={() => setActiveTool('pan')} icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}/></svg>} label="Hand" />
        <div className="w-8 h-px bg-slate-100"></div>
        <ToolButton active={activeTool === 'atom'} onClick={() => setActiveTool('atom')} icon={<Icons.Atom />} label="Atom" />
        <ToolButton active={activeTool === 'bond'} onClick={() => setActiveTool('bond')} icon={<div className="w-5 h-0.5 bg-current rounded-full"></div>} label="Single" />
        <ToolButton active={activeTool === 'double'} onClick={() => setActiveTool('double')} icon={<div className="flex flex-col space-y-1"><div className="w-5 h-0.5 bg-current rounded-full"></div><div className="w-5 h-0.5 bg-current rounded-full"></div></div>} label="Double" />
        <ToolButton active={activeTool === 'triple'} onClick={() => setActiveTool('triple')} icon={<div className="flex flex-col space-y-1"><div className="w-5 h-0.5 bg-current rounded-full"></div><div className="w-5 h-0.5 bg-current rounded-full"></div><div className="w-5 h-0.5 bg-current rounded-full"></div></div>} label="Triple" />
        <ToolButton active={activeTool === 'benzene'} onClick={() => setActiveTool('benzene')} icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z"/><path d="M12 6l5.2 3m0 6l-5.2 3m-5.2-3L12 6"/></svg>} label="Benzene" />
        <div className="flex-grow"></div>
        <ToolButton active={activeTool === 'eraser'} onClick={() => setActiveTool('eraser')} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}/></svg>} label="Eraser" />
        <button 
          onClick={() => onMoleculeChange({atoms:[], bonds:[]})}
          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
          title="Clear Canvas"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}/></svg>
        </button>
      </div>

      {/* ELEMENT SELECTOR RIGHT */}
      <div className="absolute right-4 top-4 w-12 bg-white/95 border border-slate-200 rounded-2xl z-20 flex flex-col items-center py-4 space-y-2 shadow-xl max-h-[80%] overflow-y-auto">
        {['C', 'H', 'O', 'N', 'F', 'Cl', 'Br', 'I', 'P', 'S'].map(el => (
          <button 
            key={el} 
            onClick={() => { setActiveElement(el as ElementType); setActiveTool('atom'); }} 
            className={`w-9 h-9 rounded-xl text-[11px] font-black transition-all ${activeElement === el && activeTool === 'atom' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
          >
            {el}
          </button>
        ))}
      </div>

      <canvas
        ref={canvasRef}
        width={1000}
        height={800}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={`w-full h-full block bg-white ${activeTool === 'pan' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-crosshair'}`}
      />
    </div>
  );
});

const ToolButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label?: string }> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick} 
    className={`p-2.5 rounded-xl transition-all flex flex-col items-center space-y-1 ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-400 hover:bg-slate-50'}`}
    title={label}
  >
    {icon}
    {label && <span className="text-[7px] font-black uppercase tracking-tighter">{label}</span>}
  </button>
);
