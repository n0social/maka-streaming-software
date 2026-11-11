## Maka v0.2.6.2 — Windows streaming software

**Current recommended build.** The installer reports app version **0.2.6**; download this release by tag **v0.2.6.2**.

### What’s new in v0.2.6.2

- **Go Live / WHIP (401 fix)** — MAKArelay requires a valid Bearer token on `POST /whip`. The studio now fetches a **fresh** `relayToken` from `GET /health` immediately before every WHIP publish and teardown, instead of reusing a stale token from an earlier wizard step (**#65**).

### Included from v0.2.6.1

- Go Live / WHIP via main process; stale relay Ready cleared; renderer HTTP fallback (**#61**, **#62**).
- Go Live wizard encode dropdown; **4-step** flow; overlay/chat picker simplification; gameplay overlay preset kept; refresh button alignment (**#63**).

### Core (0.2.6 studio stack)

- Game capture & scenes, MAKArelay on `127.0.0.1:38473`, phone camera/mic add-on, live stream recovery.

### Windows installer

Download **[Maka-Setup-0.2.6.exe](https://github.com/n0social/maka-streaming-software/releases/download/v0.2.6.2/Maka-Setup-0.2.6.exe)** from the assets below, or [makalive.stream/download](https://makalive.stream/download).

**Windows SmartScreen** may warn on unsigned builds — *More info* → *Run anyway* if you trust this release.

### Older tags

**v0.2.6.1** does not include the WHIP Bearer fix. Use **v0.2.6.2** for Go Live with current MAKArelay.
