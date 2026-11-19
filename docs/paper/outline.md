# Paper outline — lightweight streaming studio shells

Working title: *Reducing desktop streaming overhead by replacing bundled Chromium with a system webview.*

## Abstract

Problem, method (three-stack comparison), results TBD after benchmark runs.

## 1. Introduction

- Downloadable studios vs cloud gaming sites  
- Electron RAM/CPU tax  
- **MakaLight** hypothesis  

## 2. Related work

OBS single-process model; Electron streaming apps; WebView2.

## 3. Architectures

Diagram: OBS vs Maka Electron vs MakaLight (WHIP + open relay).

## 4. Method

- Machine spec lock  
- idle / streaming / in-game  
- Metrics table from [resource-utilization-analysis.md](../resource-utilization-analysis.md)  
- Note: Electron baseline **as-shipped** (may include legacy in-app browser); MakaLight studio-only  

## 5. Results

Tables + figures from `docs/paper/figures/` (generated).

## 6. Discussion

Tradeoffs, WebRTC codec parity, capture latency.

## 7. Conclusion

## Appendix

- CSV schema (`benchmark/runs/...`)  
- Harness version, MakaLight 0.1.x, Maka Electron 2.8.3 pin, OBS version pin  