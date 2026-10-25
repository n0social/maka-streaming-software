# Privacy, diagnostics, and feedback

This document describes how Maka handles optional diagnostics and user feedback in the studio sidebar (**Feedback** block, below **Sources**).

## Is analytics always on?

**No.** Diagnostics/analytics collection is **off by default**.

You enable it only when you turn on **Help us collect information** in the studio sidebar (stored as `diagnosticsOptIn` in local `settings.json`). Turning it off stops new events immediately; previously queued lines remain in the local log file until you delete them.

Internal engineering diagnostics (`recordDiagnostic` in the main process) still run for crashes and relay errors to support local troubleshooting and the existing diagnostics export — that is separate from the opt-in analytics queue described below.

## What is collected when opted in?

When `diagnosticsOptIn` is **true**, Maka appends **minimal JSON lines** to:

`%APPDATA%/Maka/store/analytics-events.jsonl` (Windows; path follows Electron `userData` on other platforms)

Each event uses this schema:

| Field | Description |
| --- | --- |
| `at` | ISO timestamp |
| `kind` | `app.start`, `opt_in.enabled`, `opt_in.disabled`, or `relay.lifecycle` |
| `appVersion` | Maka app version |
| `platform` | `win32`, `darwin`, or `linux` |
| `arch` | CPU architecture |
| `relayLifecycle` | Relay state when kind is `relay.lifecycle` |
| `relayErrorCode` | Redacted error text when lifecycle is `error` (stream keys and RTMP URLs stripped) |

**Not collected:** stream keys, WHIP/RTMP URLs with secrets, window titles, capture sources, chat content, or browsing history.

Events are **written only on this machine**. There is **no background upload** and **no silent email** in the current build.

## Feedback — what happens when you click Send?

1. Your message (and optional email) is appended to **`feedback.jsonl`** under the same `userData/store` folder.
2. A formatted support block is copied to your **clipboard** (when the OS allows).
3. The app shows a status line that feedback was **saved locally** — it does **not** claim that email was sent.

Optional buttons:

- **Open GitHub issue** — opens the [new issue](https://github.com/n0social/maka-streaming-software/issues/new?labels=feedback&title=Maka%20feedback) page so you can paste the clipboard text.
- **Email support** — opens a `mailto:n0social@skydav.work` link with a prefilled subject; you still send mail from your own client.

Nothing is transmitted until **you** submit via GitHub or your email app.

## Related settings

| Setting key | Default | UI |
| --- | --- | --- |
| `diagnosticsOptIn` | `false` | “Help us collect information” checkbox |

Changes are saved through existing `settings:get` / `settings:set` IPC from the studio renderer.
