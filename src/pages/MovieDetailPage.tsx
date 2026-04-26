import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2 } from 'lucide-react';
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
    return movies.find((candidate) => candidate.slug === decodedTitle) ?? null;
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
        websiteUrl: cinema.websiteUrl,
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

  const displayTitle = movie.tmdbTitle || movie.altTitle || movie.title;
  const metaTitle = `${displayTitle} — OV Berlin`;
  const metaParts = [
    movie.year && `${movie.year}`,
    movie.runtime && `${movie.runtime} min`,
    (movie.imdbRating ?? movie.rating) != null && `★ ${(movie.imdbRating ?? movie.rating)!.toFixed(1)}`,
    movie.genres?.length && movie.genres.slice(0, 2).join(', '),
    movie.variants?.length && movie.variants.join(', '),
  ].filter(Boolean);
  const metaDescription = metaParts.join(' · ');
  const shareUrl = `https://ovberlin.site/${movie.slug}`;
  const ogImage = movie.backdropUrl || movie.posterUrl;
  const ogImageWidth = movie.backdropUrl ? '1280' : '500';
  const ogImageHeight = movie.backdropUrl ? '720' : '750';

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ url: shareUrl });
    } else {
      await navigator.clipboard.writeText(shareUrl);
    }
  };

  return (
    <>
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="OV Berlin" />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={shareUrl} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        {ogImage && <meta property="og:image:width" content={ogImageWidth} />}
        {ogImage && <meta property="og:image:height" content={ogImageHeight} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDescription} />
        {ogImage && <meta name="twitter:image" content={ogImage} />}
      </Helmet>

      <div className="page-shell">
        <div className="flex flex-col gap-1.5 sm:gap-3">
          <div className="flex items-center justify-between">
            <Button
              onClick={() => navigate('/')}
              variant="link"
              className="justify-start"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Movies
            </Button>
            <Button
              onClick={handleShare}
              variant="ghost"
              size="icon"
              aria-label="Share this movie"
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </div>

           <Card className="overflow-hidden">
             <MovieHeader movie={movie} plot={movie.plot} />
           </Card>
        </div>

         <Card className="overflow-hidden">
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
