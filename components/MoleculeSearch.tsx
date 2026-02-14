
import React, { useState, useEffect, useRef } from 'react';
import { resolveMolecule, getSuggestions } from '../services/geminiService';
import { resolveMoleculeFromPubChem } from '../services/pubchemService';
import { SearchResult } from '../types';

interface MoleculeSearchProps {
  onSearchResult: (result: SearchResult) => void;
}

export const MoleculeSearch: React.FC<MoleculeSearchProps> = ({ onSearchResult }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceTimer = useRef<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    if (!query.trim() || query.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    debounceTimer.current = window.setTimeout(async () => {
      try {
        const results = await getSuggestions(query);
        setSuggestions(results);
        if (results.length > 0) setShowDropdown(true);
      } catch (e) {
        setSuggestions([]);
      }
    }, 700);

    return () => { if (debounceTimer.current) window.clearTimeout(debounceTimer.current); };
  }, [query]);

  const handleSearch = async (val: string) => {
    setShowDropdown(false);
    setSuggestions([]);
    
    setQuery(val);
    if (!val.trim()) return;
    
    setLoading(true);
    try {
      // 1. Try Gemini
      const result = await resolveMolecule(val);
      onSearchResult(result);
    } catch (e) {
      console.warn("AI Resolution failed, trying PubChem direct fallback...");
      try {
        // 2. Fallback to PubChem
        const result = await resolveMoleculeFromPubChem(val);
        onSearchResult(result);
      } catch (pcError) {
        console.error(pcError);
        alert("Molecule not found in AI or PubChem databases. Try common names like 'Glucose' or Canonical SMILES.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setShowDropdown(false);
      handleSearch(query);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex-grow max-w-2xl mx-4 relative" ref={dropdownRef}>
      <form onSubmit={(e) => { e.preventDefault(); handleSearch(query); }} className="relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (suggestions.length) setShowDropdown(true); }}
          onKeyDown={handleKeyDown}
          placeholder="Enter Molecule Name or SMILES (e.g. Glucose, Caffeine)"
          className="block w-full pl-12 pr-12 py-3.5 border border-slate-200 rounded-2xl leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all shadow-sm text-sm font-medium"
          disabled={loading}
        />
        {query && (
          <button 
            type="button"
            onClick={() => { setQuery(''); setSuggestions([]); setShowDropdown(false); }}
            className="absolute inset-y-0 right-10 flex items-center px-2 text-slate-300 hover:text-slate-500"
          >
            ✕
          </button>
        )}
        {loading && (
          <div className="absolute inset-y-0 right-4 flex items-center">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}
      </form>

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute top-full left-0 w-full mt-3 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[150] overflow-hidden">
          <div className="p-2 border-b border-slate-50 bg-slate-50/50 text-[9px] font-black uppercase tracking-widest text-slate-400 px-4 py-2">Quick Results</div>
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              onClick={() => handleSearch(s)}
              className="w-full text-left px-5 py-4 text-sm hover:bg-blue-600 hover:text-white text-slate-700 font-semibold border-b border-slate-50 last:border-0 transition-all flex items-center group"
            >
              <svg className="w-3 h-3 mr-4 text-slate-300 group-hover:text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}/></svg>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
