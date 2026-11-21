# Debug — Step 6: Platform metadata + viewers

**Electron:** [`platform-metadata.ts`](../src/main/platform-metadata.ts), [`platform-viewers.ts`](../src/main/platform-viewers.ts).

**MakaLight:** [`internal/platform`](../desktop-wails/internal/platform/) + [`app_platform.go`](../desktop-wails/app_platform.go).

## Automated

```bash
cd desktop-wails && go test ./... -v
node scripts/platform-viewers.test.mjs   # shared TS parsers (reference)
npm run verify:makalight-parity
```

Go tests mirror `scripts/platform-viewers.test.mjs` parse cases.

## Runtime (needs network egress)

- `GetPlatformViewers({ twitchLogin, youtubeVideoId })` → public Twitch GQL + YouTube `live_stats`.
- `PublishPlatformMetadata()` reads tokens from settings (`twitchUserToken`, `twitchClientId`, `youtubeUserToken`) and PATCHes Twitch / YouTube APIs when tokens are present.

## Pass criteria

- Response shapes match preload: `{ twitch, youtube }` with `number | null` viewers; metadata `{ version, twitch, youtube }`.
- Invalid login/video ids yield `null` counts (no throw).