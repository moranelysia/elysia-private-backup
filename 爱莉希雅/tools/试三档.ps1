<#
  试三档.ps1 -- try three crop framings for the tray icon, side by side

  WHY
    The tray icon is 16 px. At that size the only things that survive are
    big shapes and strong colour contrast. So the question "which crop is
    best" cannot be answered by looking at the 256px version -- it has to
    be judged at 16px.

  WHAT IT MAKES
    icon-tries\a-16.png   b-16.png   c-16.png     (and -32 and -64)
    a = wide (face + hair + flower)
    b = medium (face fills the frame)
    c = tight (mostly the open eye)

  PURE ASCII, paths included. Windows PowerShell 5.1 reads this file with
  the ANSI codepage, so Chinese inside would break it.
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$Here = $PSScriptRoot
$ProjectRoot = Split-Path -Parent $Here
$Src = Join-Path (Join-Path $ProjectRoot 'icon-source') 'elysia.jpg'
$OutDir = Join-Path (Join-Path $ProjectRoot 'icon-source') 'icon-tries'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

if (-not (Test-Path -LiteralPath $Src)) {
  Write-Host "  [ERROR] no source picture at $Src" -ForegroundColor Red
  exit 1
}

$src = [System.Drawing.Image]::FromFile($Src)
$W = $src.Width
$H = $src.Height

# her face centre, as fractions of the picture
$Cx = $W * 0.385
$Cy = $H * 0.48

$Tries = @(
  @{ Name = 'a'; Frac = 0.55 },   # wide
  @{ Name = 'b'; Frac = 0.42 },   # medium (current)
  @{ Name = 'c'; Frac = 0.30 }    # tight
)

function Save-Size {
  param([System.Drawing.Image]$From, [int]$Size, [string]$Path)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($From, 0, 0, $Size, $Size)
  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

foreach ($t in $Tries) {
  $side = [int]([Math]::Min($W, $H) * $t.Frac)
  $x = [Math]::Max(0, [Math]::Min($W - $side, [int]($Cx - $side / 2)))
  $y = [Math]::Max(0, [Math]::Min($H - $side, [int]($Cy - $side / 2)))

  $face = New-Object System.Drawing.Bitmap($side, $side)
  $fg = [System.Drawing.Graphics]::FromImage($face)
  $fg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $fg.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $side, $side)),
                (New-Object System.Drawing.Rectangle($x, $y, $side, $side)),
                [System.Drawing.GraphicsUnit]::Pixel)
  $fg.Dispose()

  foreach ($size in @(16, 32, 64, 256)) {
    $p = Join-Path $OutDir ($t.Name + '-' + $size + '.png')
    Save-Size -From $face -Size $size -Path $p
  }
  Write-Host ("  " + $t.Name + ": side=" + $side + " px, crop x=" + $x + " y=" + $y)
  $face.Dispose()
}

$src.Dispose()
Write-Host ""
Write-Host "  written to: $OutDir"
Write-Host "  Look at the -16.png files: that is how big the tray icon really is."
Write-Host ""
