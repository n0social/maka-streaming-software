# Agent handoff: Maka marketing site (CSS / wordmark)

## Problem

The public site is **[https://makalive.stream](https://makalive.stream)**. Visitors sometimes saw an unstyled hero (“black Arial MAKA”) when a front proxy dropped the request path, so `/maka.css` became a redirect to the homepage. Browsers then treated `index.html` as CSS and discarded it.

Site **source of truth** for HTML/CSS is this repo under `site/`. **Origin** nginx on **`104.131.164.94`** serves `/opt/tabcast/web`. Stylesheet links in HTML point at `https://makalive.stream/maka.css`.

## Fixes already in repo

| Commit | Summary |
| --- | --- |
| `e4cc8e2` | Absolute `maka.css` URLs, `<base href>`, critical inline CSS on home, nginx `location ~ ^/maka\.css`, deploy runbook started |
| `a4eee92` | Wordmark **35°** cream/Mikado split, holographic foil shimmer restored; removed duplicate wordmark gradient from inline critical CSS so `maka.css` wins |
| foil follow-up | Foil: drop `mask-image` on `::before` (fought `background-clip: text` → invisible foil); use `clip-path` for upper split; restore critical inline gradient so fallback is not plain black |

Keep the foil and wordmark in `site/maka.css`. Current CSS query is **`dc6d038`**.

## SSH / deploy

- Droplet: **`root@104.131.164.94`**, hostname `skydav`, web root **`/opt/tabcast/web`**
- Public URL: **https://makalive.stream**
- Deploy: rsync `site/` → `/opt/tabcast/site-src/`, run `deploy-site.sh` (full commands in `docs/site-deploy.md`)
- nginx `server_name` still includes the previous origin hostname next to `makalive.stream`. Leave that name in the nginx file.
- Cloud agents: `.cursor/environment.json` installs `openssh-client`, `npm ci`, and `known_hosts` for the droplet. **SSH private key** must come from Cursor Cloud Agent secrets / authorized key on the droplet — never commit keys.

Verify SSH (no password prompt):

```bash
ssh -o BatchMode=yes root@104.131.164.94 'hostname && ls /opt/tabcast/web/index.html'
```

## Read first

1. **`docs/agent-handoff-maka.md`** (this file) — context
2. **`docs/site-deploy.md`** — deploy and verification curls
3. **`site/maka.css`** — wordmark / foil (search `maka-wordmark`)
4. **`site/index.html`** — hero markup + critical inline fallback CSS
