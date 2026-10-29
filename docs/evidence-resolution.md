# Evidence resolution and review

The pipeline returns versioned `resolutions`, each with a selected identity or
abstention, reasons, supporting observation IDs, conflicting identities, resolved
fields and remaining questions. Published films also carry their group resolution.
A source-only identity is usable without verified external metadata. Location
eligibility still requires verified Berlin evidence or an explicit correction.

## Field policies

Selection considers evidence role before freshness; configured source names are
not authority. Applicable manual values and explicit clearing take precedence.
Verified provider metadata normally precedes listing metadata. Edition runtime
prefers an explicit source detail value; ratings prefer the verified rating
provider. Source links use attributed listing evidence. Venue websites require
an exact linked name and compatible verified address, or an exact OSM cinema
match. Neighbouring branches and substring name matches cannot supply a website.
Equal authority at the same instant with contradictory values abstains. Missing
optional values do not contradict known values. Alternatives retain explicit
absence and retrieval failure separately from unknown or manual clearing.

Selected field evidence carries a typed `evidenceRole`: `listing`, `source-detail`,
`tmdb`, `omdb`, `manual-correction`, `venue-website` or conservative `historical`.
Authority reads this role, with the existing correction/verification guards;
English `reason` strings are explanatory only. Wrapping a reason in historical
fallback text or changing its wording never changes authority. Detail roles require
the structured detail value to match the selected value and an explicitly missing
listing field; failed details do not establish this role.

Historical v1/v2 selected fields without roles remain readable. A non-mutating
compatibility view derives a role from their original observation ID, structured
detail/listing fields, verified provider identity or correction ID. Without enough
structured evidence it retains ordinary historical authority; it never guesses
from reason text or a source name alone. Copy migration preserves historical field
objects and observation hashes verbatim; subsequently selected fields persist roles.
After identity consolidation, retained source-detail fields remain candidates
only for their exact currently linked source listing subject with compatible film
identity evidence: matching interpreted titles or supported identity credits/years,
without conflicting directors, years or verified external IDs. Reuse of an upstream
record ID alone cannot carry old facts onto a replacement work. The same check
applies to detail fields already retained on the current entity.
Historical `identityVerified: true` source flags do not identify a verified provider;
the typed or structurally inferred evidence role distinguishes ordinary detail
values from provider evidence. Cross-entity recovery carries only source details,
never another entity's verified provider fields or corrections, and respects manual
separations. Normal field expiry and explicit source
absence still apply, and historical details retain their original observation time.
They compete with current fields by the same authority/freshness policy rather
than losing priority merely because current lower-authority evidence exists.

URL-keyed optional detail caches are checked before filling listing gaps, ahead
of identity resolution. Conflicting current director/year evidence withholds the
cached details and emits `detail-identity-conflict`; usable screenings remain.
Newly collected details retain a typed `listingIdentity` description of the film
at collection time. Ingestion preserves embedded bindings and never manufactures
one from the consuming listing. Reused URLs must have
compatible titles or supporting film credits, without contradictory identity
dimensions. Historical caches without that description remain readable under the
available credit/year compatibility checks and any exactly attributed original
listing descriptions (same source, URL, fetch time and detail fields). This is a
read view supplied by the shared source dependencies during normal acquisition
and recalculation, scoped to the configured source instance. Ingestion checks
embedded details by the same identity rules before creating observations, so
retained replay and recovered progress cannot reintroduce inherited facts.
Rejected details are withheld without replacing their cache or spending another
optional lookup. Compatible inherited caches retain their existing bytes and
binding, including an unknown binding. Fetch/observation times, upstream
lineage and original historical observations are preserved; URL reuse never
establishes independent corroboration.

Known overlapping upstream lineage prevents independent corroboration. Empty
lineage means unknown origin, not independence. Provider-derived metadata cannot
validate its own provider identity through another configured source. Compatible
complete labels and an established viewing may still describe the same showing;
this does not claim independent confirmation. Verified external identity conflicts,
manual separations and location requirements take precedence over ranking or
model confidence. Bounded model candidates, validation, caching, budget limits and
abstention remain in the existing decision engine.

