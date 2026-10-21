@echo off
REM ============================================================
REM  voice-hidden.cmd -- start both voice services, no windows at all
REM
REM  Lives INSIDE tools\voice\, so every path below is relative
REM  (%~dp0 = this folder). That is the whole trick: no path ever
REM  contains the Chinese workspace name.
REM
REM  WHY THAT MATTERS (measured, twice)
REM    A Chinese path inside a .cmd breaks the line -- cmd decodes the
REM    file with the system codepage (936/GBK), the bytes shift, and the
REM    quote that follows gets eaten. Two real failures:
REM      node "tools\<chinese>.cjs"        -> Cannot find module 'D:\...\'
REM      node "D:\<chinese>\tools\a.cjs"   -> 'he' is not recognized ...
REM    Relative paths avoid the problem entirely.
REM
REM  HOW THE WINDOWS ARE HIDDEN
REM    wscript run-hidden.vbs <program> ...  -- VBScript's WshShell.Run
REM    with SW_HIDE hides the window at creation, so nothing flashes.
REM    (`start /B` still leaves the cmd; `start /MIN` leaves a taskbar
REM    button; powershell -WindowStyle Hidden flashes first.)
REM
REM  PURE ASCII on purpose.
REM ============================================================

@echo off
chcp 65001 >nul

REM --- 9880: GPT-SoVITS itself ---
wscript "%~dp0run-hidden.vbs" "cmd" "/c" "%~dp0start-sovits-logged.cmd"

REM Do NOT use `timeout /t`: with no console it dies with "Input
REM redirection is not supported" and aborts the rest of this file.
ping -n 4 127.0.0.1 >nul

REM --- 9881: the bridge ---
wscript "%~dp0run-hidden.vbs" "cmd" "/c" "%~dp0start-bridge-logged.cmd"
