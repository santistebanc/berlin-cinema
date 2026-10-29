#!/usr/bin/env bash
# Beelink pipeline runner. Code comes from git; data lives under $OVB_ROOT and never in git.
#   ovberlin.sh prod              latest v* tag: scrape, build, publish to GitHub Pages
#   ovberlin.sh staging           origin/main: build with production data, serve on :4174
#   ovberlin.sh staging --scrape  origin/main: scrape a fresh copy of production state, build, serve
#   ovberlin.sh publish           rebuild and publish production after review corrections, no scrape
#   ovberlin.sh poll              start prod/staging once for each new tag or main commit
set -Eeuo pipefail

OVB_ROOT=${OVB_ROOT:-$HOME/ovberlin}
REPO=santistebanc/berlin-cinema
export PATH="$OVB_ROOT/node/bin:$PATH"
[ -f "$OVB_ROOT/secrets.env" ] && { set -a; . "$OVB_ROOT/secrets.env"; set +a; }

log() { echo "[$(date -Is)] $*"; }
notify() { [ -n "${NOTIFY_URL:-}" ] && curl -fsS -m 10 -X POST -H 'Content-Type: application/json' \
  -d "{\"message\": \"$1\"}" "$NOTIFY_URL" >/dev/null || true; }

latest_tag() { git -C "$OVB_ROOT/prod" tag -l 'v*' --sort=-v:refname | head -1; }

checkout() { # checkout DIR REF — ignored data files in public/ survive the switch
  local dir=$1 ref=$2
  git -C "$dir" checkout --quiet --force --detach "$ref"
  local lock; lock=$(sha256sum "$dir/package-lock.json" | cut -d' ' -f1)
  if [ ! -d "$dir/node_modules" ] || [ "$(cat "$dir/.lock-hash" 2>/dev/null)" != "$lock" ]; then
    log "Installing dependencies"; (cd "$dir" && npm ci --no-audit --no-fund) && echo "$lock" > "$dir/.lock-hash"
  fi
}

build() { # build DIR
  (cd "$1" && VITE_BUILD_TIME=$(date +%s) npm run build && cp dist/index.html dist/404.html)
}

backup_state() { # keep the last 20 pre-run copies of production state
  mkdir -p "$OVB_ROOT/backups"
  cp "$OVB_ROOT/state/prod/state.json.gz" "$OVB_ROOT/backups/state-$(date +%Y%m%dT%H%M%S).json.gz"
  ls -1t "$OVB_ROOT"/backups/state-*.json.gz | tail -n +21 | xargs -r rm --
}

migrate_prod() { # run the release's state migration with the review UI stopped
  local out="$OVB_ROOT/backups/migrate-$(date +%Y%m%dT%H%M%S)"
  systemctl --user stop ovberlin-admin.service || true
  (cd "$OVB_ROOT/prod" && npm run pipeline:migrate -- --state "$PIPELINE_STATE" --data "$PIPELINE_DATA_DIR" --output "$out")
  cp "$out/state.json.gz" "$PIPELINE_STATE.tmp" && mv "$PIPELINE_STATE.tmp" "$PIPELINE_STATE"
  if [ -d "$out/data" ]; then rm -rf "$PIPELINE_DATA_DIR" && cp -r "$out/data" "$PIPELINE_DATA_DIR"; fi
}

publish_prod() { # upload the built site and let the publish workflow deploy it to Pages
  local archive="$OVB_ROOT/site.tar.gz"
  tar -czf "$archive" -C "$OVB_ROOT/prod/dist" .
  gh release upload site-live "$archive" --clobber -R "$REPO"
  gh workflow run publish.yml --ref main -R "$REPO"
}

