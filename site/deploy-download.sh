#!/bin/bash
set -euo pipefail

echo "Fixing web permissions..."
chmod 755 /opt/tabcast/web
find /opt/tabcast/web -type d -exec chmod 755 {} \;
find /opt/tabcast/web -type f -exec chmod 644 {} \;

echo "Publishing installer + download page..."
cp /tmp/tabcast-upload/TabcastBrowser-Setup-0.2.0.exe /opt/tabcast/web/downloads/
cp /tmp/tabcast-upload/browser-manifest.json /opt/tabcast/web/downloads/
cp /tmp/tabcast-upload/download.html /opt/tabcast/web/download.html
cp /tmp/tabcast-upload/tabcast-downloads.conf /etc/nginx/snippets/tabcast-downloads.conf
chmod 644 \
  /opt/tabcast/web/downloads/TabcastBrowser-Setup-0.2.0.exe \
  /opt/tabcast/web/downloads/browser-manifest.json \
  /opt/tabcast/web/download.html \
  /etc/nginx/snippets/tabcast-downloads.conf

echo "Replacing broken SPA homepage with download page..."
if [ ! -f /opt/tabcast/web/index.spa.bak ]; then
  cp -a /opt/tabcast/web/index.html /opt/tabcast/web/index.spa.bak
fi
cp /opt/tabcast/web/download.html /opt/tabcast/web/index.html

nginx -t
systemctl reload nginx

echo "--- verify ---"
ls -lah /opt/tabcast/web/downloads/
ls -lah /opt/tabcast/web/index.html /opt/tabcast/web/download.html
curl -sk -o /dev/null -w "home:%{http_code}\n" https://127.0.0.1/ -H "Host: tabcast.live.skydav.work"
curl -sk -o /dev/null -w "download:%{http_code}\n" https://127.0.0.1/download.html -H "Host: tabcast.live.skydav.work"
curl -sk -o /dev/null -w "setup:%{http_code}\n" https://127.0.0.1/downloads/TabcastBrowser-Setup-0.2.0.exe -H "Host: tabcast.live.skydav.work"
curl -sk https://127.0.0.1/ -H "Host: tabcast.live.skydav.work" | head -n 8
echo DONE
