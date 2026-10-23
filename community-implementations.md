# Community implementations & marketplace

Short design note for agents extending Maka (Tabcast Browser).

## Marketplace (developer-curated)

The in-app marketplace is a **list the developer publishes**, not a user submission portal.

- **Bundled catalog:** `src/shared/marketplace-catalog.ts` (`MARKETPLACE_CATALOG`).
- **Optional remote feed:** JSON the developer hosts; merged/cached by `src/main/marketplace-feed.ts`.

Users install from that curated list. They do **not** upload addons into the marketplace UI.

## Local addon folders

A folder under the user addons directory is for **trying** an addon (manifest + files). Dropping files there does **not** add rows to the marketplace; it only matters after install/load from catalog or manual copy with a valid manifest.

## Where addons appear

Enabled addon panels stack in the right-hand **Addons** block only (`#addon-panels` / `renderAddonPanels` in the renderer). There is no hard numeric cap, but the column is the practical limit—production builds ship a short curated list.

## Core (always built-in)

These stay in the main app, not marketplace addons:

- Streaming studio (program, layers, relay encoder)
- Search / browse tab
- Display/window capture
- Local relay + Go Live
- Twitch / YouTube (and related) destinations

## Phone camera

LAN phone pairing (QR, mobile preview page on port `38474`) is an **optional marketplace addon** (`com.tabcast.phone-cam`), not a permanent left-sidebar block. The pair server runs only while that addon is installed **and** enabled.

## Community ideas

Ideas can be suggested (issues, Discord, etc.). They ship only after the developer adds an entry to the catalog (and optional remote feed). See `docs/ADDON-API.md` and this file for permissions and runtime rules.
