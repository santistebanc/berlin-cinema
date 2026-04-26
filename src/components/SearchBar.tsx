import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { Movie } from '../types';
import { createMovieFuse } from '../utils/movieSearch';
import Badge from './ui/Badge';
import Button from './ui/Button';
import Card from './ui/Card';
import MoviePoster from './ui/MoviePoster';
import TextInput from './ui/TextInput';

interface SearchBarProps {
  movies: Movie[];
  onSearch: (query: string) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ movies, onSearch }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Movie[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fuse = useMemo(() => createMovieFuse(movies), [movies]);

  useEffect(() => {
    const searchParam = searchParams.get('search');
    if (searchParam) {
      setSearchQuery(searchParam);
      onSearch(searchParam);
    }
  }, [searchParams, onSearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const generateSuggestions = (query: string): Movie[] => {
    if (!query.trim() || !movies) return [];
    return fuse.search(query, { limit: 8 }).map(r => r.item);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setSearchQuery(query);

    if (query.trim()) {
      const newSuggestions = generateSuggestions(query);
      setSuggestions(newSuggestions);
      setShowSuggestions(newSuggestions.length > 0);
      setSelectedIndex(-1);
      return;
    }

    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const handleSuggestionClick = (movie: Movie) => {
    setSearchQuery(movie.title);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    navigate(`/movie/${encodeURIComponent(movie.title)}`);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!showSuggestions) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        event.preventDefault();
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
          handleSuggestionClick(suggestions[selectedIndex]);
        } else if (searchQuery.trim()) {
          onSearch(searchQuery);
          navigate(`/?search=${encodeURIComponent(searchQuery)}`, { replace: true });
          setShowSuggestions(false);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!searchQuery.trim()) return;

    if (suggestions.length > 0) {
      navigate(`/movie/${encodeURIComponent(suggestions[0].title)}`);
    } else {
      onSearch(searchQuery);
      navigate(`/?search=${encodeURIComponent(searchQuery)}`, { replace: true });
    }

    setShowSuggestions(false);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    onSearch('');
    navigate('/', { replace: true });
  };

  const listboxId = 'search-suggestions';

  return (
    <div className="relative mx-4 max-w-2xl flex-1" ref={searchRef}>
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <TextInput
            type="text"
            role="combobox"
            aria-label="Search films"
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
            aria-controls={listboxId}
            aria-activedescendant={selectedIndex >= 0 ? `search-option-${selectedIndex}` : undefined}
            placeholder="Search title, director, actor, or format…"
            value={searchQuery}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (suggestions.length > 0) {
                setShowSuggestions(true);
              }
            }}
            className="py-2 pl-10 pr-10"
          />

          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-5 w-5" style={{ color: 'rgb(var(--text-soft))' }} />
          </div>

          {searchQuery && (
            <Button
              onClick={clearSearch}
              variant="ghost"
              size="icon"
              className="absolute inset-y-0 right-1 my-auto h-8 w-8"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </form>

      {showSuggestions && suggestions.length > 0 && (
        <Card
          id={listboxId}
          role="listbox"
          aria-label="Film suggestions"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto shadow-lg"
        >
          {suggestions.map((movie, index) => (
            <div
              key={`${movie.title}-${index}`}
              id={`search-option-${index}`}
              role="option"
              aria-selected={index === selectedIndex}
              onClick={() => handleSuggestionClick(movie)}
              className={`cursor-pointer px-4 py-3 transition-colors hover:bg-[rgb(var(--surface-muted))] ${
                index === selectedIndex ? 'border-l-4 border-[rgb(var(--accent))] bg-[rgb(var(--accent-soft))]' : ''
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <MoviePoster src={movie.posterUrl} alt={movie.title} className="h-15 w-10" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" style={{ color: 'rgb(var(--text))' }}>
                    {movie.tmdbTitle || movie.title}
                  </div>
                  {movie.director && (
                    <div className="truncate text-xs" style={{ color: 'rgb(var(--text-soft))' }}>
                      Directed by {movie.director}
                    </div>
                  )}
                  {movie.variants && movie.variants.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {movie.variants.slice(0, 3).map((variant) => (
                        <Badge key={variant} tone="accent" className="px-1">
                          {variant}
                        </Badge>
                      ))}
                      {movie.variants.length > 3 && (
                        <span className="text-xs" style={{ color: 'rgb(var(--text-soft))' }}>
                          +{movie.variants.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};

export default SearchBar;
