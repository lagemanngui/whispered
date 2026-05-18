$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

& "$Root\scripts\fetch-ffmpeg.ps1"

Set-Location "$Root\frontend"
npm ci
npm run build
Set-Location $Root

python -m venv .venv
& .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install pyinstaller

$env:PYTHONPATH = $Root
pyinstaller build\whispered.spec --noconfirm

Write-Host "Build output: $Root\dist\Whispered"
