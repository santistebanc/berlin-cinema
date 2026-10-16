# Commercial and licensed Berlin screening feeds

## Which APIs have documented Berlin access, and are they free?

### Takeaway
No continuing free production tier was verified among these specialist suppliers. International Showtimes has a seven-day trial; MovieGlu offers a 75-request real-data evaluation. Neither is a sustainable free backend. [International Showtimes pricing](https://www.internationalshowtimes.com/pricing); [MovieGlu quickstart](https://developer.movieglu.com/v2/api-index/quick-start-guide/)

### Cited Findings
- **International Showtimes / ishowtimes:** [signup](https://www.internationalshowtimes.com/subscription) requests name, email, business name, usage and territories. Trial is seven days. Published paid starting prices per month **per market**: Basic €149, Business €299, Enterprise quote. The detailed comparison excludes language/subtitles from Basic; Business includes them. Formats and ticket links are Enterprise-only. Business includes XML/CSV. Trial exposes all features. Movie-ID matching to IMDB, TMDB and Comscore is advertised. Prices are starting amounts, not a Berlin quotation. [Pricing comparison](https://www.internationalshowtimes.com/pricing)
- v5 is JSON REST at `https://api.internationalshowtimes.com/v5`, authenticated by `X-Api-Key` or token auth. Official examples explicitly include Germany and Berlin coordinates. Showtimes expose IDs for screening, cinema and movie, ISO8601 start time in cinema timezone, nullable audio `language`, `subtitle_language`, `attribute_codes`, auditorium and booking link. Unknown subtitle language can be `undetermined`. Docs include Filmtheater am Friedrichshain, Berlin, and support conditional requests plus `changed_since`. IDs are documented identifiers; lifetime stability through schedule changes is unverified. [v5 documentation](https://api.internationalshowtimes.com/documentation/v5/)
- Illustrative exact documented requests (replace placeholders; no key acquired): `GET https://api.internationalshowtimes.com/v5/cinemas/?countries=DE`; `GET https://api.internationalshowtimes.com/v5/cinemas/?location=52.5,13.37&distance=30`; `GET https://api.internationalshowtimes.com/v5/showtimes?cinema_id=51,52,53`. Documented auth example: `curl "https://api.internationalshowtimes.com/v5/cinemas/" -H "X-Api-Key: YOUR_API_KEY"`. The radius includes nearby Brandenburg; use a verified city/venue list for Berlin boundaries. [v5 examples and authentication](https://api.internationalshowtimes.com/documentation/v5/)
- **MovieGlu:** Germany is expressly listed as territory `DE`, rather than inferred from global claims. Common headers are client, x-api-key, authorization, territory, api-version, device-datetime, plus geolocation where needed. [Headers docs](https://developer.movieglu.com/v2/api-index/setup/). [Quickstart](https://developer.movieglu.com/v2/api-index/quick-start-guide/) links registration and explains emailed credentials. Selected-country real evaluation is 75 requests. Quickstart says sandbox 10,000 requests; marketing FAQ says unlimited sandbox. This conflict is unresolved; sandbox is test data either way. [Official FAQ](https://movieglu.com/contact/)
- MovieGlu's documented example request is `cinemaShowTimes/?film_id=12345&cinema_id=54321&date=2018-04-12&sort=popularity`; replace IDs/date. Omitting film ID returns all films for the cinema/date. The response documents numeric cinema/movie IDs, IMDB title ID, Standard/3D/IMAX formats and local start times. Separate audio/subtitle fields or a distinct screening ID are absent from this endpoint's published schema. After-midnight screenings belong to the cinema day 03:00–02:59; returned times are published local times. [Endpoint documentation](https://developer.movieglu.com/v2/api-index/cinemashowtimes/)
- MovieGlu's official pricing publishes **no numeric amount**. General access is request-tiered; individual-location pricing and startup pricing are advertised. Submit a project enquiry for a quote. [Pricing/form](https://movieglu.com/pricing/)

### Inferences
- International Showtimes is the clearest paid API to benchmark, but this app's OmU/OV requirements imply Business or higher; formats/ticketing may imply Enterprise. This interprets the feature matrix, not a quote.
- MovieGlu country support does not prove completeness for Berlin independents, repertory or open-air cinemas.

### Gaps
- No credentials, signup, trial or paid data access was performed. Actual Berlin completeness, null rates, request ceilings, storage/redistribution terms and ID stability were not tested.
- Neither vendor had a verified continuing free live tier. Clarify International Showtimes' definition of market and Berlin-only price. Confirm MovieGlu screening audio/subtitle support.

## Which German suppliers have real feed offers and practical contact routes?

### Takeaway
Cine Marketing and Tel-A-Vision explicitly offer German screening-data feeds, both through sales contact with no verified free tier or published cinema-feed tariff. Krankikom is a stronger attribution-backed lead than a documented self-service API.

### Cited Findings
- **Cine Marketing, Berlin:** offers nationwide cinema-program collection, raw-data delivery for editorial/mobile/online portals and custom formats. Says it records cities above 100,000 population and over 70,000 dates weekly; originated with Berlin listings and names Berlin newspaper/magazine clients. Contact **Manfred Bittmann, manfred.bittmann@kino-berlin.de, +49 30 233 26 96 09**. Request a Berlin-only raw feed, sample and licence quote. No public endpoint, auth or ID/OmU schema is provided. [Cinema service](https://cine-marketing-gmbh.de/kinoprogramm-service.html)
- Cine Marketing's Basic/Premium public price list concerns event organizers paying for entry/promotion of event notices; it is **not a cinema database/API tariff**. [Price-list scope](https://cine-marketing-gmbh.de/preisliste.html)
- **Tel-A-Vision Media Networking:** offers all screenings in Germany, Austria and German-speaking Switzerland, version/edition/FSK metadata, cinema geodata/contact/capacity, and tailored exports in common formats multiple times daily or at agreed times. Claims 98% overall and over 99% screen coverage in cities above 100,000; these are vendor claims, not measured Berlin completeness. Contact **Jochen Eisenkolb, jochen.eisenkolb@tel-a-vision.de, +49 6131 96093-30** or info@tel-a-vision.de. No public tariff/auth/API endpoint found. Page footer is 2021, so operational metrics may be older despite being online today. [Film/cinema content offer](https://www.tel-a-vision.de/movies)
- **Krankikom:** critic.de's Berlin OV finder currently credits Krankikom and Bertz + Fischer under Powered by. This confirms attribution, not responsibility for each datum or a purchasable public API. [critic.de attribution](https://www.critic.de/ov-movies-berlin/). Krankikom's current UCI case study describes programme entry, CMS and ticketing. [Official UCI case](https://www.krankikom.de/referenzen/uci-kinowelt). General enquiries: **post@krankikom.de, +49 203 30597-0**. [Official contact](https://www.krankikom.de/kontakt)
- **kino.de secondary lead:** official contact page invites database-content reuse enquiries and lists **kinoprogramm@kino.de** for programme data. No public feed/API or tariff established. [Contact](https://www.kino.de/kontakt/)

### Inferences
- A Berlin-only quote from Cine Marketing or Tel-A-Vision could fit better than a worldwide API, but price cannot be assumed affordable or free.
- Ask Krankikom directly whether the service behind critic.de is currently licensable for another Berlin app.

### Gaps
- No evidence established Berlin.de's supplier. Do not assign it to these vendors.
- Vendors must confirm stable cinema/film/session IDs; screening-specific audio/subtitles rather than movie original language; cancellation handling; refresh latency; festival, micro-cinema and open-air coverage; caching/redistribution rights; minimum term and Berlin-only price.
- CinemaClock yielded no primary evidence of a Berlin feed/API; omit as a practical recommendation.

## What is useful to the free-first app now?

### Takeaway
Commercial suppliers are optional quality/reliability upgrades and temporary benchmarks. No continuing free citywide licensed feed was verified in this part of the research; use the separate venue/public-source findings for the zero-budget path.

### Cited Findings
- International Showtimes explicitly describes free access as seven days for testing. [Pricing](https://www.internationalshowtimes.com/pricing)
- MovieGlu distinguishes evaluation/sandbox from paid production and declines additional evaluation requests for student or personal projects. [FAQ](https://movieglu.com/contact/)

### Inferences
- Use a structured trial to compare coverage, OmU/OV correctness and identity matching only if a future paid option is realistic.
- Suggested future vendor enquiry (not sent): We run a noncommercial Berlin screening finder. Could you provide a Berlin-only machine-readable feed with cinema/film/session IDs, screening start, audio/subtitle languages, format and booking URL? Please share a sample week, venue list, refresh/cancellation semantics, redistribution/caching terms and hobby/nonprofit pricing or a continuing free allowance.

### Gaps
- No sales messages, account creation, trial activation or purchases were performed. Sources were actually observed on 16 October 2026; historical footer/claims are identified above.
