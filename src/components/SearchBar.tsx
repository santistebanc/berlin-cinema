import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { Movie } from '../types';

interface ScoredMovie extends Movie {
  score: number;
}

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

  // Initialize search query from URL
  useEffect(() => {
    const searchParam = searchParams.get('search');
    if (searchParam) {
      setSearchQuery(searchParam);
      onSearch(searchParam);
    }
  }, [searchParams, onSearch]);

  // Close suggestions when clicking outside
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

  // Generate search suggestions
  const generateSuggestions = (query: string): Movie[] => {
    if (!query.trim() || !movies) return [];
    
    const searchTerm = query.toLowerCase().trim();
    const results: ScoredMovie[] = [];
    
    movies.forEach(movie => {
      let score = 0;
      
      // Title match (highest priority)
      if (movie.title?.toLowerCase().includes(searchTerm)) {
        score += 100;
      }
      
      // Director match
      if (movie.director?.toLowerCase().includes(searchTerm)) {
        score += 50;
      }
      
      // Cast match
      if (movie.cast?.some(actor => actor?.toLowerCase().includes(searchTerm))) {
        score += 30;
      }
      
      // Variant match
      if (movie.variants?.some(variant => variant?.toLowerCase().includes(searchTerm))) {
        score += 20;
      }
      
      // Country match
      if (movie.country?.toLowerCase().includes(searchTerm)) {
        score += 10;
      }
      
      if (score > 0) {
        results.push({ ...movie, score });
      }
    });
    
    // Sort by relevance score and limit to 8 suggestions
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    if (query.trim()) {
      const newSuggestions = generateSuggestions(query);
      setSuggestions(newSuggestions);
      setShowSuggestions(newSuggestions.length > 0);
      setSelectedIndex(-1);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  };

  const handleSuggestionClick = (movie: Movie) => {
    setSearchQuery(movie.title);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    // Navigate directly to the movie details page
    navigate(`/movie/${encodeURIComponent(movie.title)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // If there are suggestions, navigate to the first one
      if (suggestions.length > 0) {
        navigate(`/movie/${encodeURIComponent(suggestions[0].title)}`);
      } else {
        // Otherwise, perform a search
        onSearch(searchQuery);
        navigate(`/?search=${encodeURIComponent(searchQuery)}`, { replace: true });
      }
      setShowSuggestions(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    onSearch('');
    navigate('/', { replace: true });
  };

  return (
    <div className="relative flex-1 max-w-2xl mx-4" ref={searchRef}>
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <input
            type="text"
            placeholder="Search movies, directors, actors..."
            value={searchQuery}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (suggestions.length > 0) {
                setShowSuggestions(true);
              }
            }}
            autoFocus
            className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-cinema-500 focus:border-cinema-500 placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          
          {/* Search Icon */}
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400 dark:text-gray-500" />
          </div>
          
          {/* Clear Button */}
          {searchQuery && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </form>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          {suggestions.map((movie, index) => (
            <div
              key={`${movie.title}-${index}`}
              onClick={() => handleSuggestionClick(movie)}
              className={`px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                index === selectedIndex ? 'bg-cinema-50 dark:bg-cinema-900 border-l-4 border-cinema-500' : ''
              }`}
            >
              <div className="flex items-center space-x-3">
                {/* Movie Poster Thumbnail */}
                <div className="flex-shrink-0">
                  <img
                    src={movie.posterUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA0MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3ZnLzIwMDAvc3ZnIj48L3N2Zz4='}
                    alt={movie.title}
                    className={`w-10 h-15 object-cover rounded ${!movie.posterUrl ? 'border-2 border-gray-300 border-dashed' : ''}`}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA0MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48L3N2Zz4=';
                    }}
                  />
                </div>
                
                {/* Movie Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {movie.title}
                  </div>
                  {movie.director && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      by {movie.director}
                    </div>
                  )}
                  {movie.variants && movie.variants.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {movie.variants.slice(0, 3).map((variant, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 rounded"
                        >
                          {variant}
                        </span>
                      ))}
                      {movie.variants.length > 3 && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          +{movie.variants.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
