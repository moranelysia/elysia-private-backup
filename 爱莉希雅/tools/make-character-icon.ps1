<#
  make-character-icon.ps1 -- turn her picture into the app icon

  WHY THIS FILE EXISTS
    The tray icon is drawn at 16-24 pixels on screen. If we shrink the
    whole picture (pink hair + dress + hearts + background) down to that
    size, it turns into a pink smudge -- you cannot tell what it is.
    So we crop to her FACE first, then shrink. A face still reads as a
    face at 16 pixels.

  WHAT IT MAKES
    icon-source\elysia-icon-16.png / -32 / -48 / -64 / -256   (previews)
    icon.ico        (in the project root -- used by the shortcut + tray)

  PURE ASCII, including all variable names and output text.
  Why: Windows PowerShell 5.1 decodes .ps1 with the system ANSI codepage
  (936/GBK here). A UTF-8 Chinese character inside the CODE turns into
  garbage, and if it lands in a PATH the path stops existing.

  USAGE
    Double-click tools\make-char-icon.cmd, or:
      powershell -NoProfile -ExecutionPolicy Bypass -File tools\make-character-icon.ps1
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$Here = $PSScriptRoot
$ProjectRoot = Split-Path -Parent $Here
$SrcDir = Join-Path $ProjectRoot 'icon-source'
$Src = Join-Path $SrcDir 'elysia.jpg'
$Ico = Join-Path $ProjectRoot 'icon.ico'

if (-not (Test-Path -LiteralPath $Src)) {
  Write-Host ""
  Write-Host "  [ERROR] source picture not found:" -ForegroundColor Red
  Write-Host "          $Src"
  Write-Host "          Put her picture there and run this again."
  Write-Host ""
  exit 1
}

# ---------------------------------------------------------------
# 1. load and crop to the face
# ---------------------------------------------------------------
$src = [System.Drawing.Image]::FromFile($Src)
$W = $src.Width
$H = $src.Height

# Where her face actually is in THIS picture (measured by eye, in pixels,
# on the 1047x1034 original):
#     left eye  about (300, 520)
#     right eye about (500, 470)
#     so the face centre is about (400, 495), and a square of ~440 px
#     centred there holds both eyes, her nose and her mouth.
# These stay as fractions so they still work if you swap the picture.
$FaceCx = [int]($W * 0.385)
$FaceCy = [int]($H * 0.48)
$Side = [int]([Math]::Min($W, $H) * 0.42)

$CropW = $Side
$CropH = $Side
$CropX = [Math]::Max(0, [Math]::Min($W - $Side, $FaceCx - [int]($Side / 2)))
$CropY = [Math]::Max(0, [Math]::Min($H - $Side, $FaceCy - [int]($Side / 2)))

Write-Host ""
Write-Host "  source : $W x $H"
Write-Host "  crop   : x=$CropX y=$CropY w=$CropW h=$CropH  (the face, square)"

$face = New-Object System.Drawing.Bitmap($CropW, $CropH)
$fg = [System.Drawing.Graphics]::FromImage($face)
$fg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$fg.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $CropW, $CropH)),
              (New-Object System.Drawing.Rectangle($CropX, $CropY, $CropW, $CropH)),
              [System.Drawing.GraphicsUnit]::Pixel)
$fg.Dispose()

# ---------------------------------------------------------------
# 2. shrink the face to each icon size
# ---------------------------------------------------------------
function Resize-Square {
  param([System.Drawing.Image]$From, [int]$Size)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($From, 0, 0, $Size, $Size)
  $g.Dispose()
  return $bmp
}

$Sizes = @(16, 32, 48, 64, 256)
$pngBytes = @{}
$previews = @()

foreach ($size in $Sizes) {
  $bmp = Resize-Square -From $face -Size $size
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngBytes[$size] = $ms.ToArray()
  $ms.Dispose()

  # also drop a file next to the source so you can look at them
  $out = Join-Path $SrcDir ("elysia-icon-" + $size + ".png")
  [System.IO.File]::WriteAllBytes($out, $pngBytes[$size])
  $previews += $out

  $bmp.Dispose()
}

$face.Dispose()
$src.Dispose()

# ---------------------------------------------------------------
# 3. pack the previews into a real .ico
#    An .ico is: 6-byte header, then one 16-byte directory entry per
#    image, then the image data. Entries of 256x256 may store a PNG
#    directly (Vista and later), which is what we do here.
# ---------------------------------------------------------------
$icoSizes = @(16, 32, 48, 256)
$out = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter($out)
$w.Write([UInt16]0)               # reserved
$w.Write([UInt16]1)               # 1 = icon
$w.Write([UInt16]$icoSizes.Count)

$offset = 6 + (16 * $icoSizes.Count)
foreach ($size in $icoSizes) {
  $dim = if ($size -ge 256) { 0 } else { $size }
  $w.Write([Byte]$dim)            # width  (0 means 256)
  $w.Write([Byte]$dim)            # height
  $w.Write([Byte]0)               # palette colours
  $w.Write([Byte]0)               # reserved
  $w.Write([UInt16]1)             # colour planes
  $w.Write([UInt16]32)            # bits per pixel
  $w.Write([UInt32]$pngBytes[$size].Length)
  $w.Write([UInt32]$offset)
  $offset += $pngBytes[$size].Length
}
foreach ($size in $icoSizes) { $w.Write($pngBytes[$size]) }
$w.Flush()
[System.IO.File]::WriteAllBytes($Ico, $out.ToArray())
$w.Dispose(); $out.Dispose()

Write-Host ""
Write-Host "  [OK] icon.ico written:" -ForegroundColor Green
Write-Host "       $Ico   ($((Get-Item -LiteralPath $Ico).Length) bytes)"
Write-Host ""
Write-Host "  Previews (open these to check it reads well when small):"
foreach ($p in $previews) { Write-Host "       $p" }
Write-Host ""
Write-Host "  Now restart her: right-click the tray flower, Quit, then"
Write-Host "  double-click the Desktop icon again."
Write-Host ""
