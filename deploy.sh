#!/usr/bin/env bash
# Deploy / roll back elmenue on the server.   Run from the project folder as the "deploy" user.
#
#   ./deploy.sh              pull the latest code of the current branch, build, restart
#   ./deploy.sh <git-ref>    deploy a specific branch, tag or commit (e.g. v1.2 or a new "better version" branch)
#   ./deploy.sh rollback     go back to the previous version (the old image is still on the server)
#   ./deploy.sh status       show what is running
#
# Low downtime: the new image is built while the old one keeps serving. The switch takes a few seconds; the old
# container is stopped gracefully (it writes all pending data first) and guests' phones reconnect by themselves.
# Not zero downtime on purpose: two app copies must never run at once (live state is in memory).
set -euo pipefail
cd "$(dirname "$0")"

ENVF=.env.production
DC="docker compose --env-file $ENVF"
STATE=.deploy; mkdir -p "$STATE"
say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$ENVF" ] || die "$ENVF is missing. Copy .env.example to $ENVF and fill it in."
grep -q 'CHANGE_ME' "$ENVF" && die "$ENVF still contains CHANGE_ME placeholders."
[ "$(stat -c %a "$ENVF")" = "600" ] || chmod 600 "$ENVF"

wait_healthy() {
  for _ in $(seq 1 40); do
    cid=$($DC ps -q app 2>/dev/null || true)
    s=$([ -n "$cid" ] && docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo none)
    [ "$s" = healthy ] && return 0
    sleep 3
  done
  return 1
}

start_version() {   # $1 = APP_VERSION whose image to run
  APP_VERSION="$1" $DC up -d --remove-orphans
}

case "${1:-}" in
  status)
    $DC ps; echo; echo "current:  $(cat $STATE/current 2>/dev/null || echo unknown)"; echo "previous: $(cat $STATE/previous 2>/dev/null || echo none)"
    exit 0 ;;
  rollback)
    prev=$(cat $STATE/previous 2>/dev/null || true); [ -n "$prev" ] || die "no previous version recorded"
    docker image inspect "elmenue:$prev" >/dev/null 2>&1 || die "image elmenue:$prev is gone"
    say "Rolling back to $prev"
    cur=$(cat $STATE/current 2>/dev/null || true)
    start_version "$prev"
    wait_healthy || die "rolled-back version did not become healthy, check: $DC logs app"
    echo "$prev" > $STATE/current; [ -n "$cur" ] && echo "$cur" > $STATE/previous
    say "Rolled back to $prev"; exit 0 ;;
esac

REF="${1:-}"
if [ -d .git ]; then
  say "Fetching code"
  git fetch --all --tags --quiet
  if [ -n "$REF" ]; then git checkout --quiet "$REF"; fi
  # fast-forward only when on a branch (a tag or commit stays exactly as checked out)
  if git symbolic-ref -q HEAD >/dev/null; then git pull --ff-only --quiet || die "git pull failed (local changes on the server?)"; fi
else
  say "Not a git checkout - building the files that are here"
fi
VERSION=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)
[ -z "$(git status --porcelain --untracked-files=no 2>/dev/null)" ] || VERSION="$VERSION-dirty"
say "Version $VERSION"

say "Building image (the old version keeps running)"
APP_VERSION="$VERSION" $DC build app

cur=$(cat $STATE/current 2>/dev/null || true)
say "Switching over"
start_version "$VERSION"
if wait_healthy; then
  [ -n "$cur" ] && [ "$cur" != "$VERSION" ] && echo "$cur" > $STATE/previous
  echo "$VERSION" > $STATE/current
  say "Healthy. Smoke test:"; $DC exec -T app wget -qO- http://127.0.0.1:3000/health; echo
  # keep the 5 newest images, drop the rest
  docker images elmenue --format '{{.Tag}}' | tail -n +6 | xargs -r -I{} docker rmi "elmenue:{}" >/dev/null 2>&1 || true
  say "Done: $VERSION is live"
else
  say "New version FAILED its health check"
  $DC logs --tail 40 app || true
  if [ -n "$cur" ] && docker image inspect "elmenue:$cur" >/dev/null 2>&1; then
    say "Putting $cur back"; start_version "$cur"; wait_healthy && say "Old version restored" || say "Old version also unhealthy - check logs"
  fi
  exit 1
fi
