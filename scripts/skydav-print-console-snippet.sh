#!/usr/bin/env bash
# Print the one-liner to paste into the skydav droplet web console (root@104.131.164.94).
# After you run it there, this Cloud Agent can: ssh skydav-droplet && bash scripts/skydav-deploy-site.sh
set -euo pipefail

KEY="${HOME}/.ssh/id_ed25519_skydav"
if [[ ! -f "${KEY}.pub" ]]; then
  ssh-keygen -t ed25519 -f "${KEY}" -N "" -C "cursor-cloud-maka-$(date +%Y%m%d)"
fi

PUB="$(tr -d '\n' < "${KEY}.pub")"

cat <<EOF
=== Run this ON the droplet (DigitalOcean → Droplet → Console, login as root) ===

mkdir -p ~/.ssh && chmod 700 ~/.ssh && grep -qxF '${PUB}' ~/.ssh/authorized_keys 2>/dev/null || echo '${PUB}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo "cursor-agent key installed"

=== Then tell the agent "deploy" — it will test with: ===

bash scripts/skydav-ssh-test.sh

EOF
