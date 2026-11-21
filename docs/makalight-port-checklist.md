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
| 7 | Diagnostics + QoS | **next** | — |
| 8 | Browser + browse capture (1:1 Electron) | pending | — |
| 9 | Addons + marketplace | pending | — |
| 10 | Updates + phone-pair | pending | — |

Reference: Electron [`src/main/index.ts`](../src/main/index.ts), bridge [`src/preload/index.ts`](../src/preload/index.ts).