@echo off
chcp 65001 >nul
if /I "%~1"=="--demo" goto :demo
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-headless-chat.ps1"
exit /b %errorlevel%
:demo
node "%~dp0start-headless-chat.cjs" --demo
exit /b %errorlevel%
