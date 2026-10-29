#!/usr/bin/env bash
# Installs the daily backup (01:00 UTC) and the weekly restore test (Sunday 03:00 UTC). Run once:  sudo bash ops/install-cron.sh
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"; USER_NAME="${SUDO_USER:-deploy}"
cat > /etc/cron.d/elmenue <<CRON
0 1 * * * $USER_NAME cd $APP_DIR && bash ops/backup.sh >> /var/log/elmenue-backup.log 2>&1
0 3 * * 0 $USER_NAME cd $APP_DIR && bash ops/restore-test.sh >> /var/log/elmenue-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/elmenue
touch /var/log/elmenue-backup.log; chown "$USER_NAME" /var/log/elmenue-backup.log
echo "Installed. Logs: /var/log/elmenue-backup.log"
