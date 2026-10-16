import type React from 'react';
import { useEffect } from 'react';
import { flushSync } from 'react-dom';

const POSTER_TRANSITION_NAME = 'movie-poster';
const HOME_PATH = import.meta.env.BASE_URL;

// Only the posters being morphed get the name: view-transition names must be unique in each snapshot.
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

export function navigateHomeWithPosterTransition(slug: string, navigate: () => void): void {
  if (typeof document.startViewTransition !== 'function') {
    navigate();
    return;
  }

  let homePoster: HTMLElement | null = null;
  const transition = document.startViewTransition(() => {
    flushSync(navigate);
    homePoster = document.querySelector<HTMLElement>(`[data-poster-slug="${CSS.escape(slug)}"]`);
    if (homePoster) homePoster.style.viewTransitionName = POSTER_TRANSITION_NAME;
  });
  const clearName = () => { if (homePoster) homePoster.style.viewTransitionName = ''; };
  transition.finished.then(clearName, clearName);
}

let detailPosterSlug: string | undefined;

export function useBackToHomePosterTransition(slug: string | undefined): void {
  useEffect(() => {
    detailPosterSlug = slug;
    return () => {
      if (detailPosterSlug === slug) detailPosterSlug = undefined;
    };
  }, [slug]);
}

// Browser back: hold the popstate back from React Router and replay it inside the view transition.
// Must be installed before BrowserRouter mounts so this listener runs ahead of React Router's.
export function installBrowserBackPosterTransition(): void {
  if (typeof document.startViewTransition !== 'function') return;

  let replaying = false;
  window.addEventListener('popstate', (event) => {
    const slug = detailPosterSlug;
    if (!slug || replaying || event.hasUAVisualTransition || window.location.pathname !== HOME_PATH) return;
    event.stopImmediatePropagation();
    navigateHomeWithPosterTransition(slug, () => {
      replaying = true;
      window.dispatchEvent(new PopStateEvent('popstate', { state: event.state }));
      replaying = false;
    });
  });
}
