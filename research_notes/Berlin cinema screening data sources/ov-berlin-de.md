# Where does https://www.ov-berlin.de/ get screening data?

Observed 16 October 2026. Focus: **www.ov-berlin.de** only — not this repo’s **ovberlin.online**, and not **ovkinos.de** / **ovberlin.com** (separate products).

## Takeaway

**Upstream for showtimes is first-party scraping of cinema and ticketing websites**, not a single licensed commercial showtimes feed (International Showtimes, MovieGlu, Tel-A-Vision, Krankikom, etc.).

Hard evidence:

1. Site FAQ: showtimes are **“scraped directly from each cinema's own website”** ([/ov-kino-berlin](https://www.ov-berlin.de/ov-kino-berlin); German equivalent on [/originalfassung-kino-berlin](https://www.ov-berlin.de/originalfassung-kino-berlin)).
2. Live API rows carry **`statusSource: "SCRAPED"`** ([`https://ov-berlin.onrender.com/screenings`](https://ov-berlin.onrender.com/screenings)).
3. Datenschutz: a **background data-collection worker on Render** writes a **Supabase** DB; the public site is on **Vercel** ([Datenschutz §2](https://www.ov-berlin.de/datenschutz)).
4. Booking URLs in those rows deep-link to **Yorck, Kinoheld, CinemaxX, CineStar webticketing, UCI**, etc. — per-venue ticket CMS hosts, consistent with scrape/collect targets rather than one aggregator API.

**Confidence: high** for “own scrape worker over cinema/ticketing sites + TMDB for metadata.” **Medium** for the exact per-cinema scrape implementation (HTML vs ticket-provider API), which is not published.

## Operator and legal pages

| Claim | Source |
| --- | --- |
| Operated by a private individual; non-commercial hobby project; contact `hello@ov-berlin.de` | [Impressum](https://www.ov-berlin.de/impressum), [Datenschutz §1](https://www.ov-berlin.de/datenschutz) |
| No company / commercial registration / current monetisation | [Datenschutz §1](https://www.ov-berlin.de/datenschutz) |
| Impressum does **not** name a screening-data partner | [Impressum](https://www.ov-berlin.de/impressum) |

## Architecture (first-party disclosures)

| Layer | Provider | Evidence |
| --- | --- | --- |
| Website / Next.js frontend | Vercel | [Datenschutz §2](https://www.ov-berlin.de/datenschutz); `/_next/static/chunks/…` on [homepage](https://www.ov-berlin.de/) |
| Backend API + **background data-collection worker** | Render | [Datenschutz §2](https://www.ov-berlin.de/datenschutz) |
| Public API host observed | `https://ov-berlin.onrender.com` | Bundled client calls this base ([`/_next/static/chunks/1671-e4e983cdb4544183.js`](https://www.ov-berlin.de/_next/static/chunks/1671-e4e983cdb4544183.js)); live JSON at `/screenings`, `/movies`, `/cinemas`, `/freiluftkino`, `/health` |
| Database | Supabase (EU region claimed) | [Datenschutz §2](https://www.ov-berlin.de/datenschutz); cinema photo URLs use project host `bdkjafkwyrspcfsyczyp.supabase.co` ([`/cinemas` API](https://ov-berlin.onrender.com/cinemas)) |
| Movie metadata / posters | TMDB | [About — Data sources](https://www.ov-berlin.de/about); [Datenschutz §8](https://www.ov-berlin.de/datenschutz); `posterUrl` / `tmdbId` on screenings |
| Map tiles | CARTO + OpenStreetMap | [About](https://www.ov-berlin.de/about); [Datenschutz §9](https://www.ov-berlin.de/datenschutz) |
| Analytics (not schedule data) | Mixpanel (opt-in), Vercel Web Analytics | [Datenschutz §§3–4](https://www.ov-berlin.de/datenschutz) |

[`robots.txt`](https://www.ov-berlin.de/robots.txt) disallows `/api/` and `/_next/` (and `/out`, `/go`), and lists SEO landing paths; `Host: https://www.ov-berlin.de`; sitemap declared at `/sitemap.xml` (returned HTTP 500 when fetched on 16 Oct 2026). `/feed.xml` also returned 500 the same day.

## First-party statements about screening sources

From [About](https://www.ov-berlin.de/about) (16 Oct 2026):

- “Schedules refresh throughout the day from **88 cinemas**.”
- **Data sources:** posters, synopses, ratings from **TMDB**; “We refresh screening information regularly from **cinema and ticketing sources**”; OV Berlin does not sell tickets — users book on the cinema/ticket provider’s site.

From FAQ on [/ov-kino-berlin](https://www.ov-berlin.de/ov-kino-berlin):

> “Showtimes are **scraped directly from each cinema's own website** throughout the day, so the schedule reflects each cinema's own listings.”

From FAQ on [/originalfassung-kino-berlin](https://www.ov-berlin.de/originalfassung-kino-berlin):

> “Die Spielzeiten werden **direkt von den jeweiligen Kino-Websites abgerufen** und spiegeln das jeweilige Kinoprogramm wider.”

Homepage marketing ([`/`](https://www.ov-berlin.de/)): listings “aggregated from 88 Berlin cinemas.”

## Live API evidence (Render)

Health check (16 Oct 2026): [`GET https://ov-berlin.onrender.com/health`](https://ov-berlin.onrender.com/health) → `{"status":"ok","db":"ok","ts":"…","version":"0.1.0"}`.

Verified JSON endpoints (same day):

| Path | Role |
| --- | --- |
| `/screenings` | Paginated showtimes (`data` + `meta.total` / `page` / `limit`) |
| `/movies` | Movie catalogue (large payload) |
| `/cinemas` | Venue list with `websiteUrl`, coords, experience metadata |
| `/freiluftkino` | Open-air subset (`data` empty off-season; `meta.updatedAt` present) |

Sample screening object fields from [`/screenings?date=2026-10-16&limit=2`](https://ov-berlin.onrender.com/screenings?date=2026-10-16&limit=2):

- `id` — cuid-like (`cmv79bmtk019jd9x5hczfx5ao`)
- `startsAt`, `screeningFormat` (`OMU` / `OV` / …), `subtitleLanguage`, `labelsRaw`
- `bookingUrl` — external ticket URL
- `status` — e.g. `SCHEDULED`
- **`statusSource` — `SCRAPED`**
- `statusUpdatedAt` — timestamp near overnight scrape window (~21:xx UTC on 15 Oct for many rows)
- nested `movie` (`tmdbId`, `imdbId`, TMDB poster CDN, synopsis, cast, …) and `cinema` (`slug`, `websiteUrl`, …)

Examples of booking hosts observed in live rows (same day):

| Cinema (API slug) | Example `bookingUrl` host | Source |
| --- | --- | --- |
| `bware-ladenkino` | `www.kinoheld.de` | [`/screenings?date=2026-10-16&limit=2`](https://ov-berlin.onrender.com/screenings?date=2026-10-16&limit=2) |
| `cinemaxx-potsdamer-platz` | `www.cinemaxx.de` | same |
| `hackesche-hoefe-kino` | `www.kinoheld.de` | [`…?cinemaSlug=hackesche-hoefe-kino`](https://ov-berlin.onrender.com/screenings?cinemaSlug=hackesche-hoefe-kino&limit=3) |
| `yorck` | `www.yorck.de` (programme + `/en/checkout/tickets?sessionid=…`) | [`…?cinemaSlug=yorck`](https://ov-berlin.onrender.com/screenings?cinemaSlug=yorck&limit=3) |
| `cinestar-cubix` | `webticketing3.cinestar.de` | [`…?cinemaSlug=cinestar-cubix`](https://ov-berlin.onrender.com/screenings?cinemaSlug=cinestar-cubix&limit=3) |
| `uci-east-side-gallery` | `www.uci-kinowelt.de` | [`…?cinemaSlug=uci-east-side-gallery`](https://ov-berlin.onrender.com/screenings?cinemaSlug=uci-east-side-gallery&limit=3) |

Cinema catalogue rows point `websiteUrl` at each venue’s own programme page (e.g. `yorck.de/kinos/…`, `ladenkino.de/…`, `cinemaxx.de/…`) — [`/cinemas`](https://ov-berlin.onrender.com/cinemas).

Frontend also SSR-embeds `initialScreenings` into the Next.js App Router RSC payload on [`/`](https://www.ov-berlin.de/) (same cuid IDs / fields as the Render API), so the browser listing does not need a third-party showtimes API.

## Client JS clues (booking destinations, not licensed feeds)

From [`/_next/static/chunks/5561-5fc9d3420272b557.js`](https://www.ov-berlin.de/_next/static/chunks/5561-5fc9d3420272b557.js):

- `bookingProviderFromHost` maps ticket hosts: `kinoheld.de`, `yorck.de`, `cinestar.de`, `uci-kinowelt.de`, `cinemaxx.de` / `cinemagold.de`, `cineplex.de`, `premiumkino.de`, `zoopalast.de`, `astor-filmlounge.de`.
- `classifyBookingUrl` scores checkout vs programme deep-links for those hosts.
- Outbound clicks go through `/out?…` and `/go/[screeningId]` (also described in [Datenschutz §5](https://www.ov-berlin.de/datenschutz)).

From [`/_next/static/chunks/1671-e4e983cdb4544183.js`](https://www.ov-berlin.de/_next/static/chunks/1671-e4e983cdb4544183.js):

- Client `fetch` to `https://ov-berlin.onrender.com/freiluftkino` with filter query params.

These map **where users are sent to book**, and strongly suggest scrape/collection targets for many venues. They do **not** prove a licensed B2B feed contract with those brands.

## What is *not* the screening upstream

- **TMDB** — film metadata/images only ([About](https://www.ov-berlin.de/about), [Datenschutz §8](https://www.ov-berlin.de/datenschutz)).
- **Mixpanel / Vercel Analytics** — usage analytics ([Datenschutz §§3–4](https://www.ov-berlin.de/datenschutz)).
- **No evidence** in legal pages, About, robots, or inspected client/API payloads of International Showtimes, MovieGlu, Tel-A-Vision, Cine Marketing, Krankikom, Eventim, Vue/cine.digital, Google Sheets, Airtable, or Firebase as the showtimes source.
- Next.js path `/api/screenings` on www returned **404** when probed; showtimes are served from the Render host / SSR blob instead.
- Impressum/Datenschutz name infrastructure vendors, not a programme-data licensor.

## Brief comparison to other Berlin OV aggregators (not this site’s feed)

| Site | Relation to ov-berlin.de |
| --- | --- |
| **ovberlin.online** (this repo) | Different product; do not conflate. |
| **ovkinos.de** | Separate site; its `llms.txt` claims scrape of cinema chains / Kinoheld API — that is **their** claim, not ov-berlin.de’s. |
| **film-finder / ovberlin.com** (chrisabruce GitHub) | Older/static Cloudflare scrape project (UCI, CineStar, Yorck, critic.de). Different stack (not Vercel+Render+Supabase). Not evidence for www.ov-berlin.de’s worker. |

## Gaps

- Scraper source code and exact target URLs/cadence are **not** published (only “throughout the day” / “regularly”).
- Whether collection hits cinema HTML, Kinoheld/Yorck/Vista/Cinetixx APIs, or both is **inferred** from `bookingUrl` / `websiteUrl` hosts, not confirmed in open code.
- No public GitHub for this Render worker found via identifier searches (`hello@ov-berlin.de`, `ov-berlin.onrender.com`, Supabase project ref) on 16 Oct 2026.
- `/sitemap.xml` and `/feed.xml` errored (500) during this pass.

## Practical implication for this project

Treat **ov-berlin.de** as a competing hobby aggregator with its own Render scrape worker + Supabase store. It is **not** a documented reusable upstream API for berlin-cinema. Reusing their listings would need operator permission (`hello@ov-berlin.de`); reverse-engineering private scrape targets is a separate ethical/legal question from reading their public About/API.
