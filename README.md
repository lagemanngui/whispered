# Whispered

Cross-platform desktop app for transcribing audio with [OpenAI Whisper](https://github.com/openai/whisper). Runs entirely offline in a single process — no local web server. Built with PyWebView, React, and PyInstaller.

## Features

- Native file picker for audio (mp3, wav, m4a, flac, ogg, and more via ffmpeg)
- Model selection (tiny through large, turbo, English-only variants)
- Auto-detect language or choose manually
- Transcribe or translate to English (medium/large for translation)
- Copy transcript or save as `.txt`
- Bundled ffmpeg — end users do not install dependencies

## Requirements (developers)

- Python 3.10–3.12
- Node.js 20+
- macOS or Windows for packaging (build on the target OS)

## Quick start (development)

```bash
# macOS: fetch ffmpeg, build UI, run app
chmod +x scripts/*.sh
./scripts/dev.sh
```

Manual steps:

```bash
./scripts/fetch-ffmpeg.sh          # macOS (copies ffmpeg from imageio-ffmpeg)
# or: powershell -File scripts/fetch-ffmpeg.ps1   # Windows

cd frontend && npm install && npm run build && cd ..

python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

export PYTHONPATH="$(pwd)"         # Windows: set PYTHONPATH=%CD%
python run.py
```

On first transcription, Whisper downloads model weights to `~/.cache/whisper`.

## Package installers

**macOS:**

```bash
./scripts/package-mac.sh
# Output: dist/Whispered.app (inside dist/Whispered/)
```

**Windows:**

```powershell
.\scripts\package-win.ps1
# Output: dist\Whispered\Whispered.exe
```

Expect large artifacts (~1–2 GB) because PyTorch is bundled.

## Project layout

```
app/           Python: Whisper, PyWebView API bridge, launcher
frontend/      React UI (static build, file:// loaded)
vendor/ffmpeg/ Platform ffmpeg binaries (not in git)
build/         PyInstaller spec
scripts/       Dev and packaging helpers
```

## How it works

The React UI calls Python through PyWebView’s `js_api` (`window.pywebview.api.*`). Transcription runs on a background thread. ffmpeg is bundled per platform and prepended to `PATH` before Whisper loads audio.

## License

MIT. Whisper and model weights are [MIT licensed](https://github.com/openai/whisper/blob/main/LICENSE). ffmpeg builds from [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds) (GPL).
# whispered
