param(
    [switch]$NoBrowser,
    [switch]$SetupOnly
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskPort = 19473
$taskUrl = "http://musicbracket.localhost:$taskPort/"
$probeUrl = "http://127.0.0.1:$taskPort/"
$runtimeDirectory = Join-Path $PSScriptRoot '.runtime'
$launchLock = $null
$browserJob = $null

function Get-LaunchFileHash([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
        return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '')
    } finally {
        $stream.Dispose()
        $algorithm.Dispose()
    }
}

function Test-MusicBracket {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $probeUrl -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content -match '<title>MusicBracket'
    } catch {
        return $false
    }
}

try {
    Write-Host ''
    Write-Host 'MusicBracket' -ForegroundColor Green
    Write-Host ''
    if (-not $SetupOnly -and (Test-MusicBracket)) {
        Write-Host "Already running at $taskUrl"
        if (-not $NoBrowser) { Start-Process $taskUrl }
        exit 0
    }
    if (-not $SetupOnly -and (Get-NetTCPConnection -LocalPort $taskPort -State Listen -ErrorAction SilentlyContinue)) {
        throw "Another application is using port $taskPort. Close it, then launch MusicBracket again."
    }
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
    try {
        $launchLock = [System.IO.File]::Open(
            (Join-Path $runtimeDirectory 'launch.lock'),
            [System.IO.FileMode]::OpenOrCreate,
            [System.IO.FileAccess]::ReadWrite,
            [System.IO.FileShare]::None
        )
    } catch {
        throw 'MusicBracket is already starting. Please wait for the first window.'
    }
    $taskNode = Get-Command node.exe -ErrorAction SilentlyContinue
    $nodePath = if ($taskNode) { $taskNode.Source } else { $null }
    if ($nodePath) {
        $versionText = & $nodePath --version
        if ($LASTEXITCODE -ne 0 -or [version]$versionText.TrimStart('v') -lt [version]'22.18.0') {
            $nodePath = $null
        }
    }
    if (-not $nodePath) {
        $nodeVersion = '22.18.0'
        $taskArchitecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
        $archiveName = "node-v$nodeVersion-win-$taskArchitecture.zip"
        $nodeDirectory = Join-Path $runtimeDirectory "node-v$nodeVersion-win-$taskArchitecture"
        $nodePath = Join-Path $nodeDirectory 'node.exe'
        if (-not (Test-Path -LiteralPath $nodePath) -or
            -not (Test-Path -LiteralPath (Join-Path $nodeDirectory 'node_modules/npm/bin/npx-cli.js'))) {
            Write-Host 'Downloading Node.js into this project folder for first-time setup...'
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $archivePath = Join-Path $runtimeDirectory $archiveName
            $downloadBase = "https://nodejs.org/dist/v$nodeVersion"
            Invoke-WebRequest -UseBasicParsing -Uri "$downloadBase/$archiveName" -OutFile $archivePath
            $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "$downloadBase/SHASUMS256.txt").Content
            if ($checksums -is [byte[]]) { $checksums = [Text.Encoding]::UTF8.GetString($checksums) }
            $checksumLine = ($checksums -split "\r?\n" | Where-Object { $_.EndsWith("  $archiveName") }) | Select-Object -First 1
            $expected = if ($checksumLine) { ($checksumLine -split '\s+')[0] } else { '' }
            if (-not $expected -or (Get-LaunchFileHash $archivePath) -ne $expected) {
                throw 'The Node.js download failed its checksum check. Launch again to retry.'
            }
            Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeDirectory -Force
        }
    }
    $env:PATH = "$(Split-Path -Parent $nodePath);$env:PATH"
    $lockHash = Get-LaunchFileHash (Join-Path $PSScriptRoot 'pnpm-lock.yaml')
    $stamp = Join-Path $runtimeDirectory 'installed-lock.txt'
    $installedHash = if (Test-Path -LiteralPath $stamp) { (Get-Content -LiteralPath $stamp -Raw).Trim() } else { '' }
    if ($installedHash -ne $lockHash -or -not (Test-Path -LiteralPath 'node_modules/vite/bin/vite.js')) {
        Write-Host 'Installing project dependencies. First launch needs an internet connection...'
        $taskPnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
        if ($taskPnpm) {
            & $taskPnpm.Source install --frozen-lockfile
        } else {
            $taskNpx = Join-Path (Split-Path -Parent $nodePath) 'npx.cmd'
            if (-not (Test-Path -LiteralPath $taskNpx)) {
                $taskNpx = (Get-Command npx.cmd -ErrorAction Stop).Source
            }
            & $taskNpx --yes pnpm@11.25.0 install --frozen-lockfile
        }
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check your connection and launch again.' }
        Set-Content -LiteralPath $stamp -Value $lockHash -Encoding Ascii
    }
    if ($SetupOnly) {
        Write-Host 'Setup complete.' -ForegroundColor Green
        exit 0
    }
    Write-Host "Opening $taskUrl" -ForegroundColor Green
    Write-Host 'Keep this window open while playing. Press Ctrl+C to stop.'
    if (-not $NoBrowser) {
        $browserJob = Start-Job -ArgumentList $taskUrl, $probeUrl -ScriptBlock {
            param($url, $probe)
            for ($attempt = 0; $attempt -lt 40; $attempt++) {
                try {
                    $page = Invoke-WebRequest -UseBasicParsing -Uri $probe -TimeoutSec 1
                    if ($page.Content -match '<title>MusicBracket') {
                        Start-Process $url
                        return
                    }
                } catch {}
                Start-Sleep -Milliseconds 500
            }
        }
    }
    & $nodePath node_modules/vite/bin/vite.js --host 127.0.0.1 --port $taskPort --strictPort
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 130) { throw 'The local server stopped unexpectedly.' }
} catch {
    Write-Host ''
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    if ($browserJob) {
        Stop-Job -Job $browserJob -ErrorAction SilentlyContinue
        Remove-Job -Job $browserJob -Force -ErrorAction SilentlyContinue
    }
    if ($launchLock) { $launchLock.Dispose() }
}
