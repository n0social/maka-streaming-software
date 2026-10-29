#!/bin/bash
set -euo pipefail

WEB_ROOT="${WEB_ROOT:-/opt/maka/web}"
UPLOAD_DIR="${UPLOAD_DIR:-/tmp/maka-upload}"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Fixing web permissions..."
chmod 755 "${WEB_ROOT}"
find "${WEB_ROOT}" -type d -exec chmod 755 {} \;
find "${WEB_ROOT}" -type f -exec chmod 644 {} \;

echo "Publishing installer + download page..."
cp "${UPLOAD_DIR}/Maka-Setup-0.2.5.exe" "${WEB_ROOT}/downloads/"
cp "${UPLOAD_DIR}/browser-manifest.json" "${WEB_ROOT}/downloads/"
cp "${UPLOAD_DIR}/download.html" "${WEB_ROOT}/download.html"
if [ -f "${UPLOAD_DIR}/maka-downloads.conf" ]; then
  cp "${UPLOAD_DIR}/maka-downloads.conf" /etc/nginx/snippets/maka-downloads.conf
elif [ -f "${SRC_DIR}/maka-downloads.conf" ]; then
  cp "${SRC_DIR}/maka-downloads.conf" /etc/nginx/snippets/maka-downloads.conf
fi
chmod 644 \
  "${WEB_ROOT}/downloads/Maka-Setup-0.2.5.exe" \
  "${WEB_ROOT}/downloads/browser-manifest.json" \
  "${WEB_ROOT}/download.html" \
  /etc/nginx/snippets/maka-downloads.conf 2>/dev/null || true

echo "Replacing broken SPA homepage with download page..."
if [ ! -f "${WEB_ROOT}/index.spa.bak" ]; then
  cp -a "${WEB_ROOT}/index.html" "${WEB_ROOT}/index.spa.bak"
fi
cp "${WEB_ROOT}/download.html" "${WEB_ROOT}/index.html"

nginx -t
systemctl reload nginx

echo "--- verify ---"
ls -lah "${WEB_ROOT}/downloads/"
ls -lah "${WEB_ROOT}/index.html" "${WEB_ROOT}/download.html"
curl -sk -o /dev/null -w "home:%{http_code}\n" https://127.0.0.1/ -H "Host: makalive.stream"
curl -sk -o /dev/null -w "download:%{http_code}\n" https://127.0.0.1/download.html -H "Host: makalive.stream"
curl -sk -o /dev/null -w "setup:%{http_code}\n" https://127.0.0.1/downloads/Maka-Setup-0.2.5.exe -H "Host: makalive.stream"
curl -sk https://127.0.0.1/ -H "Host: makalive.stream" | head -n 8
# Previous origin hostname remains a nginx server_name.
curl -sk -o /dev/null -w "legacy-home:%{http_code}\n" https://127.0.0.1/ -H "Host: tabcast.live.skydav.work"
echo DONE
