# Keyboard listener - uses only Windows built-ins, no third-party library.
#
# WHY THIS EXISTS:
#   The npm package "node-global-key-listener" ships without the WinKeyServer.exe
#   it needs on Windows (the author forgot to include the compiled binary), so it
#   cannot work here. This script does the same job using user32.dll directly.
#
# HOW:
#   GetAsyncKeyState(vk) tells us whether a key is currently held down.
#   We poll all keys we care about every 15 ms and print a line when one changes.
#
# WHY POLLING IS OK:
#   It never blocks or swallows a key, so typing still reaches other apps.
#   Hand animation does not need sub-millisecond accuracy.
#
# OUTPUT (one event per line, so Node can read it line by line):
#   READY
#   DOWN Z
#   UP Z
#
# NOTE: Pure ASCII on purpose. Windows PowerShell reads .ps1 with the system
#       ANSI codepage unless the file has a UTF-8 BOM - Chinese text in here
#       would come out as garbage and break the parser.

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class KeyWatcher {
    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);
}
"@

# Virtual key code -> our key name. The names must match the image file names
# under renderer/assets/keyboard/keys/ (Z.png, Shift.png, Digit1.png, ...).
#
# NOTE: use a plain hashtable, NOT [ordered]@{} - the ordered dictionary in
#       Windows PowerShell 5 throws "index out of range" when you assign with
#       an integer key.
$keyMap = @{
    160 = "Shift"      # left shift
    161 = "Shift"      # right shift
    162 = "Ctrl"       # left ctrl
    163 = "Ctrl"       # right ctrl
    164 = "Alt"        # left alt
    165 = "Alt"        # right alt
    32  = "Space"
    13  = "Enter"
}
foreach ($c in 65..90) { $letter = [char]$c; $keyMap[$c] = [string]$letter }   # A-Z = vk 65..90
foreach ($d in 49..53) { $digit = [char]$d; $keyMap[$d] = "Digit" + [string]$digit }  # 1-5 = vk 49..53

# Previous state per key: only report on change.
$prev = @{}
foreach ($vk in $keyMap.Keys) { $prev[$vk] = $false }

# Prime with the current state so we do not fire a burst at startup.
foreach ($vk in $keyMap.Keys) {
    $prev[$vk] = ([KeyWatcher]::GetAsyncKeyState($vk) -band 0x8000) -ne 0
}

Write-Output "READY"
[Console]::Out.Flush()

while ($true) {
    foreach ($vk in @($keyMap.Keys)) {
        $down = ([KeyWatcher]::GetAsyncKeyState($vk) -band 0x8000) -ne 0
        if ($down -ne $prev[$vk]) {
            $action = if ($down) { "DOWN" } else { "UP" }
            Write-Output "$action $($keyMap[$vk])"
            [Console]::Out.Flush()
            $prev[$vk] = $down
        }
    }
    Start-Sleep -Milliseconds 15
}
