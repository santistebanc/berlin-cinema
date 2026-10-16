import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import Logo from './Logo';
import SearchBar from './SearchBar';
import { Movie } from '../types';
import { setHomeSearch } from '../utils/homeSearch';

interface HeaderProps {
  movies: Movie[];
  onSearch: (query: string) => void;
}

const Header: React.FC<HeaderProps> = ({ movies, onSearch }) => {
  const isHome = useLocation().pathname === '/';
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Berlin',
  }).format(now);
  return (
    <header className="site-header">
      <div className={isHome ? 'px-3 sm:px-6 lg:px-8' : 'px-4 sm:px-6 lg:px-9'}>
        <div className="header-layout">
          <Link
            to="/"
            aria-label="OV Berlin — home"
            title={`Build: ${__BUILD_VERSION__}`}
            className="brand-link"
            style={{ color: 'rgb(var(--accent))' }}
            onClick={() => {
              setHomeSearch('');
              sessionStorage.removeItem('scroll:/');
              if (isHome) window.scrollTo(0, 0);
            }}
          >
            <Logo className="brand-mark" />
            <div className="brand-wordmark">
              <span className="serif brand-name">
                <span style={{ color: 'rgb(var(--accent))' }}>OV</span>{' '}
                <span style={{ color: 'rgb(var(--text))' }}>Berlin</span>
              </span>
              <span className="brand-caption">Original version cinema</span>
            </div>
          </Link>

          <SearchBar movies={movies} onSearch={onSearch} />
          <div className="header-programme-summary">
            <time dateTime={new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(now)}>
              {dateLabel}
            </time>
            <p>{movies.length} films in the programme</p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
