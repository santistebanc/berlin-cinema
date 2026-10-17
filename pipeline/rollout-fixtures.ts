import type { SourceDependencies } from '../api/sources/types';

export const ROLLOUT_NOW = '2026-10-15T10:00:00Z';
export const ROLLOUT_DATE = '2026-10-18';
export const criticPage = `<div class="itemContainer"><h2><a href="/ov-movies-berlin/movie/a-film-123/">A Film (OV)</a></h2>
  <article class="cinema"><address><a href="/ov-movies-berlin/cinema/example/">Example Cinema</a>Example Street 1, 10115 Berlin</address>
  <table class="vorstellung"><thead><tr><th>Sun 18/10</th></tr></thead><tbody><tr><td class="wird_gezeigt">20:00</td></tr></tbody></table></article></div>`;
export const berlinPage = `<ul class="js-accordion"><li><span class="js-accordion__trigger"><span class="info">A Film (OV)</span></span>
  <div class="js-accordion__panel"><p>A Film läuft im "Example Cinema"</p>
  <a href="/kino/_bin/filmdetail.php/123">Film</a><a href="/kino/_bin/kinodetail.php/1">Cinema</a>
  <table><tbody><tr><td>So, 18.10.26</td><td>20:00 (OV)</td></tr></tbody></table></div></li></ul>`;
export const cinemaResponse = (cinema = 'a') => ({ film: { id: 'film-1', title: 'A Film', url: 'https://fixture.test/film/1' },
  cinema: { id: cinema, name: cinema === 'a' ? 'Example Cinema' : 'Second Cinema', address: cinema === 'a' ? 'Example Street 1, 10115 Berlin' : '' },
  screenings: [{ id: 'session-1', date: ROLLOUT_DATE, time: '20:00', variant: 'OV' }] });
/** Captured HTTP boundary only. Unexpected URLs fail instead of falling through to a network. */
export const capturedRequest: SourceDependencies['request'] = async ({ url, purpose }) => {
  const parsed = new URL(url);
  if (purpose === 'film') throw new Error('Captured optional provider unavailable');
  if (purpose === 'venue') return { status: 200, headers: {}, body: parsed.hostname === 'www.berlin.de'
    ? '<div class="article-attributes"><span class="street-address">Example Street 1</span><span class="postal-code">10115</span><span class="locality">Berlin</span></div>'
    : '<div id="kino_infos"><address><a class="mob-adr-lnk">Example Street 1, 10115 Berlin</a></address></div>' };
  const body = parsed.hostname === 'www.critic.de' ? criticPage : parsed.hostname === 'www.berlin.de'
    ? parsed.searchParams.has('startat') ? '<ul class="js-accordion"></ul>' : berlinPage
    : parsed.hostname === 'fixture.test' ? JSON.stringify(cinemaResponse(parsed.pathname.slice(1))) : null;
  if (body === null) throw new Error(`No captured response for ${url}`);
  return { body, headers: {}, status: 200 };
};
