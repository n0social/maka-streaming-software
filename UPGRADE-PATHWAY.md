# Tabcast Browser — Upgrade Pathway

**Vision:** The streaming browser people *choose* — not because it replaces OBS, but because browsing, creating, and going live happen in one intentional surface with an ecosystem that grows with the community.

**Companion docs:** [level2.md](./level2.md) (production P0–P3), [UPGRADES.md](./UPGRADES.md) (v0.2 checklist)

---

## North star

Most streamers today juggle: a browser (Twitch, YouTube Studio, chat), OBS or a capture tool, a relay/encoder, and a dozen browser extensions that don't talk to each other.

Tabcast Browser collapses that stack:

```
Browse → Capture → Scene → Go Live → Chat → Grow
         ↑___________________________|
              addons & integrations
```

**What makes people switch:**

1. **Zero context-switch** — pinned tabs, chat pop-out, and studio are one app, one hotkey away from live.
2. **Transparent pipeline** — WHIP → local relay → RTMP is visible, teachable, and debuggable (edu + pros who hate black boxes).
3. **Extensible by design** — user-made addons for alerts, overlays, analytics, and platform tools without forking the app.
4. **Browser-native superpowers** — capture *what you're already looking at*, clip from VOD pages, one-click scene presets per site.

---

## VS Code for streaming (core + extensions)

Tabcast Browser follows the same product shape as **VS Code**: a **stable core shell** with **well-defined contribution points**, and a **marketplace** where specialists extend the product without forking it.

| VS Code | Tabcast Browser |
|---------|-----------------|
| Editor + terminal + sidebar | Studio + Browse + relay + program monitor |
| Extension API (`vscode.*`) | Addon API (`tabcast.addons.*`) |
| Activity bar / panels | Left sources · center stage · right scene/destinations/addons |
| Extension marketplace | tabcast.live/addons (curated catalog) |
| Built-in language support | Built-in capture, WHIP, Twitch/YouTube RTMP |

**Core (never an addon):** local relay, WHIP publish, display/window/browse capture, scene layout contract, browse security model, go-live lifecycle.

**Extensions (addons):** alerts, lower thirds, extra platforms, Discord webhooks, OBS bridge, analytics, classroom tools.

### Example community addon (not first-party)

**“Stream to Kick / Custom RTMP”** — a third-party addon could:

1. Declare permission `relay.config.write` (user confirms each session).
2. Register a Destinations panel row for a custom RTMP URL + stream key.
3. On go-live, POST extended config to relay if/when the relay exposes multi-endpoint API — or shell out through a signed helper the addon ships.

Tabcast does **not** ship every platform; the marketplace lets creators own niche destinations while the core stays maintainable.

**Onboarding (shipped):** first-run grey-space tour with pointers at modes, sources, program, relay, destinations, addons, and Go Live. Replay from Settings.

---

## Addon system (user-made integrations)

### Design principles

| Principle | Why |
|-----------|-----|
| **Sandboxed** | Addons run with limited IPC; no raw Node in community code |
| **Declarative manifest** | `tabcast-addon.json` — id, permissions, entry, hooks |
| **Capability-based permissions** | `browse.tabs`, `scene.overlay`, `relay.config`, `chat.read`, etc. |
| **Versioned API** | `tabcast.addonApi v1` — breaking changes only on major app version |
| **Local-first** | Addons ship as folders in `%APPDATA%/Tabcast Browser/addons/` or `.tabcast-addon` zip |

### Proposed manifest (`tabcast-addon.json`)

```json
{
  "id": "com.creator.hype-train",
  "name": "Hype Train Overlay",
  "version": "1.0.0",
  "apiVersion": 1,
  "entry": "index.js",
  "permissions": ["scene.overlay", "events.twitch"],
  "hooks": ["studio.sidebar", "live.start", "live.end"],
  "settingsSchema": "./settings.json"
}
```

### Addon runtime architecture

