#!/usr/bin/env bash
# Daily Postgres backup (pg_dump custom format) -> /var/backups/elmenue, keep BACKUP_KEEP_DAYS days.
# Optional: copy off-site with rclone (RCLONE_REMOTE) and ping a monitor (BACKUP_PING_URL) after success.
# This is IN ADDITION to Supabase's own daily backups: it lives on a different provider/disk.
# Install the daily job with:  sudo bash ops/install-cron.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ENVF=.env.production
getv() { grep -E "^$1=" "$ENVF" | head -1 | cut -d= -f2- | sed -e 's/[[:space:]]#.*$//' -e 's/^"//' -e 's/"$//'; }
DB_URL="$(getv DATABASE_URL)"; [ -n "$DB_URL" ] || { echo "DATABASE_URL missing in $ENVF"; exit 1; }
KEEP="$(getv BACKUP_KEEP_DAYS)"; KEEP="${KEEP:-14}"
RCLONE_REMOTE="$(getv RCLONE_REMOTE)"; PING="$(getv BACKUP_PING_URL)"
DIR=/var/backups/elmenue; mkdir -p "$DIR"
OUT="$DIR/elmenue-$(date -u +%Y%m%d-%H%M).dump"

# pg client 17 can dump any older server. Use the Supabase SESSION pooler (port 5432), not the transaction pooler (6543).
docker run --rm -e PGSSLMODE=require postgres:17-alpine pg_dump --format=custom --no-owner --no-privileges "$DB_URL" > "$OUT.part"
mv "$OUT.part" "$OUT"
[ "$(stat -c %s "$OUT")" -gt 2000 ] || { echo "backup suspiciously small: $OUT"; exit 1; }
echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1))"

find "$DIR" -name 'elmenue-*.dump' -mtime +"$KEEP" -delete
if [ -n "$RCLONE_REMOTE" ] && command -v rclone >/dev/null; then rclone copy "$OUT" "$RCLONE_REMOTE" && echo "copied off-site to $RCLONE_REMOTE"; fi
if [ -n "$PING" ]; then curl -fsS -m 10 --retry 3 "$PING" >/dev/null || true; fi
