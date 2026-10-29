# Maka — Level 2: Production Readiness

**Version baseline:** 0.2.0  
**Last reviewed:** 2026-08-28  
**Scope:** Error pass, security hardening, and roadmap to ship Maka beyond the v0.2 early release.

---

## Executive summary

Maka is a functional Windows desktop app (Chromium studio + local WHIP relay) for **streamers who want a self-contained capture and go-live stack**. It is **not yet production-ready** for broad public distribution without addressing code signing, auto-update, onboarding, and several UX/reliability gaps documented below.

This document captures what was hardened in the latest pass, what still fails or risks failure, and a prioritized path to a trustworthy v1.0.

---

## Error pass (2026-08-28)

### Fixed in 0.2.1 (latest)

| Item | Change |
|------|--------|
| Encode profile persistence | `profile-select` change → `setSettings({ bitrateProfile })` |
| Quit cleanup | `before-quit` → renderer WHIP teardown → `relay.stop()` |
| `openChatOnBrowse` | Wired in `setAppMode()` + Settings checkbox; channel-aware Twitch chat URL |
| `browser:title` IPC | Emitted from `browse-tabs.ts` on navigate/title update |
| Relay SHA-256 at runtime | `relaySha256Error()` in `relay.ts` when manifest present |
| Manifest pipeline | `fetch-relay.mjs` writes `relay-manifest.json`; `verify.mjs` reads size from manifest |
| IPC sender validation | Settings + sensitive browser handlers require studio webContents |
| Browse list safety | Removed `!` non-null assertion in `list()` |

### Fixed in prior pass

| Item | Change |
|------|--------|
| TypeScript permission error | `display-capture` handled via `String(permission)` + `isStudioMediaPermission()` in `src/main/security.ts` |
| Missing bridge methods | Added `openStream` / `openHome` to preload + IPC (`shell:open-stream`, `shell:open-home`) for `shell.ts` |
| IPC input validation | Settings coerced via `coerceSettings()`; tab/preset IDs validated before activate/close/open |
| Browse navigation hardening | `will-navigate` + **`will-redirect`** guards on browse views and chat pop-out |
| Session sanitization | `loadSession()` drops malformed tab IDs and blocked URLs via `sanitizeSavedTabs()` |
| Settings sanitization | `loadSettings()` merges through `coerceSettings()` on every read |
| URL logic de-duplicated | Shared module `src/shared/browse-url.ts` (avoids circular imports) |
| Single-instance lock | Second launch focuses existing window instead of spawning duplicate relays |
| Studio CSP | Content-Security-Policy meta on `app.html` and `shell.html` |
| Verify offline mode | `node scripts/verify.mjs --offline` skips live relay HTTP checks |

### Verification status

```
npm run typecheck   ✅ PASS
npm run build       ✅ PASS
npm run verify -- --offline   ✅ PASS (relay HTTP checks skipped when relay not running)
```

Run full verify with relay running: `npm run verify` (no `--offline`).

### Fixed in 0.2.2 (onboarding)

| Item | Change |
|------|--------|
| First-run tour | Grey overlay + gold spotlight + pointer cards at 8 core UI areas |
| Replay tour | Settings → “Replay onboarding tour” |
| `onboardingComplete` | Persisted in settings; skip/finish both mark complete |

### Fixed in 0.2.2 (hardening pass)

| Item | Change |
|------|--------|
| IPC studio guard | All sensitive handlers require studio webContents (`ipc-guards.ts`) |
| IPC try/catch | Relay, capture list, diagnostics verify wrapped with `ipcTry` + logging |
| Input sanitization | Navigate/chat URLs clamped; browse new-tab uses `normalizeBrowseUrl` |
| WHIP auto-reconnect | Up to 2 retries on `failed`/`disconnected` |
| Capture track ended | Program source `onended` clears UI and browse capture pin |
| Platform status chips | Twitch/YouTube badges from relay `platforms` when live |
| Relay fetch timeouts | 8s `AbortSignal` on all relay-client requests |

