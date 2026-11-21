# Debug — Step 7: Diagnostics + QoS

**Electron:** [`diagnostics.ts`](../src/main/diagnostics.ts), `qos:export` in [`index.ts`](../src/main/index.ts), scoring in [`qos-score.ts`](../src/shared/qos-score.ts).

**MakaLight:** [`internal/diagnostics`](../desktop-wails/internal/diagnostics/store.go), [`internal/qos`](../desktop-wails/internal/qos/score.go), [`app_diagnostics.go`](../desktop-wails/app_diagnostics.go).

## Automated

```bash
cd desktop-wails && go test ./... -v
node scripts/qos-score.test.mjs
npm run verify:makalight-parity
```

## Runtime

Logs under `%AppData%/Maka/logs/` (or `MAKA_CONFIG_DIR/logs`):

- `maka-diagnostics.log` (append JSON lines)
- `maka-diagnostics-*.json`, `maka-qos-*.json` exports

Studio **Diagnostics** panel calls `listDiagnostics` / `clearDiagnostics` / `exportDiagnostics`. QoS export button calls `exportQosBundle` with whip/relay metrics.

## Pass criteria

- `diagnostics:event` emitted on `recordDiagnostic`.
- QoS export returns `{ ok, path, score, grade, reasons }` with redacted stream keys in bundle.
- `verifySystem` includes last 20 diagnostic events.