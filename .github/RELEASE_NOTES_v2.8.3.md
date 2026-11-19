## Maka v2.8.3 — Windows streaming software

**Current stable build.** Installer **Maka-Setup-2.8.3.exe**, app version **2.8.3**. Open **MAKA.relay 0.1.1** ships inside the app (no separate `MAKArelay.exe` download).

### What's new in v2.8.3

- **Open MAKA.relay** — WHIP + FFmpeg RTMP source in `relay/`; bundled in the installer (`npm run prepare:relay`).
- **No closed relay** — removed `MAKArelay.exe` fetch, runtime patch layer, and dev mock relay wrapper.
- **Platform metadata (0.1.1)** — Twitch title/game and YouTube title, description, and thumbnail via settings tokens after Go Live.

### Included from v2.8.1

- Game audio follows the captured window; desktop audio is the full mix.
- Adaptive encode, backup ingest, capture recovery, viewer counts, QoS score, live metadata fields in Settings.

### Windows installer

Download **[Maka-Setup-2.8.3.exe](https://github.com/n0social/maka-streaming-software/releases/download/v2.8.3/Maka-Setup-2.8.3.exe)** from release assets, or [makalive.stream/download](https://makalive.stream/download).

**Windows SmartScreen** may warn on unsigned builds — *More info* → *Run anyway* if you trust this release.

v2.8.1 remains the previous stable tag.