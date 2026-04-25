import React from 'react';
import Button from '../ui/Button';

interface SearchResultsSummaryProps {
  count: number;
  onClearSearch: () => void;
  searchQuery: string;
}

const SearchResultsSummary: React.FC<SearchResultsSummaryProps> = ({
  count,
  onClearSearch,
  searchQuery,
}) => {
  if (!searchQuery) {
    return null;
  }

  return (
    <section className="status-banner status-banner-info">
      <div className="flex items-center justify-between">
        <span>
          {count} result{count !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
        </span>

        <Button
          onClick={onClearSearch}
          variant="link"
          size="sm"
        >
          Clear search
        </Button>
      </div>
    </section>
  );
};

export default SearchResultsSummary;
