import React from 'react';
import { Movie } from '../../types';
import HomeMovieCard from './HomeMovieCard';

interface HomeMovieGridProps {
  movies: Movie[];
}

const HomeMovieGrid: React.FC<HomeMovieGridProps> = ({ movies }) => {
  return (
    <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {movies.map((movie) => (
        <HomeMovieCard key={movie.title} movie={movie} />
      ))}
    </section>
  );
};

export default HomeMovieGrid;