### Fixed in 0.3.5 (addon runtime)

| Item | Change |
|------|--------|
| `live.start` / `live.end` hooks | Main-process dispatch on go-live / end-live |
| Discord webhook addon | Settings + POST embed when webhook configured |
| Remote marketplace feed | Fetch + cache with bundled fallback |
| Addon IPC hardening | `isValidAddonId` / `isValidCatalogId`, `ipcTry` on all mutating handlers |
| Addon settings | Per-addon `settings.json` with Discord webhook validation |

### Fixed in usage pass (0.3.5)

| Item | Change |
|------|--------|
| Custom RTMP / Kick addon | Destinations row + settings persistence + relay `/config` fields |
| Browser layer overlay | Separate `browserStream` + WHIP `browser` track + program preview |
| WGC capture path | `setDisplayMediaRequestHandler` + `getDisplayMedia` for screen picks |
| YouTube live chat | `chatUrlFromBrowse()` for YT watch/studio; `pin-yt-chat` preset |
| Remote marketplace | JSON validation, multi-URL fetch, `site/marketplace.json` export script |

### Fixed in 0.3.6 (addon runtime)

| Item | Change |
|------|--------|
| Sandboxed webview runtime | `maka-addon://` protocol + per-addon webview in sidebar |
| `maka.addons` bridge | Preload API: toast, fetch, settings, openExternal, onLiveEvent |
| Live event broadcast | `app.ready`, `live.start`, `live.end` pushed to runtime webviews |
| Hello Maka sample | Marketplace installable demo with UI panel |

### Open bugs / error risks (remaining)

| Priority | Issue | Location | Impact |
|----------|-------|----------|--------|
| **P2** | Main window `sandbox: false` | `index.ts` | Higher renderer compromise blast radius |
| **P2** | Separate gameplay + browse overlay tracks | `whip.ts` / relay | Browser layer shares gameplay track today |
| **P3** | `shell.html` not in Vite inputs | `electron.vite.config.ts` | Orphan relay panel |
| **P3** | Site version strings hardcoded | `site/*.html` | Manual bump every release |

---

## Hardening applied

### Security

| Control | Status | Notes |
|---------|--------|-------|
| Browse URL scheme filter | ✅ | HTTP/HTTPS only; blocks `file:`, `javascript:`, etc. |
| Blocked host suffixes | ✅ | `skydav.work` / `skydav.com` in `src/shared/tabcast.ts` |
| Redirect blocking | ✅ | `will-redirect` on browse + chat windows |
| IPC payload validation | ✅ | Settings, tab IDs, preset IDs |
| Persisted session scrub | ✅ | Bad URLs/IDs stripped on load |
| Studio CSP | ✅ | Restricts scripts, frames, connect-src to self + localhost relay |
| Single-instance lock | ✅ | Prevents duplicate relay sidecars |
| Chat pop-out navigation | ✅ | Same allowlist as browse tabs |

### Still open (security)

| Gap | Risk | Recommendation |
|-----|------|----------------|
| Main window `sandbox: false` | Higher renderer compromise blast radius | Enable sandbox when preload surface allows; audit node APIs |
| No IPC sender validation | Any frame could invoke handlers | Check `event.sender` against known webContents IDs |
| Broad default-session media permissions | All frames on default session get capture | Scope permissions to studio webContents only |
| `neutralizeInstalledRelayConfig()` on boot | Overwrites the local relay `relay-config.json` beside the encoder install | Make opt-in or version-gated; document for IT |
| Port 38473 kill via PowerShell | Could kill unrelated listener | PID-file or relay-owned lock instead of port sweep |
| Stream keys in renderer DOM | Keys in memory in UI process | OS keychain / relay-only key entry for v1 |
| Google search fallback in browse | Sends classroom queries to Google | Optional: restrict to allowlisted domains only |
| Unsigned installer | SmartScreen warnings | Authenticode signing (see P0 below) |

---

## Production blockers (P0)

