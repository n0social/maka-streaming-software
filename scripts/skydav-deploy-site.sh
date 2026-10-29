#!/usr/bin/env bash
# Deploy the Maka static site to https://makalive.stream (droplet 104.131.164.94).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE="${ROOT}/site"
HOST_ALIAS="${SKYDAV_SSH_HOST_ALIAS:-skydav-droplet}"
REMOTE_SRC="${SKYDAV_REMOTE_SITE_SRC:-/opt/tabcast/site-src}"
WEB_ROOT="${SKYDAV_WEB_ROOT:-/opt/tabcast/web}"
SITE_HOST="${SKYDAV_SITE_HOST:-makalive.stream}"

bash "${ROOT}/scripts/cloud-skydav-ssh-bootstrap.sh"

if [[ ! -f "${HOME}/.ssh/id_ed25519_skydav" ]]; then
  echo "No SSH key materialized. Add SKYDAV_SSH_PRIVATE_KEY_B64 (or SKYDAV_SSH_PRIVATE_KEY) to Cloud Agent secrets." >&2
  exit 1
fi

echo "Syncing site/ → ${HOST_ALIAS}:${REMOTE_SRC}/ …"
ssh -o BatchMode=yes "${HOST_ALIAS}" "mkdir -p ${REMOTE_SRC}"
rsync -avz --delete \
  --exclude '.git' \
  "${SITE}/" "${HOST_ALIAS}:${REMOTE_SRC}/"

echo "Running deploy-site.sh on origin (${SITE_HOST})…"
ssh -o BatchMode=yes "${HOST_ALIAS}" \
  "WEB_ROOT=${WEB_ROOT} SITE_HOST=${SITE_HOST} bash ${REMOTE_SRC}/deploy-site.sh"

echo "--- public origin checks ---"
curl -sI "https://${SITE_HOST}/maka.css?v=dc6d036" | grep -iE '^(HTTP|content-type|last-modified)' || true
curl -s "https://${SITE_HOST}/" | grep -o 'maka.css?v=[^"]*' | head -1 || true

echo "Deploy complete: https://${SITE_HOST}/"
