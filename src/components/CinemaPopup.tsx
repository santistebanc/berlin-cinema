import React, { useEffect, useRef } from 'react';
import { ExternalLink, MapPin, Navigation, X } from 'lucide-react';

export interface CinemaPopupInfo {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  url: string;
  websiteUrl?: string;
}

interface Props {
  cinema: CinemaPopupInfo | null;
  onClose: () => void;
}

const CinemaPopup: React.FC<Props> = ({ cinema, onClose }) => {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = 'cinema-popup-title';

  useEffect(() => {
    if (!cinema) return;
    // Move focus into dialog on open
    closeBtnRef.current?.focus();

    // Trap focus within dialog
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [cinema, onClose]);

  if (!cinema) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const mapsQuery = encodeURIComponent(
    `${cinema.name} ${cinema.address || ''} ${cinema.postalCode || ''} ${cinema.city || ''} Berlin`.trim()
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(3,6,14,.62)' }}
      onClick={handleBackdropClick}
      aria-hidden="false"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border"
        style={{
          maxHeight: '90dvh',
          backgroundColor: 'rgb(var(--surface))',
          borderColor: 'rgb(var(--border-strong))',
          boxShadow: '0 30px 70px -20px rgba(0,0,0,.85)',
        }}
      >
        <div className="relative h-[40dvh] shrink-0 sm:h-[46dvh]" style={{ backgroundColor: 'rgb(var(--surface-muted))' }}>
          <div
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2"
            style={{ background: 'radial-gradient(circle at 50% 40%, #16203a, #0b1120)', color: 'rgb(var(--text-soft))' }}
          >
            <MapPin className="h-8 w-8" style={{ color: 'rgb(var(--accent))' }} strokeWidth={1.8} />
          </div>
          <iframe
            title={`Map of ${cinema.name}`}
            src={`https://maps.google.com/maps?q=${encodeURIComponent(`${cinema.name} Berlin`)}&z=15&output=embed`}
            className="absolute inset-0 h-full w-full border-0"
            style={{ filter: 'invert(1) hue-rotate(180deg)' }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3.5 top-3.5 flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:opacity-80"
            style={{ backgroundColor: 'rgba(10,14,23,.8)', borderColor: 'rgb(var(--border-strong))', color: 'rgb(var(--text-muted))' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          <h3 id={titleId} className="serif mb-1 text-2xl" style={{ color: 'rgb(var(--text))' }}>
            {cinema.name}
          </h3>

          {(cinema.address || (cinema.postalCode && cinema.city)) && (
            <div className="mt-3 flex items-start gap-2.5 text-sm" style={{ color: 'rgb(var(--text-muted))' }}>
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'rgb(var(--text-soft))' }} />
              <a
                href={`https://www.google.com/maps/search/${mapsQuery}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline transition-colors hover:text-[rgb(var(--accent))]"
                style={{ textUnderlineOffset: '2px' }}
              >
                {cinema.address}
                {cinema.address && cinema.postalCode && cinema.city && ', '}
                {cinema.postalCode && cinema.city && `${cinema.postalCode} ${cinema.city}`}
              </a>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            {cinema.websiteUrl && (
              <a
                href={cinema.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90"
                style={{ backgroundColor: 'rgb(var(--accent-strong))' }}
              >
                <ExternalLink className="h-4 w-4" />
                Open cinema site
              </a>
            )}
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-[rgb(var(--surface-muted))]"
              style={{ borderColor: 'rgb(var(--border-strong))', color: 'rgb(var(--text-muted))' }}
            >
              <Navigation className="h-4 w-4" />
              Directions
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CinemaPopup;
