@echo off
chcp 65001 >nul
title Elysia Voice 9880 (GPT-SoVITS)
cd /d D:\GPT-SoVITS
set "PATH=D:\GPT-SoVITS\runtime;%PATH%"
echo ============================================================
echo  GPT-SoVITS 本体（爱莉希雅的声音）
echo  地址 127.0.0.1:9880    模型在 D:\GPT-SoVITS
echo.
echo  正在加载三套权重，大约两分半。看到
echo     Uvicorn running on http://127.0.0.1:9880
echo  就是好了。这之前别关窗口。
echo ============================================================
echo.
runtime\python.exe -u api_v2.py -a 127.0.0.1 -p 9880 -c GPT_SoVITS\configs\tts_infer.yaml
echo.
echo [服务已经停了] 上面如果有红字，把它发给我。
pause
