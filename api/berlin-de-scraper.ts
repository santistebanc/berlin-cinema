import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE = 'https://www.berlin.de';
const LISTING_URL = `${BASE}/kino/_bin/trefferliste.php?ovomu=on&suche=1`;

const HEADERS = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
};

function decode(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/g, '');
}

// "Di, 28.04.26" → "2026-04-28"
function parseGermanDate(s: string): string | null {
  const m = s.trim().match(/(\d{2})\.(\d{2})\.(\d{2,4})/);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2]}-${m[1]}`;
}

function germanDayToEn(day: string): string {
  const map: Record<string, string> = { Mo: 'Mon', Di: 'Tue', Mi: 'Wed', Do: 'Thu', Fr: 'Fri', Sa: 'Sat', So: 'Sun' };
  return map[day] ?? day;
}

function normalizeVariant(v: string): string | null {
  const vl = v.toLowerCase().replace(/\s/g, '');
  if (vl === 'ov') return 'OV';
  if (vl === 'omu' || vl === 'omü') return 'OmU';
  if (vl.startsWith('omenglu') || vl.startsWith('omüenglu')) return 'OmU';
  return v;
}

// Parse "20:45 (OmU)" or "16:20 (DFmEnglU), 18:40 (DFmEnglU), 21:00 (DFmEnglU)"
function parseTimeCell(cell: string): { time: string; variant: string | null }[] {
  const results: { time: string; variant: string | null }[] = [];
  const parts = cell.split(/,\s*(?=\d{1,2}:\d{2})/);
  for (const part of parts) {
    const timeMatch = part.match(/(\d{1,2}:\d{2})/);
    if (!timeMatch) continue;
    const variantMatch = part.match(/\(([^)]+)\)/);
    results.push({
      time: timeMatch[1],
      variant: variantMatch ? normalizeVariant(variantMatch[1]) : null,
    });
  }
  return results;
}

interface RawCinema {
  name: string;
  address: string;
}

interface RawShowing {
  date: string;
  originalDate: string;
  time: string;
  dayOfWeek: string;
  cinema: string;
  address: string;
  city: string;
  postalCode: string;
  url: string | undefined;
  variant?: string | null;
}

export interface BerlinDeRawMovie {
  title: string;
  criticTitle: string | null;
  altTitle: string | null;
  director: string | null;
  cast: string[] | null;
  country: string | null;
  year: string | null;
  posterUrl: string | null;
  url: string | null;
  variants: string[];
  cinemas: RawCinema[];
  showings: RawShowing[];
  isSpecial: boolean;
}

class BerlinDeScraper {
  async scrapeRawMovies(): Promise<BerlinDeRawMovie[]> {
    const movieMap = new Map<string, BerlinDeRawMovie>();
    const PAGE_SIZE = 300;
    let page = 0;

    while (true) {
      const url = page === 0 ? LISTING_URL : `${LISTING_URL}&startat=${page * PAGE_SIZE}`;
      console.log(`[berlin.de] Fetching listing page ${page + 1}...`);
      const res = await axios.get(url, { headers: HEADERS });
      const countBefore = Array.from(movieMap.values()).reduce((n, m) => n + m.showings.length, 0);
      this.mergePageIntoMap(res.data as string, movieMap);
      const countAfter = Array.from(movieMap.values()).reduce((n, m) => n + m.showings.length, 0);

      // Stop when a page adds nothing new (empty or duplicate-only)
      const items = (res.data as string).match(/js-accordion__trigger/g)?.length ?? 0;
      if (items === 0) break;
      page++;
    }

    const movies = Array.from(movieMap.values()).filter(m => m.showings.length > 0);
    console.log(`[berlin.de] Done — ${movies.length} movies from ${page} page(s)`);
    return movies;
  }

  private mergePageIntoMap(html: string, movieMap: Map<string, BerlinDeRawMovie>): void {
    const $ = cheerio.load(html);

    // Each li in the movie list is one (movie, cinema) pair.
    // The movie title is in span.info inside the trigger.
    // The cinema name is in the panel paragraph: '… läuft im "Cinema Name" …'

    $('ul.js-accordion > li').each((_, li) => {
      const trigger = $(li).find('span.js-accordion__trigger').first();
      // Title is either in span.info or directly in the trigger text
      const infoSpan = trigger.find('span.info').first();
      const rawTitle = decode(
        infoSpan.length ? infoSpan.text().trim() : trigger.text().trim()
      );
      if (!rawTitle || rawTitle === 'Zurücksetzen') return;

      // Strip variant suffix → base title
      const variantSuffixMatch = rawTitle.match(/\s*\(([^)]+)\)\s*$/);
      const variantSuffix = variantSuffixMatch ? variantSuffixMatch[1] : null;
      const baseTitle = variantSuffixMatch
        ? rawTitle.slice(0, rawTitle.lastIndexOf('(')).trim()
        : rawTitle;

      if (!baseTitle) return;

      const panel = $(li).find('.js-accordion__panel').first();

      // Extract cinema name from the paragraph text: "… läuft im "Cinema Name" …"
      const paraText = decode(panel.find('p').first().text());
      const cinemaMatch = paraText.match(/läuft im\s+"([^"]+)"/);
      const cinemaName = cinemaMatch ? cinemaMatch[1].trim() : null;
      if (!cinemaName) return;

      const cinemaHref = panel.find('a[href*="kinodetail.php"]').first().attr('href');
      const cinemaUrl = cinemaHref
        ? (cinemaHref.startsWith('http') ? cinemaHref : `${BASE}${cinemaHref}`)
        : undefined;

      const filmHref = panel.find('a[href*="filmdetail.php"]').first().attr('href');
      const filmUrl = filmHref
        ? (filmHref.startsWith('http') ? filmHref : `${BASE}${filmHref}`)
        : null;

      // Get or create movie entry
      const key = baseTitle.toLowerCase();
      if (!movieMap.has(key)) {
        movieMap.set(key, {
          title: baseTitle,
          criticTitle: null,
          altTitle: null,
          director: null,
          cast: null,
          country: null,
          year: null,
          posterUrl: null,
          url: filmUrl,
          variants: [],
          cinemas: [],
          showings: [],
          isSpecial: false,
        });
      }

      const movie = movieMap.get(key)!;

      // Track variant at movie level
      if (variantSuffix) {
        const v = normalizeVariant(variantSuffix);
        if (v && !movie.variants.includes(v)) movie.variants.push(v);
      }

      // Track cinema
      if (!movie.cinemas.some(c => c.name === cinemaName)) {
        movie.cinemas.push({ name: cinemaName, address: '' });
      }

      // Parse showings from the schedule table
      panel.find('table tbody tr').each((_, row) => {
        const cells = $(row).find('td');
        const dateCell = decode(cells.eq(0).text().trim());
        const timeCell = decode(cells.eq(1).text().trim());
        if (!dateCell || !timeCell) return;

        const dateStr = parseGermanDate(dateCell);
        if (!dateStr) return;

        const dayMatch = dateCell.match(/^(\w{2}),/);
        const dayOfWeek = dayMatch ? germanDayToEn(dayMatch[1]) : '';

        for (const { time, variant } of parseTimeCell(timeCell)) {
          if (variant && !movie.variants.includes(variant)) movie.variants.push(variant);
          movie.showings.push({
            date: dateStr,
            originalDate: dateCell,
            time,
            dayOfWeek,
            cinema: cinemaName,
            address: '',
            city: 'Berlin',
            postalCode: '',
            url: cinemaUrl,
            variant,
          });
        }
      });
    });

  }
}

export default BerlinDeScraper;
