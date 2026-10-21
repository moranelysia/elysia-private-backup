<#
  make-desktop-icon.ps1 -- her picture as the DESKTOP icon

  WHY TWO DIFFERENT ICONS
    Tray icon   : Windows draws it at 16-24 px. Any illustration turns to
                  mush that small, so the tray keeps the flat pink flower
                  (big solid shapes survive at 16 px).
    Desktop icon: Windows draws it at 48 px and up. That is plenty for a
                  picture, so the desktop gets her.

  WHY THE WHOLE PICTURE AND NOT A CROP
    First version cropped to her head, on the assumption that a face reads
    better small. Then moran asked "why not just use the original?" -- so
    both were rendered at 48 px and compared, and the whole picture was
    fine: the face is still readable, and keeping the whole thing means
    nothing of his picture is thrown away.

    That is the lesson: an assumption about what "looks better" is worth
    nothing until it is rendered at the size that matters and looked at.

    One adjustment it did need: the picture is 1047x1034, not exactly
    square, so it is cropped to a centred square FIRST (309 px trimmed
    from the width at most) and then scaled. Without that, "fit to square"
    would squash her slightly.

  WHAT IT MAKES
    desktop-icon.ico   (project root)  sizes 48 / 64 / 128 / 256
    No 16 or 32 entry on purpose: if some view asks for a small size,
    Windows scales the 48 down rather than showing a mushy 16.

  PURE ASCII, including every path and variable name -- Windows PowerShell
  5.1 decodes .ps1 with the system ANSI codepage (936/GBK here), so a
  UTF-8 Chinese character inside the CODE becomes garbage, and if it lands
  in a path the path stops existing.
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$Here = $PSScriptRoot
$ProjectRoot = Split-Path -Parent $Here
$Src = Join-Path (Join-Path $ProjectRoot 'icon-source') 'elysia.jpg'
$Out = Join-Path $ProjectRoot 'desktop-icon.ico'

if (-not (Test-Path -LiteralPath $Src)) {
  Write-Host "  [ERROR] no source picture at $Src" -ForegroundColor Red
  exit 1
}

$src = [System.Drawing.Image]::FromFile($Src)
$W = $src.Width
$H = $src.Height

# centre square: trim the longer side equally on both ends
$side = [Math]::Min($W, $H)
$x = [int](($W - $side) / 2)
$y = [int](($H - $side) / 2)

$square = New-Object System.Drawing.Bitmap($side, $side)
$sg0 = [System.Drawing.Graphics]::FromImage($square)
$sg0.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$sg0.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $side, $side)),
               (New-Object System.Drawing.Rectangle($x, $y, $side, $side)),
               [System.Drawing.GraphicsUnit]::Pixel)
$sg0.Dispose()

Write-Host ""
Write-Host "  source : $W x $H"
Write-Host "  squared: $side x $side at ($x, $y)   (trimmed $($W - $side) px of width)"
Write-Host ""

$Sizes = @(48, 64, 128, 256)
$pngBytes = @{}

foreach ($size in $Sizes) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($square, 0, 0, $size, $size)
  $g.Dispose()

  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngBytes[$size] = $ms.ToArray()
  $ms.Dispose()
  $bmp.Dispose()

  Write-Host "  built $size x $size"
}

$square.Dispose()
$src.Dispose()

# pack the .ico: 6-byte header, one 16-byte directory entry per image,
# then the image data. 256 goes in as a PNG (allowed since Vista).
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([UInt16]0)                # reserved
$bw.Write([UInt16]1)                # 1 = icon
$bw.Write([UInt16]$Sizes.Count)

$offset = 6 + (16 * $Sizes.Count)
foreach ($size in $Sizes) {
  $dim = if ($size -ge 256) { 0 } else { $size }
  $bw.Write([Byte]$dim)             # width  (0 means 256)
  $bw.Write([Byte]$dim)             # height
  $bw.Write([Byte]0)                # palette colours
  $bw.Write([Byte]0)                # reserved
  $bw.Write([UInt16]1)              # colour planes
  $bw.Write([UInt16]32)             # bits per pixel
  $bw.Write([UInt32]$pngBytes[$size].Length)
  $bw.Write([UInt32]$offset)
  $offset += $pngBytes[$size].Length
}
foreach ($size in $Sizes) { $bw.Write($pngBytes[$size]) }
$bw.Flush()
[System.IO.File]::WriteAllBytes($Out, $ms.ToArray())
$bw.Dispose(); $ms.Dispose()

Write-Host ""
Write-Host "  [OK] $Out   ($((Get-Item -LiteralPath $Out).Length) bytes)" -ForegroundColor Green
Write-Host "       sizes in it: $($Sizes -join ', ')"
Write-Host ""
