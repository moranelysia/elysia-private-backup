@echo off
REM ============================================================
REM  start-sovits-logged.cmd -- GPT-SoVITS with its output logged
REM
REM  Same as start-sovits-api.cmd (left untouched), plus one thing:
REM  everything it prints also goes to a log file, so it can still be
REM  read after the window is hidden.
REM
REM  NOTE: this file does contain Chinese in the echo lines below.
REM  That is FINE and deliberate -- same as the original working file:
REM  the executable lines are all ASCII, and cmd only garbles the
REM  Chinese text it prints, not the commands it runs. The rule is
REM  "no Chinese in a COMMAND, and no Chinese path", not "no Chinese
REM  anywhere".
REM
REM  The tee is done by Node (run-logged.cjs next to this file):
REM  measured, PowerShell's Tee-Object inside a .cmd breaks on quoting
REM  ("Tee-Object is not recognized"), and its file encoding mangles
REM  mixed Chinese/English output. Node writes UTF-8 correctly.
REM
REM  The log lives in D:\GPT-SoVITS\ (pure ASCII): a Chinese path in a
REM  command is what breaks, and 8.3 short names are disabled here.
REM ============================================================

@echo off
chcp 65001 >nul
title Elysia Voice 9880 (GPT-SoVITS)
cd /d D:\GPT-SoVITS
set "PATH=D:\GPT-SoVITS\runtime;%PATH%"
set "LOG=D:\GPT-SoVITS\elysia-voice-9880.log"

echo ============================================================
echo  GPT-SoVITS 本体（爱莉希雅的声音）
echo  地址 127.0.0.1:9880    模型在 D:\GPT-SoVITS
echo.
echo  正在加载三套权重，大约两分半。看到
echo     Uvicorn running on http://127.0.0.1:9880
echo  就是好了。
echo.
echo  输出同时写一份到: %LOG%
echo ============================================================
echo.

REM %~dp0 指的是本文件所在目录，所以这里没有中文路径
node "%~dp0run-logged.cjs" "%LOG%" "D:\GPT-SoVITS\runtime\python.exe" -u api_v2.py -a 127.0.0.1 -p 9880 -c GPT_SoVITS\configs\tts_infer.yaml

echo.
echo [服务已经停了] 完整日志: %LOG%
pause
