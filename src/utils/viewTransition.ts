export function movieTransitionName(title: string): string {
  return 'movie-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