These must ship before calling Maka “production ready” for general download.

## Production blockers (P0) — tackle in order

| # | Item | Status |
|---|------|--------|
| 1 | [Code signing](./docs/CODE-SIGNING.md) | **Infra ready** — set `CSC_LINK` + run `npm run dist:signed` |
| 2 | Auto-update | Pending |
| 3 | Onboarding phase 2 | Partial (tour shipped) |
| 4 | CI/CD | Pending |
| 5 | Live session lifecycle | Mostly done |

---

### 1. Code signing (Windows)

- **Today:** Signing pipeline in `scripts/sign-windows.mjs`, `scripts/dist-signed.mjs`; electron-builder signs when `CSC_*` env is set.
- **You need:** OV or EV Authenticode cert (`.pfx`) — see **[docs/CODE-SIGNING.md](./docs/CODE-SIGNING.md)**.
- **Commands:** `npm run dist:signed` · `npm run sign:relay` · `npm run release:manifest`
- **Outcome:** SmartScreen trust, enterprise allow-listing, fewer support tickets.

### 2. Auto-update

- **Today:** `"publish": null`; no `electron-updater`.
- **Need:** GitHub Releases feed (or custom CDN), delta updates optional, in-app “Update available” UX.
- **Wire:** `package.json` `publish`, release workflow, version check on startup (non-blocking).

### 3. First-run onboarding

- **Today:** User lands in Studio with relay offline; errors are CLI-oriented (`npm run fetch:relay`).
- **Need:** Wizard: relay health → permissions test → optional key paste → test capture → Go Live.
- **Files:** New `src/renderer/onboarding.*`, hooks in `index.ts` `createMainWindow()`.

### 4. CI/CD pipeline

- **Today:** No `.github/workflows/`.
- **Need:** On tag — `typecheck` → `build` → `verify --offline` → `dist` → sign → attach to Release.
- **Add:** `npm run dist:ci` = typecheck + build + verify + dist.

### 5. Live session lifecycle

- **Today:** WHIP/relay may survive abrupt quit.
- **Need:** `before-quit` await `relay.stop()` + WHIP `close()`; tray “Stop & Quit” path.

---

## Level 2 improvements (P1)

Ship in the first post-0.2 minor (0.2.x or 0.3.0).

### Reliability

- Runtime relay **SHA-256** verify against `relay-manifest.json` (`relay.ts`).
- WHIP **reconnect** with backoff and user-visible “Reconnecting…” state.
- **`fetch-relay.mjs`** writes manifest after download; **`verify.mjs`** reads manifest size/hash.
- **`before-quit`** awaits relay shutdown; orphan process detection in diagnostics.

### Settings & UX completeness

- Persist **`bitrateProfile`** on `profile-select` change (`app.ts`).
- Wire **`openChatOnBrowse`**: auto `popoutChat()` when entering Browse mode if enabled.
- Emit **`browser:title`** from `browse-tabs.ts` on `page-title-updated`.
- Settings UI: expose missing toggles (chat on browse, profile) in `app.html` dialog.
- Relay download **progress UI** when bundled relay missing/corrupt (instead of terminal instructions).

### Capture

- **WGC fallback** (Windows Graphics Capture) when `desktopCapturer` black-screens — see Integrations.
- Optional **classroom allowlist mode**: browse restricted to `*.twitch.tv`, `*.youtube.com`, `studio.youtube.com`.

### Site & release hygiene

