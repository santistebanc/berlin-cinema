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
    <div className="relative mx-4 max-w-2xl flex-1">
      <div className="relative">
        <TextInput
          type="text"
          aria-label="Search films"
          placeholder="Search title, director, actor, genre…"
          value={searchQuery}
          onChange={handleInputChange}
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
    </div>
  );
};

export default SearchBar;
