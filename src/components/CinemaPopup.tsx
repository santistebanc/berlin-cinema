import React, { useEffect, useRef } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import Button from './ui/Button';
import Card from './ui/Card';

export interface CinemaPopupInfo {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  url: string;
  websiteUrl?: string;
  lat?: number;
  lon?: number;
}

interface Props {
  cinema: CinemaPopupInfo | null;
  onClose: () => void;
}

const CinemaPopup: React.FC<Props> = ({ cinema, onClose }) => {
  const { theme } = useTheme();
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
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgb(var(--overlay) / 0.5)' }}
      onClick={handleBackdropClick}
      aria-hidden="false"
    >
      <Card
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="mx-2 flex w-full max-w-xl flex-col overflow-hidden shadow-xl sm:mx-4"
        style={{ maxHeight: '90dvh', boxShadow: 'var(--shadow-lg)' }}
      >
        <iframe
          title={`Map of ${cinema.name}`}
          src={cinema.lat != null && cinema.lon != null
            ? `https://maps.google.com/maps?q=${cinema.lat},${cinema.lon}&z=16&output=embed`
            : `https://maps.google.com/maps?q=${encodeURIComponent(`${cinema.address}, ${cinema.postalCode} Berlin`)}&z=15&output=embed&iwloc=`
          }
          className="w-full shrink-0 border-0 h-[40dvh] sm:h-[52dvh] lg:h-[62dvh]"
          style={theme === 'dark' ? { filter: 'invert(1) hue-rotate(180deg)' } : undefined}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />

        <div className="p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 id={titleId} className="text-lg font-semibold" style={{ color: 'rgb(var(--text))' }}>
            {cinema.name}
          </h3>
          <Button
            ref={closeBtnRef}
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="space-y-3">
          {(cinema.address || (cinema.postalCode && cinema.city)) && (
            <div className="flex items-start">
              <span className="w-20 font-medium" style={{ color: 'rgb(var(--text))' }}>Address: </span>
              <a
                href={`https://www.google.com/maps/search/${mapsQuery}`}
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer underline transition-colors hover:text-[rgb(var(--accent))]"
                style={{ color: 'rgb(var(--text-muted))' }}
              >
                {cinema.address}
                {cinema.address && cinema.postalCode && cinema.city && ', '}
                {cinema.postalCode && cinema.city && `${cinema.postalCode} ${cinema.city}`}
              </a>
            </div>
          )}

          {cinema.websiteUrl && (
            <div className="pt-2">
              <a
                href={cinema.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary px-4 py-2 text-sm"
              >
                <ExternalLink className="h-4 w-4" />
                Open cinema site
              </a>
            </div>
          )}
        </div>
        </div>
      </Card>
    </div>
  );
};

export default CinemaPopup;
