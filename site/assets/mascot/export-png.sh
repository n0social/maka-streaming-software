#!/usr/bin/env bash
# Render mascot PNGs from maka-mascot.png into marketing/icons/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SRC="${ROOT}/site/assets/mascot/maka-mascot.png"
OUT="${ROOT}/marketing/icons"
mkdir -p "${OUT}"

if [[ ! -f "${SRC}" ]]; then
  echo "Missing primary art: ${SRC}" >&2
  exit 1
fi

render() {
  local size="$1"
  local name="$2"
  ffmpeg -y -loglevel error -i "${SRC}" -vf "scale=${size}:${size}" "${OUT}/${name}"
  echo "Wrote ${OUT}/${name} (${size}px)"
}

render 48 maka-mascot-48.png
render 256 maka-mascot-256.png
render 512 maka-mascot-512.png
