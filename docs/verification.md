# Offline verification

`npm run verify -- discover` lists the available scenarios and required repository
checks. `doctor` checks Node 24, installed dependencies, source identity and the
pinned baseline commit. Run `npm ci` first. Nothing selects operational data.

- `npm run verify -- run offline-shadow` creates a clean local clone at
  `885cb1bc030fbe7373cd931a9528ef5373da705e` (published main's code-identical
  rewrite of the original `1641dedd`), supplies a synthetic v1 retained
  state, and uses the existing comparison engine at a fixed clock. It checks
  retained identities, routes, aliases and viewings across five replay modes.
- `npm run verify -- run metadata-incidents` exercises four separately named
  identity regression cases. They are source-inspired examples, held separate
  from the existing development fixtures; they are not independently collected
  production incidents or an estimate of model accuracy.
- `controls offline-shadow` and `controls metadata-incidents` deliberately corrupt
  the expected result. The outer control succeeds only when the named assertion
  fails. The inner evidence remains failed. These validate the detector, not a
  live acquisition or provider.
- `evidence RUN_ID` reads the saved result and checks its commit and source
  fingerprint against the current checkout. Failed and stale evidence exits
  unsuccessfully. Reruns create new records and preserve earlier failures.

Results live in ignored `tmp/verification/RUN_ID/`. `evidence.json` contains
source and fixture hashes, named outcomes, cleanup status and explicit limits.
`comparison.json` retains semantic and provenance differences for inspection;
it does not authorize rollout. Logs and failure stacks are private diagnostics.
Disposable input state and baseline clones are removed after each scenario.
The source checkout, operational state and published listings are not changed.

The network guard rejects sockets, HTTP and fetch. The existing comparison uses
captured HTTP responses, disabled providers and `publish: false`; its internal
adapter `network: true` means exercise acquisition against the captured request
function, not access the internet. No credentials are needed.

Keep `npm run typecheck` and `npm test` as required checks. A passing synthetic
replay does not establish the quality, freshness or completeness of production
listings. Inspect differences on representative retained data separately before
an operational rollout.
