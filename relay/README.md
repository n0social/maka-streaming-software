# MAKA.relay 0.1.1 (open source)

Editable relay for Maka. Same HTTP contract as [`docs/web-relay.md`](../docs/web-relay.md).

## Run

```bash
npm run relay:open
# or
node relay/src/index.mjs
```

Before building the Windows installer:

```bash
npm run prepare:relay
```

This installs `werift` into `relay/node_modules/` for the bundled relay copy.

## Studio integration

Electron always spawns `relay/src/index.mjs` (unpackaged) or `resources/relay/src/index.mjs` (installed build) using `ELECTRON_RUN_AS_NODE`.

Platform title, description, and YouTube thumbnail are published from the app via [`src/main/platform-metadata.ts`](../src/main/platform-metadata.ts).

## Layout

| Path | Role |
| --- | --- |
| `src/http-server.mjs` | HTTP API |
| `src/whip.mjs` | WHIP (werift) |
| `src/encoder.mjs` | FFmpeg RTMP |
| `src/profiles.mjs` | Encode presets |
| `src/state.mjs` | In-RAM keys |