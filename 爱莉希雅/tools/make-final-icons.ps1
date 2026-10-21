<#
  make-final-icons.ps1 -- two candidate icons, side by side, for him to pick

  CANDIDATE A ("face"): tight on her face -- eyes, blush, the wink.
  CANDIDATE B ("face+heart"): slightly wider, so the pink heart she is
      holding is in the frame too. At 16 px the heart becomes a strong
      pink blob, which actually helps you spot the icon in the tray.

  Both are written at every size the tray and Explorer use, plus a
  side-by-side sheet so the choice can be made by looking, not guessing.

  PURE ASCII on purpose: Windows PowerShell 5.1 reads .ps1 with the system
  ANSI codepage (936/GBK), so Chinese inside the code would turn to mush
  and any Chinese path would stop existing.
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$Here = $PSScriptRoot
$ProjectRoot = Split-Path -Parent $Here
$SrcDir = Join-Path $ProjectRoot 'icon-source'
$Src = Join-Path $SrcDir 'elysia.jpg'

if (-not (Test-Path -LiteralPath $Src)) {
  Write-Host "  [ERROR] no source picture at $Src" -ForegroundColor Red
  exit 1
}

$src = [System.Drawing.Image]::FromFile($Src)
$W = $src.Width
$H = $src.Height

function Crop-Square {
  param([double]$FracCx, [double]$FracCy, [double]$FracSide)
  $side = [int]([Math]::Min($W, $H) * $FracSide)
  $x = [Math]::Max(0, [Math]::Min($W - $side, [int]($W * $FracCx - $side / 2)))
  $y = [Math]::Max(0, [Math]::Min($H - $side, [int]($H * $FracCy - $side / 2)))
  $bmp = New-Object System.Drawing.Bitmap($side, $side)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $side, $side)),
               (New-Object System.Drawing.Rectangle($x, $y, $side, $side)),
               [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  return $bmp
}

function Save-All {
  param([System.Drawing.Image]$From, [string]$Prefix)
  $made = @{}
  foreach ($size in @(16, 32, 48, 64, 256)) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($From, 0, 0, $size, $size)
    $g.Dispose()
    $p = Join-Path $SrcDir ($Prefix + '-' + $size + '.png')
    $bmp.Save($p, [System.Drawing.Imaging.ImageFormat]::Png)
    $made[$size] = $bmp
    Write-Host "  $p"
  }
  return $made
}

# A: tight on the face
$a = Crop-Square -FracCx 0.385 -FracCy 0.46 -FracSide 0.34
Write-Host "candidate A (face)"
$aMade = Save-All -From $a -Prefix 'candA'

# B: wider, keeps the heart
$b = Crop-Square -FracCx 0.40 -FracCy 0.56 -FracSide 0.52
Write-Host "candidate B (face + heart)"
$bMade = Save-All -From $b -Prefix 'candB'

# ---- a comparison sheet: real tray sizes, magnified 6x with no smoothing
#      (so you see the actual pixels, not a nice blurry enlargement)
$sheet = New-Object System.Drawing.Bitmap(660, 260)
$sg = [System.Drawing.Graphics]::FromImage($sheet)
$sg.Clear([System.Drawing.Color]::FromArgb(255, 40, 40, 48))
$sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$sg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

$font = New-Object System.Drawing.Font('Consolas', 11)
$brush = [System.Drawing.Brushes]::White

$y = 12
foreach ($pair in @(@('A  face', $aMade), @('B  face+heart', $bMade))) {
  $sg.DrawString($pair[0], $font, $brush, 10, $y)
  $x = 150
  foreach ($size in @(16, 32, 48, 64)) {
    $sg.DrawImage($pair[1][$size], $x, $y, $size * 3, $size * 3)
    $sg.DrawString([string]$size, $font, $brush, $x, $y + ($size * 3) + 2)
    $x += ($size * 3) + 18
  }
  $y += 120
}

$sheetPath = Join-Path $SrcDir 'compare.png'
$sheet.Save($sheetPath, [System.Drawing.Imaging.ImageFormat]::Png)
$sg.Dispose(); $sheet.Dispose(); $font.Dispose()

$a.Dispose(); $b.Dispose(); $src.Dispose()
foreach ($k in $aMade.Keys) { $aMade[$k].Dispose() }
foreach ($k in $bMade.Keys) { $bMade[$k].Dispose() }

Write-Host ""
Write-Host "  comparison sheet: $sheetPath"
Write-Host ""