```
┌─────────────────────────────────────────────────────────┐
│  Tabcast Browser (main)                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ AddonHost   │──│ Permission   │──│ IPC bridge      │ │
│  │ (main)      │  │ gate         │  │ (preload slice) │ │
│  └─────────────┘  └──────────────┘  └─────────────────┘ │
└───────────────────────────┬─────────────────────────────┘
                            │ isolated world
┌───────────────────────────▼─────────────────────────────┐
│  Addon iframe / Worker (user JS, CSP strict)             │
│  tabcast.addons.* API                                    │
└─────────────────────────────────────────────────────────┘
```

**Implementation phases:**

| Phase | Deliverable | Target |
|-------|-------------|--------|
| **A0** | Internal “dogfood” plugins (hardcoded modules using same hooks) | ✅ 0.2.2 (`AddonHost` + scene templates) |
| **A1** | `AddonHost` + manifest loader + 3 permissions | ✅ 0.3 (`addon-api.ts`, declarative actions) |
| **A2** | Addon marketplace folder + enable/disable UI in Settings | ✅ 0.3 (marketplace dialog + install) |
| **A2.5** | Sandboxed webview runtime + `tabcast.addons` preload bridge | ✅ 0.3.6 |
| **A3** | Signed addon catalog (GitHub repo / tabcast.live/addons) | 1.0 |
| **A4** | Creator SDK docs + CLI `tabcast-addon init` | 1.1 |

### Hook surface (what addons can attach to)

| Hook | When fired | Example addon use |
|------|------------|-------------------|
| `app.ready` | After relay health OK | Pre-flight checklist |
| `mode.change` | Studio ↔ Browse | Auto-open chat addon |
| `browse.tab.active` | User switches tab | Update stream title from page |
| `capture.source.selected` | Display/window picked | Game detection overlay |
| `live.start` / `live.end` | WHIP session lifecycle | Start/stop analytics timer |
| `relay.status` | Poll tick | Bitrate warning toast |
| `scene.layout` | Before POST `/scene` | Inject overlay layer |
| `studio.sidebar.panel` | Render sidebar slot | Custom widget UI |
| `hotkey` | User-defined chord | Clip last 30s |

### Permission tiers

| Permission | Risk | Example |
|------------|------|---------|
| `ui.toast` | Low | “Stream started” notification |
| `scene.overlay` | Medium | Browser-source-style HTML overlay on program |
| `browse.tabs.read` | Medium | Read active URL/title (no cookies) |
| `relay.config.read` | Medium | Show profile, not keys |
| `relay.config.write` | **High** | Requires explicit user confirm per session |
| `network.fetch` | **High** | Allowlist domains in manifest |

Stream keys **never** exposed to addons — relay config write goes through main-process confirm dialog.

---

## Addon ideas (community + first-party)

### Alerts & engagement

| Addon | Description | Hooks |
|-------|-------------|-------|
| **Streamlabs-style alerts** | Browser overlay for follows/subs via Twitch EventSub | `scene.overlay`, `events.twitch` |
| **Hype train / prediction ticker** | Read-only overlay from public APIs | `scene.overlay` |
| **Sound pad** | Hotkey-triggered stingers mixed into mic bus | `hotkey`, `audio.inject` (future) |
| **Goal bar** | Sub/follow goal progress | `scene.overlay`, `settings` |

### Production & scene

| Addon | Description | Hooks |
|-------|-------------|-------|
| **Lower thirds** | Name/title templates with JSON config | `scene.overlay`, `studio.sidebar.panel` |
| **BRB / Starting Soon** | One-click scene preset + timer | `live.start`, `scene.layout` |
| **Multi-layout profiles** | “Just Chatting” vs “Gameplay” scene swap | `hotkey`, `scene.layout` |
| **Safe zone grid** | Overlay guide for TikTok/Reels crop | `studio.program` |

### Browse & platform

| Addon | Description | Hooks |
|-------|-------------|-------|
| **Twitch chat commands** | Moderator !commands panel (read-only at first) | `browse.tabs.read` |
| **YT chapter markers** | Push chapter timestamps while live | `browse.tab.active`, `events.youtube` |
| **Stream title sync** | Copy browser tab title → relay metadata | `browse.tab.active`, `live.start` |
| **Clip button** | Mark timestamp + open clip flow | `hotkey`, `live.start` |

### Education & labs

