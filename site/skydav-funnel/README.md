# Skydav Maka funnel

Minimal cream/gold hero for **`makalive.stream.skydav.work`** (and any leftover Maka hostname still on the skydav droplet) **after** apex traffic moves to the dedicated Maka droplet.

- CTAs: **Stream** → `https://makalive.stream/stream/`, **Download** → `https://makalive.stream/`
- No studio SPA, no signaling proxy, no downloads tree
- Self-contained `index.html` (inline CSS + fonts)

## When to deploy

**Only after** `makalive.stream` DNS + TLS work on the **new** droplet. Until then, leave skydav serving the full `/opt/maka/web` origin.

There is **no** nginx `server_name` for `makalive.stream.skydav.work` on skydav today (`tabcast.live.skydav.work` + `makalive.stream` share `/opt/maka/web`). Do **not** deploy this funnel over that root while apex still originates here.

See **`docs/maka-droplet-migration.md`** for the full cutover checklist.

## Suggested root (do not delete `/opt/maka`)

```bash
rsync -av ./site/skydav-funnel/ root@104.131.164.94:/opt/maka-funnel/
```

Point the skydav Maka nginx `server_name` at `/opt/maka-funnel` and drop `makalive.stream` / `www.makalive.stream` from that server block once DNS no longer hits skydav.
