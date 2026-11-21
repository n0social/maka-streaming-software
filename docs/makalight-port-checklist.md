# MakaLight IPC port checklist

One handler group per step. After each step: run **Debug** commands, tick the box, commit.

| Step | IPC / Go methods | Status | Debug |
| --- | --- | --- | --- |
| 1 | `capture:list-sources`, `capture:set-preferred` | done (Win32 list; Linux `[]`) | [`makalight-debug-step-1-capture.md`](makalight-debug-step-1-capture.md) |
| 2 | `window-audio:start/stop`, `window-audio:pcm` | done (loopback-capture worker) | [`makalight-debug-step-2-audio.md`](makalight-debug-step-2-audio.md) |
| 3 | Relay + WHIP e2e on Windows (`wails dev`) | **next** | — |
| 4 | `shell:open-stream`, intro flow | pending | — |
| 5 | Recording / scene IPC | pending | — |
| 6 | Platform metadata + viewers | pending | — |
| 7 | Diagnostics + QoS | pending | — |
| 8 | Browser + browse capture (1:1 Electron) | pending | — |
| 9 | Addons + marketplace | pending | — |
| 10 | Updates + phone-pair | pending | — |

Reference: Electron [`src/main/index.ts`](../src/main/index.ts), bridge [`src/preload/index.ts`](../src/preload/index.ts).