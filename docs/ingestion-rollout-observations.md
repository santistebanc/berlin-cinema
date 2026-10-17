# Original-base rollout observations

The comparison uses original commit
`1641dedd018422721b53d22e767598da0e1e60d2`, not an intermediate feature branch.
The retained-state clock is `2026-10-16T07:08:38.647Z`; expiry is exactly two days
later. Default-adapter captured collection uses `2026-10-15T10:00:00Z` and the
fixture's future `2026-10-18` programme. Each run has its own state copy. All
providers are retained/offline, decision models are disabled and no public files
are replaced. See [repeatable commands and recovery](ingestion-rollout.md).

## Actual retained inputs

The repository's original tracked v1 state contains 8,110 observations (1,399
listing, 339 venue, 6,372 screening), 6,976 heads, 415 entities, 768 identity links,
400 review issues, three corrections, 317 field sets, 3,634 resource entries and
two snapshots. None of those observations has a provenance sidecar. Their upstream
lineage is unknown. Retained resources include 624 TMDb detail bundles, 139 TMDb
enrichment entries, 137 OMDb entries, 299 source detail entries, 114 venue detail
entries and 275 geocoding entries. The 7,176 stored `identityVerified` field flags
are historical flags, not a fresh correctness assessment or proof that all source
values independently identify a provider film.

The representative raw files are **actual retained** `critic-raw.json` and
`berlin-raw.json`, copied read-only from the original checkout into the implementer's
ignored recovery directory. The original checkout's intentionally absent
`pipeline/state.json` was never restored or modified. The input hashes are in the
committed [machine-readable baseline](ingestion-rollout-baseline.json). The raw
files are not checked in or assigned fictitious independent roots.

Migration preserves the complete non-observation state verbatim and every
observation's original data/hash/key/timestamps. Tests also compare all resources,
corrections, snapshots, fields, entities, links, heads and issues against this
representative state. New provenance keeps `upstreamLineage: []`; last-observed
heads retain their original timestamps even when an unchanged observation ID was
reused. Repeating migration, migrating an already-v2 bundle and restoring verified
original bytes do not create identities or observation refreshes. Unsupported state
and raw versions, broken state references, a writer lock, modified migration output
and corrupt recovery checksums are explicit failures.

## Retained continuity

Both recalculation and actual raw replay produce **183 films/programmes and 1,679
viewings** in both implementations, with **131 verified public identities**. All
183 public IDs and canonical slugs stay stable; no old slug route or source alias
subject is lost, and viewing keys/details and published venue fields are unchanged.
These runs preserve accepted provider evidence rather than asking unknown sources
to verify it again. The input's most recent saved snapshot contains 182 films;
183 is the result of recalculating both implementations at the fixed test clock,
not a claimed change caused by migration.

The primary value differences are deliberate field-policy changes:

- 51 runtime values use explicit source detail evidence ahead of provider/general
  metadata. For example, Metropolis changes from 148 to the retained source's
  edition value 118; the report retains both values. This is an explained policy
  difference, not proof that the source's number is correct.
- 94 main source URLs follow attributed authority/freshness rather than the old
  hardcoded critic.de preference. Supporting source URLs and aliases remain.
- Two country values use accepted provider metadata ahead of source text:
  LINKIN PARK: UNSHATTER selects South Korea, and Mein neues altes Ich selects
  Denmark. The fuller source labels remain attributed evidence.
- The contradictory alternate label `The Hunger Games: Catching Fire` is withheld
  for Die Tribute von Panem - Mockingjay Teil 1.
- Sneak Preview's poster becomes unspecified because equally authoritative
  current observations report two different posters. Both alternatives and the
  data-quality diagnostic remain; the showing stays available.

Selected-field attribution changes on 182 records: the new policy distinguishes
unverified source values from verified provider values, adds the selected listing
URL evidence and explains authority/freshness or abstention. This affects provenance
descriptions, not public identity or the 131 retained verified film identities.
The full before/after snapshots remain in the implementation worktree's ignored
`.recovery/fixed-clock-shadow/`; the committed baseline lists value differences and
the names of changed provenance fields without duplicating entire provider plots
for every attribution reason.

