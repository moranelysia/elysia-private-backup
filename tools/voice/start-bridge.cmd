@echo off
REM Start the TTS bridge (9881). Pure ASCII on purpose - see below.
REM
REM The workspace path is derived with %~dp0 + ..\.. instead of
REM typing the Chinese name "Xin Jian Wen Jian Jia" literally.
REM Reason: `chcp 65001` earlier in this file switches cmd to UTF-8,
REM but cmd may have already buffered/decoded the following lines, so a
REM Chinese `cd /d` could fail - which is exactly what happened once
REM (the bridge then ran with cwd = tools\voice and looked for
REM tools\voice\tools\voice\tts-bridge.cjs).
setlocal
chcp 65001 >nul
title Elysia Voice 9881 (bridge)
cd /d "%~dp0..\.."
echo ============================================================
echo  bridge - DSH plugin's OpenAI-style requests - GPT-SoVITS
echo  address 127.0.0.1:9881
echo  cwd: %CD%
echo.
echo  It waits for port 9880 first (up to 5 minutes).
echo  Every synthesized line is printed here.
echo ============================================================
echo.
node "%~dp0tts-bridge.cjs"
echo.
echo [bridge stopped] if there is red text above, send it to me.
pause
