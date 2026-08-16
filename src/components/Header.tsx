import React from 'react';
import { Link } from 'react-router-dom';
import Logo from './Logo';
import SearchBar from './SearchBar';
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
        backgroundColor: 'rgb(var(--surface-muted))',
        borderColor: 'rgb(var(--border))',
      }}
    >
      <div className="px-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-5 h-20">
          <Link
            to="/"
            aria-label="OV Berlin — home"
            title={`Build: ${__BUILD_VERSION__}`}
            className="flex shrink-0 items-center gap-3"
            style={{ color: 'rgb(var(--accent))' }}
          >
            <Logo className="h-11 w-11" />
            <span className="serif hidden text-2xl sm:block">
              <span style={{ color: 'rgb(var(--accent))' }}>OV</span>{' '}
              <span style={{ color: 'rgb(var(--text))' }}>Berlin</span>
            </span>
          </Link>

          <SearchBar movies={movies} onSearch={onSearch} />
        </div>
      </div>
    </header>
  );
};

export default Header;
