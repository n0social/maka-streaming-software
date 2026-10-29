# Tabcast / Maka static site deploy

Consolidated runbook for marketing HTML, `maka.css`, downloads, `/stream/`, and `/preview/`.

## Architecture

| Layer | Host | Role |
| --- | --- | --- |
| **Public apex** | `tabcast.live`, `www.tabcast.live` (Caddy on **45.77.x**) | TLS + redirect to origin; **must preserve `{uri}`** |
| **Origin** | `tabcast.live.skydav.work` on DO droplet **`104.131.164.94`** | nginx serves **`/opt/tabcast/web`** |

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

## Deploy to origin (104.131.164.94)

From repo root, on a machine with SSH to the droplet:

```bash
rsync -avz --delete \
  --exclude '.git' \
  ./site/ root@104.131.164.94:/opt/tabcast/site-src/
ssh root@104.131.164.94 'WEB_ROOT=/opt/tabcast/web bash /opt/tabcast/site-src/deploy-site.sh'
```

`site/deploy-site.sh` copies assets into `/opt/tabcast/web`, installs nginx site + cache snippet, reloads nginx. Default CSS cache bust: **`CSS_BUILD=dc6d036`** (override with env if needed).

From a Cloud Agent with `SKYDAV_SSH_PRIVATE_KEY_B64` configured:

```bash
bash scripts/skydav-deploy-site.sh
```

## Branch / repo state (studio redesign)

On **`cursor/studio-redesign-continue-dc6d`**:

- Wordmark: **35°** cream/Mikado Yellow split + holographic foil in **`site/maka.css`** (build **`dc6d035`**)
- HTML uses absolute stylesheet URLs to **`https://tabcast.live.skydav.work/maka.css?v=dc6d035`**
- Home has critical inline CSS fallback if external CSS fails; wordmark colors/foil are **only** in `maka.css` (commit `a4eee92`)
- Apex CSS breakage when Caddy strips paths: mitigated in repo by absolute origin URLs + inline fallback; **still broken for relative `/maka.css` on www** until Caddy is fixed

Key commits: **`e4cc8e2`** (Caddy/path/nginx), **`a4eee92`** (wordmark 35° + foil).

Handoff summary: **`docs/agent-handoff-tabcast.md`**.

## Caddy on 45.77.x (tabcast.live / www) — preserve `{uri}`

**Root cause of “black Arial MAKA”:** apex/www redirects that send every path to `https://tabcast.live.skydav.work/` (homepage only). Browsers then load **`index.html` as the stylesheet** when `/maka.css` (or cached relative URL) hits Caddy (MIME mismatch → stylesheet discarded → unstyled hero).

Required Caddy v2 redirect (path **and** query preserved):

```caddy
tabcast.live, www.tabcast.live {
	redir https://tabcast.live.skydav.work{uri} permanent
}
```

Avoid `handle_path` or a single target URL without `{uri}`.

After editing on the **45.77.x** host:

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

## Live verification (curl)

**Origin CSS (should pass after deploy):**

```bash
curl -sI 'https://tabcast.live.skydav.work/maka.css?v=dc6d036' | grep -iE '^(HTTP|content-type)'
# HTTP/1.1 200 OK
# Content-Type: text/css
```

**Apex redirect must preserve path (often failing until Caddy fix):**

```bash
curl -sI 'https://www.tabcast.live/maka.css?v=TEST' | grep -i location
# WANT: location: https://tabcast.live.skydav.work/maka.css?v=TEST
# BAD:  location: https://tabcast.live.skydav.work/
```

As of last agent check, www still returned the **BAD** location (path stripped). Re-run after Caddy reload.

**Homepage redirect chain:**

```bash
curl -sI 'https://tabcast.live/' | grep -i location
# Typically redirects to www, then Caddy → origin
```

## nginx on origin

`site/deploy-site.sh` installs:

- `/etc/nginx/sites-available/tabcast.live.skydav.work` (from `site/nginx/tabcast.live.skydav.work.conf`)
- `/etc/nginx/snippets/tabcast-site-cache.conf` (from `site/tabcast-site-cache.conf`) — exact `/maka.css` handling, `text/css`, no SPA fallback for CSS

## Cache bust

When `site/maka.css` changes:

1. Bump `MAKA_CSS_BUILD` comment at top of `site/maka.css`
2. Bump `CSS_BUILD` default in `site/deploy-site.sh`
3. Update every `maka.css?v=` in `site/**/*.html`
4. Redeploy to origin
