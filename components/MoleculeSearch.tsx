
import React, { useState, useEffect, useRef } from 'react';
import { resolveMolecule, getSuggestions } from '../services/geminiService';
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

  useEffect(() => {
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    if (!query.trim() || query.length < 2) {
      setSuggestions([]);
      return;
    }

    debounceTimer.current = window.setTimeout(async () => {
      const results = await getSuggestions(query);
      setSuggestions(results);
      setShowDropdown(true);
    }, 600);

    return () => { if (debounceTimer.current) window.clearTimeout(debounceTimer.current); };
  }, [query]);

  const handleSearch = async (val: string) => {
    setQuery(val);
    setShowDropdown(false); // Fix: close dropdown immediately
    if (!val.trim()) return;
    setLoading(true);
    try {
      const result = await resolveMolecule(val);
      onSearchResult(result);
    } catch (e) {
      console.error(e);
      alert("Molecule not found or resolution failed. Check your connection/quota.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-grow max-w-xl mx-4 relative">
      <form onSubmit={(e) => { e.preventDefault(); handleSearch(query); }} className="relative group">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (suggestions.length) setShowDropdown(true); }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder="Search SMILES or Name (e.g. Caffeine, Aspirin)"
          className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all shadow-sm"
          disabled={loading}
        />
        {loading && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}
      </form>

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl z-[100] overflow-hidden">
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              onClick={() => handleSearch(s)}
              className="w-full text-left px-4 py-3 text-sm hover:bg-blue-50 text-slate-700 font-medium border-b border-slate-50 last:border-0 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
