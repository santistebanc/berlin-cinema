import React from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { Movie } from '../types';
import Button from './ui/Button';
import TextInput from './ui/TextInput';

interface SearchBarProps {
  movies: Movie[];
  onSearch: (query: string) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ movies: _movies, onSearch: _onSearch }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const searchQuery = searchParams.get('search') ?? '';

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    if (isHome) {
      setSearchParams(query.trim() ? { search: query } : {}, { replace: true });
    } else {
      navigate(query.trim() ? `/?search=${encodeURIComponent(query)}` : '/');
    }
  };

  const clearSearch = () => {
    if (isHome) {
      setSearchParams({}, { replace: true });
    } else {
      navigate('/');
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-xl flex-1">
      <div className="relative">
        <TextInput
          type="text"
          aria-label="Search films"
          placeholder="Search title, director, actor, genre…"
          value={searchQuery}
          onChange={handleInputChange}
          className={`h-10 py-2 pl-10 ${searchQuery ? 'pr-10' : 'pr-4'} text-sm transition-shadow ${
            searchQuery ? 'border-[rgb(var(--accent))] shadow-[0_0_0_3px_rgb(var(--accent)/0.16)]' : ''
          }`}
        />

        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
          <Search className="h-4 w-4" style={{ color: searchQuery ? 'rgb(var(--accent))' : 'rgb(var(--text-soft))' }} />
        </div>

        {searchQuery && (
          <Button
            onClick={clearSearch}
            variant="ghost"
            size="icon"
            className="absolute inset-y-0 right-1 my-auto h-8 w-8 rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default SearchBar;
