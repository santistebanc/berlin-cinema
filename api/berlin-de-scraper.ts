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

// Map berlin.de variant codes to app variant codes
function normalizeVariant(v: string): string | null {
  const vl = v.toLowerCase().replace(/\s/g, '');
  if (vl === 'ov') return 'OV';
  if (vl === 'omu' || vl === 'omü') return 'OmU';
  if (vl.startsWith('omenglu') || vl.startsWith('omüenglu')) return 'OmU';
  // Return as-is for other codes (DFmEnglU, etc.)
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

interface ListingEntry {
  title: string;
  detailUrl: string;
}

class BerlinDeScraper {
  private delay(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
  }

  async scrapeRawMovies(): Promise<BerlinDeRawMovie[]> {
    console.log('[berlin.de] Fetching listing page...');
    const listing = await axios.get(LISTING_URL, { headers: HEADERS });
    const entries = this.parseListing(listing.data as string);
    console.log(`[berlin.de] Found ${entries.length} movies on listing page`);

    const rawMovies: BerlinDeRawMovie[] = [];

    for (let i = 0; i < entries.length; i++) {
      const { title, detailUrl } = entries[i];
      try {
        await this.delay(300);
        const detail = await axios.get(detailUrl, { headers: HEADERS });
        const movie = this.parseDetailPage(title, detailUrl, detail.data as string);
        if (movie) rawMovies.push(movie);
        if ((i + 1) % 10 === 0) {
          console.log(`[berlin.de] Fetched ${i + 1}/${entries.length}`);
        }
      } catch (err) {
        console.warn(`[berlin.de] Failed to fetch ${detailUrl}: ${(err as Error).message}`);
      }
    }

    console.log(`[berlin.de] Done — ${rawMovies.length} movies with showings`);
    return rawMovies;
  }

  private parseListing(html: string): ListingEntry[] {
    const $ = cheerio.load(html);
    const entries: ListingEntry[] = [];
    const seen = new Set<string>();

    $('span.js-accordion__trigger').each((_, el) => {
      const rawText = decode($(el).text().trim());
      if (!rawText || rawText === 'Zurücksetzen') return;

      // Strip variant suffix to get base title
      const title = rawText.replace(/\s*\((OV|OmU|OmU\+OV|OV\+OmU|OmenglU)\)\s*$/i, '').trim();
      if (!title || seen.has(title)) return;

      const panel = $(el).closest('strong').next('.js-accordion__panel');
      const href = panel.find('a[href*="filmdetail.php"]').first().attr('href');
      if (!href) return;

      const detailUrl = href.startsWith('http') ? href : `${BASE}${href}`;
      seen.add(title);
      entries.push({ title, detailUrl });
    });

    return entries;
  }

  private parseDetailPage(title: string, detailUrl: string, html: string): BerlinDeRawMovie | null {
    const $ = cheerio.load(html);

    const cinemas: RawCinema[] = [];
    const showings: RawShowing[] = [];
    const variantSet = new Set<string>();

    $('ul.js-accordion > li').each((_, liEl) => {
      const trigger = $(liEl).find('span.js-accordion__trigger').first();
      const infoText = trigger.find('.info').text().trim();
      const fullText = decode(trigger.text().trim());
      const cinemaName = fullText.replace(infoText, '').trim();
      if (!cinemaName) return;

      const panel = $(liEl).find('.js-accordion__panel').first();
      const cinemaHref = panel.find('a[href*="kinodetail.php"]').first().attr('href');
      const cinemaUrl = cinemaHref
        ? (cinemaHref.startsWith('http') ? cinemaHref : `${BASE}${cinemaHref}`)
        : undefined;

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
          if (variant) variantSet.add(variant);
          showings.push({
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

      if (!cinemas.some(c => c.name === cinemaName)) {
        cinemas.push({ name: cinemaName, address: '' });
      }
    });

    if (showings.length === 0) return null;

    const filmId = detailUrl.match(/filmdetail\.php\/(\d+)/)?.[1] ?? '';
    const posterUrl = filmId
      ? `${BASE}/kino/_img/filmbilder/p_${filmId}_Print2.jpg`
      : null;

    return {
      title,
      criticTitle: null,
      altTitle: null,
      director: null,
      cast: null,
      country: null,
      year: null,
      posterUrl,
      url: detailUrl,
      variants: Array.from(variantSet),
      cinemas,
      showings,
      isSpecial: false,
    };
  }
}

export default BerlinDeScraper;