run_prod() {
  local tag; git -C "$OVB_ROOT/prod" fetch --quiet --force --tags origin
  tag=$(latest_tag); [ -n "$tag" ] || { log "No v* release tag yet; nothing to deploy"; return 0; }
  local previous; previous=$(cat "$OVB_ROOT/prod.deployed" 2>/dev/null || true)
  log "Production run for $tag"
  echo "$tag" > "$OVB_ROOT/prod.attempted"
  checkout "$OVB_ROOT/prod" "$tag"
  export PIPELINE_STATE="$OVB_ROOT/state/prod/state.json.gz" PIPELINE_DATA_DIR="$OVB_ROOT/state/prod/data"
  backup_state
  [ "$previous" = "$tag" ] || migrate_prod
  (cd "$OVB_ROOT/prod" && npm run scrape) || { log "Scrape failed; publishing the preserved dataset"; notify "ovberlin scrape failed for $tag; the previous dataset stays live"; }
  build "$OVB_ROOT/prod"
  publish_prod
  echo "$tag" > "$OVB_ROOT/prod.deployed"
  [ "$previous" = "$tag" ] || systemctl --user restart ovberlin-admin.service
  log "Published $tag"
}

run_publish() {
  local dir="$OVB_ROOT/prod"
  # Review corrections regenerate public/movies.json; publish until the build matches it.
  for _ in 1 2 3; do
    if cmp -s "$dir/public/movies.json" "$dir/dist/movies.json"; then log "Published dataset is current"; return 0; fi
    log "Publishing regenerated dataset"
    build "$dir"
    publish_prod
  done
}

run_staging() {
  local dir="$OVB_ROOT/staging" prod_public="$OVB_ROOT/prod/public"
  git -C "$dir" fetch --quiet origin main
  local sha; sha=$(git -C "$dir" rev-parse origin/main)
  log "Staging run for main@${sha:0:8} ${1:-}"
  echo "$sha" > "$OVB_ROOT/staging.attempted"
  checkout "$dir" "$sha"
  if [ "${1:-}" = "--scrape" ]; then
    export PIPELINE_STATE="$OVB_ROOT/state/staging/state.json.gz" PIPELINE_DATA_DIR="$OVB_ROOT/state/staging/data"
    rm -rf "$OVB_ROOT/state/staging" && cp -r "$OVB_ROOT/state/prod" "$OVB_ROOT/state/staging"
  fi
  # Start from the published production dataset; a staging scrape then replaces it.
  cp "$prod_public/movies.json" "$prod_public/sitemap.xml" "$dir/public/"
  rm -rf "$dir/public/audit" && cp -r "$prod_public/audit" "$dir/public/audit"
  if [ "${1:-}" = "--scrape" ]; then
    (cd "$dir" && npm run pipeline:migrate -- --state "$PIPELINE_STATE" --data "$PIPELINE_DATA_DIR" --output "$OVB_ROOT/state/staging-migrated" \
      && mv "$OVB_ROOT/state/staging-migrated/state.json.gz" "$PIPELINE_STATE" && rm -rf "$OVB_ROOT/state/staging-migrated")
    (cd "$dir" && npm run scrape) || log "Staging scrape failed; serving production data"
  fi
  build "$dir"
  systemctl --user restart ovberlin-staging-web.service
  log "Staging serves main@${sha:0:8}"
}

poll() {
  git -C "$OVB_ROOT/prod" fetch --quiet --force --tags origin
  local tag; tag=$(latest_tag)
  if [ -n "$tag" ] && [ "$tag" != "$(cat "$OVB_ROOT/prod.attempted" 2>/dev/null)" ]; then
    log "New release $tag"; systemctl --user start --no-block ovberlin-prod.service
  fi
  git -C "$OVB_ROOT/staging" fetch --quiet origin main
  if [ "$(git -C "$OVB_ROOT/staging" rev-parse origin/main)" != "$(cat "$OVB_ROOT/staging.attempted" 2>/dev/null)" ]; then
    log "New commit on main"; systemctl --user start --no-block ovberlin-staging.service
  fi
}

mode=${1:-}; shift || true
case "$mode" in
  poll) poll ;;
  prod|staging|publish)
    # Production and staging share production state; never run them at the same time.
    exec 9>"$OVB_ROOT/run.lock"; flock 9
    trap 'notify "ovberlin $mode run failed; see journalctl --user -u ovberlin-$mode"' ERR
    "run_$mode" "$@" ;;
  *) echo "Usage: $0 prod | staging [--scrape] | publish | poll" >&2; exit 2 ;;
esac