Original-base actionable review counts are 52 for recalculation and 54 for raw
replay. Both become 42. Operational cached-source failures and optional metadata
notices no longer become human identity questions, and related decisions consolidate.
This reduction is descriptive; the 42 remaining questions are not claimed resolved.

## Actual adapters and conservative cold replay

The old scraper facades and the current default adapters receive the same captured
listing and venue/detail evidence. The original parser's clock is fixed during
extraction. Both publish the same complete-title viewing with the same film ID/slug.
Current adapter outputs retain unknown upstream lineage. Simultaneous equally
authoritative source URLs can be withheld while both source links remain in
aliases. The current adapter case has no actionable identity review; the original
case has two operational/optional notices classified as open.

The public viewing and venue IDs match in that captured case. One supporting
Berlin screening observation hash changes: the adapter attaches the captured
venue's address, postal code and explicit Berlin city before emitting its typed
record, whereas the old pipeline repaired the venue observation later. The source
subject and original observation time stay stable. `sourceObservationChanges` in
the baseline records these exact three fields; this explains its one changed
viewing-detail entry. It is additional evidence on a newly collected record, not
rewriting any migrated historical observation. No such viewing-detail changes
occur in either representative retained-state comparison.

Cold raw replay deliberately removes established entities, identity links,
corrections and verified selected fields but keeps the **actual retained provider
and source caches**. It is a stress check of provenance, not the migration path.
The original behavior publishes 184 records / 1,901 viewings / 126 verified
identities. The new behavior publishes 202 source-only records / 1,971 viewings /
zero verified identities. There are 84 regrouped identity comparisons and only
100 unchanged public ID/slug pairs; 56 old public routes are absent. All source
alias subjects are retained. Exact complete labels can still consolidate known
viewings, but unknown lineage cannot establish independent provider verification
or merge translated labels through copied schedules/credits.

These cold differences are intentionally conservative and **cannot be hidden by
assigning each adapter an independent root**. A raw cache is not a substitute for
established identity/correction state. Cold reconstruction is unsupported as a
continuity-preserving rollout; use the lossless state migration. A future deliberate
cold import needs separately verified lineage/identity decisions and review of the
reported route/group differences. No production precision claim follows from this
offline check.

After two days, both replay implementations publish zero current films/viewings.
The new result explicitly reports no current support and no actionable decisions;
the original still has two operational open issues. Cached raw evidence does not
renew observation age.

## Baseline workload and combined acceptance

Retained recalculation and replay each measure 5,188 selected identity/field
outcomes, 803 abstentions, 42 actionable decisions, 32 recurring decisions and zero
recorded reviewed reversals. These are per-outcome counts, including reused
corrections and multiple group members. They are not distinct users/movies or
measured accuracy. Cold replay measures 2,270 selections, 1,603 abstentions, 82
actionable decisions, zero recurring decisions and zero recorded reviewed reversals.
A first conflict with a correction need not already have a previous reopened-issue
transition, so a zero reversal count does not imply that no correction was
contradicted. The older synthetic #6 baseline (13 / 34 / 0 / 0 / 0) remains covered
and is not substituted for these representative measurements.

The combined rollout acceptance uses the actual two default adapters plus the
fixture cinema adapter configured twice. No independent roots are assigned. It
demonstrates collection, three-source viewing deduplication, exclusion of an
unverified second cinema, review preview/apply, durable grouped corrections,
partial refresh with a malformed sibling, unaffected unselected instances, optional
metadata outage, disabling, total acquisition failure, PWA expiry, an expired shadow
followed by publication rollback, re-enabling and material address conflict review.
The recovered fixture baseline is 9 selected outcomes / 15 abstentions / zero open,
recurring or reversed issues, followed by an explicit new correction conflict.

This acceptance discovered and fixed an actual cross-ticket defect: a changed
address could create a new published physical venue and bypass the explicit saved
address correction. The fallback now retains that corrected venue/address and
opens review. A plain identity-link correction with a contradictory address still
does not silently accept the old physical identity; its existing safeguard test
remains enabled. A grouped review also no longer creates duplicate identical link
corrections. Static data sync now accepts shared-contract valid empty programmes
and rejects unsupported snapshots before replacing existing data.

No original-state mutation, live scrape, paid provider request, push, deployment,
integration merge-back or GitHub closure was performed. Real-source extraction
coverage and future upstream changes remain outside the evidence established here.
