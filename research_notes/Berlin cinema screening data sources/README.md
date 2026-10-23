# Berlin cinema screening data sources

Research index, observed 16 October 2026. Each note cites its primary sources inline.

| Note | Covers |
| --- | --- |
| [public-aggregators.md](public-aggregators.md) | City-wide listing portals (berlin.de, critic.de, indiekino, Morgenpost, tip), national portals, OV competitors, APIs/open data, festivals |
| [venues-and-ticketing.md](venues-and-ticketing.md) | Chains (Yorck, CineStar, CinemaxX, UCI, Cineplex), ticketing platforms (kinoheld, cinetixx), independents' own sites, open-air |
| [licensed-feeds.md](licensed-feeds.md) | Paid feeds: International Showtimes, MovieGlu, Cine Marketing, Tel-A-Vision, Krankikom |
| [ov-berlin-de.md](ov-berlin-de.md) | How www.ov-berlin.de collects its data |

## Compliance issue in the current scrapers

- `api/berlin-de-scraper.ts` fetches `/kino/_bin/trefferliste.php`, which [berlin.de/robots.txt](https://www.berlin.de/robots.txt) disallows for all user agents. Per-venue `kinodetail.php/<id>` pages are not disallowed (see public-aggregators.md).
- `api/pipeline/source-venues.ts` and `api/pipeline/source-details.ts` fetch `/ov-movies-berlin/cinema/` and `/ov-movies-berlin/movie/` pages, which [critic.de/robots.txt](https://www.critic.de/robots.txt) disallows.

## Best structured sources found

| Source | Route | Venues | Notes |
| --- | --- | --- | --- |
| indiekino | [one city page](https://www.indiekino.de/kinoprogramm/de/berlin/kino_datum) (HTML) | ~117 incl. open-air | Per-screening OmU/OmeU/OV tags; Impressum requires written consent to store in a database |
| Yorck | `__NEXT_DATA__` on [yorck.de/filme](https://www.yorck.de/filme) | 14 | `formats` OmU/OmeU/OV; months ahead; consent required per Impressum |
| CineStar | `https://www.cinestar.de/api/cinema/{id}/show/` JSON | 4 | `OV`/`OMU`/`AUDIO_*` attributes |
| CinemaxX | `/api/microservice/showings/cinemas/1107/films?showingDate=…` JSON | 1 | One day per request |
| Arsenal | `https://www.arsenal-berlin.de/api/v1/search/calendar/` JSON | 1 | Explicit OmeU/OmdU; reuse needs permission |
| IL KINO | schema.org `ScreeningEvent` JSON-LD on homepage | 1 | Audio + subtitle language |
| Zoo Palast | `https://backend.premiumkino.de/v1/de/zoopalast/program` JSON | 1 | |
| Filmrausch | `/wp-json/filmrausch/v1/programm` JSON | 1 | |
| Freiluftkino Kreuzberg/Friedrichshain/Rehberge | `kinokalender_{site}.ics` | 3 | Seasonal (May–Sep) |

Do not scrape kinoheld, cinetixx or kinotickets.express (robots.txt disallows), or Cineplex (Cloudflare challenge). For kinoheld/cinetixx venues, ask for a partner feed. Contacts for permission requests are listed in each note.
