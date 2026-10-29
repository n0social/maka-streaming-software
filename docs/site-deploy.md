# Tabcast / Maka static site deploy

Origin for marketing HTML, `maka.css`, downloads, `/stream/`, and `/preview/` is **`tabcast.live.skydav.work`** on the DigitalOcean droplet **`104.131.164.94`** (`/opt/tabcast/web`). Public **`tabcast.live`** / **`www.tabcast.live`** on **`45.77.x`** front Caddy and must redirect to the origin **without dropping the request path**.

## Deploy to origin (104.131.164.94)

From a machine with SSH to the droplet:

```bash
rsync -avz --delete \
  --exclude '.git' \
  ./site/ root@104.131.164.94:/opt/tabcast/site-src/
ssh root@104.131.164.94 'WEB_ROOT=/opt/tabcast/web bash /opt/tabcast/site-src/deploy-site.sh'
```

Or copy `site/` into `/opt/tabcast/site-src` on the server and run `deploy-site.sh` there.

## Caddy on 45.77.x (tabcast.live / www) — preserve `$uri`

**Root cause of “black Arial MAKA”:** apex/www redirects that send every path to `https://tabcast.live.skydav.work/` (homepage only). Browsers then load **`index.html` as the stylesheet** when an old or relative `/maka.css` URL hits Caddy (MIME mismatch → stylesheet discarded → unstyled hero).

Use a redirect that keeps path **and** query string (`{uri}` in Caddy v2):

```caddy
tabcast.live, www.tabcast.live {
	redir https://tabcast.live.skydav.work{uri} permanent
}
```

If you use `handle_path` or a single target URL without `{uri}`, fix it before relying on relative asset URLs on the apex host.

After editing Caddy:

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

Verify:

```bash
curl -sI 'https://www.tabcast.live/maka.css?v=TEST' | grep -i location
# MUST be: location: https://tabcast.live.skydav.work/maka.css?v=TEST
# NOT:     location: https://tabcast.live.skydav.work/
```

## nginx on origin

`site/deploy-site.sh` installs:

- `/etc/nginx/sites-available/tabcast.live.skydav.work`
- `/etc/nginx/snippets/tabcast-site-cache.conf` (exact `/maka.css` + `text/css`, no SPA fallback)

## Cache bust

When `site/maka.css` changes, bump `MAKA_CSS_BUILD` in `maka.css` and every `maka.css?v=` in `site/**/*.html`, then redeploy.
