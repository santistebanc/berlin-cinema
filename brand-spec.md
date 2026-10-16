# OV Berlin ? retained design changes

The user rejected the homepage and detail-page redesign and requested restoring
those pages to their original design, keeping the header and corner changes.
They subsequently also retained full-text wrapping of screenings in both views.
This decision supersedes the earlier design draft and typography choices.

- Preserve the original film cards, typography, metadata, poster hover zoom,
  detail layout, cinema popup, showtime layouts, and filter controls.
- Keep full cinema names and screening variants wrapping without ellipses in
  both grid and stacked views, using the original sizing and spacing.
- Keep the updated header: existing brand at left, search centered, and today's
  Berlin date plus total film count at right. The count is in the header rather
  than repeated above the film grid.
- Below 1100px hide the date/count; below 600px use the existing logo mark
  without the wordmark, keeping search beside it in one row.
- Match the header's horizontal padding to the original page content: on the
  homepage use 12px / 24px / 32px at mobile / 640px / 1024px breakpoints; on
  film details use 16px / 24px / 36px, matching the film header. Use full width
  without an independent maximum-width cap.
- Keep 8px corners for posters, inputs, cards, and standard controls, and 12px
  corners for larger dialogs/sheets. Keep intentionally circular controls round.
- Existing assets: src/components/Logo.tsx, public/favicon.svg, and real poster
  URLs from public/movies.json. Existing palette and fonts remain unchanged.
- Keep local data/API fixes and the nonvisual router typing correction.

## Read-only admin extension

The user simplified the public audit workspace to latest run changes at `/admin`,
cinemas at `/admin/cinemas`, and movies at `/admin/movies`. Viewings and matching/API
evidence belong in the record details. Each value exposes its recorded history.
An unchanged run lists nothing; the initial baseline is not a set of additions.
Keep the existing midnight slate/orange palette, DM Sans, 8px controls, compact
tables, and expandable record pane. The public film pages retain their restored design.

Design Read: laptop-first data inspection; extension mode; variance 2/10,
motion 1/10, density 8/10, asset dependence 3/10, brand fidelity 10/10.
Use a stable table spine, state feedback only, real audit records and the
existing Logo component. Menus/panes use borders rather than decorative shadows.
Dates display in Berlin time. Baselines and unavailable source/selection history
must be labeled explicitly. Storage remains Git plus static run reports, written
by GitHub Actions and served by GitHub Pages; no live database is required.
