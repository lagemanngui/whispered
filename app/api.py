from __future__ import annotations

import os
import threading
import time
from typing import Any

import webview

from app import audio_info, history_store, paths, whisper_service

_job_lock = threading.Lock()
_job_state: dict[str, Any] = {
    "status": "idle",
    "phase": None,
    "progress": None,
    "percent": None,
    "partial_text": None,
    "result": None,
    "history_entry": None,
    "error": None,
}


def _history_title(audio_path: str) -> str:
    import os
    from datetime import datetime

    base = os.path.basename(audio_path)
    name, _ = os.path.splitext(base)
    stamp = datetime.now().strftime("%b %d, %H:%M")
    return f"{name} — {stamp}"


def _history_from_result(
    result: dict,
    audio_path: str,
    model: str,
    language: str,
    task: str,
    *,
    audio_duration_sec: float | None = None,
    audio_size_bytes: int | None = None,
    transcribe_duration_ms: int | None = None,
) -> dict:
    return history_store.create_transcript(
        title=_history_title(audio_path),
        text=result.get("text") or "",
        audio_path=audio_path,
        model=model,
        language=language,
        task=task,
        detected_language=result.get("language"),
        segments=result.get("segments"),
        audio_duration_sec=audio_duration_sec,
        audio_size_bytes=audio_size_bytes,
        transcribe_duration_ms=transcribe_duration_ms,
    )


def _on_progress(update: dict[str, Any]) -> None:
    with _job_lock:
        _job_state["phase"] = update.get("phase")
        _job_state["progress"] = update.get("message")
        _job_state["percent"] = update.get("percent")
        if "partial_text" in update:
            _job_state["partial_text"] = update.get("partial_text")


