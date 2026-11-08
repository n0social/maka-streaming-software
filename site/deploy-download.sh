#!/bin/bash
set -euo pipefail

echo "Fixing web permissions..."
chmod 755 /opt/maka/web
find /opt/maka/web -type d -exec chmod 755 {} \;
find /opt/maka/web -type f -exec chmod 644 {} \;

echo "Publishing installer + download page..."
cp /tmp/maka-upload/Maka-Setup-0.2.4.exe /opt/maka/web/downloads/
cp /tmp/maka-upload/browser-manifest.json /opt/maka/web/downloads/
cp /tmp/maka-upload/download.html /opt/maka/web/download.html
cp /tmp/maka-upload/maka-downloads.conf /etc/nginx/snippets/maka-downloads.conf
chmod 644 \
  /opt/maka/web/downloads/Maka-Setup-0.2.4.exe \
  /opt/maka/web/downloads/browser-manifest.json \
  /opt/maka/web/download.html \
  /etc/nginx/snippets/maka-downloads.conf

echo "Replacing broken SPA homepage with download page..."
if [ ! -f /opt/maka/web/index.spa.bak ]; then
  cp -a /opt/maka/web/index.html /opt/maka/web/index.spa.bak
fi
cp /opt/maka/web/download.html /opt/maka/web/index.html

nginx -t
systemctl reload nginx

echo "--- verify ---"
ls -lah /opt/maka/web/downloads/
ls -lah /opt/maka/web/index.html /opt/maka/web/download.html
curl -sk -o /dev/null -w "home:%{http_code}\n" https://127.0.0.1/ -H "Host: makalive.stream.skydav.work"
curl -sk -o /dev/null -w "download:%{http_code}\n" https://127.0.0.1/download.html -H "Host: makalive.stream.skydav.work"
curl -sk -o /dev/null -w "setup:%{http_code}\n" https://127.0.0.1/downloads/Maka-Setup-0.2.4.exe -H "Host: makalive.stream.skydav.work"
curl -sk https://127.0.0.1/ -H "Host: makalive.stream.skydav.work" | head -n 8
echo DONE
