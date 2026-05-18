$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Vendor = Join-Path $Root "vendor\ffmpeg\win64"
New-Item -ItemType Directory -Force -Path $Vendor | Out-Null

python -m pip install -q imageio-ffmpeg

$Out = Join-Path $Vendor "ffmpeg.exe"
python -c @"
import shutil, imageio_ffmpeg
shutil.copy2(imageio_ffmpeg.get_ffmpeg_exe(), r'$Out')
print('Installed ffmpeg at', r'$Out')
"@
