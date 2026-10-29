#!/bin/bash
set -euo pipefail

# Public stylesheets: https://makalive.stream/maka.css?v=dc6d038
# nginx: site/maka-site-cache.conf + site/nginx/tabcast.live.skydav.work.conf

WEB_ROOT="${WEB_ROOT:-/opt/maka/web}"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
SITE_HOST="${SITE_HOST:-makalive.stream}"
CSS_BUILD="${CSS_BUILD:-dc6d038}"

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
cp "${SRC_DIR}/assets/mascot/maka-mascot.svg" "${WEB_ROOT}/maka-mascot.svg"

mkdir -p "${WEB_ROOT}/marketing/icons"
cp -r "${SRC_DIR}/marketing/." "${WEB_ROOT}/marketing/"

find "${WEB_ROOT}/marketing" -type f -exec chmod 644 {} \;
chmod 644 "${WEB_ROOT}/index.html" "${WEB_ROOT}/legacy.html" "${WEB_ROOT}/download.html" \
  "${WEB_ROOT}/404.html" "${WEB_ROOT}/maka.css" "${WEB_ROOT}/maka-mascot.svg" "${WEB_ROOT}/robots.txt" "${WEB_ROOT}/sitemap.xml" \
  "${WEB_ROOT}/stream/index.html" "${WEB_ROOT}/stream/stream.css" "${WEB_ROOT}/stream/stream.js" \
  "${WEB_ROOT}/preview/index.html" "${WEB_ROOT}/preview/preview.css"

if [ -f "${SRC_DIR}/maka-downloads.conf" ]; then
  cp "${SRC_DIR}/maka-downloads.conf" /etc/nginx/snippets/maka-downloads.conf
fi

if [ -f "${SRC_DIR}/maka-site-cache.conf" ]; then
  cp "${SRC_DIR}/maka-site-cache.conf" /etc/nginx/snippets/maka-site-cache.conf
fi

if [ -f "${SRC_DIR}/nginx/tabcast.live.skydav.work.conf" ]; then
  cp "${SRC_DIR}/nginx/tabcast.live.skydav.work.conf" /etc/nginx/sites-available/tabcast.live.skydav.work
  ln -sf /etc/nginx/sites-available/tabcast.live.skydav.work /etc/nginx/sites-enabled/tabcast.live.skydav.work
fi

nginx -t
systemctl reload nginx

echo "--- verify ---"
curl -sk -o /dev/null -w "home:%{http_code}\n" "https://127.0.0.1/" -H "Host: ${SITE_HOST}"
curl -sk -o /dev/null -w "preview:%{http_code}\n" "https://127.0.0.1/preview/" -H "Host: ${SITE_HOST}"
curl -sk -o /dev/null -w "legacy:%{http_code}\n" "https://127.0.0.1/legacy.html" -H "Host: ${SITE_HOST}"
curl -sk -o /dev/null -w "stream:%{http_code}\n" "https://127.0.0.1/stream/" -H "Host: ${SITE_HOST}"
curl -sk -o /dev/null -w "marketing:%{http_code}\n" "https://127.0.0.1/marketing/download-now.png" -H "Host: ${SITE_HOST}"
curl -sk -o /dev/null -w "setup:%{http_code}\n" "https://127.0.0.1/downloads/Maka-Setup-0.2.5.exe" -H "Host: ${SITE_HOST}"

css_ct="$(curl -skI "https://127.0.0.1/maka.css?v=${CSS_BUILD}" -H "Host: ${SITE_HOST}" | awk -F': ' 'tolower($1)=="content-type"{print $2}' | tr -d '\r')"
css_tmp="$(mktemp)"
curl -sk -o "${css_tmp}" "https://127.0.0.1/maka.css?v=${CSS_BUILD}" -H "Host: ${SITE_HOST}"
css_head="$(head -c 40 "${css_tmp}")"
rm -f "${css_tmp}"
echo "maka.css content-type:${css_ct}"
echo "maka.css head:${css_head}"
if [[ "${css_ct}" != *"text/css"* ]] || [[ "${css_head}" != "/* MAKA_CSS_BUILD=${CSS_BUILD}"* ]]; then
  echo "FAIL: maka.css not served as stylesheet" >&2
  exit 1
fi

html_link="$(curl -sk "https://127.0.0.1/" -H "Host: ${SITE_HOST}" | grep -o 'maka.css?v=[^"]*' | head -1)"
echo "index stylesheet link:${html_link}"

echo DONE