class Api:
    def get_models(self) -> list[dict[str, Any]]:
        return whisper_service.list_models()

    def get_languages(self) -> list[str]:
        return whisper_service.list_languages()

    def get_ffmpeg_status(self) -> dict[str, Any]:
        binary = paths.ffmpeg_binary()
        return {
            "bundled": binary is not None,
            "path": str(binary) if binary else None,
        }

    def get_audio_info(self, path: str) -> dict[str, Any]:
        try:
            return audio_info.get_audio_info(path)
        except OSError as exc:
            return {"error": str(exc)}

    def pick_audio_file(self) -> str | None:
        file_types = (
            "Audio files (*.mp3;*.wav;*.m4a;*.flac;*.ogg;*.webm;*.aac;*.wma)",
            "All files (*.*)",
        )
        result = webview.windows[0].create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=False,
            file_types=file_types,
        )
        if not result:
            return None
        return result[0] if isinstance(result, (list, tuple)) else result

    def get_job_status(self) -> dict[str, Any]:
        with _job_lock:
            return {
                "status": _job_state["status"],
                "phase": _job_state["phase"],
                "progress": _job_state["progress"],
                "percent": _job_state["percent"],
                "partial_text": _job_state["partial_text"],
                "result": _job_state["result"],
                "history_entry": _job_state["history_entry"],
                "error": _job_state["error"],
            }

    def transcribe(
        self,
        path: str,
        model: str = "turbo",
        language: str = "auto",
        task: str = "transcribe",
    ) -> dict[str, Any]:
        with _job_lock:
            if _job_state["status"] == "running":
                return {"started": False, "error": "A transcription is already in progress."}
            _job_state["status"] = "running"
            _job_state["phase"] = "starting"
            _job_state["progress"] = "Starting…"
            _job_state["percent"] = None
            _job_state["partial_text"] = None
            _job_state["result"] = None
            _job_state["history_entry"] = None
            _job_state["error"] = None

        lang = None if language in ("", "auto") else language

        def run() -> None:
            whisper_service.set_progress_callback(_on_progress)
            started = time.perf_counter()
            file_meta: dict[str, Any] = {}
            try:
                file_meta = audio_info.get_audio_info(path)
            except OSError:
                file_meta = {}
            try:
                result = whisper_service.transcribe(
                    path,
                    model=model,
                    language=lang,
                    task=task,
                )
                elapsed_ms = int((time.perf_counter() - started) * 1000)
                history_entry = _history_from_result(
                    result,
                    path,
                    model,
                    lang or language,
                    task,
                    audio_duration_sec=file_meta.get("duration_sec"),
                    audio_size_bytes=file_meta.get("size_bytes"),
                    transcribe_duration_ms=elapsed_ms,
                )
                with _job_lock:
                    _job_state["status"] = "done"
                    _job_state["phase"] = None
                    _job_state["progress"] = None
                    _job_state["percent"] = None
                    _job_state["partial_text"] = None
                    _job_state["result"] = result
                    _job_state["history_entry"] = history_entry
            except Exception as exc:
                with _job_lock:
                    _job_state["status"] = "error"
                    _job_state["phase"] = None
                    _job_state["progress"] = None
                    _job_state["percent"] = None
                    _job_state["partial_text"] = None
                    _job_state["history_entry"] = None
                    _job_state["error"] = str(exc)
            finally:
                whisper_service.set_progress_callback(None)

        threading.Thread(target=run, daemon=True).start()
        return {"started": True}

    def reset_job(self) -> dict[str, bool]:
        with _job_lock:
            if _job_state["status"] == "running":
                return {"ok": False}
            _job_state["status"] = "idle"
            _job_state["phase"] = None
            _job_state["progress"] = None
            _job_state["percent"] = None
            _job_state["partial_text"] = None
            _job_state["result"] = None
            _job_state["history_entry"] = None
            _job_state["error"] = None
        return {"ok": True}

    def list_history(self) -> list[dict[str, Any]]:
        return history_store.list_transcripts()

    def get_history(self, transcript_id: str) -> dict[str, Any] | None:
        return history_store.get_transcript(transcript_id)

    def create_history(
        self,
        title: str,
        text: str,
        audio_path: str | None = None,
        model: str | None = None,
        language: str | None = None,
        task: str | None = None,
        detected_language: str | None = None,
        audio_duration_sec: float | None = None,
        audio_size_bytes: int | None = None,
        transcribe_duration_ms: int | None = None,
    ) -> dict[str, Any]:
        if not title.strip():
            title = "Untitled transcript"
        return history_store.create_transcript(
            title=title.strip(),
            text=text,
            audio_path=audio_path or None,
            model=model,
            language=language,
            task=task,
            detected_language=detected_language,
            audio_duration_sec=audio_duration_sec,
            audio_size_bytes=audio_size_bytes,
            transcribe_duration_ms=transcribe_duration_ms,
        )

    def update_history(
        self,
        transcript_id: str,
        title: str | None = None,
        text: str | None = None,
        audio_path: str | None = None,
        model: str | None = None,
        language: str | None = None,
        task: str | None = None,
        detected_language: str | None = None,
        audio_duration_sec: float | None = None,
        audio_size_bytes: int | None = None,
        transcribe_duration_ms: int | None = None,
    ) -> dict[str, Any]:
        clean_title = None
        if title is not None:
            clean_title = title.strip() or "Untitled transcript"
        updated = history_store.update_transcript(
            transcript_id,
            title=clean_title,
            text=text,
            audio_path=audio_path,
            model=model,
            language=language,
            task=task,
            detected_language=detected_language,
            audio_duration_sec=audio_duration_sec,
            audio_size_bytes=audio_size_bytes,
            transcribe_duration_ms=transcribe_duration_ms,
        )
        if updated is None:
            return {"ok": False, "error": "Transcript not found."}
        return {"ok": True, "entry": updated}

    def delete_history(self, transcript_id: str) -> dict[str, Any]:
        deleted = history_store.delete_transcript(transcript_id)
        if not deleted:
            return {"ok": False, "error": "Transcript not found."}
        return {"ok": True}

    _DEFAULT_FILE_TYPES = (
        "HTML (*.html)",
        "Markdown (*.md)",
        "Text (*.txt)",
        "All files (*.*)",
    )

    def save_file(
        self,
        content: str,
        default_name: str = "transcript.txt",
        file_types: list[str] | tuple[str, ...] | None = None,
    ) -> dict[str, Any]:
        if not content:
            return {"saved": False, "error": "Nothing to save."}

        types = tuple(file_types) if file_types else self._DEFAULT_FILE_TYPES
        result = webview.windows[0].create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename=default_name,
            file_types=types,
        )
        if not result:
            return {"saved": False}

        path = result if isinstance(result, str) else result[0]
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            return {"saved": True, "path": path}
        except OSError as exc:
            return {"saved": False, "error": str(exc)}

    def save_transcript(self, text: str, default_name: str = "transcript.txt") -> dict[str, Any]:
        return self.save_file(
            text,
            default_name,
            ("Text files (*.txt)", "All files (*.*)"),
        )

    _MAX_IMAGE_BYTES = 10 * 1024 * 1024

    def pick_image_file(self) -> str | None:
        file_types = (
            "Images (*.png;*.jpg;*.jpeg;*.gif;*.webp;*.bmp;*.svg)",
            "All files (*.*)",
        )
        result = webview.windows[0].create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=False,
            file_types=file_types,
        )
        if not result:
            return None
        return result[0] if isinstance(result, (list, tuple)) else result

    def image_to_data_url(self, path: str) -> dict[str, Any]:
        import base64
        import mimetypes

        try:
            mime, _ = mimetypes.guess_type(path)
            if not mime or not mime.startswith("image/"):
                return {"error": "Not an image file."}
            size = os.path.getsize(path)
            if size > self._MAX_IMAGE_BYTES:
                return {"error": "Image is too large (max 10 MB)."}
            with open(path, "rb") as f:
                encoded = base64.b64encode(f.read()).decode("ascii")
            return {"data_url": f"data:{mime};base64,{encoded}"}
        except OSError as exc:
            return {"error": str(exc)}

    def copy_to_clipboard(self, text: str) -> dict[str, bool]:
        if not text:
            return {"ok": False}
        try:
            import subprocess
            import platform

            system = platform.system()
            if system == "Darwin":
                subprocess.run(["pbcopy"], input=text.encode("utf-8"), check=True)
            elif system == "Windows":
                subprocess.run(
                    ["clip"],
                    input=text,
                    check=True,
                    text=True,
                    shell=True,
                )
            else:
                subprocess.run(
                    ["xclip", "-selection", "clipboard"],
                    input=text.encode("utf-8"),
                    check=True,
                )
            return {"ok": True}
        except Exception:
            return {"ok": False}