| Addon | Description | Hooks |
|-------|-------------|-------|
| **Lab checklist** | Teacher steps: relay OK → capture OK → go live | `app.ready`, `ui.wizard` |
| **Bandwidth estimator** | Show expected Mbps for profile | `relay.status` |
| **Privacy mode** | Blur chat names / block key fields on projector | `scene.overlay`, `ui.settings` |

### Utility & power user

| Addon | Description | Hooks |
|-------|-------------|-------|
| **OBS bridge** | Forward scene layout to OBS WebSocket (hybrid workflow) | `scene.layout`, `network.fetch` |
| **Discord webhook** | “Now live” post on go-live | `live.start`, `network.fetch` |
| **Analytics lite** | Session duration, dropped frames from relay logs | `relay.status`, `live.end` |
| **Backup keys** | Encrypted export to OS keychain (opt-in) | `relay.config.write` + vault API |

---

## Killer features (core product, not addons)

These belong in the main app — addons extend them, don't replace them.

### Tier 1 — “Why download this?”

| Feature | User value | Technical notes |
|---------|------------|-----------------|
| **Browse tab as capture source** | Stream exactly what's in your browser tab — no window hunting | ✅ MVP via `getMediaSourceId` + Sources panel |
| **One-key Go Live** | F8 / Ctrl+L with remembered destinations | Done; add “last good config” restore |
| **Smart chat dock** | Channel-aware pop-out (done in 0.2.1); add YT Live chat, resize snap | `openChatPopout`, multi-chat layout |
| **Scene templates** | “Gaming + cam”, “Desk only”, “Browse showcase” one click | Preset JSON → `/scene` |
| **Instant replay buffer** | 30s clip without full DVR | Ring buffer in relay or local ffmpeg segment |
| **Dual-dest status** | Per-platform LIVE/error badges | Consume `platforms` from relay `/status` |

### Tier 2 — “Why keep using this?”

| Feature | User value | Technical notes |
|---------|------------|-----------------|
| **WGC capture** | Fewer black screens, better FPS | Native module; fallback chain |
| **Audio routing** | Desktop audio + mic + browser tab audio mix | WASAPI loopback in relay |
| **Stream health dashboard** | Bitrate, keyframe interval, encoder lag | Parse relay/ffmpeg logs in UI |
| **VOD markers** | Mark moments during stream; export chapter file | Timestamp store + YT API later |
| **Multi-profile accounts** | Separate key sets for school vs personal | Encrypted profiles in userData |
| **Restream without cloud** | N destinations via relay fan-out | Relay feature parity |

### Tier 3 — “Why recommend this?”

| Feature | User value | Technical notes |
|---------|------------|-----------------|
| **Collaborative labs** | Teacher “push layout” to student instances | Local network discovery or simple room code |
| **Guided onboarding** | First-run wizard with test capture | New onboarding route |
| **Creator marketplace** | Install addons from curated list | Phase A3 |
| **Mobile companion** | Phone as cam or chat monitor | WebRTC sidecar (long-term) |
| **Mac/Linux** | Cross-platform relay | Separate relay builds |

---

## Integration map (first-party + OAuth)

Beyond user addons, **built-in integrations** ship with the app and may share code with official addons.

```
                    ┌──────────────┐
                    │ Tabcast      │
                    │ Browser      │
                    └──────┬───────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │ Twitch     │  │ YouTube    │  │ Discord    │
    │ EventSub   │  │ Live API   │  │ Webhooks   │
    │ Helix      │  │ Studio     │  │ RPC (RO)   │
    └────────────┘  └────────────┘  └────────────┘
           │               │
           └───────┬───────┘
                   ▼
            ┌────────────┐
            │ Tabcast    │
            │ Relay      │
            │ RTMP out   │
            └────────────┘
```

| Integration | v0.2 | 0.3 | 0.4 | 1.0 |
|-------------|------|-----|-----|-----|
| Twitch RTMP + pinned tabs | ✅ | | | |
| YouTube RTMP + YT Studio tab | ✅ | | | |
| Channel-aware chat URL | ✅ | | | |
| Twitch EventSub (alerts) | | 🔲 | | |
| YouTube Live chat pop-out | | 🔲 | | |
| OAuth stream key (where allowed) | | | 🔲 | |
| Discord “now live” | | | 🔲 | |
| OBS WebSocket hybrid | | | | 🔲 |

