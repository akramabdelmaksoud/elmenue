#!/usr/bin/env bash
# Proves a backup can really be restored: loads the newest dump (or the file you pass) into a THROWAWAY Postgres
# container and counts the restaurants. Touches nothing real. Run it after setting up backups and then weekly
# (ops/install-cron.sh schedules it). A backup that was never restored is not a backup.
#
#   bash ops/restore-test.sh [/var/backups/elmenue/elmenue-YYYYmmdd-HHMM.dump]
#
# REAL disaster recovery (replaces live data - stop the app first):
#   ./deploy.sh status ; docker compose --env-file .env.production stop app
#   docker run --rm -i postgres:17-alpine pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" < DUMPFILE
#   ./deploy.sh        # starts the app again
set -euo pipefail
DUMP="${1:-$(ls -1t /var/backups/elmenue/elmenue-*.dump 2>/dev/null | head -1)}"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || { echo "no dump found"; exit 1; }
NAME=elmenue-restore-test-$$
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
echo "Restoring $DUMP ..."
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pw postgres:17-alpine >/dev/null
for _ in $(seq 1 30); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec -i "$NAME" pg_restore -U postgres -d postgres --no-owner < "$DUMP" 2>&1 | grep -v "^$" | head -20 || true
Q() { docker exec "$NAME" psql -U postgres -tA -c "$1"; }
T=$(Q "select count(*) from tenants where id not like 'aux:%'"); A=$(Q "select count(*) from tenants where id like 'aux:%'")
echo "restaurants: $T   history/image rows: $A"
Q "select id, doc->>'name', pg_column_size(doc) from tenants where id not like 'aux:%' order by 1 limit 10"
[ "${T:-0}" -ge 1 ] || { echo "RESTORE TEST FAILED: no restaurants found"; exit 1; }
echo "RESTORE TEST PASSED"
