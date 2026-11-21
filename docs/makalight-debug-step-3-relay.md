# Debug — Step 3: Relay + WHIP

**Electron:** auto-starts open relay, `relay:*` + `whip:publish` IPC, onboarding `verifySystem()`.

**MakaLight:** [`internal/relay`](../desktop-wails/internal/relay/manager.go), [`app_relay.go`](../desktop-wails/app_relay.go), bridge `publishWhipOffer` → `PublishWhipOffer`.

## Automated (Linux / CI)

```bash
cd desktop-wails && go test ./... -v
npm run verify:makalight-parity
```

Relay path test should **PASS** (finds `relay/src/index.mjs`). WHIP mock test exercises bearer + SDP POST without a live relay.

Optional full relay + WHIP (needs relay `npm install`):

```bash
npm run prepare:relay
cd desktop-wails
MAKA_RELAY_INTEGRATION=1 go test ./internal/relay/... -run Integration -v
```

## Windows e2e (`wails dev`)

```bash
npm ci
npm run prepare:relay
npm run makalight:bundle
cd desktop-wails
wails dev
```

1. Relay chip → **Ready** within ~20s (auto-start on launch).
2. Onboarding **Check relay** → all three: `relay-lifecycle`, `relay-health`, `relay-binary`.
3. **Go Live** (test keys / lab mode) → WHIP publishes via `PublishWhipOffer`, meters move, relay `/status` shows ingest.

## Pass criteria

- `GET http://127.0.0.1:38473/health` returns JSON with `relayToken`.
- `PublishWhipOffer` returns `answerSdp` + optional `resourceUrl`; `closeWhipResource` DELETE succeeds.
- `relay:update` events every 2s and after start/stop/refresh.