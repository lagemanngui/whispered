from __future__ import annotations

import gc
import hashlib
import os
import re
import sys
import urllib.request
from contextlib import contextmanager
from typing import Any, Callable, TextIO

import whisper

ProgressCallback = Callable[[dict[str, Any]], None]

MODELS = [
    {"id": "turbo", "label": "Turbo (fast, multilingual)", "english_only": False, "supports_translate": False},
    {"id": "tiny", "label": "Tiny", "english_only": False, "supports_translate": True},
    {"id": "tiny.en", "label": "Tiny (English)", "english_only": True, "supports_translate": False},
    {"id": "base", "label": "Base", "english_only": False, "supports_translate": True},
    {"id": "base.en", "label": "Base (English)", "english_only": True, "supports_translate": False},
    {"id": "small", "label": "Small", "english_only": False, "supports_translate": True},
    {"id": "small.en", "label": "Small (English)", "english_only": True, "supports_translate": False},
    {"id": "medium", "label": "Medium", "english_only": False, "supports_translate": True},
    {"id": "medium.en", "label": "Medium (English)", "english_only": True, "supports_translate": False},
    {"id": "large", "label": "Large", "english_only": False, "supports_translate": True},
]

LANGUAGES = [
    "auto",
    "en",
    "es",
    "fr",
    "de",
    "it",
    "pt",
    "nl",
    "pl",
    "ru",
    "ja",
    "ko",
    "zh",
    "ar",
    "hi",
]

_loaded_model_name: str | None = None
_loaded_model: whisper.Whisper | None = None
_progress_callback: ProgressCallback | None = None


_SEGMENT_LINE = re.compile(r"^\[[\d:.]+\s+-->\s+[\d:.]+\]\s*(.*)$")


def _emit(
    phase: str,
    message: str,
    *,
    percent: float | None = None,
    partial_text: str | None = None,
) -> None:
    if _progress_callback is None:
        return
    payload: dict[str, Any] = {"phase": phase, "message": message}
    if percent is not None:
        payload["percent"] = round(percent, 1)
    if partial_text is not None:
        payload["partial_text"] = partial_text
    _progress_callback(payload)


class _VerboseTranscriptCapture(TextIO):
    """Capture Whisper verbose segment lines and emit growing transcript text."""

    def __init__(self, on_text: Callable[[str], None]) -> None:
        self._on_text = on_text
        self._parts: list[str] = []
        self._buffer = ""

    def write(self, s: str) -> int:
        if not s:
            return 0
        self._buffer += s
        while "\n" in self._buffer:
            line, self._buffer = self._buffer.split("\n", 1)
            self._handle_line(line.strip())
        return len(s)

    def flush(self) -> None:
        if self._buffer.strip():
            self._handle_line(self._buffer.strip())
            self._buffer = ""

    def _handle_line(self, line: str) -> None:
        if not line:
            return
        match = _SEGMENT_LINE.match(line)
        if not match:
            return
        text = match.group(1).strip()
        if not text:
            return
        self._parts.append(text)
        self._on_text(" ".join(self._parts))

    def readable(self) -> bool:
        return False

    @property
    def encoding(self) -> str | None:
        return "utf-8"


@contextmanager
def _verbose_transcript_stream():
    def on_partial(text: str) -> None:
        _emit("transcribing", "Transcribing audio…", partial_text=text)

    capture = _VerboseTranscriptCapture(on_partial)
    old_stdout = sys.stdout
    sys.stdout = capture
    try:
        yield
    finally:
        sys.stdout = old_stdout
        capture.flush()


def _format_bytes(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f} KB"
    if n < 1024 * 1024 * 1024:
        return f"{n / (1024 * 1024):.1f} MB"
    return f"{n / (1024 * 1024 * 1024):.2f} GB"


