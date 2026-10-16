import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { Movie } from '../types';
import Button from './ui/Button';
import TextInput from './ui/TextInput';
import { getHomeSearch, homePathWithSearch, setHomeSearch } from '../utils/homeSearch';

interface SearchBarProps {
  movies: Movie[];
  onSearch: (query: string) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ movies: _movies, onSearch: _onSearch }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const urlSearch = searchParams.get('search') ?? '';
  const [searchQuery, setSearchQuery] = useState(() => urlSearch || getHomeSearch());

  useEffect(() => {
    if (!isHome) {
      setSearchQuery(getHomeSearch());
      return;
    }
    if (!urlSearch) {
      const stored = getHomeSearch();
      if (stored) {
        setSearchParams({ search: stored }, { replace: true });
        setSearchQuery(stored);
        return;
      }
    }
    setSearchQuery(urlSearch);
    setHomeSearch(urlSearch);
  }, [isHome, urlSearch, setSearchParams]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setSearchQuery(query);
    setHomeSearch(query);
    if (isHome) {
      setSearchParams(query.trim() ? { search: query } : {}, { replace: true });
    } else {
      navigate(homePathWithSearch(query));
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setHomeSearch('');
    if (isHome) {
      setSearchParams({}, { replace: true });
    } else {
      navigate('/');
    }
  };

  return (
    <div className="header-search">
      <div className="relative">
        <TextInput
          type="text"
          aria-label="Search films"
          placeholder="Search title, director, actor, genre…"
          value={searchQuery}
          onChange={handleInputChange}
          className={`h-12 py-2 pl-11 ${searchQuery ? 'pr-12' : 'pr-4'} text-sm transition-shadow ${
            searchQuery ? 'border-[rgb(var(--accent))] shadow-[0_0_0_3px_rgb(var(--accent)/0.16)]' : ''
          }`}
        />

        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
          <Search className="h-4 w-4" style={{ color: searchQuery ? 'rgb(var(--accent))' : 'rgb(var(--text-soft))' }} />
        </div>

        {searchQuery && (
          <Button
            onClick={clearSearch}
            variant="ghost"
            size="icon"
            aria-label="Clear search"
            className="absolute inset-y-0 right-0.5 my-auto h-11 w-11 rounded-lg"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default SearchBar;
