# MakaLight IPC port checklist

One handler group per step. After each step: run **Debug** commands, tick the box, commit.

| Step | IPC / Go methods | Status | Debug |
| --- | --- | --- | --- |
| 1 | `capture:list-sources`, `capture:set-preferred` | done (Win32 list; Linux `[]`) | [`makalight-debug-step-1-capture.md`](makalight-debug-step-1-capture.md) |
| 2 | `window-audio:start/stop`, `window-audio:pcm` | done (loopback-capture worker) | [`makalight-debug-step-2-audio.md`](makalight-debug-step-2-audio.md) |
| 3 | Relay + WHIP e2e on Windows (`wails dev`) | done (auto-start, verify, WHIP Go) | [`makalight-debug-step-3-relay.md`](makalight-debug-step-3-relay.md) |
| 4 | `shell:open-stream`, intro flow | done (focus, home URL, settings) | [`makalight-debug-step-4-shell.md`](makalight-debug-step-4-shell.md) |
| 5 | Recording / scene IPC | done (dialogs + file I/O) | [`makalight-debug-step-5-recording.md`](makalight-debug-step-5-recording.md) |
| 6 | Platform metadata + viewers | done (Twitch/YouTube HTTP) | [`makalight-debug-step-6-platform.md`](makalight-debug-step-6-platform.md) |
| 7 | Diagnostics + QoS | done (store, export, score) | [`makalight-debug-step-7-diagnostics.md`](makalight-debug-step-7-diagnostics.md) |
| — | `browser:*`, browse capture | **not ported** (deprecated in Electron; stubs only) | [`wails-migration-plan.md`](wails-migration-plan.md) § IPC matrix |
| 8 | Addons + marketplace | **next** | — |
| 9 | Updates (`app:update-*`) | pending | — |
| 10 | Phone-pair / WebRTC | pending | — |

**Browser:** MakaLight does not ship an in-app browser or Search tab. The synced renderer may still contain dormant DOM from Electron; `app_stubs.go` + `maka-bridge` keep `browser:*` / `getBrowseCaptureTarget` as empty no-ops so the studio bundle does not crash. Do **not** add a port step for browser IPC.

Reference: Electron [`src/main/index.ts`](../src/main/index.ts), bridge [`src/preload/index.ts`](../src/preload/index.ts). Product scope: [`wails-migration-plan.md`](wails-migration-plan.md).