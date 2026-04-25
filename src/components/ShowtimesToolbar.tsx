import React from 'react';
import { Columns, Filter, ImageDown, LayoutGrid } from 'lucide-react';
import { cn } from '../utils/cn';
import Button from './ui/Button';

interface ShowtimesToolbarProps {
  imageExporting: boolean;
  onDownloadImage: () => void;
  onToggleFilters: () => void;
  setTableMode: (mode: 'grid' | 'stacked') => void;
  showFilters: boolean;
  tableMode: 'grid' | 'stacked';
}

const ShowtimesToolbar: React.FC<ShowtimesToolbarProps> = ({
  imageExporting,
  onDownloadImage,
  onToggleFilters,
  setTableMode,
  showFilters,
  tableMode,
}) => {
  return (
    <div className="mb-3 flex items-center justify-between px-3 py-2 sm:px-5">
      <div className="flex items-center gap-2">
        <Button
          onClick={onToggleFilters}
          size="icon"
          variant={showFilters ? 'primary' : 'outline'}
          className="h-10 w-10 rounded-md"
          aria-label={showFilters ? 'Hide filters' : 'Show filters'}
          title={showFilters ? 'Hide filters' : 'Show filters'}
        >
          <Filter className="h-4 w-4" />
        </Button>

        <div
          role="group"
          aria-label="View mode"
          className="inline-flex overflow-hidden rounded-md border"
          style={{ borderColor: 'rgb(var(--border-strong))' }}
        >
          <button
            type="button"
            onClick={() => setTableMode('stacked')}
            aria-pressed={tableMode === 'stacked'}
            className={cn(
              'inline-flex h-10 items-center gap-1 px-3 text-xs font-medium transition-colors',
              tableMode === 'stacked'
                ? 'bg-[rgb(var(--accent-strong))] text-white'
                : 'bg-[rgb(var(--surface))] text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-muted))]'
            )}
            title="Stacked view"
          >
            <Columns className="h-3.5 w-3.5 shrink-0" />
            Stacked
          </button>

          <button
            type="button"
            onClick={() => setTableMode('grid')}
            aria-pressed={tableMode === 'grid'}
            className={cn(
              'inline-flex h-10 items-center gap-1 border-l px-3 text-xs font-medium transition-colors',
              'border-[rgb(var(--border-strong))]',
              tableMode === 'grid'
                ? 'bg-[rgb(var(--accent-strong))] text-white'
                : 'bg-[rgb(var(--surface))] text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-muted))]'
            )}
            title="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
            Grid
          </button>
        </div>
      </div>

      <Button
        onClick={onDownloadImage}
        disabled={imageExporting}
        variant="outline"
        size="sm"
        className="h-10 gap-1.5 rounded-md"
        title="Save the current showtimes grid (respects filters) as a PNG"
      >
        <ImageDown className="h-3.5 w-3.5 shrink-0" />
        {imageExporting ? 'Generating…' : 'Export image'}
      </Button>
    </div>
  );
};

export default ShowtimesToolbar;
