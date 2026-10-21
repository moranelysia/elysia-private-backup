@echo off
rem ---------------------------------------------------------------------------
rem Back up the Elysia project source code (with a timestamp).
rem ASCII only: cmd.exe parses .cmd files with the system ANSI codepage.
rem Double-click this file after you finish writing code.
rem ---------------------------------------------------------------------------
chcp 65001 >nul
cd /d "%~dp0.."
node "tools\备份代码.cjs"
if not defined DSH_NO_PAUSE pause
