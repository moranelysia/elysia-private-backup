@echo off
REM ============================================================
REM  start-all.cmd -- one click, everything
REM
REM  PURE ASCII ONLY. Never add Chinese characters to this file.
REM  cmd.exe decodes .cmd with the console code page (936/GBK);
REM  a UTF-8 Chinese byte sequence can swallow the quotes or the
REM  line break that follows, and cmd then runs the fragments.
REM  All Chinese output lives in .cjs files (Node reads UTF-8).
REM
REM  Default:
REM    1. the pet     (Bongo Cat -- the body on your desktop)
REM    2. her         (the tray flower -- click it to talk)
REM
REM  Voice is skipped during testing. To include it:
REM    start-all.cmd --voice
REM
REM  Steps 1+2 reuse the proven launcher; 3+4 are the pet project.
REM  Chinese folder and file names are passed to node as ARGUMENTS,
REM  which survive intact -- only file CONTENT must stay ASCII.
REM ============================================================

chcp 65001 >nul
title Elysia - start everything

cd /d "%~dp0"

if not exist "start-all.cjs" goto :missing
if not exist "node_modules" (
  REM node itself is enough for this script
)

REM ---------- the pet, and her ----------
REM  All steps live inside start-all.cjs, because they need
REM  a Chinese path, and a Chinese path inside THIS file would break it.
node "start-all.cjs" %*

echo.
echo   ============================================================
echo    Everything is up.
echo.
echo      the pet    : on your desktop (follows your typing)
echo      her        : the pink flower in the tray, bottom right
echo                   (may hide behind the ^ arrow -- drag it out)
echo.
echo    To stop the pet : right-click its own tray icon - Exit
echo    To stop her     : right-click the pink flower - Exit
echo    Voice was skipped unless this was started with --voice.
echo   ============================================================
echo.
exit /b 0

:missing
echo.
echo   [ERROR] start-all.cjs is missing -- this file must stay in
echo   the project folder, next to the pet project folder.
echo.
echo   You are running it from:
echo       %~dp0
echo.
pause
exit /b 1
