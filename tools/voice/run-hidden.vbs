' run-hidden.vbs -- start a program with NO window at all
'
' WHY VBSCRIPT, OF ALL THINGS
'   To launch a console program (her voice service) without a black
'   window appearing, Windows gives few real options:
'     start /B                          -- no new window, but the cmd stays
'     start /MIN                        -- minimised, still there
'     powershell -WindowStyle Hidden    -- flashes: it creates the window first
'     WshShell.Run with SW_HIDE         -- hidden FROM CREATION, never flashes
'   The last one is the only one that truly never shows a window, and
'   VBScript is the easiest way to reach it.
'
' HOW TO USE
'   wscript "run-hidden.vbs" "program" "arg1" "arg2" ...
'   It returns immediately; the program keeps running in the background.
'
' WHY THIS FILE IS PURE ASCII
'   Windows Script Host reads .vbs with the system ANSI codepage
'   (936/GBK on this machine). A UTF-8 Chinese character inside would
'   decode into garbage and break the script. Same rule as .cmd and .ps1.

Option Explicit

Dim shell, cmd, i, full

Set shell = CreateObject("WScript.Shell")

If WScript.Arguments.Count = 0 Then
  WScript.Quit 1
End If

cmd = WScript.Arguments(0)
full = """" & cmd & """"

For i = 1 To WScript.Arguments.Count - 1
  full = full & " " & """" & WScript.Arguments(i) & """"
Next

' 0 = SW_HIDE (no window), False = do not wait for it to finish
shell.Run full, 0, False
