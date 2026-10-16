# Public aggregators, listing portals and open-data routes for Berlin screenings

All observations were made on 16 October 2026 with a handful of requests per site. Counts are snapshots for the cinema week of Thursday 15 to Wednesday 21 October 2026 unless stated otherwise. Individual cinema sites and ticketing platforms are covered in a separate note. Commercial feeds are covered in [licensed-feeds.md](licensed-feeds.md).

## Comparison table

| Source | URL | Access method | OV/OmU flags | Coverage (observed) | robots / ToS | Verdict |
|---|---|---|---|---|---|---|
| berlin.de Kino (in use) | [berlin.de/kino](https://www.berlin.de/kino/) | Server HTML. Listing endpoint `trefferliste.php` plus per-cinema `kinodetail.php/<id>` and per-film `filmdetail.php/<id>` pages. RSS is editorial only. | `(OmU)`, `(OV / OmU)`, `(OmenglU)` in titles and time cells | About 98 venues including Umland and an open-air filter. Runs to the end of the cinema week. | **`trefferliste.php` is disallowed for `*`.** Bots must identify themselves. | Keep, but move to `kinodetail.php` pages |
| critic.de OV finder (in use) | [critic.de/ov-movies-berlin](https://www.critic.de/ov-movies-berlin/) | HTML form POST | OV and OmU checkboxes | About 48 cinemas, 7 days | Finder allowed. **`/ov-movies-berlin/cinema/` and `/movie/` disallowed.** | Keep, but stop fetching the detail subpaths |
| indiekino Berlin | [indiekino.de/kinoprogramm/de/berlin](https://www.indiekino.de/kinoprogramm/de/berlin/kino_datum) | Server HTML. One page holds the whole city programme. | Per-screening `span.fassung`: OmU, OmeU, OV, EnglF | 117 venue entries including open-air; 2,322 screenings on one page | robots allows. Impressum requires consent before storing in databases. | **Best new candidate. Ask for permission first.** |
| kino-zeit.de | [per-cinema pages](https://www.kino-zeit.de/kinoprogramm/berlin/delphi-lux-berlin) | JSON-LD `MovieTheater.event[]` | `(OmU)` in `Event.name` | Per-cinema; 157 events at Delphi LUX | robots allows. No reproduction without permission. | Structured fallback, low priority |
| Berliner Morgenpost Kinoprogramm | [kino.morgenpost.de/region](https://kino.morgenpost.de/region/) | Server HTML (RCE white-label) | URL suffix `_OmU`, `_OmenglU`, `_OV`, `_3D` | 68 cinema pages, Friday to Wednesday | robots allows content paths. ToS not reviewed. | Possible, but probably the same upstream as tip/indiekino |
| tip Berlin | [tip-berlin.de/event/kino/…](https://www.tip-berlin.de/movie-sitemap.xml) | WordPress behind a bot wall | OmU/OmenglU (search snippets only) | 647 URLs in movie sitemap | robots allows all, but a Centinel JS challenge returns 403 | Not feasible |
| Cine Marketing public Kinoprogramm | [kino.veranstaltungen-in-berlin.de](https://kino.veranstaltungen-in-berlin.de/region/) | RCE HTML | none seen | 1 cinema and 16 films shown | robots allows content | No |
| cinema.de Kinotimer | [cinema.de/kino/kinoprogramm/berlin](https://www.cinema.de/kino/kinoprogramm/berlin) | HTML GET form | Title suffix `(OmU)`, `(OF)`, `(OV/70 mm)` | 104 venues, 8 days | Anthropic's fetcher is refused. ToS unread. | No (site has opted out) |
| filmstarts.de (Webedia) | [filmstarts.de/kinoprogramm/kino/A0625](https://www.filmstarts.de/kinoprogramm/kino/A0625/) | HTML `data-*` attributes; other dates load later | `Localization.Subtitle.German`, `Localization.Version.Original` | Per-cinema; dates to 9 Nov | `/_/` disallowed. ToS: private, non-commercial use only. | No |
| kino.de (Ströer) | [kino.de/kinoprogramm/stadt/berlin/…](https://www.kino.de/kinoprogramm/stadt/berlin/stadtteil/marzahn/) | not fetched | unknown | unknown | TDM rights reserved; automated access prohibited without permission | No, unless permission is granted |
| moviepilot.de (Webedia) | [moviepilot.de/kinos/…](https://www.moviepilot.de/kinos/lichtblick-kino-berlin) | Next.js; showtimes empty in `__NEXT_DATA__` | unknown | Pages showed no screenings | `/api/` disallowed | No |
| kinoheld city portal | [kinoheld.de/kino/berlin](https://www.kinoheld.de/kino/berlin) | Nuxt plus GraphQL with a bearer token | n/a here | 25 km radius | `/ajax/` and ClaudeBot disallowed | See the ticketing note |
| ov-berlin.info | [ov-berlin.info/movies](https://ov-berlin.info/movies/) | JSON-LD `ScreeningEvent` per film; RSS; API on request | `subtitleLanguage` holds OmU/OV/OmeU | 293 films, 57 cinemas, 14 days | robots allows | Competitor: use as a QA benchmark or ask for the API |
| English Cinema Berlin | [englishcinemaberlin.com/films](https://englishcinemaberlin.com/films) | JSON-LD `ScreeningEvent` | English audio only, no tag | 62 films, about 40 cinemas | `/r/` booking redirect disallowed | Benchmark only |
| SerpApi Google Showtimes | [serpapi.com/showtimes-results](https://serpapi.com/showtimes-results) | Paid JSON API | No language field documented | Germany not documented | 250 free searches per month | No |
| TMDb / OMDb | [TMDb now_playing](https://developer.themoviedb.org/reference/movie-now-playing-list), [OMDb](https://www.omdbapi.com/) | API | none | **no showtimes** | n/a | Enrichment only |
| OSM Overpass / Wikidata | [Overpass](https://overpass-api.de/api/interpreter), [WDQS](https://query.wikidata.org/sparql) | Query APIs | n/a | 90 OSM cinemas; 839 Wikidata items, many historic | ODbL / CC0 | Venue data only |
| Berlin Open Data / kulturdaten.berlin | [datenregister CKAN](https://datenregister.berlin.de/api/3/action/package_search?q=kino), [kulturdaten.berlin](https://www.kulturdaten.berlin/) | CKAN API | n/a | 0 cinema datasets; project ended 2023 | n/a | No |
| openair-kino.net | [wp-json posts](https://openair-kino.net/wp-json/wp/v2/posts) | WordPress REST (one post per screening) | `(OmU)` in title | 14,281 posts; Berlin and Brandenburg open-air | robots allows; no reuse terms | Seasonal source (May–Sep). Ask the operator. |
| Berlinale | [berlinale.de programme](https://www.berlinale.de/en/programme/berlinale-programme.html?sort=1&section_id=51&day_id=0) | HTML; iCal and `/api/` exist | Festival language data (not inspected) | February only | iCal, `/api/` and ticket JSON disallowed | Seasonal. Contact the festival. |

## Which Berlin listing portals exist and how are they accessed?

### Takeaway
Berlin's newspaper and city-magazine listings mostly share one upstream supplier, Cine Marketing. Of the portals that can be fetched, **indiekino** has the best OV signal: version tags on each screening, kinoheld booking deep links, and open-air and micro venues, all on one page. The two sources already in use have robots.txt conflicts in the project's current access paths. These can be fixed by switching to allowed pages on the same sites.

### Cited Findings
- **berlin.de robots conflict:** the `User-Agent: *` block contains `Disallow: /kino/_bin/trefferliste.php`. The robots header says automated programs must "clearly and uniquely identify" themselves. It calls access to disallowed pages "strictly unauthorised" and gives `webmaster@berlinonline.net` as the contact. [berlin.de robots.txt](https://www.berlin.de/robots.txt). The project's listing scraper fetches exactly `…/kino/_bin/trefferliste.php?ovomu=on&suche=1` with a Chrome browser User-Agent. [berlin-de-scraper.ts](../../api/berlin-de-scraper.ts)
- **berlin.de allowed structure:**
  - `kinodetail.php/<id>` pages list every film at a cinema, with dates, times and version tags, e.g. `Bitteres Fest (OmU) … So, 18.10.26 20:45 (OmU)`. [Acud Kino detail](https://www.berlin.de/kino/_bin/kinodetail.php/30151)
  - `filmdetail.php/<id>` pages list every cinema and time for a film, e.g. B-ware! `Mo, 19.10.26 12:40 (OmU)`. [film detail](https://www.berlin.de/kino/_bin/filmdetail.php/316397/)
  - The cinema `<select>` on any kino page holds 100 options. Two are placeholders ("Alle Kinos", "Alle Freiluftkinos" = `-1`). The rest include Umland venues such as Filmmuseum Potsdam and Filmpalast Bernau. [A–Z Kinos](https://www.berlin.de/kino/_bin/azkino.php)
  - An OV-only film A–Z exists, split over two pages. [azfilm.php/ov](https://www.berlin.de/kino/_bin/azfilm.php/ov)
  - The date filter runs from today to Wednesday 21 October. [search page](https://www.berlin.de/kino/_bin/index.php)
  - `/kino/index.rss` carries editorial film tips, and `/kino/_bin/rss.php` carries new releases, not showtimes. [index.rss](https://www.berlin.de/kino/index.rss); [rss.php](https://www.berlin.de/kino/_bin/rss.php)
  - No JSON-LD, `__NEXT_DATA__` or iCal was found on film pages. [film detail](https://www.berlin.de/kino/_bin/filmdetail.php/316397/)
  - The site is operated by BerlinOnline GmbH. The Impressum names no cinema-data supplier and allows use of content "nur im Rahmen der gesetzlichen Bestimmungen". [Impressum](https://www.berlin.de/wir-ueber-uns/impressum/)
- **critic.de robots conflict:** robots allows `/` but disallows `/ov-movies-berlin/cinema/` and `/ov-movies-berlin/movie/`. [critic.de robots.txt](https://www.critic.de/robots.txt) The project POSTs to the allowed finder URL. However, it fetches `/ov-movies-berlin/cinema/<slug>/` venue pages and `/ov-movies-berlin/movie/<slug>/` detail pages. [source-venues.ts](../../api/pipeline/source-venues.ts); [source-details.ts](../../api/pipeline/source-details.ts); [berlin-cinema-scraper.ts](../../api/berlin-cinema-scraper.ts)
- **critic.de structure:**
  - The finder form offers about 48 cinemas (49 options including the prompt), a district filter, dates Fri 16/10 to Thu 22/10, and "OV" and "OV w/ sub" checkboxes. [OV finder](https://www.critic.de/ov-movies-berlin/)
  - The page has no JSON-LD. It credits "krankikom" and "Bertz + Fischer Verlag" under "Powered by". [OV finder](https://www.critic.de/ov-movies-berlin/)
  - The Impressum names publisher Michael Kienzl (mkienzl@critic.de) and has no data-reuse clause. [Impressum](https://www.critic.de/impressum/)
- **indiekino Berlin:**
  - `robots.txt` only disallows `/werbung/`. [robots](https://www.indiekino.de/robots.txt)
  - `/kinoprogramm/de/berlin/kinos` lists 117 venue entries by district, including Freiluftkino Insel, B-Ware Open Air and Mobile Kino. Per-cinema pages follow `/kinoprogramm/de/berlin/kinos/<slug>`. [Kinos](https://www.indiekino.de/kinoprogramm/de/berlin/kinos)
  - Each screening is a `div.termin` with time `span.zi`, version `span.fassung` and title link `/film/de/<slug>`. Booking links are kinoheld deep links such as `kinoheld.de/kino/berlin/sputnik-kino/vorstellung/3681985419/…&ref=indie`. [Sputnik Südstern](https://www.indiekino.de/kinoprogramm/de/berlin/kinos/berlin_sputnik_suedstern)
  - `/kinoprogramm/de/berlin/kino_datum` (1.2 MB) contained 2,322 `termin` entries across 50 cinema slugs, with dates through Wed 21.10. Of those, 1,023 had version tags (OmU 594, OmeU 396, OV 31, EnglF 2), and 525 had kinoheld links. Multiplexes sit behind a "Multiplexe anzeigen" toggle. [kino_datum](https://www.indiekino.de/kinoprogramm/de/berlin/kino_datum)
  - The site is published by INDIEKINO BERLIN UG (info@indiekino.de). The Impressum says any use not permitted by copyright law, explicitly including "Einspeicherung" in databases, needs prior written consent. [Impressum](https://www.indiekino.de/impressum)
- **Shared upstream:** Cine Marketing's supply list (dated 01.03.2020) names these Berlin clients:
  - B.Z., Berliner Morgenpost, Berliner Zeitung, PNN, Stadtmagazin TIP, Zitty, Der Tagesspiegel and taz Berlin
  - the web portals indiekino.de, tip-online.de and zitty.de
  - "filmaggregate (Programmkinos Berlin)"

  [Kinoprogrammlieferungen.pdf](https://cine-marketing-gmbh.de/files/pdfs/2018/Kinoprogrammlieferungen.pdf)
- **Cine Marketing's own public Kinoprogramm:** kino-berlin.de redirects to veranstaltungen-in-berlin.de, whose footer reads "© 2026 Cine Marketing GmbH, Müllerstr. 12 13353 Berlin". [veranstaltungen-in-berlin.de](https://veranstaltungen-in-berlin.de/) Its `kino.` subdomain showed only 16 films and one cinema (Thalia Movie Magic), with a "© 2021" footer. [Kinoprogramm](https://kino.veranstaltungen-in-berlin.de/region/?kinos)
- **Berliner Morgenpost:**
  - `kino.morgenpost.de/region/` runs on the RCE event platform (assets from `rce-event.de`). Its `og:description` reads "Kinoprogramm in Köln und Umgebung". [Morgenpost Kinoprogramm](https://kino.morgenpost.de/region/)
  - The `?kinos` view links 68 cinema pages using the pattern `/berlin/<slug>-t<id>/`. [cinema list](https://kino.morgenpost.de/region/?kinos)
  - Film pages use `<slug>-f<id>_<id>[_OmU|_OmenglU|_OV|_3D|_Atmos].html`. The landing page linked 112 film-version pages (OmenglU 27, OmU 23, OV 5). [landing](https://kino.morgenpost.de/region/)
  - Cinema pages show a Fri–Wed grid with version tags but no booking links. [b-ware! ladenkino](http://kino.morgenpost.de/berlin/b-ware-ladenkino-t43655193/)
  - `robots.txt` only blocks system paths. [robots](https://kino.morgenpost.de/robots.txt)
- **tip Berlin:**
  - `robots.txt` has an empty `Disallow`. [robots](https://www.tip-berlin.de/robots.txt)
  - Programme, event and `wp-json` pages returned HTTP 403 or a JS cookie challenge titled "Access Blocked - Centinel Analytica" to both curl and WebFetch. [Kinoprogramm](https://www.tip-berlin.de/kino/kinoprogramm/)
  - Sitemaps are readable. `movie-sitemap.xml` lists 647 `/event/kino/<slug>/` URLs, and venue pages use `/event/location/<slug>/`. [movie sitemap](https://www.tip-berlin.de/movie-sitemap.xml); [location sitemap](https://www.tip-berlin.de/location-sitemap.xml)
- **Other print brands:**
  - The Berliner (formerly Exberliner; exberliner.com redirects to the-berliner.com) has editorial film coverage but no showtime listings. Its footer reads "Tip Berlin Media Group GmbH | Müllerstraße 12 | 13353 Berlin". [The Berliner film](https://www.the-berliner.com/film/)
  - Zitty's homepage now carries farewell pieces ("Mach's gut, liebe Zitty!"). [zitty.de](https://www.zitty.de/)
  - Probed Tagesspiegel Kinoprogramm URLs returned 404. [tagesspiegel.de/kinoprogramm](https://www.tagesspiegel.de/kinoprogramm/)
  - berliner-zeitung.de/kinoprogramm redirected to a category index. [berliner-zeitung.de/kinoprogramm](https://www.berliner-zeitung.de/kinoprogramm)
  - bz-berlin.de/kino returned 403. [bz-berlin.de/kino](https://www.bz-berlin.de/kino)

### Inferences
- indiekino, tip and the Morgenpost probably share the Cine Marketing upstream, so they are not independent observations of the same screening. Agreement between them should not count as corroboration of film identity. berlin.de's supplier remains unknown; see the gap in [licensed-feeds.md](licensed-feeds.md).
- Cine Marketing and Tip Berlin Media Group share the Müllerstraße 12 address. That suggests they are co-located or related, not that any data licence exists.
- A robots-compliant berlin.de crawl takes about 98 `kinodetail.php/<id>` requests per run, one per venue. A narrower option is the `filmdetail.php` pages for titles in `azfilm.php/ov` (two pages). Both carry the same date/time/version cells the current parser already handles. Send an honest, identifying User-Agent.

### Gaps
- berlin.de's and critic.de's data suppliers are not stated on their sites.
- The Cine Marketing client list dates from 2020 and may be stale.
- Tagesspiegel, Berliner Zeitung and B.Z. Kinoprogramm locations (if any still exist) were not found.
- tip Berlin's ToS and data could not be read because of the bot wall.
- Morgenpost/FUNKE terms were not reviewed.

## Which national portals cover Berlin and expose structured data?

### Takeaway
filmstarts and kino-zeit carry the cleanest machine-readable version metadata. Both, however, limit reuse: filmstarts by contract, kino-zeit by copyright notice. filmstarts also loads most dates after the page renders. kino.de prohibits automated access outright. cinema.de and TV Spielfilm have opted out of Anthropic's fetchers. moviepilot served no showtimes. None adds coverage that berlin.de plus indiekino lacks.

### Cited Findings
- **kino.de:** robots.txt reserves commercial text and data mining under § 44b UrhG. It states that "The use of robots or other automated means … without the express permission of kino.de is strictly prohibited". Permission requests go to **info@stroeermediabrands.de**. ClaudeBot and GPTBot are disallowed from `/`. [kino.de robots.txt](https://www.kino.de/robots.txt) Content pages were therefore not fetched. Search-indexed URL patterns include `/kinoprogramm/stadt/berlin/stadtteil/<district>/` and `/kinoprogramm/stadt/berlin/kino/<slug>/`. [Marzahn](https://www.kino.de/kinoprogramm/stadt/berlin/stadtteil/marzahn/); [Freiluftkino Rehberge](https://www.kino.de/kinoprogramm/stadt/berlin/kino/freiluftkino-rehberge/)
- **filmstarts.de:**
  - Cinema pages follow `/kinoprogramm/kino/<A-code>/`. JSON-LD covers only `MovieTheater` and an `ItemList` of films. [Kino International](https://www.filmstarts.de/kinoprogramm/kino/A0625/)
  - Showtimes are in attributes: `data-showtime-id="82822915584"`, `data-showtime-time="2026-10-16T20:15:00+02:00"` and `data-experiences` values such as `Localization.Subtitle.German`, `Localization.Version.Original` and `Format.Projection.Digital`. [Kino International](https://www.filmstarts.de/kinoprogramm/kino/A0625/)
  - `data-showtimes-dates` listed dates through 2026-11-09, but the server HTML held only four showtimes (dated 15 and 16 October). [Kino International](https://www.filmstarts.de/kinoprogramm/kino/A0625/)
  - Film-by-area pages exist at `/kritiken/<id>/kinoprogramm/in-und-um-<area>/`. [example](https://www.filmstarts.de/kritiken/1000013045/kinoprogramm/in-und-um-153471/)
  - robots.txt disallows `/_/` and several `/ws/` handlers. [robots](https://www.filmstarts.de/robots.txt)
  - The ToS (Webedia GmbH) permit "ausschließlich eine private, nicht-kommerzielle Nutzung". Reproduction without consent is barred. [Nutzungsbedingungen](https://www.filmstarts.de/services/nutzungsbedingungen/)
- **moviepilot.de:**
  - Cinema pages are Next.js. `__NEXT_DATA__` held `initialState.cinema.showtimes: {}`. The pages for Lichtblick-Kino and Kant Kino displayed "Derzeit gibt es keine passenden Vorstellungen". [Lichtblick](https://www.moviepilot.de/kinos/lichtblick-kino-berlin); [Kant Kino](https://www.moviepilot.de/kinos/neue-kant-kinos-berlin)
  - robots.txt disallows `/api/`, `/api-docs` and deep `kinoprogramm` paths. [robots](https://www.moviepilot.de/robots.txt)
- **kinoheld.de as a portal:**
  - `/kino/berlin` is a Nuxt app ("Berlin und Umgebung (25km)"). Its runtime config shows a `graphql-client` using a Bearer token stored in a cookie, with no JSON-LD. [kinoheld Berlin](https://www.kinoheld.de/kino/berlin)
  - robots.txt disallows `/ajax/` for all bots and `/` for ClaudeBot and GPTBot. [robots](https://www.kinoheld.de/robots.txt)
- **kino-zeit.de:**
  - Per-cinema pages `/kinoprogramm/berlin/<slug>` embed JSON-LD `MovieTheater` with an `event` array. Delphi LUX had 157 entries like `{"@type":"Event","startDate":"2026-10-16T14:45:00","name":"Bad Apples (OmU)","location":{…}}`, from 2026-10-16 to 2026-10-21, with no booking URL in the JSON. [Delphi LUX](https://www.kino-zeit.de/kinoprogramm/berlin/delphi-lux-berlin)
  - The city day view `/kinoprogramm/ort/Berlin/tag/16-10-2026` is film-ordered and has `/booking/<id>` links. [Berlin day](https://www.kino-zeit.de/kinoprogramm/ort/Berlin/tag/16-10-2026)
  - "Kinoprogramm abonnieren" is an e-mail subscription, not iCal. Its cinema picker includes entries such as "Cinestar Sony Center IMAX" and "Astor Film Lounge". [Kinoabo](https://www.kino-zeit.de/kinoabo/41429)
  - robots.txt only blocks Drupal system paths. [robots](https://www.kino-zeit.de/robots.txt)
  - The site is run by Kurz & Spiegel GbR, Mannheim. Texts may not be reproduced without permission. [Impressum](https://www.kino-zeit.de/impressum)
- **cinema.de (Burda):**
  - The Berlin "Kinotimer" GET form (`city`, `theater`, `day`, `movie`) offered 104 theatres, 8 days (to Fri 23.10) and 143 film-version options. Titles carry suffixes such as `(OmU)`, `(OF)`, `(OV/70 mm)` and `(Imax) (OF)`. [Berlin](https://www.cinema.de/kino/kinoprogramm/berlin)
  - Cinema pages show a single-day table with no booking links. JSON-LD is `MovieTheater` only. [Central-Kino](https://www.cinema.de/kino/kinoprogramm/berlin/central-kino)
  - WebFetch reported it is "unable to fetch from www.cinema.de", so requests stopped and the ToS page was not read. [Nutzungsbedingungen](https://www.cinema.de/services/nutzungsbedingungen)
- **TV Spielfilm:** robots.txt disallows ClaudeBot from `/` under "Blocked AI crawlers". It was not investigated further. [robots](https://www.tvspielfilm.de/robots.txt)
- **programmkino.de (AG Kino):** news, reviews, Arthouse charts and film pages; no showtime listings. [programmkino.de](https://www.programmkino.de/)

### Inferences
- filmstarts' `Localization.*` tags are the most precise version vocabulary seen anywhere. The private-use clause and the later-loading dates make filmstarts unsuitable as an automated source for a public site.
- kino-zeit's JSON-LD is easy to parse, but it needs one request per cinema. It includes no booking link, and its venue picker may contain stale venues. Its value is mainly as a fallback if berlin.de changes.

### Gaps
- Upstream suppliers for filmstarts, kino-zeit and cinema.de were not identified.
- How filmstarts loads further dates was not observed; it is likely under `/_/`.
- moviepilot's emptiness may be a client-side render issue rather than missing data; this was not verified.
- kino.de coverage and markup were not inspected, out of respect for its prohibition.

## Which English/OV-focused listings exist?

### Takeaway
Two independent OV-focused sites already aggregate Berlin with clean `ScreeningEvent` JSON-LD. Both are effectively competitors. They are most useful as coverage and accuracy benchmarks, and ov-berlin.info offers API access on request.

### Cited Findings
- **ov-berlin.info** ("Multi-city Original Language Cinema Guide"):
  - robots.txt allows `/movies/`, `/cinemas/` and `/events/`. [robots](https://ov-berlin.info/robots.txt)
  - The Berlin page reported "293 movies in OV/OmU/OmeU versions, shown in 57 cinemas", with day filters from Fri 16 Oct to Thu 29 Oct. [movies](https://ov-berlin.info/movies/)
  - Film pages embed JSON-LD `Movie.subjectOf[]` `ScreeningEvent` entries with `startDate`, `location.name`, a kinoheld booking `url` and `"subtitleLanguage":"OmU"`. They also carry IMDb, Letterboxd and Rotten Tomatoes links. [2001: A Space Odyssey](https://ov-berlin.info/movies/427-2001-a-space-odyssey/)
  - RSS feeds exist at [movies.rss](https://ov-berlin.info/movies.rss) and `events.rss`.
  - The sitemap lists 7,509 movie, 243 cinema and 167 event URLs. [sitemap](https://ov-berlin.info/sitemap-0.xml)
  - The API page reads: "To get access to the website's API, contact us at project.ov.berlin@gmail.com". [API](https://ov-berlin.info/api)
- **English Cinema Berlin** (an ExpatMondo site):
  - It lists "62 English-language films in Berlin this week" with about 40 cinemas in its filter. Its scope is English-audio screenings only; French films with English subtitles are excluded. [films](https://englishcinemaberlin.com/films); [about](https://englishcinemaberlin.com/about)
  - Film pages embed `ScreeningEvent` arrays (18 for Whalefall) with ISO `startDate`/`endDate`, address and an `offers.url` via `/r/…` redirects. [Whalefall](https://englishcinemaberlin.com/m/whalefall/in-english-in-berlin)
  - robots.txt disallows `/r/`. [robots](https://englishcinemaberlin.com/robots.txt)
- An expat guide updated 3 June 2026 recommends exactly these two sites plus berlin.de's OV A–Z. [All About Berlin](https://allaboutberlin.com/guides/english-cinemas-berlin)

### Inferences
- Scraping a direct competitor's aggregated database carries more legal risk (database maker's right) and reputational risk than scraping primary listings. Use these sites for periodic manual comparison of film and cinema counts, or ask ov-berlin.info about API terms.

### Gaps
- Neither site's upstream sources or terms of use were found.
- Letterboxd and Mubi local showtime listings were not investigated beyond observing that ov-berlin.info links to Letterboxd for ratings only.

## Are there APIs or open-data routes?

### Takeaway
No free, official, citywide showtime API exists. SERP APIs are paid, unverified for Germany and carry no OV flags. TMDb and OMDb have no showtimes. OSM and Wikidata are venue-only. Berlin's open-data portal has no cinema datasets.

### Cited Findings
- **SerpApi:**
  - The Google showtimes result is `showtimes[]` with `day` and `date`, then `theaters[]` (`name`, `link`, `distance`, `address`, `showing[]` with `time[]` and `type`). For a theatre query it is `movies[]`. [SerpApi showtimes](https://serpapi.com/showtimes-results)
  - `type` examples are Standard, IMAX and Dolby. No language or subtitle field is documented. Examples are US-only. [SerpApi showtimes](https://serpapi.com/showtimes-results)
  - Free plan: 250 searches per month, 50 per hour. Starter: $25 per month for 1,000. [pricing](https://serpapi.com/pricing)
- **ScrapingBee:** claims its Google Showtimes scraper returns title, theatre, address, showtimes, booking URL and rating. Hobby is $19 per month with a 1,000-credit free trial. These are vendor claims. [ScrapingBee](https://www.scrapingbee.com/scrapers/google-showtimes-results-api/)
- **TMDb:** `GET /3/movie/now_playing` returns paginated movie metadata for a `region`. It has no theatre or showtime fields. [TMDb docs](https://developer.themoviedb.org/reference/movie-now-playing-list)
- **OMDb:** title and search parameters only; it does not mention screenings. [OMDb](https://www.omdbapi.com/)
- **OSM:**
  - The query `area["ISO3166-2"="DE-BE"][admin_level=4]->.b;nwr["amenity"="cinema"](area.b);out tags center;` returned 90 elements: 89 named, 63 with `wikidata`, 41 with `website`, 42 with `contact:website`, 45 with `opening_hours` and 39 with `screen`. The OSM base timestamp was 2026-10-16T04:51:45Z. [Overpass API](https://overpass-api.de/api/interpreter)
  - The project already calls Overpass. [osm-client.ts](../../api/osm-client.ts)
  - OSM data is ODbL, attribution required. [OSM copyright](https://www.openstreetmap.org/copyright)
- **Wikidata:** `SELECT (COUNT(DISTINCT ?c) AS ?n) WHERE { ?c wdt:P31 wd:Q41253 ; wdt:P131 ?d . ?d wdt:P131* wd:Q64 . FILTER NOT EXISTS { ?c wdt:P576 ?x } }` returned 839, which far exceeds Berlin's operating cinemas. [WDQS](https://query.wikidata.org/sparql) Data is CC0. [Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)
- **Berlin Open Data:** CKAN `package_search?q=kino` returned 0 datasets. `q=veranstaltungen` returned 5 unrelated datasets (Bildungszeit, road events, VHS). [CKAN kino](https://datenregister.berlin.de/api/3/action/package_search?q=kino); [CKAN veranstaltungen](https://datenregister.berlin.de/api/3/action/package_search?q=veranstaltungen)
- **kulturdaten.berlin** shows "Projekt ist abgeschlossen! Laufzeit: Juli 2020 – Dezember 2023". [kulturdaten.berlin](https://www.kulturdaten.berlin/); [Technologiestiftung](https://www.technologiestiftung-berlin.de/en/projects/kulturdatenberlin)
- **berlin.de Landeskalender:** has an RSS endpoint (`index.php?rss&c=22&date_start=…`). Its venue picker lists only "Kino b-ware! (1)" and "Kino Toni (4)" as cinemas. [Landeskalender](https://www.berlin.de/land/kalender/)

### Inferences
- Use OSM to geocode venues and verify websites. Wikidata needs a filter for currently operating cinemas, because end dates are sparse. Neither source can answer "what is showing".
- SERP showtimes cost money per query. They lack OV flags and depend on Google showing panels for Berlin, so they offer nothing over berlin.de.

### Gaps
- Whether Google shows showtime panels for Berlin queries, and with which version labels, was not tested; no SerpApi key was used.
- No visitBerlin event API or partner data documentation was found.

## How are festival and open-air programmes published?

### Takeaway
Open-air screenings are best covered by openair-kino.net's WordPress REST API in season. Festivals publish HTML programmes once a year. The Berlinale has iCal and an API, but both are robots-disallowed.

### Cited Findings
- **openair-kino.net:**
  - robots.txt only disallows `/wp-admin/`. [robots](https://openair-kino.net/robots.txt)
  - `GET /wp-json/wp/v2/posts` reported `X-WP-Total: 14281`. Each post is a screening: `date` holds the showtime (e.g. `2026-10-03T19:00:51`), categories are venues under district parents ("Center Cinema", parent 11), and tags are attributes ("Eintritt frei"). [posts](https://openair-kino.net/wp-json/wp/v2/posts?per_page=2); [categories](https://openair-kino.net/wp-json/wp/v2/categories?include=1209,1210)
  - Version appears in titles, e.g. "Raving Iran (OmU)". [search](https://openair-kino.net/wp-json/wp/v2/search?search=OmU)
  - The site is run by Peter Ulrich (info@openair-kino.net). The Impressum has no reuse terms. [Impressum](https://openair-kino.net/impressum/)
- **Open-air in existing sources:** berlin.de has an "Alle Freiluftkinos" filter. [berlin.de](https://www.berlin.de/kino/_bin/azkino.php) indiekino lists open-air venues. [indiekino Kinos](https://www.indiekino.de/kinoprogramm/de/berlin/kinos)
- **freiluftkino-berlin.de** is the operator site for the Friedrichshain, Kreuzberg and Rehberge venues. It shows the 2027 season opening in May. [freiluftkino-berlin.de](https://www.freiluftkino-berlin.de/)
- **Berlinale:** robots.txt disallows `/api/`, `/de/programm/ical.*`, `/en/programme/ical.*` and `10-uhr-ticket-json.html`. [robots](https://www.berlinale.de/robots.txt) The programme is browsable by section and day. [programme](https://www.berlinale.de/en/programme/berlinale-programme.html?sort=1&section_id=51&day_id=0)
- **achtung berlin:** 2027 edition is 14–21 April 2027. News RSS at `/feed.rss`; no programme was online yet. [achtung berlin](https://achtungberlin.de/)
- **XPOSED:** WordPress/Elementor HTML programme with 2026 days from 21 to 31 May. [program 2026](https://xposedfilmfestival.com/2026/program)

### Inferences
- openair-kino.net is the cleanest seasonal add-on. It is one small API, but the date-as-showtime convention and title-embedded versions need validation against venue sites, and permission from a one-person operator is easy to ask for.
- Festival screenings are better handled as manual or seasonal imports than as permanent scrapers.

### Gaps
- The openair-kino.net date convention and its Brandenburg filtering were not checked against a live season.
- Berlinale programme JSON and API terms are unknown; contact the festival.

## What should OV Berlin add next?

### Takeaway
1. Fix compliance on the two existing sources (berlin.de and critic.de).
2. Request permission from indiekino and add it as the third source, mainly for per-screening OmU/OmeU/OV tags, kinoheld session links and open-air and micro-venue coverage.
3. Treat ov-berlin.info and English Cinema Berlin as QA benchmarks.
4. Add openair-kino.net seasonally.
5. Skip kino.de, filmstarts, moviepilot, tip, cinema.de, TV Spielfilm and SERP APIs.

### Cited Findings
- berlin.de disallows the exact listing endpoint in use and requires identifying bots. [robots](https://www.berlin.de/robots.txt); [scraper](../../api/berlin-de-scraper.ts)
- critic.de disallows the venue and movie subpaths fetched by enrichment. [robots](https://www.critic.de/robots.txt); [source-venues.ts](../../api/pipeline/source-venues.ts)
- indiekino exposes version tags and kinoheld session IDs on each screening, but requires written consent for storing its content in databases. [kino_datum](https://www.indiekino.de/kinoprogramm/de/berlin/kino_datum); [Impressum](https://www.indiekino.de/impressum)
- indiekino is a Cine Marketing client as of 2020. [client list](https://cine-marketing-gmbh.de/files/pdfs/2018/Kinoprogrammlieferungen.pdf)

### Inferences
- **Priority 1 (no new source):** replace the `trefferliste.php` crawl with `kinodetail.php/<id>` for each venue ID in the cinema `<select>`. Send an identifying User-Agent such as `OVBerlinBot/1.0 (+https://ovberlin.online)`. Drop critic.de `/ov-movies-berlin/cinema/` and `/movie/` fetches, or e-mail critic.de/krankikom for permission.
- **Priority 2:** e-mail info@indiekino.de describing the noncommercial OV finder, attribution and link-back, and request permission for one daily fetch of `kino_datum`. If granted, its `span.fassung` and kinoheld IDs strengthen variant and booking evidence. Its rows cannot be used as independent identity corroboration against tip or Morgenpost-type sources.
- **Priority 3:** a weekly manual comparison against ov-berlin.info (57 cinemas, 14-day horizon) to detect missing venues and dates. Optionally ask its operator about API terms.
- **Priority 4:** add openair-kino.net from May to September after contacting the operator.

### Gaps
- No permission requests were sent.
- The overlap between indiekino and berlin.de/critic.de was not measured screening-by-screening.
- Whether berlin.de's 6-day horizon versus ov-berlin.info's 14 days reflects source data or display limits is unverified.
