#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

OS="$(uname -s)"
ARCH="$(uname -m)"

if [[ "$OS" == "Darwin" ]]; then
  if [[ "$ARCH" == "arm64" ]]; then
    PLATFORM="mac-arm64"
  else
    PLATFORM="mac-x64"
  fi
elif [[ "$OS" == "Linux" ]]; then
  if [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
    PLATFORM="linux-arm64"
  else
    PLATFORM="linux-x64"
  fi
else
  echo "On Windows run: powershell -File scripts/fetch-ffmpeg.ps1"
  exit 1
fi

OUT="$ROOT/vendor/ffmpeg/$PLATFORM/ffmpeg"
mkdir -p "$(dirname "$OUT")"

if [[ -x "$ROOT/.venv/bin/python" ]]; then
  PYTHON="$ROOT/.venv/bin/python"
elif command -v python3 &>/dev/null; then
  PYTHON="python3"
else
  PYTHON="python"
fi

"$PYTHON" -m pip install -q imageio-ffmpeg

export OUT
"$PYTHON" - <<'PY'
import os
import shutil
import stat

import imageio_ffmpeg

src = imageio_ffmpeg.get_ffmpeg_exe()
out = os.environ["OUT"]
shutil.copy2(src, out)
os.chmod(out, os.stat(out).st_mode | stat.S_IEXEC)
print(f"Installed ffmpeg at {out}")
PY
