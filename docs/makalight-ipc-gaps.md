# MakaLight IPC gaps (Electron vs Wails)

Living list from [Electron vs MakaLight IPC gap audit](https://github.com/n0social/maka-streaming-software). **P0 relay + version fixes landed in 0.1.2** (`appmeta`, lifecycle poll, renderer version refresh).

| Priority | Item | Status |
| --- | --- | --- |
| P0 | Relay lifecycle (`ready`/`live`, not `running`) + HTTP poll | **0.1.2** |
| P0 | `GetVersionInfo` → `wails.json` product version | **0.1.2** |
| P0 | Platform `win32` on Windows | **0.1.2** |
| P0 | Bundled install layout (`relay/` + `node/node.exe`) | **0.1.1 installer** |
| P1 | Relay auto-restart, `restarts` count | Open |
| P1 | Legacy relay / port 38473 cleanup | Open |
| P1 | Stubs: addons, updates shape, GPU list, VCam | Open |
| — | Browser / phone-pair | Intentionally stub |

See `docs/makalight-port-checklist.md` for step-by-step port status.