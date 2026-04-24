import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { ArrowLeft, Play, ExternalLink, Filter, X, Globe, Calendar, ImageDown, LayoutGrid, Columns } from 'lucide-react';
import { useMovies } from '../contexts/MovieContext';
import { Movie } from '../types';

const MovieDetailPage: React.FC = () => {
  const { title } = useParams<{ title: string }>();
  const navigate = useNavigate();
  const { movies, loading, error } = useMovies();
  const [movie, setMovie] = useState<Movie | null>(null);
  
  // Filter states
  const [selectedCinemas, setSelectedCinemas] = useState<string[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  
  // Table display mode
  const [tableMode, setTableMode] = useState<'grid' | 'stacked'>('stacked');

  // Popup state
  const [selectedCinemaForPopup, setSelectedCinemaForPopup] = useState<{ name: string, address: string, city: string, postalCode: string, url: string } | null>(null);
  const [showCinemaPopup, setShowCinemaPopup] = useState(false);
  const showingsTableRef = useRef<HTMLDivElement>(null);
  const [imageExporting, setImageExporting] = useState(false);

  // Generate readable short form from cinema name
  const getCinemaAbbr = (name: string): string => {
    const skip = new Set(['am', 'an', 'in', 'im', 'der', 'die', 'das', 'de', 'la', 'le', 'bei', 'beim', 'zum', 'zur', 'und', 'the', 'a', 'kino', 'berlin', 'kinowelt']);
    const words = name.split(/[\s\|\-–/]+/).filter(w => w.length > 0);
    const significant = words.filter(w => !skip.has(w.toLowerCase()));
    const parts = significant.slice(0, 3).map(w => w.length > 10 ? w.slice(0, 9) + '.' : w);
    return parts.join(' ') || name.slice(0, 15);
  };

  // Generate unique colors for each cinema
  const getCinemaColors = () => {
    if (!movie) return {};
    
    const cinemaColors: { [key: string]: string } = {};
    const colors = [
      'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-200 dark:border-red-700',
      'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-700',
      'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-200 dark:border-green-700',
      'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-200 dark:border-yellow-700',
      'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-700',
      'bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-200 border-pink-200 dark:border-pink-700',
      'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-700',
      'bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 border-teal-200 dark:border-teal-700',
      'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border-orange-200 dark:border-orange-700',
      'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-200 border-cyan-200 dark:border-cyan-700',
      'bg-lime-100 dark:bg-lime-900/30 text-lime-800 dark:text-lime-200 border-lime-200 dark:border-lime-700',
      'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-700',
      'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700',
      'bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200 border-violet-200 dark:border-violet-700',
      'bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-700',
      'bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-700'
    ];
    
    let colorIndex = 0;
    
    // For merged movies, we need to get all unique cinema names from the timeInfo
    if (movie.cinemas && movie.cinemas.length > 0 && (movie.cinemas[0] as any).timeInfo) {
      // This is a merged movie, collect all cinema names from showtimes
      const allCinemaNames = new Set<string>();
      movie.cinemas.forEach(cinema => {
        cinema.showtimes.forEach(showtime => {
          if ((showtime as any).timeInfo) {
            Object.values((showtime as any).timeInfo).forEach((timeSlots: any) => {
              timeSlots.forEach((showing: any) => {
                allCinemaNames.add(showing.cinema);
              });
            });
          }
        });
      });
      
      // Assign colors to all unique cinema names
      Array.from(allCinemaNames).sort().forEach(cinemaName => {
        if (!cinemaColors[cinemaName]) {
          cinemaColors[cinemaName] = colors[colorIndex % colors.length];
          colorIndex++;
        }
      });
    } else if (movie.cinemas) {
      // Regular movie, use cinemas array
      movie.cinemas.forEach(cinema => {
        if (!cinemaColors[cinema.name]) {
          cinemaColors[cinema.name] = colors[colorIndex % colors.length];
          colorIndex++;
        }
      });
    }
    
    return cinemaColors;
  };

    // Get available cinemas, dates, and variants for filters
  const getAvailableFilters = () => {
    if (!movie) return { cinemas: [], dates: [], variants: [] };
    
    // New data structure: showings is organized by date -> time -> cinema+variant
    const cinemas = new Set<string>();
    const dates = Object.keys(movie.showings).sort();
    
    Object.values(movie.showings).forEach(dateShowings => {
      Object.values(dateShowings).forEach(timeShowings => {
        timeShowings.forEach(showing => {
          cinemas.add(showing.cinema);
        });
      });
    });
    
    const variants = movie.variants || [];
    
    return { 
      cinemas: Array.from(cinemas).sort(), 
      dates, 
      variants 
    };
  };

  // Initialize filters when movie data loads
  useEffect(() => {
    if (movie) {
      const { cinemas, dates, variants } = getAvailableFilters();
      setSelectedCinemas(cinemas);
      setSelectedDates(dates);
      setSelectedVariants(variants);
    }
  }, [movie]);

  useEffect(() => {
    if (title && movies.length > 0) {
      const movieTitle = decodeURIComponent(title);
      const foundMovie = movies.find(movie => 
        movie.title.toLowerCase() === movieTitle.toLowerCase()
      );
      
      if (foundMovie) {
        setMovie(foundMovie);
      }
    }
  }, [title, movies]);



  const toggleCinema = (cinema: string) => {
    setSelectedCinemas(prev => 
      prev.includes(cinema) 
        ? prev.filter(c => c !== cinema)
        : [...prev, cinema]
    );
  };

    const toggleDate = (date: string) => {
    setSelectedDates(prev =>
      prev.includes(date)
        ? prev.filter(d => d !== date)
        : [...prev, date]
    );
  };

  const toggleVariant = (variant: string) => {
    setSelectedVariants(prev =>
      prev.includes(variant)
        ? prev.filter(v => v !== variant)
        : [...prev, variant]
    );
  };

  // Handle cinema badge click to show popup
  const handleCinemaClick = (cinemaName: string) => {
    // Find cinema info from cinemas array
    if (movie?.cinemas) {
      const cinema = movie.cinemas.find(c => c.name === cinemaName);
      if (cinema) {
        setSelectedCinemaForPopup({
          name: cinema.name,
          address: cinema.address,
          city: cinema.city || 'Berlin',
          postalCode: cinema.postalCode || '',
          url: cinema.url || ''
        });
        setShowCinemaPopup(true);
      }
    }
  };

  // Close popup when clicking outside
  const handlePopupOutsideClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setShowCinemaPopup(false);
      setSelectedCinemaForPopup(null);
    }
  };

  // Reset all filters
  const resetFilters = () => {
    const { cinemas, dates, variants } = getAvailableFilters();
    setSelectedCinemas(cinemas);
    setSelectedDates(dates);
    setSelectedVariants(variants);
  };

  const downloadShowingsTableImage = async () => {
    const node = showingsTableRef.current;
    if (!node || !movie) return;
    setImageExporting(true);
    try {
      const isDark = document.documentElement.classList.contains('dark');
      const safeName = movie.title.replace(/[/\\?%*:|"<>]/g, '-').trim().slice(0, 120) || 'showtimes';
      const scrollWrap = node.querySelector<HTMLElement>('[data-showings-scroll]');
      const tableEl = node.querySelector<HTMLTableElement>('table');
      // Full table lives inside overflow-x-auto; the card's scrollWidth stays viewport-wide without this.
      const fullWidth = Math.max(
        scrollWrap?.scrollWidth ?? 0,
        tableEl?.scrollWidth ?? 0,
        tableEl?.offsetWidth ?? 0,
        node.scrollWidth
      );
      const fullHeight = Math.max(
        scrollWrap?.scrollHeight ?? 0,
        tableEl?.scrollHeight ?? 0,
        tableEl?.offsetHeight ?? 0,
        node.scrollHeight
      );

      // Temporarily remove scroll overflow from live DOM so html-to-image captures no scrollbars.
      // Only override auto/scroll — leave hidden intact so truncated text still clips.
      type SavedStyle = { el: HTMLElement; overflow: string; overflowX: string; overflowY: string };
      const saved: SavedStyle[] = [];
      const scrollValues = new Set(['auto', 'scroll']);
      [node, ...Array.from(node.querySelectorAll<HTMLElement>('*'))].forEach(el => {
        const cs = getComputedStyle(el);
        const needsFix = scrollValues.has(cs.overflow) || scrollValues.has(cs.overflowX) || scrollValues.has(cs.overflowY);
        if (needsFix) {
          saved.push({ el, overflow: el.style.overflow, overflowX: el.style.overflowX, overflowY: el.style.overflowY });
          if (scrollValues.has(cs.overflow)) el.style.overflow = 'visible';
          if (scrollValues.has(cs.overflowX)) el.style.overflowX = 'visible';
          if (scrollValues.has(cs.overflowY)) el.style.overflowY = 'visible';
        }
      });

      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        skipFonts: true,
        backgroundColor: isDark ? '#1f2937' : '#ffffff',
        width: fullWidth,
        height: fullHeight,
        onclone: (_doc, cloned) => {
          const root = cloned as HTMLElement;
          const clonedWrap = root.querySelector<HTMLElement>('[data-showings-scroll]');
          const clonedTable = root.querySelector<HTMLTableElement>('table');
          const w = Math.max(
            clonedWrap?.scrollWidth ?? 0,
            clonedTable?.scrollWidth ?? 0,
            clonedTable?.offsetWidth ?? 0,
            root.scrollWidth,
            fullWidth
          );
          const h = Math.max(
            clonedWrap?.scrollHeight ?? 0,
            clonedTable?.scrollHeight ?? 0,
            clonedTable?.offsetHeight ?? 0,
            root.scrollHeight,
            fullHeight
          );
          root.style.overflow = 'visible';
          root.style.width = `${w}px`;
          root.style.height = `${h}px`;
          root.style.maxWidth = 'none';
          if (clonedWrap) {
            clonedWrap.style.overflow = 'visible';
            clonedWrap.style.width = `${w}px`;
            clonedWrap.style.height = `${h}px`;
            clonedWrap.style.maxWidth = 'none';
          }
          // Hide scrollbars in the export
          const noScrollStyle = _doc.createElement('style');
          noScrollStyle.textContent = `
            * { scrollbar-width: none !important; overflow: -moz-scrollbars-none !important; }
            *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
          `;
          _doc.head.appendChild(noScrollStyle);
          _doc.querySelectorAll('*').forEach(el => {
            const hEl = el as HTMLElement;
            hEl.style.overflow = 'visible';
            hEl.style.overflowX = 'visible';
            hEl.style.overflowY = 'visible';
          });
          root.querySelectorAll('.sticky').forEach((el) => {
            const hEl = el as HTMLElement;
            hEl.style.position = 'relative';
            hEl.style.left = 'auto';
            hEl.style.boxShadow = 'none';
          });
        },
      });
      // Restore live DOM overflow styles
      saved.forEach(({ el, overflow, overflowX, overflowY }) => {
        el.style.overflow = overflow;
        el.style.overflowX = overflowX;
        el.style.overflowY = overflowY;
      });

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${safeName}-showtimes.png`;
      link.click();
    } catch (err) {
      console.error('Failed to export showings table image:', err);
    } finally {
      setImageExporting(false);
    }
  };

  // Check if a date should be displayed
  const shouldShowDate = (date: string) => {
    return selectedDates.includes(date);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cinema-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading movie information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Error Loading Movies</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-cinema-600 text-white rounded-lg hover:bg-cinema-700 transition-colors"
        >
          ← Back to Movies
        </button>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Movie Not Found</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">The requested movie could not be found.</p>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-cinema-600 text-white rounded-lg hover:bg-cinema-700 transition-colors"
        >
          ← Back to Movies
        </button>
      </div>
    );
  }

  const { cinemas, dates, variants } = getAvailableFilters();

  return (
    <div className="w-full px-2 sm:px-4 space-y-2">
      {/* Back Button */}
      <button
        onClick={() => navigate('/')}
        className="inline-flex items-center text-cinema-600 hover:text-cinema-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Movies
      </button>

      {/* Movie Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-2 sm:p-4 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <div className="flex items-start space-x-4">
            {/* Movie Poster */}
            <div className="flex-shrink-0">
              <img
                src={movie.posterUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDEyOCAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PC9zdmc+'}
                alt={movie.title}
                className={`w-20 h-30 object-cover rounded-lg ${!movie.posterUrl ? 'border-2 border-gray-300 border-dashed' : ''}`}
                                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDEyOCAxOTIiIGZpbGw9Im5vbmUiIHhtdG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PC9zdmc+';
                  }}
              />
            </div>
            
            {/* Movie Info */}
            <div className="flex-1 min-w-0">
                              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2 text-left">{movie.title}</h1>
              
              {/* Movie Details */}
                              <div className="mb-3 space-y-1 text-left">
                
                {/* Year and Country */}
                {(movie.year || movie.country) && (
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                    {movie.country && (
                      <span className="mr-3">
                        <Globe className="h-4 w-4 inline mr-1" />
                        {movie.country}
                      </span>
                    )}
                    {movie.year && (
                      <span>
                        <Calendar className="h-4 w-4 inline mr-1" />
                        {movie.year}
                      </span>
                    )}
                  </div>
                )}
                
                {/* Director */}
                {movie.director && (
                  <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Director:</span> {movie.director}
                  </div>
                )}
                
                {/* Cast */}
                {movie.cast && movie.cast.length > 0 && (
                  <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Cast:</span> {movie.cast.join(', ')}
                  </div>
                )}
              </div>
              
              {/* Badges and Links */}
                              <div className="flex flex-col sm:flex-row items-start space-y-2 sm:space-y-0 sm:space-x-3 mb-3">
                {/* Variants Badge */}
                {movie.variants && movie.variants.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {movie.variants.map((variant, idx) => (
                      <span key={idx} className="px-1 py-0.5 text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border border-orange-300 dark:border-orange-700 rounded">
                        {variant}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="px-1 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                    No variants
                  </span>
                )}
                

            </div>
          </div>
        </div>
        
        {/* Filters Section */}
        <div className="px-2 sm:px-4 pb-2 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          {showFilters && (
            <div className="space-y-4">

              
              {/* Cinema Filters */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cinemas</h4>
                <div className="flex flex-wrap gap-2">
                  {cinemas.map(cinema => (
                    <button
                      key={cinema}
                      onClick={() => toggleCinema(cinema)}
                      className={`px-1 py-0.5 rounded text-xs font-medium border transition-colors ${
                        selectedCinemas.includes(cinema)
                          ? `${getCinemaColors()[cinema]}`
                          : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      {cinema}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Date Filters */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Dates</h4>
                <div className="flex flex-wrap gap-2">
                  {dates.map(date => (
                    <button
                      key={date}
                      onClick={() => toggleDate(date)}
                      className={`px-1 py-0.5 rounded text-xs font-medium border transition-colors ${
                        selectedDates.includes(date)
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-600'
                          : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      {new Date(date).toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </button>
                  ))}
                </div>
              </div>

              {/* Variant Filters */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Variants {movie.variants ? `(${movie.variants.length})` : '(none)'}
                </h4>
                

                <div className="flex flex-wrap gap-2">
                  {movie.variants && movie.variants.length > 0 ? (
                    movie.variants.map(variant => (
                      <button
                        key={variant}
                        onClick={() => toggleVariant(variant)}
                        className={`px-1 py-0.5 rounded text-xs font-medium border transition-colors ${
                                                  selectedVariants.includes(variant)
                          ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-600'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:border-orange-300 dark:hover:border-orange-600'
                        }`}
                      >
                        {variant}
                      </button>
                    ))
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400 text-sm">No variants available</span>
                  )}
                </div>
              </div>
              
              {/* Reset Button */}
              <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                <button
                  onClick={resetFilters}
                  className="inline-flex items-center pl-1 pr-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  title="Reset All Filters"
                >
                  <X className="h-3 w-3 mr-1" />
                  Reset
                </button>
              </div>

            </div>
          )}
        </div>
        

        {/* Showtimes Table - Single Table with Dates as Columns */}
        <div className="overflow-x-auto relative">
          {movie.showings && Object.keys(movie.showings).length > 0 ? (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                {/* Filter toggle */}
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`inline-flex items-center justify-center w-7 h-7 rounded border transition-colors ${
                    showFilters
                      ? 'bg-cinema-600 text-white border-cinema-600'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                  title={showFilters ? 'Hide Filters' : 'Show Filters'}
                >
                  <Filter className="h-3.5 w-3.5" />
                </button>
                {/* Mode toggle */}
                <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setTableMode('stacked')}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${
                      tableMode === 'stacked'
                        ? 'bg-cinema-600 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                    title="Stacked view"
                  >
                    <Columns className="h-3.5 w-3.5 shrink-0" />
                    Stacked
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableMode('grid')}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium border-l border-gray-300 dark:border-gray-600 transition-colors ${
                      tableMode === 'grid'
                        ? 'bg-cinema-600 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                    title="Grid view"
                  >
                    <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                    Grid
                  </button>
                </div>
                </div>
                <button
                  type="button"
                  onClick={downloadShowingsTableImage}
                  disabled={imageExporting}
                  className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  title="Save the current showtimes grid (respects filters) as a PNG"
                >
                  <ImageDown className="h-3.5 w-3.5 shrink-0" />
                  {imageExporting ? 'Generating…' : 'Screenshot table'}
                </button>
              </div>

              <div
                ref={showingsTableRef}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
              {tableMode === 'grid' ? (
                /* ── Grid mode ── */
                <div className="overflow-x-auto relative" data-showings-scroll>
                  <table className="w-full relative">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                        <th className="text-left py-1.5 px-1 font-medium text-gray-700 dark:text-gray-300 w-[50px] sticky left-0 bg-gray-50 dark:bg-gray-700 z-10 text-xs shadow-sm whitespace-nowrap">
                          Time
                        </th>
                        {(() => {
                          const datesWithShowings = Object.keys(movie.showings)
                            .filter(date => selectedDates.length === 0 || selectedDates.includes(date))
                            .filter(date => {
                              const dateShowings = movie.showings[date];
                              return Object.keys(dateShowings).some(time => {
                                const timeShowings = dateShowings[time] || [];
                                return timeShowings.some(showing => {
                                  const cinemaMatch = selectedCinemas.length === 0 || selectedCinemas.includes(showing.cinema);
                                  const variantMatch = selectedVariants.length === 0 || (showing.variant && selectedVariants.includes(showing.variant));
                                  return cinemaMatch && variantMatch;
                                });
                              });
                            })
                            .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

                          return datesWithShowings.map(date => (
                            <th key={date} className="text-center py-1.5 px-0.5 font-medium text-gray-700 dark:text-gray-300 min-w-[60px] max-w-[200px] w-[200px]">
                              <div className="text-xs font-semibold whitespace-nowrap">
                                {new Date(date).toLocaleDateString('en-US', { weekday: 'short' })}{' '}
                                <span className="font-normal text-gray-600 dark:text-gray-400">
                                  {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                            </th>
                          ));
                        })()}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const allTimes = new Set<string>();
                        Object.values(movie.showings).forEach(dateShowings => {
                          Object.keys(dateShowings).forEach(time => allTimes.add(time));
                        });

                        const datesWithShowings = Object.keys(movie.showings)
                          .filter(date => selectedDates.length === 0 || selectedDates.includes(date))
                          .filter(date => {
                            const dateShowings = movie.showings[date];
                            return Object.keys(dateShowings).some(t => {
                              const timeShowings = dateShowings[t] || [];
                              return timeShowings.some(showing => {
                                const cinemaMatch = selectedCinemas.length === 0 || selectedCinemas.includes(showing.cinema);
                                const variantMatch = selectedVariants.length === 0 || (showing.variant && selectedVariants.includes(showing.variant));
                                return cinemaMatch && variantMatch;
                              });
                            });
                          })
                          .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

                        return Array.from(allTimes).sort()
                          .filter(time =>
                            datesWithShowings.some(date => {
                              const dateShowings = movie.showings[date];
                              if (!dateShowings[time]) return false;
                              return dateShowings[time].some(showing => {
                                const cinemaMatch = selectedCinemas.length === 0 || selectedCinemas.includes(showing.cinema);
                                const variantMatch = selectedVariants.length === 0 || (showing.variant && selectedVariants.includes(showing.variant));
                                return cinemaMatch && variantMatch;
                              });
                            })
                          )
                          .map(time => (
                            <tr key={time} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                              <td className="py-0.5 px-1 font-mono text-sm text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700 z-10 shadow-sm w-[50px] shrink-0 whitespace-nowrap">
                                {time}
                              </td>
                              {datesWithShowings.map(date => {
                                const filteredShowings = (movie.showings[date][time] || []).filter(showing => {
                                  const cinemaMatch = selectedCinemas.length === 0 || selectedCinemas.includes(showing.cinema);
                                  const variantMatch = selectedVariants.length === 0 || (showing.variant && selectedVariants.includes(showing.variant));
                                  return cinemaMatch && variantMatch;
                                });
                                return (
                                  <td key={date} className="py-1 px-1 text-center max-w-[200px]">
                                    {filteredShowings.length > 0 ? (
                                      <div className="flex flex-col gap-0.5">
                                        {filteredShowings.map((showing, idx) => (
                                          <div key={idx} className="flex items-center justify-center gap-1 min-w-0">
                                            <button
                                              onClick={() => handleCinemaClick(showing.cinema)}
                                              className={`px-0.5 py-0.5 rounded text-xs font-medium ${getCinemaColors()[showing.cinema]} cursor-pointer hover:opacity-80 transition-opacity truncate max-w-full`}
                                              title={showing.cinema}
                                            >
                                              {getCinemaAbbr(showing.cinema)}
                                            </button>
                                            {showing.variant && (
                                              <span className="px-0.5 py-0.5 text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border border-orange-300 dark:border-orange-700 rounded">
                                                {showing.variant}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="text-gray-300 dark:text-gray-600 text-xs">—</div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ));
                      })()}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* ── Stacked mode: one table per date ── */
                (() => {
                  const filteredDates = Object.keys(movie.showings)
                    .filter(date => selectedDates.length === 0 || selectedDates.includes(date))
                    .filter(date => {
                      const dateShowings = movie.showings[date];
                      return Object.keys(dateShowings).some(time =>
                        (dateShowings[time] || []).some(showing => {
                          const cinemaMatch = selectedCinemas.length === 0 || selectedCinemas.includes(showing.cinema);
                          const variantMatch = selectedVariants.length === 0 || (showing.variant && selectedVariants.includes(showing.variant));
                          return cinemaMatch && variantMatch;
                        })
                      );
                    })
                    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

                  return (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      {filteredDates.map(date => {
                        const dateShowings = movie.showings[date];
                        const filteredTimes = Object.keys(dateShowings)
                          .filter(time =>
                            (dateShowings[time] || []).some(showing => {
                              const cinemaMatch = selectedCinemas.length === 0 || selectedCinemas.includes(showing.cinema);
                              const variantMatch = selectedVariants.length === 0 || (showing.variant && selectedVariants.includes(showing.variant));
                              return cinemaMatch && variantMatch;
                            })
                          )
                          .sort();

                        return (
                          <div key={date}>
                            {/* Date header */}
                            <div className="py-1.5 px-2 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                {new Date(date).toLocaleDateString('en-US', { weekday: 'short' })}
                              </span>
                              <span className="ml-1.5 text-xs text-gray-500 dark:text-gray-400">
                                {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                            {/* Table with same structure as grid mode */}
                            <table className="w-full">
                              <tbody>
                                {filteredTimes.map(time => {
                                  const showings = (dateShowings[time] || []).filter(showing => {
                                    const cinemaMatch = selectedCinemas.length === 0 || selectedCinemas.includes(showing.cinema);
                                    const variantMatch = selectedVariants.length === 0 || (showing.variant && selectedVariants.includes(showing.variant));
                                    return cinemaMatch && variantMatch;
                                  });
                                  return (
                                    <tr key={time} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                                      <td className="py-1 px-1 font-mono text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 w-[50px] shrink-0">
                                        {time}
                                      </td>
                                      <td className="py-1 px-2">
                                        <div className="flex flex-wrap gap-0">
                                          {showings.map((showing, idx) => (
                                            <div key={idx} className="flex items-center gap-1 min-w-0 border-r border-gray-200 dark:border-gray-600 px-2 last:border-r-0">
                                              <button
                                                onClick={() => handleCinemaClick(showing.cinema)}
                                                className={`px-1.5 py-0.5 rounded text-xs font-medium ${getCinemaColors()[showing.cinema]} cursor-pointer hover:opacity-80 transition-opacity truncate`}
                                                title={showing.cinema}
                                              >
                                                {showing.cinema}
                                              </button>
                                              {showing.variant && (
                                                <span className="px-0.5 py-0.5 text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border border-orange-300 dark:border-orange-700 rounded shrink-0">
                                                  {showing.variant}
                                                </span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No showtimes available for the selected filters.
            </div>
          )}
        </div>
      </div>
      
      {/* Cinema Popup */}
      {showCinemaPopup && selectedCinemaForPopup && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={handlePopupOutsideClick}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-2 sm:mx-4 p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedCinemaForPopup.name}</h3>
              <button
                onClick={() => {
                  setShowCinemaPopup(false);
                  setSelectedCinemaForPopup(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              {(selectedCinemaForPopup.address || (selectedCinemaForPopup.postalCode && selectedCinemaForPopup.city)) && (
                <div className="flex items-start">
                  <span className="font-medium text-gray-700 dark:text-gray-300 w-20">Address: </span>
                  <a
                    href={`https://www.google.com/maps/search/${encodeURIComponent(
                      `${selectedCinemaForPopup.name} ${selectedCinemaForPopup.address || ''} ${selectedCinemaForPopup.postalCode || ''} ${selectedCinemaForPopup.city || ''} Berlin`
                    ).trim()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-600 dark:text-gray-400 hover:text-cinema-600 underline cursor-pointer transition-colors"
                  >
                    {selectedCinemaForPopup.address}
                    {selectedCinemaForPopup.address && selectedCinemaForPopup.postalCode && selectedCinemaForPopup.city && ', '}
                    {selectedCinemaForPopup.postalCode && selectedCinemaForPopup.city && `${selectedCinemaForPopup.postalCode} ${selectedCinemaForPopup.city}`}
                  </a>
                </div>
              )}
              
              {selectedCinemaForPopup.url && (
                <div className="pt-2">
                  <a
                    href={selectedCinemaForPopup.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 bg-cinema-600 text-white text-sm rounded-md hover:bg-cinema-700 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Visit Website
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
  );
};

export default MovieDetailPage;
