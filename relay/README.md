# MAKA.relay 0.1.1 (open source)

Editable relay that replaces the closed `MAKArelay.exe` sidecar. Same HTTP contract as documented in [`docs/web-relay.md`](../docs/web-relay.md).

## Run

```bash
# From repo root (Node ≥ 22)
npm run relay:open

# Or
node relay/src/index.mjs
```

Environment:

| Variable | Meaning |
| --- | --- |
| `RELAY_HOST` | Bind address (default `127.0.0.1`) |
| `RELAY_PORT` | Port (default `38473`) |
| `MAKA_RELAY_MOCK_RTMP` | `1` = log RTMP only (default on non-Windows / CI) |
| `FFMPEG_PATH` | FFmpeg binary when pushing real RTMP on Windows |
| `MAKA_RELAY_FORCE_TRANSCODE` | `1` = never `-c:v copy` |

## Studio integration

When **unpackaged**, Maka prefers this relay over `vendor/relay/MAKArelay.exe`.

- `MAKA_USE_OPEN_RELAY=1` — force open relay (also in packaged builds when bundled).
- `MAKA_USE_CLOSED_RELAY=1` — force legacy `MAKArelay.exe`.

Platform title / description / YouTube thumbnail are **not** implemented here; the Electron/Wails app publishes them via [`src/main/platform-metadata.ts`](../src/main/platform-metadata.ts).

## Layout

| Path | Role |
| --- | --- |
| `src/http-server.mjs` | Fastify-free HTTP API (`/health`, `/config`, WHIP, …) |
| `src/whip.mjs` | WHIP sessions (werift) |
| `src/encoder.mjs` | FFmpeg RTMP pipeline |
| `src/profiles.mjs` | Encode presets (matches studio profiles) |
| `src/state.mjs` | In-RAM keys and phase |

## Packaging

Installer bundles `relay/` under `resources/relay-open/` and launches it with `ELECTRON_RUN_AS_NODE` when open relay is enabled.