from __future__ import annotations

import json
import os
import platform
import subprocess
from pathlib import Path
from typing import Any

from app import paths


def _ffprobe_binary() -> Path | None:
    ffmpeg = paths.ffmpeg_binary()
    if ffmpeg is None:
        return None
    name = "ffprobe.exe" if platform.system() == "Windows" else "ffprobe"
    candidate = ffmpeg.parent / name
    return candidate if candidate.is_file() else None


def _parse_duration_from_ffmpeg_stderr(stderr: str) -> float | None:
    for line in stderr.splitlines():
        if "Duration:" not in line:
            continue
        try:
            stamp = line.split("Duration:", 1)[1].split(",", 1)[0].strip()
            hours, minutes, seconds = stamp.split(":")
            total = (
                int(hours) * 3600
                + int(minutes) * 60
                + float(seconds)
            )
            return total if total > 0 else None
        except (ValueError, IndexError):
            return None
    return None


def _probe_duration_sec(file_path: str) -> float | None:
    ffprobe = _ffprobe_binary()
    if ffprobe is not None:
        try:
            out = subprocess.run(
                [
                    str(ffprobe),
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "json",
                    file_path,
                ],
                capture_output=True,
                text=True,
                check=True,
                timeout=30,
            )
            data = json.loads(out.stdout)
            raw = data.get("format", {}).get("duration")
            if raw is not None:
                duration = float(raw)
                if duration > 0:
                    return duration
        except (OSError, subprocess.SubprocessError, json.JSONDecodeError, ValueError, TypeError):
            pass

    ffmpeg = paths.ffmpeg_binary()
    if ffmpeg is None:
        return None
    try:
        proc = subprocess.run(
            [str(ffmpeg), "-i", file_path],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return _parse_duration_from_ffmpeg_stderr(proc.stderr)
    except (OSError, subprocess.SubprocessError):
        return None


def get_audio_info(file_path: str) -> dict[str, Any]:
    if not file_path or not os.path.isfile(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    stat = os.stat(file_path)
    path = Path(file_path)
    return {
        "path": file_path,
        "name": path.name,
        "extension": path.suffix.lower().lstrip(".") or None,
        "size_bytes": stat.st_size,
        "duration_sec": _probe_duration_sec(file_path),
    }
