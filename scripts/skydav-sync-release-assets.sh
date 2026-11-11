#!/usr/bin/env bash
# Download GitHub release installer + manifest, push to makalive.stream downloads/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_ALIAS="${SKYDAV_SSH_HOST_ALIAS:-skydav-droplet}"
WEB_ROOT="${SKYDAV_WEB_ROOT:-/opt/maka/web}"
RELEASE_TAG="${RELEASE_TAG:-v0.2.6.2}"
SETUP_NAME="${SETUP_NAME:-Maka-Setup-0.2.6.exe}"
REPO="${GITHUB_REPO:-n0social/maka-streaming-software}"
STAGING="${TMPDIR:-/tmp}/maka-release-${RELEASE_TAG}"

bash "${ROOT}/scripts/cloud-skydav-ssh-bootstrap.sh"

if [[ ! -f "${HOME}/.ssh/id_ed25519_skydav" ]]; then
  echo "No SSH key. Set SKYDAV_SSH_PRIVATE_KEY_B64 or run scripts/skydav-print-console-snippet.sh on the droplet." >&2
  exit 1
fi

mkdir -p "${STAGING}"
echo "Fetching ${RELEASE_TAG} assets…"
curl -fSL \
  -o "${STAGING}/${SETUP_NAME}" \
  "https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${SETUP_NAME}"
curl -fSL \
  -o "${STAGING}/browser-manifest.json" \
  "https://github.com/${REPO}/releases/download/${RELEASE_TAG}/browser-manifest.json" \
  || cp "${ROOT}/site/browser-manifest.json" "${STAGING}/browser-manifest.json"

echo "Syncing downloads/ → ${HOST_ALIAS}:${WEB_ROOT}/downloads/ …"
ssh -o BatchMode=yes "${HOST_ALIAS}" "mkdir -p ${WEB_ROOT}/downloads"
rsync -avz \
  "${STAGING}/${SETUP_NAME}" \
  "${STAGING}/browser-manifest.json" \
  "${HOST_ALIAS}:${WEB_ROOT}/downloads/"

ssh -o BatchMode=yes "${HOST_ALIAS}" \
  "chmod 644 ${WEB_ROOT}/downloads/${SETUP_NAME} ${WEB_ROOT}/downloads/browser-manifest.json"

echo "Remote SHA:"
ssh -o BatchMode=yes "${HOST_ALIAS}" "sha256sum ${WEB_ROOT}/downloads/${SETUP_NAME} | awk '{print \$1}'"
echo "Release assets synced: ${RELEASE_TAG}"
