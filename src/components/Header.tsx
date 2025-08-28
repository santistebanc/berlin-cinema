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
    <header className="w-full bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-2 text-cinema-600 hover:text-cinema-700 transition-colors">
            <Film className="h-8 w-8" />
          </Link>
          
          {/* Search Bar */}
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
