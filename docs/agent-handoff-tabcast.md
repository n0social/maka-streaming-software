# Agent handoff: Tabcast marketing site (CSS / wordmark / Caddy)

**Branch:** `cursor/studio-redesign-continue-dc6d` (PR base `main`)

## Problem

An older public front dropped the request path, so `/maka.css` redirected to the homepage and browsers treated `index.html` as CSS (“black Arial MAKA”).

The public site host is now **`https://makalive.stream`** and **`https://www.makalive.stream`**. Both names resolve to **`104.131.164.94`**, where nginx serves `/opt/maka/web` (`/opt/tabcast` → `/opt/maka`) with a certificate that includes those names. Checked 7 Nov 2026: HTTPS on both names returns `200`. **`makalive.stream.skydav.work`** is the same IP but TLS fails (certificate name mismatch). Canonical, Open Graph, sitemap, and absolute CSS URLs use `https://makalive.stream/`.

Site **source of truth** for HTML/CSS is this repo under `site/`. See `docs/site-deploy.md`. Do not rename the live vhost file `tabcast.live.skydav.work` or its certificate directory; that block’s `server_name` already includes `makalive.stream` and `www.makalive.stream`.

## Fixes already in repo

| Commit | Summary |
| --- | --- |
| `e4cc8e2` | Absolute `maka.css` URLs on origin, `<base href>`, critical inline CSS on home, nginx `location ~ ^/maka\.css`, deploy runbook started |
| `a4eee92` | Wordmark **35°** cream/Mikado split, holographic foil shimmer restored; cache bust **`dc6d035`**; removed duplicate wordmark gradient from inline critical CSS so `maka.css` wins |

**Current CSS build id:** `dc6d039` (`site/maka.css`, `site/deploy-site.sh`, all `maka.css?v=` in HTML).

## Production check

`curl -sI 'https://makalive.stream/maka.css?v=dc6d039'` and the same URL on `www.makalive.stream` should return `200` and `Content-Type: text/css`. Publish HTML by copying the site tree to `/opt/maka/web`. Do not touch `/var/www/portfolio`.

## SSH / deploy

- Droplet: **`root@104.131.164.94`**, hostname `skydav`, web root **`/opt/maka/web`** (`/opt/tabcast` → `/opt/maka`)
- Deploy HTML by copying the site tree into `/opt/maka/web`. Full commands, including the nginx-reloading script, are in `docs/site-deploy.md`. Do not touch `/var/www/portfolio`.
- Cloud agents: `.cursor/environment.json` installs `openssh-client`, `npm ci`, and `known_hosts` for the droplet. **SSH private key** must come from Cursor Cloud Agent secrets / authorized key on the droplet — never commit keys.

Verify SSH (no password prompt):

```bash
ssh -o BatchMode=yes root@104.131.164.94 'hostname && ls /opt/tabcast/web/index.html'
```

## Read first

1. **`docs/agent-handoff-tabcast.md`** (this file) — context
2. **`docs/site-deploy.md`** — public host `makalive.stream`, deploy, verification curls
3. **`site/maka.css`** — wordmark / foil (search `maka-wordmark`)
4. **`site/index.html`** — hero markup + critical inline fallback CSS
