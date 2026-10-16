const KEY = 'ov:homeSearch';

export function getHomeSearch(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setHomeSearch(query: string): void {
  try {
    if (!query.trim()) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, query);
  } catch {
    /* private mode */
  }
}

export function homePathWithSearch(query = getHomeSearch()): string {
  const trimmed = query.trim();
  return trimmed ? `/?search=${encodeURIComponent(trimmed)}` : '/';
}
