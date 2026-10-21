@echo off
rem ---------------------------------------------------------------------------
rem  Desktop pet bridge service (launcher).
rem
rem  Watches .cache\command-queue.json. Whenever a command shows up there,
rem  this service presses the matching hotkey for Bongo Cat.
rem
rem  ASCII ONLY - both the file name and its contents.
rem  cmd.exe reads .cmd files with the system ANSI codepage, so any non-ASCII
rem  byte here gets mangled and the parser runs the comment text as commands.
rem  All the Chinese text and real logic lives in tools\pet-service.cjs.
rem
rem  Double-click to start. Keep this window open.
rem ---------------------------------------------------------------------------
cd /d "%~dp0.."
node "tools\pet-service.cjs"
echo.
echo   Service stopped.
pause
