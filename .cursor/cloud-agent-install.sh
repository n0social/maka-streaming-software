#!/usr/bin/env bash
# Cloud Agent bootstrap: Node deps + SSH client for origin deploy (root@104.131.164.94).
# Private keys must NOT live in git — add the agent's public key to the droplet and/or
# configure Cursor Cloud Agent secrets so BatchMode SSH works. See docs/site-deploy.md.
set -euo pipefail

if ! command -v ssh >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends openssh-client
fi

if [[ -f package-lock.json ]]; then
  npm ci
fi

mkdir -p "${HOME}/.ssh"
chmod 700 "${HOME}/.ssh"
if ! grep -q '104.131.164.94' "${HOME}/.ssh/known_hosts" 2>/dev/null; then
  ssh-keyscan -H 104.131.164.94 >>"${HOME}/.ssh/known_hosts" 2>/dev/null || true
fi
chmod 600 "${HOME}/.ssh/known_hosts" 2>/dev/null || true
