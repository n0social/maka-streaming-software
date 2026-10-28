#!/bin/bash
set -euo pipefail

WEB_ROOT="${WEB_ROOT:-/opt/tabcast/web}"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Publishing Maka site from ${SRC_DIR}…"

chmod 755 "${WEB_ROOT}" "${WEB_ROOT}/marketing" "${WEB_ROOT}/stream" "${WEB_ROOT}/preview" "${WEB_ROOT}/assets" 2>/dev/null || true

cp "${SRC_DIR}/index.html" "${WEB_ROOT}/index.html"
cp "${SRC_DIR}/download.html" "${WEB_ROOT}/download.html"
cp "${SRC_DIR}/legacy.html" "${WEB_ROOT}/legacy.html"
cp "${SRC_DIR}/404.html" "${WEB_ROOT}/404.html"
cp "${SRC_DIR}/maka.css" "${WEB_ROOT}/maka.css"
cp "${SRC_DIR}/robots.txt" "${WEB_ROOT}/robots.txt"
cp "${SRC_DIR}/sitemap.xml" "${WEB_ROOT}/sitemap.xml"

mkdir -p "${WEB_ROOT}/stream"
cp "${SRC_DIR}/stream/index.html" "${WEB_ROOT}/stream/index.html"
cp "${SRC_DIR}/stream/stream.css" "${WEB_ROOT}/stream/stream.css"
cp "${SRC_DIR}/stream/stream.js" "${WEB_ROOT}/stream/stream.js"

mkdir -p "${WEB_ROOT}/preview"
cp "${SRC_DIR}/preview/index.html" "${WEB_ROOT}/preview/index.html"
cp "${SRC_DIR}/preview/preview.css" "${WEB_ROOT}/preview/preview.css"

mkdir -p "${WEB_ROOT}/assets/mascot"
cp -r "${SRC_DIR}/assets/mascot/." "${WEB_ROOT}/assets/mascot/"

mkdir -p "${WEB_ROOT}/marketing/icons"
cp -r "${SRC_DIR}/marketing/." "${WEB_ROOT}/marketing/"

find "${WEB_ROOT}/marketing" -type f -exec chmod 644 {} \;
chmod 644 "${WEB_ROOT}/index.html" "${WEB_ROOT}/legacy.html" "${WEB_ROOT}/download.html" \
  "${WEB_ROOT}/404.html" "${WEB_ROOT}/maka.css" "${WEB_ROOT}/robots.txt" "${WEB_ROOT}/sitemap.xml" \
  "${WEB_ROOT}/stream/index.html" "${WEB_ROOT}/stream/stream.css" "${WEB_ROOT}/stream/stream.js" \
  "${WEB_ROOT}/preview/index.html" "${WEB_ROOT}/preview/preview.css"

if [ -f "${SRC_DIR}/tabcast-downloads.conf" ]; then
  cp "${SRC_DIR}/tabcast-downloads.conf" /etc/nginx/snippets/tabcast-downloads.conf
fi

nginx -t
systemctl reload nginx

echo "--- verify ---"
curl -sk -o /dev/null -w "home:%{http_code}\n" https://127.0.0.1/ -H "Host: tabcast.live.skydav.work"
curl -sk -o /dev/null -w "preview:%{http_code}\n" https://127.0.0.1/preview/ -H "Host: tabcast.live.skydav.work"
curl -sk -o /dev/null -w "legacy:%{http_code}\n" https://127.0.0.1/legacy.html -H "Host: tabcast.live.skydav.work"
curl -sk -o /dev/null -w "stream:%{http_code}\n" https://127.0.0.1/stream/ -H "Host: tabcast.live.skydav.work"
curl -sk -o /dev/null -w "marketing:%{http_code}\n" https://127.0.0.1/marketing/download-now.png -H "Host: tabcast.live.skydav.work"
curl -sk -o /dev/null -w "setup:%{http_code}\n" https://127.0.0.1/downloads/Maka-Setup-0.2.4.exe -H "Host: tabcast.live.skydav.work"
echo DONE