---

## UX moats (what browsers + OBS don't do together)

1. **Pinned streamer workspace** — Twitch directory, your channel, YT Studio, chat — restored every session.
2. **Live-aware chrome** — tray, titlebar, and tab strip show LIVE state; minimize-to-tray while encoding.
3. **Educational transparency** — diagnostics export, verify button, ffmpeg log drawer — trust for schools.
4. **Browse-first streaming** — “I'm already on this page, stream it” without retargeting OBS.
5. **Addon sidebar** — third-party tools live where streamers look while live (right rail), not buried in menus.

---

## Roadmap (unified)

```
0.2.1  ✅ Bugfixes: profile save, quit teardown, openChatOnBrowse, browser:title, SHA verify
0.2.2  ✅ Browse tab capture · scene templates · dual-dest chips · onboarding tour
0.3.0  ✅ Addon API v1 (declarative) · marketplace catalog UI · install/enable
0.3.5  ✅ live.start/end hooks · remote catalog feed · Discord webhook pattern
0.3.6  ✅ Sandboxed addon iframe + tabcast.addons bridge + Hello Tabcast sample
0.4.0  Public creator SDK · community platform addons (Kick/custom RTMP)
0.4.5  Instant replay buffer · audio routing improvements
0.5.0  Addon marketplace (curated) · YouTube chat · Discord webhook integration
1.0.0  Signed installer · auto-update · CI — GA
1.1.0  Creator SDK · `tabcast-addon` CLI · community catalog on tabcast.live
1.2.0  Collaborative lab mode · multi-profile · restream fan-out
2.0.0  “Ultimate” tier: mobile companion, cross-platform relay, plugin economy
```

---

## Sample addon: “Now Live Discord” (reference)

**Manifest permissions:** `network.fetch`, `live.start`

**Behavior:**
1. User configures webhook URL in addon settings (stored encrypted locally).
2. On `live.start`, POST embed JSON to Discord.
3. On `live.end`, optionally PATCH message or post “Stream ended”.

**Why this is a good first community addon:** Single hook, no keys, clear permission model, immediate value.

---

## Sample first-party addon: “Scene Templates”

Ship as built-in before API is public — proves hook design.

- Sidebar panel lists 3 templates.
- Click → builds `SceneLayout` JSON → existing `postSceneLayout`.
- Becomes reference implementation for addon docs.

---

## Success metrics (when we know it's working)

| Metric | Target (6 mo post-1.0) |
|--------|------------------------|
| Time to first live stream (new user) | < 10 minutes with onboarding |
| Addon installs (enabled) | 30% of MAU with ≥1 addon |
| Relay orphan processes after quit | 0% sessions |
| Black-screen capture reports | < 5% with WGC enabled |
| GitHub stars / release downloads | Growth q/q (track manually early) |

---

## What to build next (recommended order)

1. **Browse tab capture** — unlocks the “streaming browser” promise.
2. **Scene templates** — immediate wow factor, low risk.
3. **AddonHost A0** — internal hooks only; refactor sidebar to slot model.
4. **Onboarding wizard** — production P0 from level2.md.
5. **First public addon API** — EventSub alerts or Discord webhook.
6. **WGC + audio routing** — quality parity with OBS for gamers.

---

## File targets for implementation

| Feature | Primary files |
|---------|---------------|
| AddonHost | `src/main/addon-host.ts` (new), `src/preload/addon-bridge.ts` |
| Browse capture | `src/main/browse-tabs.ts`, `src/renderer/app.ts`, `whip.ts` |
| Scene templates | `src/shared/scene-templates.ts`, `src/renderer/app.ts` |
| EventSub addon | `addons/twitch-eventsub/` or first-party module |
| Marketplace UI | `src/renderer/addons-panel.ts`, Settings → Addons tab |

---

*This pathway is living documentation. Update when shipping each milestone. For production blockers (signing, CI, auto-update), see [level2.md](./level2.md).*