Film metadata matching also accepts a complete matching title, exact year, at
least one shared cast member, runtime within two minutes and a shared production
country. Country codes allow comparison with German, English and French labels.
Limited whole-name transliteration substitutions (`tch/ch`, `ou/u`, `gui/gi`,
`ia/ya`) can corroborate a director only with a matching complete title, exact
year and runtime within two minutes. These paths require a unique supported
provider candidate; competing supported candidates remain in review. Runtime
from an explicitly labelled edition is excluded. Supplemental runtime/country
evidence comes from independent source observations, never previous provider
enrichment. Conflicting years, unrelated directors and verified IDs retain the
existing conflict checks.

Berlin detail extraction retains the synopsis before the Filmdaten block,
genres, FSK, German release date and official website as attributed source
fields. A synopsis or website alone does not establish external identity; website
links are recorded without fetching them. Existing detail caches keep their
seven-day TTL, and berlin.de requests retain their six-second minimum spacing.

## Review lifecycle

Operational failures and optional-data notices are cautions, separate from open
actionable decisions. Material identity, location and correction ambiguity stays
open. Each actionable issue records its question, stopping reason, fallback,
publication impact, valid choices and related evidence. Refreshes reuse stable
decisions and retain status/evidence history. New timestamps alone are not new
facts. Field corrections record the facts visible when reviewed; new contradictory
values for corrected fields reopen the decision while keeping its saved fallback.
Unrelated fields do not invalidate it. Later sufficient evidence retires the
question without discarding its history.

Consolidated venue questions cover the source rows shown in their evidence. A
confirmed identity/location decision applies to those rows together. Preview
tokens cover all grouped facts, so a change to any member requires a fresh
preview. Equivalent refreshes retain the same token and acknowledgment.
The snapshot's `resolutionDiagnostics` exposes recovery, data-quality and
actionable categories; withheld optional conflicts carry their alternatives here
without adding a human question.

## Resolution metrics

Every run returns `resolutionMetrics` and persists `resolution-metrics:latest`.
The first measured run is retained as `resolution-metrics:baseline`, including its
resource timestamp. These are descriptive counts, not quality scores or targets:

- `automaticResolution`: selected identity outcomes plus known or manually cleared
  field outcomes, including decisions reused from prior evidence/corrections.
- `abstention`: identity abstentions plus unknown field outcomes. Explicit absence
  and failed retrieval remain separately inspectable field states.
- `actionableReview`: currently open decisions after consolidation.
- `recurringIssues`: currently open decisions encountered in more than one run.
- `reviewedReversals`: recorded transitions from a human-resolved decision to open
  with changed evidence. Consolidated supporting-row histories are excluded.
  Further changes while already open are not reversals.

Identity outcomes are per canonical entity; grouped publication fields can appear
on each member's outcome. Counts therefore describe resolution work rather than
unique movies or people. A manually selected value also contributes to selected
outcomes; the metric does not claim that automation independently discovered it.
Use retained evidence and review history to investigate correctness before setting
any review-volume target. No evidence guard should be lowered to improve a count.

Run `npm run test:resolution` for captured, offline pipeline/review acceptance.
It is also wired into `test:pipeline` and `npm test`. Use an isolated
`PIPELINE_STATE` and captured source collections for replay; no live model or
source request is necessary.

The captured three-source baseline in `resolution.test.ts` records 13 selected
identity/field outcomes, 34 abstentions, 0 actionable decisions, 0 recurring
decisions and 0 reviewed reversals. It contains one published showing, three
source film identities and one venue. Most abstentions are unknown optional
fields counted on each identity outcome, not hidden screenings. This fixture is
an offline baseline for reproducibility; it is not a production quality estimate.
