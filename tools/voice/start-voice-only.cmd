@echo off
REM ============================================================
REM  start-voice-only.cmd -- her voice, and nothing else
REM
REM  Starts the two windows her voice needs:
REM      9880  GPT-SoVITS itself   (loads the weights, ~2.5 min)
REM      9881  the bridge          (waits for 9880, then serves)
REM
REM  WHY THIS EXISTS NEXT TO start-voice.cmd
REM    The older start-voice.cmd was written back when everything ran
REM    through DSH, and its closing message tells you to go refresh the
REM    DSH page. The standalone app does not use DSH at all -- it talks
REM    to the model itself -- so that hint is wrong here, and a wrong
REM    hint is worse than none. Same two windows, honest text.
REM
REM  PURE ASCII. Always. cmd.exe decodes .cmd with the system codepage
REM  (936/GBK) while these files are UTF-8; one Chinese byte can swallow
REM  the quote or the line break after it, and cmd then runs the pieces.
REM ============================================================

@echo off
chcp 65001 >nul
title Elysia Voice

echo ============================================================
echo   Starting her voice -- two windows, do not close them
echo.
echo     1) GPT-SoVITS        127.0.0.1:9880   loads in ~2.5 minutes
echo     2) bridge            127.0.0.1:9881   comes up right after
echo.
echo   Wait until neither window is scrolling text any more.
echo   She can still talk (typed) while these are loading -- she just
echo   has no voice yet.
echo.
echo   DSH is NOT part of this. The desktop app does not need it.
echo ============================================================
echo.

start "Elysia Voice - GPT-SoVITS" cmd /k "%~dp0start-sovits-api.cmd"

REM Do NOT use `timeout /t` here: with no console it dies with
REM "Input redirection is not supported" and aborts the rest of the file,
REM so the second `start` would never run.
ping -n 4 127.0.0.1 >nul

start "Elysia Voice - bridge" cmd /k "%~dp0start-bridge.cmd"

echo.
echo   Both windows are on their way. This one can be closed.
ping -n 7 127.0.0.1 >nul
