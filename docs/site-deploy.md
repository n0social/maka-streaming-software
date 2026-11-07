# Tabcast / Maka static site deploy

Consolidated runbook for marketing HTML, `maka.css`, downloads, `/stream/`, and `/preview/`.

## Architecture

| Layer | Host | Role |
| --- | --- | --- |
| **Public site** | `makalive.stream`, `www.makalive.stream` | DNS A → droplet **`104.131.164.94`**. nginx serves **`/opt/maka/web`** with TLS for both names. |
| **Same tree** | `/opt/tabcast` → `/opt/maka` | Symlink. `/opt/tabcast/web` and `/opt/maka/web` are one directory. |
| **Not a public URL** | `makalive.stream.skydav.work` | Same IP, but that name is not on the live site vhost, so certificate verification fails. Do not use it for canonical, Open Graph, sitemap, robots, or CSS. |

Deploy target user: **`root@104.131.164.94`** (hostname `skydav`). Do not write **`/var/www/portfolio`**.

The live vhost file stays **`/etc/nginx/sites-enabled/tabcast.live.skydav.work`**. Its `server_name` is `tabcast.live.skydav.work makalive.stream www.makalive.stream`, and the certificate directory is `/etc/letsencrypt/live/tabcast.live.skydav.work/`. Leave that filename and the legacy hostname in `server_name` in place.

## Cloud Agent environment

Repository file **`.cursor/environment.json`** runs `.cursor/cloud-agent-install.sh` on environment build:

- `npm ci` when `package-lock.json` exists
- `openssh-client` if missing
- `ssh-keyscan` for **`104.131.164.94`** into `~/.ssh/known_hosts`

**Secrets:** Do **not** commit private SSH keys. The droplet must trust the Cloud Agent’s key (Cursor Cloud Agent secrets / dashboard SSH key, or `authorized_keys` on the droplet). Agents deploy with:

```bash
rsync … root@104.131.164.94:/opt/tabcast/site-src/
ssh root@104.131.164.94 'WEB_ROOT=/opt/tabcast/web bash /opt/tabcast/site-src/deploy-site.sh'
```

### SSH smoke test (BatchMode)

From any machine (or Cloud Agent) with the key loaded:

```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  root@104.131.164.94 'hostname && ls /opt/tabcast/web/index.html'
```

Expected: `skydav` and `/opt/tabcast/web/index.html`. Nonzero exit or “Permission denied” means fix keys/secrets before deploy.

## Deploy to origin (104.131.164.94)

From repo root, on a machine with SSH to the droplet:

```bash
rsync -avz --delete \
  --exclude '.git' \
  ./site/ root@104.131.164.94:/opt/tabcast/site-src/
ssh root@104.131.164.94 'WEB_ROOT=/opt/tabcast/web bash /opt/tabcast/site-src/deploy-site.sh'
```

`site/deploy-site.sh` copies assets into `/opt/tabcast/web` (the `/opt/maka/web` tree), installs nginx site + cache snippet, and reloads nginx. Default CSS cache bust: **`CSS_BUILD=dc6d039`** (override with env if needed). Skip that script when you only need to publish HTML: copy the site files into `/opt/maka/web` and leave nginx and `/var/www/portfolio` alone.

Alternative: copy `site/` into `/opt/tabcast/site-src` on the server and run the same `deploy-site.sh` there.

## Branch / repo state

Public site host is **`makalive.stream`**. **`www.makalive.stream`** serves the same tree.

- Stylesheet build **`dc6d039`** in **`site/maka.css`**
- Absolute stylesheet URLs use **`https://makalive.stream/maka.css?v=dc6d039`**
- Home `<base href>` is **`https://makalive.stream/`** and also preloads `/maka.css?v=dc6d039`
- Checked 7 Nov 2026: `makalive.stream` and `www.makalive.stream` both answer `HTTP/1.1 200` with a valid certificate. `makalive.stream.skydav.work` fails TLS (name mismatch), so public links do not use it.

Handoff summary: **`docs/agent-handoff-tabcast.md`**.

## Public host

Canonical, Open Graph, sitemap, robots, in-app “open home”, and absolute CSS links use **`https://makalive.stream/`**. nginx on **`104.131.164.94`** serves that name directly, so `/maka.css` is the stylesheet (no redirect in front).

An older front stripped every path to a homepage URL, and browsers then parsed `index.html` as CSS (“black Arial MAKA”). That path is not how `makalive.stream` is served. Keep absolute `https://makalive.stream/maka.css?v=…` links so a cached page still requests the stylesheet by the name that has a working certificate.

## Live verification (curl)

```bash
dig +short makalive.stream A
dig +short www.makalive.stream A
# both 104.131.164.94

curl -sI 'https://makalive.stream/' | grep -iE '^(HTTP|content-type)'
curl -sI 'https://www.makalive.stream/' | grep -iE '^(HTTP|content-type)'
curl -sI 'https://makalive.stream/maka.css?v=dc6d039' | grep -iE '^(HTTP|content-type)'
# HTTP/1.1 200 OK
# Content-Type: text/css
```

## nginx on the droplet

Leave the live vhost file **`tabcast.live.skydav.work`** enabled. It is the server block for `makalive.stream` and `www.makalive.stream`. Do not point certbot at `makalive.stream.skydav.work` for this site, and do not reload nginx just to publish HTML.

`site/deploy-site.sh` installs, when you choose to run it:

- `/etc/nginx/sites-available/makalive.stream.skydav.work` (from `site/nginx/makalive.stream.skydav.work.conf`)
- `/etc/nginx/snippets/tabcast-site-cache.conf` (from `site/tabcast-site-cache.conf`) — exact `/maka.css` handling, `text/css`, no SPA fallback for CSS

## Cache bust

When `site/maka.css` changes:

1. Bump `MAKA_CSS_BUILD` comment at top of `site/maka.css`
2. Bump `CSS_BUILD` default in `site/deploy-site.sh`
3. Update every `maka.css?v=` in `site/**/*.html`
4. Redeploy to origin
