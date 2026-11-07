# Local preview on Windows: http://127.0.0.1:4000
# Usage (from the repo root):  powershell -ExecutionPolicy Bypass -File scripts\windows-preview\serve.ps1
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$env:Path = "$env:LOCALAPPDATA\Programs\Ruby33\bin;$env:Path"
$env:BUNDLE_GEMFILE = Join-Path $PSScriptRoot "Gemfile"
$env:BUNDLE_PATH__SYSTEM = "true"
Set-Location $root
bundle exec jekyll serve --host 127.0.0.1 --port 4000 --watch --force_polling @args
