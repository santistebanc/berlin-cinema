#!/usr/bin/env bash
# One-time Beelink setup, safe to re-run. Usage: ops/beelink/install.sh [SEED_COMMIT]
# SEED_COMMIT is the last commit that still tracked pipeline state and public data.
set -euo pipefail

OVB_ROOT=${OVB_ROOT:-$HOME/ovberlin}
REPO=santistebanc/berlin-cinema
NODE_MAJOR=24
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OVB_ROOT/state/prod/data" "$OVB_ROOT/backups" "$OVB_ROOT/ops"

if [ ! -x "$OVB_ROOT/node/bin/node" ]; then
  version=$(curl -fsS https://nodejs.org/dist/index.json | grep -o "\"v$NODE_MAJOR\.[0-9.]*\"" | head -1 | tr -d '"')
  echo "Installing Node $version into $OVB_ROOT/node"
  curl -fsSL "https://nodejs.org/dist/$version/node-$version-linux-x64.tar.xz" | tar -xJ -C "$OVB_ROOT"
  mv "$OVB_ROOT/node-$version-linux-x64" "$OVB_ROOT/node"
fi

for env in prod staging; do
  [ -d "$OVB_ROOT/$env/.git" ] || gh repo clone "$REPO" "$OVB_ROOT/$env"
done

# Seed production data once from the last commit that tracked it.
if [ ! -f "$OVB_ROOT/state/prod/state.json.gz" ]; then
  seed=${1:?Pass the seed commit on first install}
  git -C "$OVB_ROOT/prod" fetch --quiet origin
  git -C "$OVB_ROOT/prod" show "$seed:pipeline/state.json.gz" > "$OVB_ROOT/state/prod/state.json.gz"
  git -C "$OVB_ROOT/prod" checkout --quiet --detach "$seed"
  public="$OVB_ROOT/prod/public"
  git -C "$OVB_ROOT/prod" show "$seed:public/movies.json" > "$OVB_ROOT/seed-movies.json"
  git -C "$OVB_ROOT/prod" show "$seed:public/sitemap.xml" > "$OVB_ROOT/seed-sitemap.xml"
  rm -rf "$OVB_ROOT/seed-audit" && cp -r "$public/audit" "$OVB_ROOT/seed-audit"
  # Later checkouts stop tracking these files and would delete them; restore after switching.
  git -C "$OVB_ROOT/prod" checkout --quiet --detach origin/main
  mv "$OVB_ROOT/seed-movies.json" "$public/movies.json"
  mv "$OVB_ROOT/seed-sitemap.xml" "$public/sitemap.xml"
  rm -rf "$public/audit" && mv "$OVB_ROOT/seed-audit" "$public/audit"
fi

cp "$HERE/ovberlin.sh" "$OVB_ROOT/ops/ovberlin.sh" && chmod +x "$OVB_ROOT/ops/ovberlin.sh"
[ -f "$OVB_ROOT/secrets.env" ] || { printf 'TMDB_API_KEY=\nOMDB_API_KEY=\nGEOAPIFY_API_KEY=\n# NOTIFY_URL=\n' > "$OVB_ROOT/secrets.env"; chmod 600 "$OVB_ROOT/secrets.env"; }

gh release view site-live -R "$REPO" >/dev/null 2>&1 || gh release create site-live -R "$REPO" --prerelease \
  --title "Live site build" --notes "Built site uploaded by the Beelink runner. Not a code release."

mkdir -p "$HOME/.config/systemd/user"
cp "$HERE"/systemd/* "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now ovberlin-prod.timer ovberlin-poll.timer ovberlin-publish.path
systemctl --user enable ovberlin-admin.service ovberlin-staging-web.service
# Review UI over HTTPS for the tailnet only (serve, not funnel).
host=$(tailscale status --json | grep -m1 -o '"DNSName": *"[^"]*"' | cut -d'"' -f4 | sed 's/.$//')
# Other serve entries on this machine need root to rewrite the shared config.
sudo tailscale serve --bg --https=3443 http://127.0.0.1:3003 >/dev/null
grep -q '^ADMIN_ORIGINS=' "$OVB_ROOT/secrets.env" || echo "ADMIN_ORIGINS=https://$host:3443" >> "$OVB_ROOT/secrets.env"
systemctl --user restart ovberlin-admin.service
echo "Review UI: https://$host:3443/admin/review"
echo "Installed. Fill $OVB_ROOT/secrets.env, then: systemctl --user start ovberlin-prod.service"
