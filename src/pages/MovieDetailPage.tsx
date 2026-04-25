import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useMovies } from '../contexts/MovieContext';
import { buildCinemaColors } from '../utils/cinemaUtils';
import { useShowtimeFilters } from '../hooks/useShowtimeFilters';
import MovieHeader from '../components/MovieHeader';
import FiltersPanel from '../components/FiltersPanel';
import ShowtimesTable from '../components/ShowtimesTable';
import CinemaPopup, { CinemaPopupInfo } from '../components/CinemaPopup';
import DetailPageState from '../components/detail/DetailPageState';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

const MovieDetailPage: React.FC = () => {
  const { title } = useParams<{ title: string }>();
  const navigate = useNavigate();
  const { movies, loading, error } = useMovies();
  const [selectedCinemaForPopup, setSelectedCinemaForPopup] = useState<CinemaPopupInfo | null>(null);
  const movie = useMemo(() => {
    if (!title || movies.length === 0) {
      return null;
    }

    const decodedTitle = decodeURIComponent(title);
    return movies.find((candidate) => candidate.title.toLowerCase() === decodedTitle.toLowerCase()) ?? null;
  }, [movies, title]);

  const filters = useShowtimeFilters(movie);
  const cinemaColors = useMemo(() => (movie ? buildCinemaColors(movie) : {}), [movie]);

  const handleCinemaClick = (cinemaName: string) => {
    const cinema = movie?.cinemas.find(c => c.name === cinemaName);
    if (cinema) {
      setSelectedCinemaForPopup({
        name: cinema.name,
        address: cinema.address,
        city: cinema.city || 'Berlin',
        postalCode: cinema.postalCode || '',
        url: cinema.url || '',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <div className="text-center">
          <div
            className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2"
            style={{ borderColor: 'rgb(var(--accent))' }}
          />
          <p className="body-muted mt-4">Loading film details and showtimes…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <DetailPageState
        actionLabel="Back to listings"
        message={`We couldn’t load the film details right now. ${error}`}
        onAction={() => navigate('/')}
        title="Error Loading Movies"
      />
    );
  }

  if (!movie) {
    return (
      <DetailPageState
        actionLabel="Back to listings"
        message="That film isn’t in the current listings. Go back to browse what’s playing now."
        onAction={() => navigate('/')}
        title="Movie Not Found"
      />
    );
  }

  const cinemaCount = movie.cinemas?.length ?? 0;
  const metaTitle = `${movie.title} — OV Berlin`;
  const metaDescription = `${movie.title} showtimes in Berlin — playing at ${cinemaCount} cinema${cinemaCount !== 1 ? 's' : ''}. Original version (OV) screenings with dates and times.`;

  return (
    <>
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={`https://ovberlin.site/movie/${encodeURIComponent(movie.title)}`} />
        {movie.posterUrl && <meta property="og:image" content={movie.posterUrl} />}
      </Helmet>

      <div className="page-shell">
        <div className="flex flex-col gap-1.5 sm:gap-3">
          <Button
            onClick={() => navigate('/')}
            variant="link"
            className="justify-start"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Movies
          </Button>

          <Card className="overflow-hidden rounded-xl">
            <MovieHeader movie={movie} plot={movie.plot} />
          </Card>
        </div>

        <Card className="overflow-hidden rounded-xl">
          <FiltersPanel
            visible={filters.showFilters}
            availableCinemas={filters.availableCinemas}
            availableDates={filters.availableDates}
            availableVariants={filters.availableVariants}
            selectedCinemas={filters.selectedCinemas}
            selectedDates={filters.selectedDates}
            selectedVariants={filters.selectedVariants}
            cinemaColors={cinemaColors}
            toggleCinema={filters.toggleCinema}
            toggleDate={filters.toggleDate}
            toggleVariant={filters.toggleVariant}
            resetFilters={filters.resetFilters}
          />

          <ShowtimesTable
            movie={movie}
            selectedDates={filters.selectedDates}
            selectedCinemas={filters.selectedCinemas}
            selectedVariants={filters.selectedVariants}
            showFilters={filters.showFilters}
            setShowFilters={filters.setShowFilters}
            cinemaColors={cinemaColors}
            onCinemaClick={handleCinemaClick}
          />
        </Card>
      </div>

      <CinemaPopup
        cinema={selectedCinemaForPopup}
        onClose={() => setSelectedCinemaForPopup(null)}
      />
    </>
  );
};

export default MovieDetailPage;
