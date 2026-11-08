# Maka → dedicated DigitalOcean droplet (migration runbook)

**Status:** docs + skydav funnel prepared. Live traffic **not** cut over. Do **not** delete `/opt/maka` on skydav. **New droplet comes later — do not migrate yet.**

**Portfolio (stays on skydav):** `skydav.work` / `skydav-portfolio` keeps a **Download** link to `https://makalive.stream/download.html` (no large installer copies under the portfolio tree). Full Maka origin (studio + downloads + signaling) moves to the new droplet later; the portfolio link keeps working across that cutover.

**Goal:** move **all** Maka code (static site, signaling, future relay) onto a new DO droplet. After cutover, `makalive.stream.skydav.work` (and any `*.skydav.work` Maka host) becomes a **cream/gold hero funnel** that sends streamers to `https://makalive.stream/`. Apex `makalive.stream` DNS points at the **new** droplet IP.

---

## Skyler checklist (short)

1. Create the new DO droplet (see sizing below) → note the **public IPv4**.
2. Reply to the agent / chat with that IP (SSH key + firewall next).
3. Point `makalive.stream` (+ `www` if used) **A** records to the new IP (TTL low first).
4. On new droplet: install nginx, certbot, Node 22, pm2; rsync `/opt/maka`; start signaling; issue TLS.
5. Smoke-test `https://makalive.stream/` (site + `/ws` + downloads).
6. On skydav only: deploy `site/skydav-funnel/` for the skydav hostname(s) — keep `/opt/maka` intact as backup until stable.
7. Remove `makalive.stream` / `www.makalive.stream` from skydav nginx `server_name` once DNS + TLS are confirmed on the new box.
8. Do **not** tear down skydav `/opt/maka` until the new origin has been healthy for a while.

---

## Inventory snapshot (skydav `104.131.164.94`, 2026-11-08)

| Item | Value |
| --- | --- |
| Host | `skydav` — Ubuntu, ~961 MiB RAM, 24G disk (~20G used / 4.2G free) |
| Tree | `/opt/maka` **~1.3G**; `/opt/tabcast` → `/opt/maka` |
| Web | `/opt/maka/web` **~1.1G** (almost all `/downloads/*.exe`, ~1.1G) |
| Signaling | pm2 `tabcast-signaling` → `/opt/tabcast/apps/signaling/dist/index.js`, port **3001**, Node 22 |
| Other pm2 | `skydav-portfolio` on **:3000** (unrelated; stays on skydav) |
| nginx | Site `makalive.stream.skydav.work` also serves `makalive.stream` + `www.makalive.stream`; root `/opt/maka/web`; `/ws` + API → `127.0.0.1:3001`; TLS under `/etc/letsencrypt/live/makalive.stream.skydav.work/` |
| Certbot / nginx / node / pm2 | Present; **ufw inactive** |
| Env keys (signaling `.env`) | `NODE_ENV`, `SIGNALING_PORT`, `SIGNALING_HOST`, `SQLITE_PATH`, `JWT_SECRET`, `WS_ORIGIN_ALLOWLIST`, `PUBLIC_WS_URL`, `NODE_OPTIONS` — copy privately; do not commit |

Nothing was deleted on skydav during this inventory.

---

## What fits on ~$4 vs recommended size

DigitalOcean Basic Droplets (bundled, as of late 2026 pricing page):

| Plan | RAM | vCPU | SSD | Notes |
| --- | --- | --- | --- | --- |
| **$4/mo** | 512 MiB | 1 | **10 GiB** | Real current entry plan — not only “legacy promo.” Too tight for full Maka: OS + node + nginx + **~1.1G downloads** already blows past comfortable headroom; apt upgrades and TLS renewals will hurt. |
| **$6/mo** | **1 GiB** | 1 | **25 GiB** | **Smallest viable for all Maka code** (site + signaling + installers). Matches today’s skydav RAM class; leave swap on. |
| $12/mo | 2 GiB | 1 | 50 GiB | Comfort if you add a relay process or keep multiple installer generations. |

**Recommendation:** create the **$6 Basic (1 GiB / 1 vCPU / 25 GiB)** unless you are only hosting a static funnel (then $4 can work). If the UI still shows an old “$4 for 1GB” SKU in your account, take it — that is leftover pricing; new accounts usually see $4 = 512 MiB / 10 GiB.

Also add a **2 GiB swapfile** on the new box (skydav already relies on swap).

---

## A. Create the droplet (you)

1. DigitalOcean → Create → Droplets.
2. Region: prefer same/nearby as current (`104.131.164.94` / NYC-class if that is where skydav lives).
3. Image: **Ubuntu 24.04 LTS**.
4. Size: **Basic $6 (1 GiB)** as above.
5. Auth: add your SSH key **and** the Cloud Agent deploy key if agents should keep deploying.
6. Hostname e.g. `maka` / `makalive`.
7. Create → copy **public IPv4** → send it so cutover scripting can continue.

No DO API token was available in the agent environment; provisioning is left to you.

---

## B. DNS (after droplet exists)

