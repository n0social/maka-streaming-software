#!/usr/bin/env bash
# Materialize SSH credentials for the skydav.work droplet from Cloud Agent secrets.
# Idempotent — safe to run on every agent boot (wire into environment "start").
set -euo pipefail

SSH_DIR="${HOME}/.ssh"
KEY_PATH="${SSH_DIR}/id_ed25519_skydav"
HOST_ALIAS="skydav-droplet"
HOST="${SKYDAV_SSH_HOST:-104.131.164.94}"
USER="${SKYDAV_SSH_USER:-root}"

mkdir -p "${SSH_DIR}"
chmod 700 "${SSH_DIR}"

if [[ -f "${KEY_PATH}" ]]; then
  exit 0
fi

if [[ -z "${SKYDAV_SSH_PRIVATE_KEY_B64:-}" && -z "${SKYDAV_SSH_PRIVATE_KEY:-}" ]]; then
  echo "cloud-skydav-ssh-bootstrap: no SKYDAV_SSH_PRIVATE_KEY_B64 or SKYDAV_SSH_PRIVATE_KEY set; skipping." >&2
  exit 0
fi

if [[ -n "${SKYDAV_SSH_PRIVATE_KEY_B64:-}" ]]; then
  printf '%s' "${SKYDAV_SSH_PRIVATE_KEY_B64}" | base64 -d > "${KEY_PATH}"
else
  # Secret pasted with literal \n sequences (common in dashboard multiline fields)
  printf '%b' "${SKYDAV_SSH_PRIVATE_KEY}" > "${KEY_PATH}"
fi

chmod 600 "${KEY_PATH}"

touch "${SSH_DIR}/known_hosts"
chmod 644 "${SSH_DIR}/known_hosts"
if ! grep -q "${HOST}" "${SSH_DIR}/known_hosts" 2>/dev/null; then
  ssh-keyscan -H "${HOST}" >> "${SSH_DIR}/known_hosts" 2>/dev/null || true
fi

CONFIG_BLOCK="# --- skydav droplet (cursor cloud agent) ---
Host ${HOST_ALIAS}
  HostName ${HOST}
  User ${USER}
  IdentityFile ${KEY_PATH}
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
# --- end skydav ---
"

if ! grep -q "Host ${HOST_ALIAS}" "${SSH_DIR}/config" 2>/dev/null; then
  printf '%s\n' "${CONFIG_BLOCK}" >> "${SSH_DIR}/config"
  chmod 600 "${SSH_DIR}/config"
fi

echo "cloud-skydav-ssh-bootstrap: wrote ${KEY_PATH}; use: ssh ${HOST_ALIAS}"
