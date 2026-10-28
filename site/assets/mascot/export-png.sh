#!/usr/bin/env bash
# Render mascot PNGs from maka-mascot.svg into marketing/icons/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SVG="${ROOT}/site/assets/mascot/maka-mascot.svg"
OUT="${ROOT}/marketing/icons"
mkdir -p "${OUT}"

render() {
  local size="$1"
  local name="$2"
  npx --yes @resvg/resvg-js-cli --fit-width "${size}" "${SVG}" "${OUT}/${name}"
  echo "Wrote ${OUT}/${name} (${size}px)"
}

render 48 maka-mascot-48.png
render 256 maka-mascot-256.png