- Single deploy script; **`browser-manifest.json`** drives version/SHA on landing page.
- “Try our browser” CTA → latest GitHub Release (already partially on [makalive.stream](https://makalive.stream)).

---

## Integrations & platform (P2)

### Twitch (partial today)

| Done | Next |
|------|------|
| Pinned directory + chat presets | Channel-aware chat URL from active tab (`/popout/{channel}/chat`) |
| RTMP via relay + manual stream key | Optional Twitch OAuth / Helix for title, category, stream key (where policy allows) |
| Chat pop-out window | Auto-open on Browse when `openChatOnBrowse` enabled |

### YouTube (partial today)

| Done | Next |
|------|------|
| Pinned YT Studio tab | YouTube Live chat pop-out preset |
| Dual-dest RTMP + key verify | Per-platform status in destinations panel (`platforms.twitch` / `platforms.youtube` from relay) |
| Manual stream key | YouTube Live API for stream lifecycle (create broadcast, bind stream) — long-term |

### WGC (Windows Graphics Capture)

- **Not implemented.** Current path: Electron `desktopCapturer` → `getUserMedia` in `app.ts`.
- **Why:** Better performance, fewer black screens with GPU/composited windows.
- **Plan:** Native addon or Electron WGC module → feed `gameplay` track in `whip.ts`; fallback chain WGC → desktopCapturer → guided error UI.
- Tracked in `UPGRADES.md`; target 0.3+.

### Browse-as-source

- Capture active browse tab into WHIP **gameplay** or overlay layer (today browser layer toggle is UI-only).
- Requires `WebContentsView` capture or OS-level window capture of embedded view.

### Scene / relay API

- Webcam layout, layer visibility already POST to `/scene`.
- Extend for browser overlay position, alert widgets, lower-thirds (edu templates).

---

## Launch & education (P3)

- **Lab mode** docs for teachers (keys in RAM, Browse limited to streaming sites, minimize-to-tray while live).
- **Crash/opt-in telemetry** — Sentry or self-hosted; respect FERPA/classroom privacy.
- **macOS / Linux** builds (Electron supports; relay is Windows `.exe` today — blocker for cross-platform).
- **Optional ad/script blocking** in browse while live (`UPGRADES.md`).
- Marketing package refresh per release (`npm run marketing` → `site/` + store assets).

---

## Recommended release sequence

```
0.2.1  ✅ Bugfixes (profile save, quit cleanup, openChatOnBrowse, browser:title, relay SHA, IPC sender checks)
0.2.2  Browse-as-source MVP · dual-dest status UI · scene templates
0.3.0  Onboarding wizard + in-app relay repair/download UI
0.3.5  AddonHost prototype (internal hooks)
0.4.0  Public addon API v1 + first-party EventSub/Discord addons
1.0.0  Signed installer + auto-update + CI — “production ready” public GA
```

**Full vision (addons, killer features, integrations):** see **[UPGRADE-PATHWAY.md](./UPGRADE-PATHWAY.md)**.

---

## Quick reference — key files

| Area | Paths |
|------|-------|
| Main / IPC | `src/main/index.ts`, `relay.ts`, `browse-tabs.ts`, `security.ts` |
| URL policy | `src/shared/browse-url.ts`, `src/shared/tabcast.ts` |
| Studio UI | `src/renderer/app.ts`, `app.html`, `whip.ts`, `relay-client.ts` |
| Build / verify | `package.json`, `scripts/verify.mjs`, `scripts/fetch-relay.mjs` |
| Site | `site/index.html`, `site/browser-manifest.json`, `site/deploy-site.sh` |
| Roadmap (v0.2) | `UPGRADES.md` |
| This doc | `level2.md` |

---

## Test plan (before next public build)

- [ ] Fresh install on clean Windows 11 VM (unsigned warning documented).
- [ ] Relay start/stop/restart × 10; no orphan MAKA.relay process after quit.
- [ ] Browse: blocked host redirect denied; Twitch/YT Studio load; chat pop-out.
- [ ] Go Live 720p and 1080p; profile persists after restart (**after 0.2.1 fix**).
- [ ] Settings save/load; invalid JSON in userData recovered gracefully.
- [ ] Second instance focuses first window; tray minimize while live.
- [ ] `npm run typecheck && npm run build && node scripts/verify.mjs --offline`.
- [ ] Full verify with relay running: `npm run verify`.

---

*For v0.2 feature checklist see [UPGRADES.md](./UPGRADES.md). For dev setup see [README.md](./README.md).*
