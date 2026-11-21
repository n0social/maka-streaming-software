#!/bin/bash
# Publish MakaLight installer mirror + download.html on the origin (legacy one-shot helper).
# Prefer: site/deploy-site.sh or scripts/skydav-deploy-site.sh (full site + rsync installer).
set -euo pipefail

WEB_ROOT="${WEB_ROOT:-/opt/maka/web}"
UPLOAD_DIR="${UPLOAD_DIR:-/tmp/maka-upload}"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALLER_NAME="${INSTALLER_NAME:-MakaLight-amd64-installer.exe}"
RELEASE_TAG="${RELEASE_TAG:-makalight-v0.1.3}"

echo "Fixing web permissions..."
chmod 755 "${WEB_ROOT}"
find "${WEB_ROOT}" -type d -exec chmod 755 {} \;
find "${WEB_ROOT}" -type f -exec chmod 644 {} \;

echo "Publishing MakaLight installer + download page (tag ${RELEASE_TAG})..."
mkdir -p "${WEB_ROOT}/downloads"
if [ -f "${UPLOAD_DIR}/${INSTALLER_NAME}" ]; then
  cp "${UPLOAD_DIR}/${INSTALLER_NAME}" "${WEB_ROOT}/downloads/"
else
  echo "WARN: ${UPLOAD_DIR}/${INSTALLER_NAME} missing — download button on site still points at GitHub."
fi
cp "${SRC_DIR}/browser-manifest.json" "${WEB_ROOT}/downloads/" 2>/dev/null || true
cp "${SRC_DIR}/download.html" "${WEB_ROOT}/download.html"
if [ -f "${UPLOAD_DIR}/maka-downloads.conf" ]; then
  cp "${UPLOAD_DIR}/maka-downloads.conf" /etc/nginx/snippets/maka-downloads.conf
elif [ -f "${SRC_DIR}/maka-downloads.conf" ]; then
  cp "${SRC_DIR}/maka-downloads.conf" /etc/nginx/snippets/maka-downloads.conf
fi
chmod 644 \
  "${WEB_ROOT}/downloads/${INSTALLER_NAME}" \
  "${WEB_ROOT}/downloads/browser-manifest.json" \
  "${WEB_ROOT}/download.html" \
  /etc/nginx/snippets/maka-downloads.conf 2>/dev/null || true

if [ -f "${SRC_DIR}/index.html" ]; then
  cp "${SRC_DIR}/index.html" "${WEB_ROOT}/index.html"
fi

nginx -t
systemctl reload nginx

echo "--- verify ---"
ls -lah "${WEB_ROOT}/downloads/" || true
grep -o 'makalight-v[^"]*' "${WEB_ROOT}/download.html" | head -3 || true
curl -sk -o /dev/null -w "download:%{http_code}\n" https://127.0.0.1/download.html -H "Host: makalive.stream"
curl -sk -o /dev/null -w "installer:%{http_code}\n" "https://127.0.0.1/downloads/${INSTALLER_NAME}" -H "Host: makalive.stream"
echo DONE