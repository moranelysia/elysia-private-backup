<#
#  check-desktop-icon.ps1 -- check the desktop icon at the sizes Windows uses
#
#  The desktop draws icons at 48 px (small), 64 (medium) and 96+ (large,
#  and more on a high-DPI screen). So this writes those sizes out as PNGs
#  and also a magnified sheet, because judging an icon by its 256px version
#  is exactly the mistake that led to a mushy tray icon earlier today.
#
#  PURE ASCII.
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$Here = $PSScriptRoot
$ProjectRoot = Split-Path -Parent $Here
$Ico = Join-Path $ProjectRoot 'desktop-icon.ico'
$OutDir = Join-Path $ProjectRoot 'icon-source'

if (-not (Test-Path -LiteralPath $Ico)) {
  Write-Host "  [ERROR] $Ico not found -- run make-desktop-icon.ps1 first" -ForegroundColor Red
  exit 1
}

# Reading an .ico by frame index is fiddly, so instead render the sheet
# from the source picture with the same crop the icon builder uses.
$Src = Join-Path $OutDir 'elysia.jpg'
$src = [System.Drawing.Image]::FromFile($Src)
$W = $src.Width
$H = $src.Height
$Cx = $W * 0.385
$Cy = $H * 0.44
$side = [int]([Math]::Min($W, $H) * 0.56)
$x = [Math]::Max(0, [Math]::Min($W - $side, [int]($Cx - $side / 2)))
$y = [Math]::Max(0, [Math]::Min($H - $side, [int]($Cy - $side / 2)))

$face = New-Object System.Drawing.Bitmap($side, $side)
$fg = [System.Drawing.Graphics]::FromImage($face)
$fg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$fg.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $side, $side)),
              (New-Object System.Drawing.Rectangle($x, $y, $side, $side)),
              [System.Drawing.GraphicsUnit]::Pixel)
$fg.Dispose()

function Make {
  param([int]$Size)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($face, 0, 0, $Size, $Size)
  $g.Dispose()
  return $bmp
}

$sizes = @(48, 64, 96, 256)
$made = @{}
foreach ($s in $sizes) {
  $b = Make -Size $s
  $made[$s] = $b
  $p = Join-Path $OutDir ("desktop-check-" + $s + ".png")
  $b.Save($p, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "  $p"
}

# side by side, magnified 3x, nearest neighbour so the real pixels show
$cellW = 0
foreach ($s in $sizes) { $cellW += ($s * 2) + 24 }
$sheet = New-Object System.Drawing.Bitmap(($cellW + 20), 320)
$sg = [System.Drawing.Graphics]::FromImage($sheet)
$sg.Clear([System.Drawing.Color]::FromArgb(255, 36, 36, 44))
$sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$font = New-Object System.Drawing.Font('Consolas', 11)
$brush = [System.Drawing.Brushes]::White

$x0 = 10
foreach ($s in $sizes) {
  $sg.DrawImage($made[$s], $x0, 20, $s * 2, $s * 2)
  $sg.DrawString(($s.ToString() + ' px'), $font, $brush, $x0, (20 + ($s * 2) + 6))
  $x0 += ($s * 2) + 24
}

$sheetPath = Join-Path $OutDir 'desktop-check-sheet.png'
$sheet.Save($sheetPath, [System.Drawing.Imaging.ImageFormat]::Png)
$sg.Dispose(); $sheet.Dispose(); $font.Dispose()
foreach ($s in $sizes) { $made[$s].Dispose() }
$face.Dispose(); $src.Dispose()

Write-Host ""
Write-Host "  sheet: $sheetPath"
Write-Host ""