1. Lower TTL on `makalive.stream` / `www.makalive.stream` (e.g. 60–300s) ahead of time if possible.
2. Set **A** records for `makalive.stream` and `www.makalive.stream` → **new droplet IP**.
3. Leave `makalive.stream.skydav.work` on **104.131.164.94** (funnel after cutover).
4. Wait for propagation (`dig +short makalive.stream`) before expecting certbot HTTP-01 to succeed on the new box.

---

## C. New droplet bootstrap (outline)

```bash
# as root on NEW droplet
apt update && apt upgrade -y
apt install -y nginx certbot python3-certbot-nginx ufw curl git

# Node 22 (match skydav)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm i -g pm2

# Swap (2G)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Firewall: SSH + HTTP/HTTPS only
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
# Do NOT expose 3001 publicly — nginx proxies /ws
```

### Copy `/opt/maka` from skydav

From a machine that can SSH both hosts (or from skydav):

```bash
# On NEW droplet first:
mkdir -p /opt/maka

# From skydav (or via jump):
rsync -aHAX --info=progress2 \
  /opt/maka/ root@NEW_IP:/opt/maka/

# Optional convenience symlink (matches current layout):
ssh root@NEW_IP 'ln -sfn /opt/maka /opt/tabcast'
```

Preserve `apps/signaling/.env` permissions (`chmod 600`). Update on the new host:

- `WS_ORIGIN_ALLOWLIST` — include `https://makalive.stream` (and www if needed)
- `PUBLIC_WS_URL` — e.g. `wss://makalive.stream/ws`
- `SIGNALING_HOST=127.0.0.1` / `SIGNALING_PORT=3001` as today

### pm2 signaling

```bash
cd /opt/maka/apps/signaling   # or /opt/tabcast/apps/signaling
pm2 start dist/index.js --name tabcast-signaling --node-args='--env-file=.env'
pm2 save
pm2 startup
```

### nginx + TLS on new droplet

- Adapt `site/nginx/makalive.stream.skydav.work.conf` (live skydav also lists `makalive.stream` / `www` in `server_name`).
- `root /opt/maka/web;`
- Include download + cache snippets from `/etc/nginx/snippets/` (copy from skydav or from deploy scripts).
- Proxy `/ws` and `/(auth|rooms|admin|billing|webhooks|health)` → `127.0.0.1:3001`.
- Issue certs: `certbot --nginx -d makalive.stream -d www.makalive.stream`
- `nginx -t && systemctl reload nginx`

### Smoke tests

- `curl -I https://makalive.stream/`
- `curl -I https://makalive.stream/maka.css`
- Open studio/stream paths that need `/ws`
- Download installer URL once

---

## D. Skydav after cutover — funnel only (do not delete `/opt/maka`)

Repo path: **`site/skydav-funnel/`** — minimal cream/gold MAKA hero with CTAs to:

- Stream → `https://makalive.stream/stream/`
- Download → `https://makalive.stream/` (or direct installer URL on apex)

**No** full studio, **no** `/stream` SPA, **no** signaling proxy required on skydav for Maka after cutover.

### Deploy options

**Option 1 — separate small root (preferred):**

```bash
mkdir -p /opt/maka-funnel
rsync -av ./site/skydav-funnel/ root@104.131.164.94:/opt/maka-funnel/
```

Point the skydav Maka `server_name` (`makalive.stream.skydav.work` only) `root` at `/opt/maka-funnel`. Remove `makalive.stream` / `www.makalive.stream` from that server block once DNS no longer hits skydav.

**Option 2 — replace `/opt/maka/web` contents for the skydav host only:** copy funnel `index.html` over the live web root **after** apex traffic is on the new droplet. Keep a backup tarball of `/opt/maka/web` first. Still do **not** delete `/opt/maka` tree (signaling backup, downloads archive).

Sample nginx idea:

```nginx
server {
    server_name makalive.stream.skydav.work;
    root /opt/maka-funnel;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    # TLS: keep existing makalive.stream.skydav.work cert
}
```

---

## E. Explicit non-goals (this pass)

- Do **not** create the DO droplet from the agent without a clear API token.
- Do **not** migrate live traffic yet.
- Do **not** tear down `/opt/maka` or stop `tabcast-signaling` on skydav until the new origin is verified.
- Do **not** move `skydav-portfolio` off skydav — only ensure it links to Maka download on `makalive.stream`.
- Do **not** replace full studio on `makalive.stream` with the thin funnel while apex still originates here.

### Funnel host note (`makalive.stream.skydav.work`)

As of 2026-11-08, nginx on skydav has **no** `server_name` for `makalive.stream.skydav.work`. `makalive.stream.skydav.work` (+ `makalive.stream` / `www`) already serves `/opt/maka/web` (full studio). Deploy `site/skydav-funnel/` only after cutover (or after adding a dedicated funnel vhost); do not overwrite `/opt/maka/web` with the funnel while `makalive.stream` still points here.

---

## Blocked on

**New droplet public IPv4** — once Skyler creates the $6 (recommended) droplet and pastes the IP, continue with SSH hardening, rsync, pm2, nginx/certbot, and DNS cutover assistance.
