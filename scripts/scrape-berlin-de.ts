/**
 * Scrapes OV/OmU movies from berlin.de and compares with movies.json from critic.de.
 * Usage: npx tsx scripts/scrape-berlin-de.ts
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
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

const BERLIN_DE_URL = 'https://www.berlin.de/kino/_bin/trefferliste.php?ovomu=on&suche=1';
const MOVIES_JSON_PATH = path.join(__dirname, '../public/movies.json');
const OUTPUT_PATH = path.join(__dirname, '../berlin-de-movies.json');

const HEADERS = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
};

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

function normalizeTitle(title: string): string {
  return decode(title)
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

interface BerlinDeMovie {
  title: string;
  variants: string[];
  filmDetailUrl: string | null;
}

async function scrapeBerlinDe(): Promise<BerlinDeMovie[]> {
  console.log('Fetching berlin.de OV listings...');
  const response = await axios.get(BERLIN_DE_URL, { headers: HEADERS });
  const html: string = response.data;

  // Each movie is an accordion entry: <strong class="js-accordion__heading">
  //   <span class="js-accordion__trigger"> Title (OmU) </span>
  // followed by a panel with film detail link
  const blockRe = /<strong[^>]*class="js-accordion__heading"[^>]*>[\s\S]*?<span[^>]*class="js-accordion__trigger"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/strong>([\s\S]*?)(?=<strong[^>]*class="js-accordion__heading"|<\/ul>)/g;

  const variantPattern = /\((OV|OmU|OmU\+OV|OV\+OmU)\)\s*$/;
  const filmLinkRe = /href="([^"]*filmdetail\.php[^"]*)"/;

  const movies = new Map<string, BerlinDeMovie>();

  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) !== null) {
    const triggerRaw = match[1];
    const panelRaw = match[2];

    const triggerText = decode(stripTags(triggerRaw)).trim();
    if (!triggerText || triggerText === 'Zurücksetzen') continue;

    const variantMatch = triggerText.match(variantPattern);
    const variant = variantMatch ? variantMatch[1] : null;
    const title = variantMatch
      ? triggerText.slice(0, triggerText.lastIndexOf('(')).trim()
      : triggerText;

    if (!title) continue;

    const linkMatch = panelRaw.match(filmLinkRe);
    const filmDetailUrl = linkMatch
      ? `https://www.berlin.de${linkMatch[1]}`
      : null;

    const key = normalizeTitle(title);
    if (movies.has(key)) {
      const existing = movies.get(key)!;
      if (variant && !existing.variants.includes(variant)) existing.variants.push(variant);
    } else {
      movies.set(key, {
        title,
        variants: variant ? [variant] : [],
        filmDetailUrl,
      });
    }
  }

  return Array.from(movies.values()).sort((a, b) => a.title.localeCompare(b.title));
}

function loadCriticMovies(): string[] {
  const data = JSON.parse(fs.readFileSync(MOVIES_JSON_PATH, 'utf-8'));
  return data.movies.map((m: any) => m.title as string);
}

function fuzzyMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return true;
  // allow one to be a substring of the other (handles subtitle differences)
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

async function main() {
  const berlinMovies = await scrapeBerlinDe();
  console.log(`berlin.de: ${berlinMovies.length} unique OV/OmU movies`);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ movies: berlinMovies, scrapedAt: new Date().toISOString() }, null, 2));
  console.log(`Saved to ${OUTPUT_PATH}`);

  const criticTitles = loadCriticMovies();
  console.log(`critic.de (movies.json): ${criticTitles.length} movies\n`);

  // Find berlin.de movies NOT in critic.de
  const onlyInBerlin = berlinMovies.filter(bm =>
    !criticTitles.some(ct => fuzzyMatch(bm.title, ct))
  );

  // Find critic.de movies NOT in berlin.de
  const onlyInCritic = criticTitles.filter(ct =>
    !berlinMovies.some(bm => fuzzyMatch(bm.title, ct))
  );

  console.log(`=== In berlin.de but NOT in critic.de (${onlyInBerlin.length}) ===`);
  for (const m of onlyInBerlin) {
    console.log(`  - ${m.title}${m.variants.length ? ` (${m.variants.join(', ')})` : ''}`);
  }

  console.log(`\n=== In critic.de but NOT in berlin.de (${onlyInCritic.length}) ===`);
  for (const t of onlyInCritic) {
    console.log(`  - ${t}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
