# Maka user addons

Copy an addon folder to:

`%APPDATA%/Maka/addons/<your-addon-id>/`

Each addon needs a validated `maka-addon.json` manifest. See [docs/ADDON-API.md](../docs/ADDON-API.md).

## Marketplace (in app)

Studio → **Addon marketplace** — install curated extensions without manual file copy.

## Built-in

- **Scene templates** — always enabled (`maka.scene-templates`)

## Catalog examples (install from marketplace)

- **Discord Now Live** — webhook pattern (declarative actions)
- **Custom RTMP / Kick** — third-party platform example
- **Lower thirds** — scene layout shortcuts

## Samples

- `_samples/hello-maka/` — sandboxed runtime demo (`index.html` + `maka.addons` API). Also in marketplace as **Hello Maka**.
