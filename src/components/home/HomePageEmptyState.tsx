import React from 'react';
import Button from '../ui/Button';
import type { MovieDataState } from '../../services/movie-data';

interface HomePageEmptyStateProps {
  onClearSearch: () => void;
  searchQuery: string;
  dataState?: MovieDataState;
  failed?: boolean;
}

const SEARCH_TIPS = [
  { label: 'Film title', example: '"The Substance"' },
  { label: 'Director', example: '"Coralie Fargeat"' },
  { label: 'Actor', example: '"Demi Moore"' },
  { label: 'Format', example: '"OmU" or "OV"' },
];

const HomePageEmptyState: React.FC<HomePageEmptyStateProps> = ({ onClearSearch, searchQuery, dataState, failed }) => {
  if (!searchQuery) {
    return (
      <p className="body-muted px-1 py-6">
        {dataState === 'expired' ? 'No current listings remain. Previous screening support has expired.'
          : failed ? 'Current listings are unavailable. Try loading them again.'
          : 'No screenings are currently listed in the checked programme.'}
      </p>
    );
  }

  return (
    <section className="py-6">
      <p className="body-muted mb-4">
        Nothing matched <span className="font-medium" style={{ color: 'rgb(var(--text))' }}>"{searchQuery}"</span>.
      </p>

      <div
        className="mb-5 border p-4"
        style={{ borderColor: 'rgb(var(--border))', backgroundColor: 'rgb(var(--surface))' }}
      >
        <p className="caption mb-3 font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--text-soft))' }}>
          Try searching by
        </p>
        <ul className="space-y-1.5">
          {SEARCH_TIPS.map(tip => (
            <li key={tip.label} className="flex items-baseline gap-2 text-sm">
              <span className="font-medium" style={{ color: 'rgb(var(--text))' }}>{tip.label}</span>
              <span style={{ color: 'rgb(var(--text-soft))' }}>{tip.example}</span>
            </li>
          ))}
        </ul>
      </div>

      <Button onClick={onClearSearch} variant="outline" size="sm">
        Clear search
      </Button>
    </section>
  );
};

export default HomePageEmptyState;
