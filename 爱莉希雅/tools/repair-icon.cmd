@echo off
REM ============================================================
REM  repair-icon.cmd -- redraw her flower icon
REM
REM  Writes icon.ico into the project root (the Desktop shortcut
REM  uses it). You only need this if icon.ico got deleted, or if
REM  you changed the drawing code and want a new flower.
REM
REM  PURE ASCII, NO EXCEPTIONS -- not even in a file name.
REM  Measured: `node "tools\<chinese>.cjs"` inside a .cmd gets cut
REM  in half and node reports "Cannot find module 'D:\...\'".
REM  So the drawing code is reached through tools\make-ico.cjs,
REM  an ASCII-named file that requires the Chinese-named one.
REM ============================================================

chcp 65001 >nul
cd /d "%~dp0.."

node "tools\make-ico.cjs"

echo.
pause
