#!/usr/bin/env bash
# Rsync Tabcast static site from this repo to the droplet, then run server deploy script.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE="${ROOT}/site"
HOST_ALIAS="${SKYDAV_SSH_HOST_ALIAS:-skydav-droplet}"
REMOTE_TMP="/tmp/tabcast-site-upload"

bash "${ROOT}/scripts/cloud-skydav-ssh-bootstrap.sh"

if [[ ! -f "${HOME}/.ssh/id_ed25519_skydav" ]]; then
  echo "No SSH key materialized. Add SKYDAV_SSH_PRIVATE_KEY_B64 to Cloud Agent secrets." >&2
  exit 1
fi

echo "Syncing site/ to ${HOST_ALIAS}:${REMOTE_TMP}…"
ssh "${HOST_ALIAS}" "rm -rf ${REMOTE_TMP} && mkdir -p ${REMOTE_TMP}"
rsync -az --delete "${SITE}/" "${HOST_ALIAS}:${REMOTE_TMP}/"

echo "Running deploy-site.sh on droplet…"
ssh "${HOST_ALIAS}" "sudo bash ${REMOTE_TMP}/deploy-site.sh"

echo "Deploy complete."
