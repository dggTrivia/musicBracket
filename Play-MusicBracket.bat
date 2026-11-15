@echo off
setlocal
title MusicBracket
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-MusicBracket.ps1" %*
if errorlevel 1 (
  echo.
  echo MusicBracket could not start. See the message above.
  pause
)
endlocal
