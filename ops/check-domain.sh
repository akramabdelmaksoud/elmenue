#!/usr/bin/env bash
# Is a restaurant's custom domain ready?   bash ops/check-domain.sh menu.mycafe.com [cname-target]
# Checks the CNAME, then opens the site over HTTPS (the first visit also makes the certificate: this is the "pre-warm").
set -uo pipefail
D="${1:?usage: check-domain.sh menu.mycafe.com [cname-target]}"
BASE="$(grep -E '^BASE_DOMAIN=' "$(dirname "$0")/../.env.production" 2>/dev/null | cut -d= -f2- | sed 's/[[:space:]]#.*$//')"
TARGET="${2:-cname.$BASE}"
echo "CNAME of $D:"; dig +short CNAME "$D" | sed 's/^/   /'
dig +short CNAME "$D" | grep -qi "^$TARGET\.\?$" && echo "   OK: points to $TARGET" || echo "   NOT pointing to $TARGET yet (DNS can take up to a few hours)"
echo "HTTPS:"; curl -sS -o /dev/null -m 30 -w "   status %{http_code}, certificate check: %{ssl_verify_result} (0 = valid)\n" "https://$D/" || echo "   not reachable yet"
