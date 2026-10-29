# Maka static site deploy

Consolidated runbook for marketing HTML, `maka.css`, downloads, `/stream/`, and `/preview/`.

Public site: **[https://makalive.stream](https://makalive.stream)**.

## Architecture

| Layer | Host | Role |
| --- | --- | --- |
| **Public site** | `makalive.stream`, `www.makalive.stream` | nginx on the origin droplet |
| **Origin files** | DO droplet **`104.131.164.94`** | nginx serves **`/opt/tabcast/web`** |

The previous origin hostname stays in `server_name` inside `site/nginx/tabcast.live.skydav.work.conf` so old links keep resolving. Do not drop it from that file. User-facing pages and this runbook send people to https://makalive.stream.

Deploy target user: **`root@104.131.164.94`** (hostname `skydav`).

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

### Console one-liner (no private key in Cursor secrets)

If you deploy from a Cloud Agent without `SKYDAV_SSH_PRIVATE_KEY_B64`, the agent can generate an **ephemeral** key on the VM and print a droplet-console snippet:

```bash
bash scripts/skydav-print-console-snippet.sh
```

Paste the printed line into **DigitalOcean → Droplet (104.131.164.94) → Access → Launch Droplet Console** as **root**. That appends the agent’s **public** key to `/root/.ssh/authorized_keys`. Then the agent runs `bash scripts/skydav-deploy-site.sh`.

Re-run the print script on a **new** agent VM (each run gets a new key unless the same VM is reused).

## Deploy to origin (104.131.164.94)

From repo root, on a machine with SSH to the droplet:

```bash
rsync -avz --delete \
  --exclude '.git' \
  ./site/ root@104.131.164.94:/opt/tabcast/site-src/
ssh root@104.131.164.94 'WEB_ROOT=/opt/tabcast/web bash /opt/tabcast/site-src/deploy-site.sh'
```

`site/deploy-site.sh` copies assets into `/opt/tabcast/web`, installs nginx site + cache snippet, reloads nginx. Default CSS cache bust: **`CSS_BUILD=dc6d038`** (override with env if needed).

From a Cloud Agent with `SKYDAV_SSH_PRIVATE_KEY_B64` configured:

```bash
bash scripts/skydav-deploy-site.sh
```

## Branch / repo state (studio redesign)

Wordmark and foil live in **`site/maka.css`**. Do not strip the holographic foil or the cream/gold wordmark when editing the site.

- HTML uses absolute stylesheet URLs to **`https://makalive.stream/maka.css?v=dc6d038`**
- Home has critical inline CSS fallback if external CSS fails; wordmark colors/foil are in `maka.css`
- If an older front proxy strips the request path, `/maka.css` can be served as HTML and the hero looks unstyled. Absolute stylesheet URLs on makalive.stream avoid that

Handoff summary: **`docs/agent-handoff-maka.md`**.

## Older public hostnames — preserve `{uri}`

If a front proxy still accepts the previous apex names, redirects must keep the path **and** query, and the target is the public site:

```caddy
# previous apex names, kept so old links resolve
tabcast.live, www.tabcast.live {
	redir https://makalive.stream{uri} permanent
}
```

Avoid `handle_path` or a single target URL without `{uri}`. A redirect to the homepage only makes browsers load `index.html` as the stylesheet.

## Live verification (curl)

**Public CSS (should pass after deploy):**

```bash
curl -sI 'https://makalive.stream/maka.css?v=dc6d038' | grep -iE '^(HTTP|content-type)'
# HTTP/1.1 200 OK
# Content-Type: text/css
```

## nginx on origin

`site/deploy-site.sh` installs:

- `/etc/nginx/sites-available/tabcast.live.skydav.work` (from `site/nginx/tabcast.live.skydav.work.conf`)
- `/etc/nginx/snippets/tabcast-site-cache.conf` (from `site/tabcast-site-cache.conf`) — exact `/maka.css` handling, `text/css`, no SPA fallback for CSS
- `/etc/nginx/snippets/tabcast-downloads.conf` (from `site/tabcast-downloads.conf`)

`server_name` in that site file includes `makalive.stream`, `www.makalive.stream`, and the previous origin hostname.

## Cache bust

When `site/maka.css` changes:

1. Bump `MAKA_CSS_BUILD` comment at top of `site/maka.css`
2. Bump `CSS_BUILD` default in `site/deploy-site.sh`
3. Update every `maka.css?v=` in `site/**/*.html`
4. Redeploy to origin
