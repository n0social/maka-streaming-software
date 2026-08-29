# Tabcast user addons

Copy an addon folder to:

`%APPDATA%/Tabcast Browser/addons/<your-addon-id>/`

Each addon needs a validated `tabcast-addon.json` manifest. See [docs/ADDON-API.md](../docs/ADDON-API.md).

## Marketplace (in app)

Studio → **Addon marketplace** — install curated extensions without manual file copy.

## Built-in

- **Scene templates** — always enabled (`tabcast.scene-templates`)

## Catalog examples (install from marketplace)

- **Discord Now Live** — webhook pattern (declarative actions)
- **Custom RTMP / Kick** — third-party platform example
- **Lower thirds** — scene layout shortcuts

## Samples

- `_samples/hello-tabcast/` — sandboxed runtime demo (`index.html` + `tabcast.addons` API). Also in marketplace as **Hello Tabcast**.
