# Agent handoff: Tabcast marketing site (CSS / wordmark / Caddy)

**Branch:** `cursor/studio-redesign-continue-dc6d` (PR base `main`)

## Problem

Users visiting **`https://tabcast.live`** / **`https://www.tabcast.live`** sometimes see an unstyled hero (“black Arial MAKA”) or stale styling. Root cause on the **45.77.x Caddy** front: apex redirects drop the request path, so `/maka.css` becomes a redirect to the origin **homepage**; browsers treat `index.html` as CSS and discard it.

Site **source of truth** for HTML/CSS is this repo under `site/`. **Origin** nginx on **`104.131.164.94`** serves `/opt/tabcast/web` (`tabcast.live.skydav.work`). Repo fixes are deployed; **Caddy on the public apex is still wrong** until someone with access to the 45.77 host applies the `{uri}` redirect (see `docs/site-deploy.md`).

## Fixes already in repo

| Commit | Summary |
| --- | --- |
| `e4cc8e2` | Absolute `maka.css` URLs on origin, `<base href>`, critical inline CSS on home, nginx `location ~ ^/maka\.css`, deploy runbook started |
| `a4eee92` | Wordmark **35°** cream/Mikado split, holographic foil shimmer restored; cache bust **`dc6d035`**; removed duplicate wordmark gradient from inline critical CSS so `maka.css` wins |

**Current CSS build id:** `dc6d035` (`site/maka.css`, `site/deploy-site.sh`, all `maka.css?v=` in HTML).

## Blocker (production)

Live check (Oct 2026): `curl -sI 'https://www.tabcast.live/maka.css?v=TEST'` returns `location: https://tabcast.live.skydav.work/` (**path stripped**). Origin direct URL works: `https://tabcast.live.skydav.work/maka.css?v=dc6d035` → `200 text/css`.

**Next agent:** fix Caddy on 45.77.x, then redeploy origin if needed, then verify apex + www curls in `docs/site-deploy.md`.

## SSH / deploy

- Droplet: **`root@104.131.164.94`**, hostname `skydav`, web root **`/opt/tabcast/web`**
- Deploy: rsync `site/` → `/opt/tabcast/site-src/`, run `deploy-site.sh` (full commands in `docs/site-deploy.md`)
- Cloud agents: `.cursor/environment.json` installs `openssh-client`, `npm ci`, and `known_hosts` for the droplet. **SSH private key** must come from Cursor Cloud Agent secrets / authorized key on the droplet — never commit keys.

Verify SSH (no password prompt):

```bash
ssh -o BatchMode=yes root@104.131.164.94 'hostname && ls /opt/tabcast/web/index.html'
```

## Read first

1. **`docs/agent-handoff-tabcast.md`** (this file) — context
2. **`docs/site-deploy.md`** — deploy + Caddy + verification curls
3. **`site/maka.css`** — wordmark / foil (search `maka-wordmark`)
4. **`site/index.html`** — hero markup + critical inline fallback CSS
