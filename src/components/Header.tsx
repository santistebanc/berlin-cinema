import React from 'react';
import { Link } from 'react-router-dom';
import { Film } from 'lucide-react';
import SearchBar from './SearchBar';
import ThemeToggle from './ThemeToggle';
import { Movie } from '../types';

interface HeaderProps {
  movies: Movie[];
  onSearch: (query: string) => void;
}

const Header: React.FC<HeaderProps> = ({ movies, onSearch }) => {
  return (
    <header
      className="w-full border-b"
      style={{
        backgroundColor: 'rgb(var(--surface))',
        borderColor: 'rgb(var(--border))',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link
            to="/"
            aria-label="OV Berlin — home"
            className="flex items-center gap-3 transition-colors"
            style={{ color: 'rgb(var(--accent))' }}
          >
            <Film className="h-8 w-8" />
            <p className="hidden sm:block text-sm font-semibold tracking-[-0.01em]" style={{ color: 'rgb(var(--text))' }}>
              OV Berlin
            </p>
          </Link>
          
          <SearchBar movies={movies} onSearch={onSearch} />
          
          <div className="flex items-center space-x-4">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
