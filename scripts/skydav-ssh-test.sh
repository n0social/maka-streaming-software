#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source_env() { :; }

bash "${SCRIPT_DIR}/cloud-skydav-ssh-bootstrap.sh"

HOST_ALIAS="${SKYDAV_SSH_HOST_ALIAS:-skydav-droplet}"
echo "Testing SSH to ${HOST_ALIAS}…"
ssh -o BatchMode=yes -o ConnectTimeout=15 "${HOST_ALIAS}" 'echo ok && hostname && ls -la /opt/maka/web 2>/dev/null | head -5'
