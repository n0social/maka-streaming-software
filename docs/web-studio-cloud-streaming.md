# Web studio + cloud gaming (GeForce Now → Twitch / YouTube)

How Maka’s **browser studio** (`site/stream/`) and the **local TabcastRelay / MAKArelay sidecar** work together so a streamer can capture cloud gaming (e.g. NVIDIA GeForce Now in a browser tab or window) and send a platform-ready RTMP stream without heavy encoding in the browser.

Canonical contracts live in:

| Area | Source |
|------|--------|
| Encode profile IDs (720p30…4k60) | `src/shared/stream-encode-profiles.ts` |
| `POST /config` body builder | `src/shared/relay-config.ts` |
| Relay HTTP paths / WHIP track ids | `src/shared/tabcast.ts` |
| Desktop sidecar spawn + health | `src/main/relay.ts` |
| Desktop WHIP publish | `src/renderer/whip.ts`, `src/renderer/relay-client.ts` |
| Web studio Go Live | `site/stream/js/live.js` |
| Web preview capture | `site/stream/js/preview.js` |

Relay listens on **`http://127.0.0.1:38473`** only. Stream keys and RTMP never leave the streamer’s PC via Maka’s website.

---

## Capture path (GeForce Now)

1. Streamer opens GeForce Now (or similar) in Chrome / Edge — typically a **browser tab** or a **dedicated app window**.
2. In Maka web studio **Program** preview, they click **Share GeForce Now tab / window** (or equivalent share control).
3. The browser shows the standard **`getDisplayMedia`** picker. The user must choose the GeForce Now **tab** or **window** (not an unrelated display unless they want the whole monitor).
4. Preview attaches that `MediaStream` as the gameplay / screen bed (`preview.js` → `MakaStreamPreview.getStreams().screen`). Optional webcam is a separate `getUserMedia` track (PiP).
5. Capture stays **local preview** until Go Live publishes WHIP. There is no CDN ingest from the website alone.

**Audio note:** tab/window share may or may not include game audio depending on the OS and picker (“Share tab audio”). Mic is separate via the Audio Mixer / `getUserMedia({ audio: true })`.

---

## Where encoding happens

| Stage | Who | What |
|-------|-----|------|
| Capture + local preview | **Browser** | `getDisplayMedia` / `getUserMedia`; Program canvas / `<video>` |
| Transport to encoder | **Browser → relay** | WebRTC **WHIP** `POST` SDP to `http://127.0.0.1:38473/whip` |
| Hardware / software encode (incl. up to **4K60**) | **Local relay sidecar** | TabcastRelay / MAKArelay — profile + bitrate from `POST /config` |
| Platform ingest | **Relay** | **RTMP(S)** out to Twitch / YouTube (or custom) using keys held in relay RAM / desktop settings |

The browser does **not** perform 4K NVENC (or equivalent) for Twitch/YouTube. Selecting `4k60` in the web UI only tells the **relay** which `profile` / `bitrateMbps` to use. Without a healthy sidecar, Go Live must refuse to claim a live cloud stream.

Desktop exe difference: Electron **spawns** the sidecar (`src/main/relay.ts`). The web page **cannot** start that process — it only probes `/health` and publishes WHIP when something is already listening on port **38473**.

---

## Destinations: stream keys, WHIP, RTMP

### Flow

```
GeForce Now tab/window
        │ getDisplayMedia
        ▼
  Browser Program preview
        │ WHIP (WebRTC)
        ▼
  Local relay :38473  ──encode (profile)──►  RTMP(S) ──► Twitch / YouTube
        ▲
        │ POST /config { profile, bitrateMbps, twitchKey?, youtubeKey?,
        │                streamTitle?, streamCategory?, … }
```

### Stream keys

- Twitch / YouTube (and custom RTMP) keys are **ingest credentials**. The relay attaches them when opening RTMP to the platform.
- Desktop: chips / Go Live wizard → settings / `POST /config` (`buildRelayConfigRequest` in `relay-config.ts`).
- Web: Twitch / YouTube chips arm destinations; stream-key fields (or paste-from-dashboard instructions) feed the same `/config` payload when the user pastes a key. Keys may also be configured in the **desktop app / relay settings** the same way the exe does — the website never proxies RTMP.

### WHIP vs RTMP

| Protocol | Role |
|----------|------|
| **WHIP** | Browser → local relay only (media in). |
| **RTMP(S)** | Relay → Twitch / YouTube / custom (media out). Browsers cannot open Twitch/YouTube RTMP directly from this page. |

---

## Encode profiles (real relay keys)

IDs must match the exe / relay (`EncodeProfileId`). Do not invent alternate labels that never reach `/config`.

| `profile` id | Resolution | FPS | Target `bitrateMbps` |
|--------------|------------|-----|----------------------|
| `720p30` | 1280×720 | 30 | 3 |
| `720p60` | 1280×720 | 60 | 4.5 |
| `1080p30` | 1920×1080 | 30 | 4.5 |
| `1080p60` | 1920×1080 | 60 | 6 |
| `2k60` | 2560×1440 | 60 | 10 |
| `4k60` | 3840×2160 | 60 | 16 |

Web persistence (what `live.js` reads for `/config`):

- `localStorage['maka.stream.bitrateProfile']`
- Mirrored in `maka.stream.settings.v1` → `bitrateProfile`
- UI: `#program-quality-select`, `#cfg-profile`, Settings → Streaming `#set-encode-profile`

Also mirrored for metadata: `maka.stream.streamTitle`, `maka.stream.streamCategory`.

---

## What the WEB client can do today vs must use local relay

### Browser-only (no relay)

| Capability | Status |
|------------|--------|
| Share GeForce Now tab/window + webcam preview | Yes |
| Local recording (MediaRecorder → download) | Yes (preview quality, not relay encode) |
| Virtual camera as an OS device | No — preview mock only |
| Pick encode profile in UI / localStorage | Yes (preference only until relay applies it) |
| Go Live to Twitch / YouTube | **No** — show install/run Maka desktop relay guidance |
| 4K NVENC / platform RTMP | **No** |

### With local relay (MAKArelay / Maka desktop) on `:38473`

| Capability | Status |
|------------|--------|
| Probe `/health`, poll `/status` | Yes |
| `POST /config` with profile, bitrate, title, category, keys | Yes |
| WHIP publish gameplay (+ webcam / mic tracks) | Yes |
| Relay encodes with selected profile (incl. 4k60 when hardware allows) | Yes (relay) |
| RTMP to Twitch / YouTube | Yes (relay; keys on PC) |

### Honest UX rules

- Never imply the **browser alone** does 4K NVENC or platform live without the sidecar.
- Missing relay → modal / copy: install or run Maka desktop / MAKArelay; preview stays local.
- “Live” in the web UI means **WHIP to local relay**, not a CDN viewer badge, until the relay reports platform ingest.

---

## GeForce Now streamer checklist (web + relay)

1. Install / run **Maka desktop** (or start **MAKArelay.exe**) so `http://127.0.0.1:38473/health` returns `ok`.
2. Open GeForce Now in a browser tab or window; open Maka **web studio** (`/stream/`).
3. **Share the GeForce Now tab or window** in Program preview.
4. Settings / stats bar: pick encode profile (`720p30`…`4k60`) — stored under `maka.stream.bitrateProfile`.
5. Arm **Twitch** and/or **YouTube** chips; paste stream key(s) when prompted (or set keys in desktop relay settings).
6. Set stream title / category (flows into `POST /config`).
7. **Go Live** → web posts config + scene, then WHIP → relay encodes → RTMP to the platform.
)
