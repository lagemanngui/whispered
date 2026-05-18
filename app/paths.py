from __future__ import annotations

import os
import platform
import sys
from pathlib import Path

ROOT: Path | None = None
RESOURCE_ROOT: Path | None = None
FRONTEND_DIST: Path | None = None


def init() -> None:
    global ROOT, RESOURCE_ROOT, FRONTEND_DIST

    if getattr(sys, "frozen", False):
        ROOT = Path(sys.executable).resolve().parent
        RESOURCE_ROOT = Path(getattr(sys, "_MEIPASS", ROOT))
    else:
        ROOT = Path(__file__).resolve().parent.parent
        RESOURCE_ROOT = ROOT

    FRONTEND_DIST = RESOURCE_ROOT / "frontend" / "dist"
    _configure_ffmpeg()


def _ffmpeg_platform_dir() -> str:
    system = platform.system()
    machine = platform.machine().lower()
    if system == "Darwin":
        if machine in ("arm64", "aarch64"):
            return "mac-arm64"
        return "mac-x64"
    if system == "Windows":
        return "win64"
    if machine in ("arm64", "aarch64"):
        return "linux-arm64"
    return "linux-x64"


def _vendor_candidates() -> list[Path]:
    if RESOURCE_ROOT is None:
        init()
    assert RESOURCE_ROOT is not None

    platform_dir = _ffmpeg_platform_dir()
    name = "ffmpeg.exe" if platform.system() == "Windows" else "ffmpeg"
    paths = [RESOURCE_ROOT / "vendor" / "ffmpeg" / platform_dir / name]

    if ROOT and ROOT != RESOURCE_ROOT:
        paths.append(ROOT / "vendor" / "ffmpeg" / platform_dir / name)

    if not getattr(sys, "frozen", False):
        project_root = Path(__file__).resolve().parent.parent
        paths.append(project_root / "vendor" / "ffmpeg" / platform_dir / name)

    return paths


def _imageio_ffmpeg_binary() -> Path | None:
    try:
        import imageio_ffmpeg
    except ImportError:
        return None

    exe = Path(imageio_ffmpeg.get_ffmpeg_exe())
    return exe if exe.is_file() else None


def ffmpeg_binary() -> Path | None:
    for candidate in _vendor_candidates():
        if candidate.is_file():
            return candidate
    return _imageio_ffmpeg_binary()


def _configure_ffmpeg() -> None:
    binary = ffmpeg_binary()
    if binary is None:
        return

    ffmpeg_dir = str(binary.parent)
    path = os.environ.get("PATH", "")
    if ffmpeg_dir not in path.split(os.pathsep):
        os.environ["PATH"] = ffmpeg_dir + os.pathsep + path

    os.environ["WHISPER_FFMPEG"] = str(binary)


def index_html() -> Path:
    if FRONTEND_DIST is None:
        init()
    assert FRONTEND_DIST is not None
    return FRONTEND_DIST / "index.html"


def user_data_dir() -> Path:
    system = platform.system()
    if system == "Darwin":
        base = Path.home() / "Library" / "Application Support" / "Whispered"
    elif system == "Windows":
        appdata = os.environ.get("APPDATA")
        base = Path(appdata) / "Whispered" if appdata else Path.home() / "Whispered"
    else:
        base = Path.home() / ".local" / "share" / "whispered"
    base.mkdir(parents=True, exist_ok=True)
    return base
