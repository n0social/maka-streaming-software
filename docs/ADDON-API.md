# Maka Addon API v1

Manifest: `maka-addon.json` in `%APPDATA%/Maka/addons/<folder>/`

## API version

`apiVersion: 1` (see `src/shared/addon-api.ts`)

## Permissions

| Permission | Purpose |
|------------|---------|
| `ui.toast` | Show messages in the studio hint area |
| `ui.external` | Open HTTPS links in the system browser |
| `scene.layout` | Apply scene templates / layout actions |
| `scene.overlay` | HTML overlay on program (future) |
| `browse.tabs.read` | Read active browse tab URL/title (future) |
| `relay.config.read` | Read relay profile (future) |
| `relay.config.write` | Write relay config — user confirm required (future) |
| `network.fetch` | HTTPS fetch from main process (sandboxed runtime + live hooks) |
| `live.events` | Subscribe to go-live / end-live / app.ready |
| `device.phone-pair` | LAN phone QR pairing (`com.maka.phone-cam` only): get/refresh/unpair + status updates |

## Declarative actions (v1)

Sidebar panels declare actions in `contributes.sidebarPanels`:

- `message` — requires `ui.toast`
- `open-url` — requires `ui.external`, HTTPS only
- `scene-template` — requires `scene.layout`, references built-in template id

## Sandboxed runtime (v1.1 — shipped 0.3.6)

Addons with `"entry": "index.html"` load in a **sandboxed webview** in the Addons sidebar.

### Protocol

Addon pages load from `maka-addon://<addon-id>/<file>` — served only from the installed addon folder (path traversal blocked).

### Preload bridge

Each webview uses `addon-bridge` preload exposing:

```javascript
window.maka.addons.getInfo()       // → { id, name, version, apiVersion }
window.maka.addons.toast(message)  // requires ui.toast
window.maka.addons.fetch(url, init) // requires network.fetch, HTTPS only
window.maka.addons.getSettings()
window.maka.addons.setSettings(partial)
window.maka.addons.openExternal(url) // requires ui.external
window.maka.addons.onLiveEvent(handler) // requires live.events hook
window.maka.addons.getPhonePair()       // requires device.phone-pair
window.maka.addons.refreshPhonePair()   // requires device.phone-pair
window.maka.addons.unpairPhone()        // requires device.phone-pair
window.maka.addons.onPhonePairUpdate(handler) // requires device.phone-pair
```

Pair URLs come from the main process; addons must not bind port `38474` themselves.

### Live hooks

| Hook | When fired |
|------|------------|
| `app.ready` | Relay reaches ready/live |
| `live.start` | WHIP session started |
| `live.end` | WHIP session ended |

Declarative addons with `live.events` + `network.fetch` can also use main-process Discord webhooks via settings.

Settings path: `%APPDATA%/Maka/addons/<folder>/settings.json`

## Marketplace

The marketplace is **developer-curated** (not user submissions). See [community-implementations.md](../community-implementations.md).

Bundled catalog: `src/shared/marketplace-catalog.ts`

Remote feed (optional): `https://tabcast.live.skydav.work/marketplace.json` — merged with bundled entries, cached 1h.

Install copies manifest + optional `files` to user addons folder.

**Try it:** Install **Hello Maka** from marketplace — sandboxed panel with toast button.

## Next (v1.2)

- Encrypted addon settings (OS keychain)
- `browse.tabs.read` in runtime bridge
- Signed remote catalog
