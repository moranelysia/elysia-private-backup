@echo off
REM ============================================================
REM  make-icon.cmd -- put an Elysia icon on your Desktop
REM
REM  Double-click this once. It builds icon.ico from her drawn icon
REM  and creates a Desktop shortcut named "Elysia" that starts
REM  everything: her voice, DSH, the desktop pet, and the tray flower.
REM
REM  PURE ASCII: cmd.exe decodes .cmd with the system codepage
REM  (936/GBK); a UTF-8 Chinese byte can swallow the following quote
REM  or line break and cmd then runs the fragments. All Chinese logic
REM  lives in .cjs / .ps1 files, which are read as UTF-8.
REM ============================================================

chcp 65001 >nul
cd /d "%~dp0"

if not exist "build-folder-icon.ps1" (
  echo.
  echo   [ERROR] build-folder-icon.ps1 is missing next to this file.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "build-folder-icon.ps1"

echo.
pause
