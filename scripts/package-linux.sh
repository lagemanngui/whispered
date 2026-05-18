#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash scripts/fetch-ffmpeg.sh

cd frontend
npm ci
npm run build
cd "$ROOT"

python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -r requirements.txt
pip install 'pywebview[gtk]' pyinstaller

export PYTHONPATH="$ROOT"
pyinstaller build/whispered.spec --noconfirm

echo "Build output: $ROOT/dist/Whispered/Whispered"
