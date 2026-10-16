import type React from 'react';
import { flushSync } from 'react-dom';

const POSTER_TRANSITION_NAME = 'movie-poster';

// Only the clicked poster gets the name: view-transition names must be unique in each snapshot.
// Relies on BrowserRouter's useTransitions={false}, otherwise flushSync can't commit the new route.
export function navigateWithPosterTransition(
  event: React.MouseEvent<HTMLAnchorElement>,
  poster: HTMLElement | null,
  navigate: () => void,
): void {
  if (
    !poster
    || typeof document.startViewTransition !== 'function'
    || event.defaultPrevented
    || event.button !== 0
    || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
  ) {
    return;
  }

  event.preventDefault();
  poster.style.viewTransitionName = POSTER_TRANSITION_NAME;
  document.startViewTransition(() => {
    poster.style.viewTransitionName = '';
    flushSync(navigate);
  });
}
