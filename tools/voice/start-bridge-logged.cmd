@echo off
REM ============================================================
REM  start-bridge-logged.cmd -- the bridge (9881), with its output logged
REM
REM  Same as start-bridge.cmd (left untouched), plus logging via Node.
REM  See start-sovits-logged.cmd for why Node does the tee and why the
REM  log lives in D:\GPT-SoVITS\.
REM
REM  The workspace path is derived with %~dp0 + ..\.. instead of typing
REM  the Chinese folder name -- `chcp 65001` earlier in the file switches
REM  cmd to UTF-8, but cmd may already have buffered the following lines,
REM  so a Chinese `cd /d` can fail (that happened once: the bridge then
REM  ran with the wrong cwd and could not find tts-bridge.cjs).
REM
REM  PURE ASCII on purpose.
REM ============================================================

@echo off
setlocal
chcp 65001 >nul
title Elysia Voice 9881 (bridge)
cd /d "%~dp0..\.."
set "LOG=D:\GPT-SoVITS\elysia-voice-9881.log"

echo ============================================================
echo  bridge  127.0.0.1:9881
echo  waits for 9880 first (up to 5 minutes), then serves.
echo.
echo  output is also written to:
echo    %LOG%
echo ============================================================
echo.

node "%~dp0run-logged.cjs" "%LOG%" "%~dp0tts-bridge.cjs"

echo.
echo [bridge stopped] full log: %LOG%
pause
