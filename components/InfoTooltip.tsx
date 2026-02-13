
import React, { useState } from 'react';
import { getExplanation } from '../services/geminiService';
import { Icons } from '../constants';

interface InfoTooltipProps {
  topic: string;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ topic }) => {
  const [show, setShow] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setShow(!show);
    if (!content && !loading) {
      setLoading(true);
      try {
        const result = await getExplanation(topic);
        setContent(result);
      } catch (e) {
        setContent("Failed to load explanation.");
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="relative inline-block ml-1">
      <button 
        onClick={handleClick}
        className="text-blue-500 hover:text-blue-700 transition-colors p-1 rounded-full hover:bg-blue-50"
      >
        <Icons.Info />
      </button>
      
      {show && (
        <div className="absolute z-50 w-72 p-4 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl transform -translate-x-1/2 left-1/2">
          <div className="flex justify-between items-start mb-2">
            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{topic}</h4>
            <button onClick={() => setShow(false)} className="text-slate-400 hover:text-slate-600">×</button>
          </div>
          <div className="text-xs text-slate-600 leading-relaxed max-h-48 overflow-y-auto">
            {loading ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                <span>Retrieving academic reference...</span>
              </div>
            ) : content}
          </div>
        </div>
      )}
    </div>
  );
};
