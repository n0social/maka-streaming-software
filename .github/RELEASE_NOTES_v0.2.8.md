## Maka v0.2.8 — Windows streaming software

**Current recommended build.** Installer **Maka-Setup-0.2.8.exe**, app version **0.2.8**. The addon marketplace is not part of this release.

### What’s new since v0.2.6.2

- **Adaptive encode** — congestion step-down, including a cloud-gaming preset, without false step-downs on a healthy stream.
- **Backup ingest** — backup RTMP URL and key in Settings, kept across restarts, plus a live connection event log.
- **Capture recovery** — frozen gameplay retries at 720p30 after the preview has painted; a black screen falls back to a window; the program monitor stays visible when Maka is not focused.
- **Encode load** — the compositor sheds extra WHIP tracks when the CPU falls behind, and does not shed them only because the source is below the encode frame rate.
- **MAKArelay encode** — a live config applies the studio bitrate, audio, encoder, GOP, and B-frame settings on the unpacked relay.
- **Viewers and latency** — Twitch and YouTube counts while live, and measured WHIP latency instead of a fixed value.
- **QoS score** — a live session score and a support export with stream keys redacted.
- **Naming** — studio API and addon ids use Maka. The shipped encoder file is `MAKArelay.exe`.

### Windows installer

Download **[Maka-Setup-0.2.8.exe](https://github.com/n0social/maka-streaming-software/releases/download/v0.2.8/Maka-Setup-0.2.8.exe)** from the assets below, or [makalive.stream/download](https://makalive.stream/download).

**Windows SmartScreen** may warn on unsigned builds — *More info* → *Run anyway* if you trust this release.

v0.2.6.2 remains the previous stable tag.
