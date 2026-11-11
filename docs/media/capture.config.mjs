// OV Berlin showcase: a read-only listing site, captured from production.
export default {
  name: 'OV Berlin',
  url: 'https://ovberlin.online',
  serve: { command: 'npm run preview', url: 'http://localhost:4173' },
  // The first run used ['light', 'dark'] and warned that both were pixel-identical: the live app is dark-only.
  themes: ['dark'],
  theme: { strategy: 'media' },
  ready: (page) => page.locator('main img').first().waitFor({ timeout: 20000 }),
  shots: [
    { id: 'listing', path: '/', caption: 'Films showing in original version across Berlin, sorted by upcoming showings' },
    {
      id: 'film-detail', path: '/', caption: 'Film page with ratings, plot and every showtime by cinema',
      before: async (page, h) => { await h.click('main a[href^="/"]'); await h.ready(); },
    },
    {
      id: 'search', path: '/', viewports: ['mobile'], caption: 'Fuzzy search across titles, directors, cast and genres',
      before: async (page, h) => { await page.fill('input[type="text"]', 'love'); await h.settle(); },
    },
  ],
  flows: [
    {
      id: 'find-a-film', path: '/', viewport: 'desktop', theme: 'dark', hero: true,
      caption: 'Search for a film, open it and switch the showtimes to the grid view',
      run: async (page, h) => {
        await h.type('input[type="text"]', 'love');
        await h.settle();
        await h.pause(900);
        await page.keyboard.press('Escape');
        await h.click('main a[href^="/"]');
        await h.ready();
        await h.scroll(450);
        await h.click(page.getByTitle('Grid view'));
        await h.pause(1200);
      },
    },
    {
      id: 'cinema-map', path: '/', viewport: 'mobile', theme: 'dark',
      caption: 'Open a film on a phone and tap a cinema to see it on the map',
      run: async (page, h) => {
        await h.click('main a[href^="/"]');
        await h.ready();
        await h.scroll(500);
        await h.click('main button[title*=" · "]');
        await h.pause(2500);
      },
    },
  ],
};
