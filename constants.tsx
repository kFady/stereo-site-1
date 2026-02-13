
import React from 'react';

export const ELEMENTS: Record<string, { color: string; valency: number; mass: number }> = {
  C: { color: '#444444', valency: 4, mass: 12.01 },
  H: { color: '#FFFFFF', valency: 1, mass: 1.008 },
  O: { color: '#FF0000', valency: 2, mass: 16.00 },
  N: { color: '#0000FF', valency: 3, mass: 14.01 },
  Cl: { color: '#00FF00', valency: 1, mass: 35.45 },
  F: { color: '#90EE90', valency: 1, mass: 19.00 },
  Br: { color: '#A52A2A', valency: 1, mass: 79.90 },
  I: { color: '#9400D3', valency: 1, mass: 126.90 },
  P: { color: '#FFA500', valency: 3, mass: 30.97 },
  S: { color: '#FFFF00', valency: 2, mass: 32.06 },
};

export const Icons = {
  Info: () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Atom: () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
    </svg>
  ),
  Bond: () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
};