def _download_with_progress(url: str, root: str, in_memory: bool) -> bytes | str:
    os.makedirs(root, exist_ok=True)

    expected_sha256 = url.split("/")[-2]
    download_target = os.path.join(root, os.path.basename(url))

    if os.path.isfile(download_target):
        with open(download_target, "rb") as f:
            model_bytes = f.read()
        if hashlib.sha256(model_bytes).hexdigest() == expected_sha256:
            return model_bytes if in_memory else download_target

    model_name = os.path.basename(url).replace(".pt", "")
    _emit("downloading", f"Downloading {model_name} model…", percent=0.0)

    with urllib.request.urlopen(url) as source, open(download_target, "wb") as output:
        total = int(source.info().get("Content-Length") or 0)
        downloaded = 0
        while True:
            buffer = source.read(8192)
            if not buffer:
                break
            output.write(buffer)
            downloaded += len(buffer)
            if total > 0:
                pct = min(100.0, downloaded * 100.0 / total)
                _emit(
                    "downloading",
                    f"Downloading {model_name}… {_format_bytes(downloaded)} / {_format_bytes(total)}",
                    percent=pct,
                )
            else:
                _emit(
                    "downloading",
                    f"Downloading {model_name}… {_format_bytes(downloaded)}",
                )

    model_bytes = open(download_target, "rb").read()
    if hashlib.sha256(model_bytes).hexdigest() != expected_sha256:
        raise RuntimeError(
            "Model has been downloaded but the SHA256 checksum does not match. Please retry."
        )

    _emit("downloading", f"Downloaded {model_name}", percent=100.0)
    _emit("loading", f"Loading {model_name} into memory…")
    return model_bytes if in_memory else download_target


@contextmanager
def _patch_whisper_download():
    original = whisper._download
    whisper._download = _download_with_progress  # type: ignore[assignment]
    try:
        yield
    finally:
        whisper._download = original  # type: ignore[assignment]


def set_progress_callback(callback: ProgressCallback | None) -> None:
    global _progress_callback
    _progress_callback = callback


def list_models() -> list[dict[str, Any]]:
    return MODELS


def list_languages() -> list[str]:
    return LANGUAGES


def _model_cached(name: str) -> bool:
    if name not in whisper._MODELS:
        return False
    root = os.path.join(os.getenv("XDG_CACHE_HOME", os.path.expanduser("~/.cache")), "whisper")
    url = whisper._MODELS[name]
    path = os.path.join(root, os.path.basename(url))
    if not os.path.isfile(path):
        return False
    expected_sha256 = url.split("/")[-2]
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest() == expected_sha256


def _unload_model() -> None:
    global _loaded_model_name, _loaded_model
    _loaded_model = None
    _loaded_model_name = None
    gc.collect()


def get_model(name: str) -> whisper.Whisper:
    global _loaded_model_name, _loaded_model
    if _loaded_model is not None and _loaded_model_name == name:
        return _loaded_model

    _unload_model()

    if not _model_cached(name):
        _emit("downloading", f"Preparing to download {name}…", percent=0.0)
    else:
        _emit("loading", f"Loading {name} into memory…")

    with _patch_whisper_download():
        _loaded_model = whisper.load_model(name)

    _loaded_model_name = name
    return _loaded_model


def transcribe(
    file_path: str,
    *,
    model: str = "turbo",
    language: str | None = None,
    task: str = "transcribe",
) -> dict[str, Any]:
    if model == "turbo" and task == "translate":
        raise ValueError("The turbo model does not support translation. Use medium or large.")

    if not file_path or not os.path.isfile(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    whisper_model = get_model(model)
    _emit("transcribing", "Transcribing audio…", partial_text="")

    options: dict[str, Any] = {"task": task, "verbose": True}
    if language and language != "auto":
        options["language"] = language

    with _verbose_transcript_stream():
        result = whisper_model.transcribe(file_path, **options)
    segments = [
        {
            "id": seg["id"],
            "start": seg["start"],
            "end": seg["end"],
            "text": seg["text"],
        }
        for seg in result.get("segments", [])
    ]

    return {
        "text": (result.get("text") or "").strip(),
        "language": result.get("language"),
        "segments": segments,
    }
