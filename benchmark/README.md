# Maka resource benchmark (`makabench`)

Collect **time-series CSV** for three stacks under the same scene settings:

| Stack | Process roots (typical) |
| --- | --- |
| Maka Electron | `Maka.exe`, Chromium children |
| MakaLight | `MakaLight.exe`, `msedgewebview2.exe`, relay `node` |
| OBS Studio | `obs64.exe` |

## States (10 min each, ≥3 runs, report median)

- **idle** — preview open, not streaming  
- **streaming** — sustained RTMP  
- **in-game** — fixed benchmark title while streaming  

## Metrics

| Column | Source |
| --- | --- |
| `timestamp`, `stack`, `state`, `run_id` | Harness |
| `private_bytes_total` | Sum process-tree private bytes (Windows perf counter / PowerShell) |
| `cpu_percent` | Process CPU |
| `fps_avg`, `fps_1pct_low` | PresentMon or CapFrameX (optional merge) |

## Usage (stub)

```bash
node benchmark/record.mjs --stack makalight --state idle --label run01 --duration 600
```

Full Windows sampling lands in a follow-up PR; see [resource utilization analysis](../docs/resource-utilization-analysis.md).

## Output layout

```
benchmark/runs/<date>/<stack>_<state>_<label>/metrics.csv
benchmark/runs/<date>/<stack>_<state>_<label>/run.json
```

Plot figures: `node scripts/plot-benchmark.mjs` (stub) → `docs/paper/figures/`.