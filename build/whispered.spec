# -*- mode: python ; coding: utf-8 -*-
import platform
import sys
from pathlib import Path

block_cipher = None
root = Path(SPECPATH).resolve().parent

system = platform.system()
machine = platform.machine().lower()

if system == "Darwin":
    ffmpeg_plat = "mac-arm64" if machine in ("arm64", "aarch64") else "mac-x64"
elif system == "Windows":
    ffmpeg_plat = "win64"
elif machine in ("arm64", "aarch64"):
    ffmpeg_plat = "linux-arm64"
else:
    ffmpeg_plat = "linux-x64"

ffmpeg_dir = root / "vendor" / "ffmpeg" / ffmpeg_plat
frontend_dist = root / "frontend" / "dist"

datas = []
if frontend_dist.is_dir():
    datas.append((str(frontend_dist), "frontend/dist"))
else:
    print("WARNING: frontend/dist missing. Run: cd frontend && npm run build", file=sys.stderr)

if ffmpeg_dir.is_dir() and any(ffmpeg_dir.iterdir()):
    datas.append((str(ffmpeg_dir), f"vendor/ffmpeg/{ffmpeg_plat}"))
else:
    print(f"NOTE: {ffmpeg_dir} missing; bundling imageio-ffmpeg instead", file=sys.stderr)
    try:
        import imageio_ffmpeg

        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        datas.append((str(Path(ffmpeg_exe).parent), "imageio_ffmpeg"))
    except ImportError:
        print("WARNING: imageio-ffmpeg not installed", file=sys.stderr)

excludes = [
    "torch.test",
    "torch.testing",
    "torch.utils.tensorboard",
    "torch.distributed",
    "matplotlib",
    "scipy",
    "PIL",
    "IPython",
    "notebook",
    "tkinter",
    "tensorflow",
    "tensorboard",
]

hiddenimports = [
    "whisper",
    "whisper.audio",
    "whisper.model",
    "whisper.decoding",
    "whisper.transcribe",
    "tiktoken",
    "tiktoken_ext.openai_public",
    "torch",
    "webview",
    "app",
    "app.api",
    "app.paths",
    "app.whisper_service",
    "imageio_ffmpeg",
]

if system == "Darwin":
    hiddenimports.append("webview.platforms.cocoa")
elif system == "Windows":
    hiddenimports.extend(["webview.platforms.winforms", "webview.platforms.edgechromium"])
elif system == "Linux":
    hiddenimports.append("webview.platforms.gtk")

a = Analysis(
    [str(root / "run.py")],
    pathex=[str(root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Whispered",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=(system == "Linux"),
    upx=False,
    upx_exclude=[],
    name="Whispered",
)

if system == "Darwin":
    app = BUNDLE(
        coll,
        name="Whispered.app",
        icon=None,
        bundle_identifier="com.whispered.app",
    )
