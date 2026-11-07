# Web client cloud streaming (makalive.stream/stream/)

**Primary surface:** the **browser studio** at [`https://makalive.stream/stream/`](https://makalive.stream/stream/) (`site/stream/`).  
Capture GeForce Now (or similar) in the tab, preview locally, then publish **WHIP** to a **local relay helper** on the streamer’s PC for encode + Twitch/YouTube RTMP.

This doc is about the **web client workflow**. The Electron exe (`src/renderer`) is a behavior/UI reference only — do not treat the desktop app as the deliverable for this path.

| Area | Source |
|------|--------|
| Web studio shell / modules | `site/stream/` (`index.html`, `js/*`, `css/*`) |
| Encode profile IDs (720p30…4k60) | `src/shared/stream-encode-profiles.ts` |
| `POST /config` body builder | `src/shared/relay-config.ts` |
| Relay HTTP paths / WHIP track ids | `src/shared/tabcast.ts` |
| Desktop sidecar spawn (reference) | `src/main/relay.ts` — web **cannot** spawn this |

Relay listens on **`http://127.0.0.1:38473`** only. Stream keys and RTMP never leave the streamer’s PC via Maka’s website.

---

## Web client workflow (browser + local relay)

1. Open **`https://makalive.stream/stream/`** (or local `site/` → `/stream/`).
2. In **Program**, click **Share GeForce Now tab / window** → pick the cloud-game tab/window in the browser picker.
3. Optional: **Add webcam**, tune **Audio Mixer**, switch **Scenes**.
4. Pick encode profile (`720p30`…`4k60`) in the stats bar or **Settings → Streaming**.
5. Arm **Twitch** / **YouTube**; paste stream key(s) when shown (or keep keys only in the local relay).
6. Start the **local relay helper** (MAKArelay / Maka desktop sidecar) so `http://127.0.0.1:38473/health` returns `ok`. Use **↻** on the relay chip to re-probe.
7. **Go Live** → web posts `/config` + scene, then **WHIP** → relay encodes → **RTMP(S)** to the platform.

Without a healthy relay, Go Live opens an **honest modal** (preview stays local; no fake CDN “live”).

```
Browser (makalive.stream/stream/)
  │ getDisplayMedia / getUserMedia → Program preview
  │ WHIP (WebRTC) when Go Live
  ▼
Local relay :38473  ──encode (profile)──►  RTMP(S) ──► Twitch / YouTube
  ▲
  └── POST /config { profile, bitrateMbps, keys?, title?, category? }
```

---

## Capture path (GeForce Now)

1. Open GeForce Now (or similar) in Chrome / Edge — typically a **browser tab** or dedicated window.
2. In Maka **web** studio Program preview, click **Share GeForce Now tab / window**.
3. Choose that **tab** or **window** in `getDisplayMedia` (not an unrelated display unless intended).
4. Preview attaches the stream (`preview.js` → `MakaStreamPreview.getStreams().screen`). Webcam is a separate `getUserMedia` track (PiP).
5. Capture stays **local** until Go Live publishes WHIP. The website alone does not ingest to a CDN.

**Audio:** tab/window share may include game audio (“Share tab audio”). Mic is separate via the mixer / `getUserMedia({ audio: true })`.

---

## Where encoding happens

| Stage | Who | What |
|-------|-----|------|
| Capture + local preview | **Browser web client** | `getDisplayMedia` / `getUserMedia`; Program stage |
| Transport to encoder | **Browser → relay** | WHIP `POST` SDP to `http://127.0.0.1:38473/whip` |
| Encode (incl. up to **4K60**) | **Local relay helper** | TabcastRelay / MAKArelay — profile from `POST /config` |
| Platform ingest | **Relay** | RTMP(S) to Twitch / YouTube using keys on the PC |

Selecting `4k60` in the web UI only tells the **relay** which `profile` / `bitrateMbps` to use. The browser does not NVENC to Twitch/YouTube by itself.

Desktop difference (reference only): Electron can **spawn** the sidecar. The web page only probes `/health` and publishes WHIP when something already listens on **38473**.

---

## Destinations, keys, WHIP vs RTMP

- Twitch / YouTube chips **arm** destinations; key fields feed `/config` when pasted. Keys may also live only in relay RAM / desktop relay settings.
- **WHIP** = browser → local relay (media in).
- **RTMP(S)** = relay → platform (media out). Browsers cannot open Twitch/YouTube RTMP from this page.

---

## Encode profiles (relay keys)

| `profile` id | Resolution | FPS | Target `bitrateMbps` |
|--------------|------------|-----|----------------------|
| `720p30` | 1280×720 | 30 | 3 |
| `720p60` | 1280×720 | 60 | 4.5 |
| `1080p30` | 1920×1080 | 30 | 4.5 |
| `1080p60` | 1920×1080 | 60 | 6 |
| `2k60` | 2560×1440 | 60 | 10 |
| `4k60` | 3840×2160 | 60 | 16 |

Web persistence: `localStorage['maka.stream.bitrateProfile']`, mirrored in `maka.stream.settings.v1`, UI `#program-quality-select` / `#cfg-profile` / Settings `#set-encode-profile`.

---

## What the web client can do vs needs local relay

### Browser-only (no relay)

| Capability | Status |
|------------|--------|
| Share GeForce Now tab/window + webcam preview | Yes |
| Scenes / sources / settings / mixer chrome | Yes |
| Local recording (MediaRecorder → download) | Yes (preview quality) |
| Virtual camera as an OS device | No — preview mock only |
| Pick encode profile in UI | Yes (preference until relay applies it) |
| Go Live to Twitch / YouTube | **No** — honest modal; install/run local relay |
| Cross-origin capture / some tab-audio cases | May hit browser CORS / permission limits |

### With local relay on `:38473`

| Capability | Status |
|------------|--------|
| Probe `/health`, poll `/status`, refresh chip | Yes |
| `POST /config` + WHIP publish | Yes |
| Relay encode (incl. 4k60 when hardware allows) + RTMP | Yes (relay; keys on PC) |

### Honest UX

- Never imply the browser alone does 4K NVENC or platform live without the sidecar.
- Missing relay → modal / copy; preview stays local; UI does not claim CDN live.
- “Live” in the web UI means **WHIP to local relay** until the relay reports platform ingest.
