#!/usr/bin/env bash
set -euo pipefail

if ! command -v ssh >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends openssh-client rsync
fi

if [[ -f package-lock.json ]] && command -v npm >/dev/null; then
  npm ci
fi

mkdir -p "${HOME}/.ssh"
chmod 700 "${HOME}/.ssh"
if ! grep -q '104.131.164.94' "${HOME}/.ssh/known_hosts" 2>/dev/null; then
  ssh-keyscan -H 104.131.164.94 >>"${HOME}/.ssh/known_hosts" 2>/dev/null || true
fi
chmod 600 "${HOME}/.ssh/known_hosts" 2>/dev/null || true

bash scripts/cloud-skydav-ssh-bootstrap.sh || true
