# OV Berlin — Design Context

## Register

product

## Users

Expats and internationals living in Berlin who rely on OV (original version) screenings because they don't speak German fluently. They're task-oriented: "what can we see tonight or this week, at which cinema?" — often deciding with a friend, sometimes last-minute. They use the app the way they'd use a transit app: quickly, confidently, then close it. They are not browsing for discovery or taste; they are resolving a specific practical need.

## Product Purpose

A fast, reliable tool for finding original-version film showtimes across Berlin cinemas. No ratings, no reviews, no social features — just current data, clearly presented, so users can make a decision and move on. Success means finding a showtime in under 30 seconds.

## Brand Personality

**Quiet · Reliable · Local**

Calm and practical, like a good transit app. Not cold — there's warmth in the font pairing (DM Serif Display for film titles evokes a programme or film magazine) — but never flashy or performative. Feels like something a Berlin film nerd built carefully for people like themselves, not a product optimised for conversion.

Emotional goals: confidence (I can trust this is current), ease (I found what I needed without thinking), and a faint sense of place (this is distinctly Berlin, not a global cinema chain).

## Anti-references

- **Fandango / Odeon / Vue**: Commercial chain energy — flashy hero banners, upsell clutter, sales-first hierarchy. Never this.
- **Letterboxd**: Beautiful but social/taste-community focused. OV Berlin is a tool, not a taste network. No ratings, no reviews, no social proof.

## Design Principles

1. **Information before decoration** — Visual weight should follow information priority. If a decorative element is competing with data, the decoration loses.

2. **Predictable spatial rhythm** — Users scanning for "tonight at 21:00" should never have to hunt. Consistent zones, consistent spacing, consistent typography roles across every view.

3. **Minimal cognitive overhead for non-native speakers** — Plain English, no jargon, no assumptions about German cultural context. Labels over icons wherever the label fits.

4. **Progressive disclosure, not clutter** — Show the essential path immediately (film → showtimes → cinema info). Filters, export, and detail are available but don't compete for attention on first glance.

5. **Local warmth without quirkiness** — Feels specifically made for Berlin film life without being cute or niche. The serif on film titles, the warm accent, the concise copy — these signal care, not cleverness.

## Accessibility & Inclusion

- **WCAG 2.1 AA** target for all interactive and informational elements.
- **Reduced motion**: Respect `prefers-reduced-motion`. No decorative motion that cannot be disabled.
- **Color blindness**: All state changes (hover, focus, active, selected) are conveyed through more than color alone — pattern, text, or icon changes.
- **Screen reader support**: Semantic HTML, proper heading hierarchy, aria-labels on icon-only controls, and live regions for dynamic content updates.
- **Cognitive accessibility**: Plain language, consistent interaction patterns, no surprise modals or auto-playing content.
