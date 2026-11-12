# Maka user addons

Copy an addon folder to:

`%APPDATA%/Maka/addons/<your-addon-id>/`

Each addon needs a validated `maka-addon.json` manifest. See [docs/ADDON-API.md](../docs/ADDON-API.md).

## Marketplace (in app)

Studio → **Addon marketplace** — install curated extensions without manual file copy.

## Catalog examples (install from marketplace)

- **Discord Now Live** — webhook pattern (declarative actions)
- **Custom RTMP / Kick** — third-party platform example
- **Phone camera** — QR pairing on the same Wi-Fi

Scene layouts (gameplay, desk, intermission, ending) live in the studio Scenes list. They are not marketplace addons.

## Samples

- `_samples/hello-maka/` — sandboxed runtime demo (`index.html` + `maka.addons` API). Kept for addon validation. It is not listed in the marketplace.
