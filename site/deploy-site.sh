#!/bin/bash
set -euo pipefail

WEB_ROOT="${WEB_ROOT:-/opt/tabcast/web}"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Publishing Tabcast site from ${SRC_DIR}…"

chmod 755 "${WEB_ROOT}" "${WEB_ROOT}/marketing" "${WEB_ROOT}/stream" 2>/dev/null || true

cp "${SRC_DIR}/index.html" "${WEB_ROOT}/index.html"
cp "${SRC_DIR}/legacy.html" "${WEB_ROOT}/legacy.html"
mkdir -p "${WEB_ROOT}/stream"
cp "${SRC_DIR}/stream/index.html" "${WEB_ROOT}/stream/index.html"

mkdir -p "${WEB_ROOT}/marketing/icons"
cp -r "${SRC_DIR}/marketing/." "${WEB_ROOT}/marketing/"

find "${WEB_ROOT}/marketing" -type f -exec chmod 644 {} \;
chmod 644 "${WEB_ROOT}/index.html" "${WEB_ROOT}/legacy.html" "${WEB_ROOT}/stream/index.html"

if [ -f "${SRC_DIR}/tabcast-downloads.conf" ]; then
  cp "${SRC_DIR}/tabcast-downloads.conf" /etc/nginx/snippets/tabcast-downloads.conf
fi

nginx -t
systemctl reload nginx

echo "--- verify ---"
curl -sk -o /dev/null -w "home:%{http_code}\n" https://127.0.0.1/ -H "Host: tabcast.live.skydav.work"
curl -sk -o /dev/null -w "legacy:%{http_code}\n" https://127.0.0.1/legacy.html -H "Host: tabcast.live.skydav.work"
curl -sk -o /dev/null -w "stream:%{http_code}\n" https://127.0.0.1/stream/ -H "Host: tabcast.live.skydav.work"
curl -sk -o /dev/null -w "marketing:%{http_code}\n" https://127.0.0.1/marketing/download-now.png -H "Host: tabcast.live.skydav.work"
curl -sk -o /dev/null -w "setup:%{http_code}\n" https://127.0.0.1/downloads/TabcastBrowser-Setup-0.2.0.exe -H "Host: tabcast.live.skydav.work"
echo DONE
