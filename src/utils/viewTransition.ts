import { flushSync } from 'react-dom';

export function movieTransitionName(title: string): string {
  return 'movie-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function withViewTransition(fn: () => void): void {
  if (typeof document !== 'undefined' && 'startViewTransition' in document) {
    (document as any).startViewTransition(() => flushSync(fn));
  } else {
    fn();
  }
}
