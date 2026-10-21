@echo off
rem ============================================================
rem  start-elysia.cmd -- start Elysia (tray version)
rem
rem  RULE: NO CHINESE CHARACTERS IN THIS FILE.
rem  cmd.exe reads .cmd files using the system ANSI codepage (936/GBK),
rem  but this file is UTF-8. One Chinese byte sequence is enough to
rem  break a whole line -- the command gets cut in half and cmd tries
rem  to run the fragments. So: ASCII file name, ASCII content.
rem  All Chinese logic lives in .cjs files (Node reads UTF-8 properly).
rem
rem  Double-click this file to wake her up.
rem ============================================================

chcp 65001 >nul
cd /d "%~dp0.."

if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo   [!] Electron is not installed yet.
  echo       Run this in the project folder:  npm install
  echo.
  pause
  exit /b 1
)

echo.
echo   Waking up Elysia...
echo   (a small window will pop up; afterwards she lives on the tray flower)
echo.

rem Call electron.exe directly -- do NOT use npx. npx hits the network
rem every run and grabs the npm cache lock, which deadlocks with Cyrene.
start "" "node_modules\electron\dist\electron.exe" .
