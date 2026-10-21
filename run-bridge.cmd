@echo off
rem ---------------------------------------------------------------------------
rem  Start the desktop pet bridge service (double-click this file).
rem
rem  It runs start-pet-service.cjs, which watches
rem      ai-li-xi-ya\.cache\command-queue.json
rem  and presses the matching hotkey in Bongo Cat whenever a command appears.
rem
rem  WHY THIS FILE EXISTS: double-clicking a .cjs does not run it on Windows -
rem  .cjs is not associated with node by default. So we need a .cmd wrapper.
rem
rem  ASCII ONLY - file name and contents. cmd.exe reads .cmd with the system
rem  ANSI codepage (936 / GBK here) while these files are stored as UTF-8, so
rem  any Chinese character would be mis-decoded and break the parser.
rem ---------------------------------------------------------------------------
chcp 65001 >nul
cd /d "%~dp0"
title Elysia - desktop pet service

node "start-pet-service.cjs"

echo.
echo   Service stopped.
pause
