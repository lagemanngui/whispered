#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARCH="$(uname -m)"
PLAT="mac-arm64"
if [[ "$ARCH" != "arm64" ]]; then
  PLAT="mac-x64"
fi

if [[ ! -f "$ROOT/vendor/ffmpeg/$PLAT/ffmpeg" ]]; then
  echo "Installing bundled ffmpeg…"
  bash "$ROOT/scripts/fetch-ffmpeg.sh"
fi

cd frontend
if [[ ! -d node_modules ]]; then
  npm install
fi
npm run build
cd "$ROOT"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q -r requirements.txt

export PYTHONPATH="$ROOT"
python run.py
