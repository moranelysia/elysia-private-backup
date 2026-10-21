<#
  make-pixel-icon.ps1 -- a pixel-art version of her face for the tray

  WHY THIS EXISTS
    The tray icon is drawn at 16-24 pixels. Shrinking a soft illustration
    that far turns it into a blur -- every one of those 16 pixels is an
    average of ~4000 pixels of the original, so all the fine lines
    (eyelashes, blush, the highlight in her eye) dissolve into mush.

    Averaging is what causes the blur. So: first shrink, then CLEAN UP.
    Cleaning up means snapping each pixel to a small palette, which turns
    smooth gradients into distinct blocks. At 16 px that reads as
    "deliberate pixel art" instead of "a smudge".

  WHAT IT MAKES
    icon-source\pixel-N.png     for N = 16, 24, 32, 48, 64, 256
    icon-source\pixel.ico       a multi-size .ico to look at

  PURE ASCII, paths included: Windows PowerShell reads this file with the
  ANSI codepage (936/GBK here), so Chinese inside the code would break it.
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

# centre on her face, tight enough that the eyes are big in the frame
$Cx = $W * 0.385
$Cy = $H * 0.46
$side = [int]([Math]::Min($W, $H) * 0.34)
$x = [Math]::Max(0, [Math]::Min($W - $side, [int]($Cx - $side / 2)))
$y = [Math]::Max(0, [Math]::Min($H - $side, [int]($Cy - $side / 2)))

$face = New-Object System.Drawing.Bitmap($side, $side)
$fg = [System.Drawing.Graphics]::FromImage($face)
$fg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$fg.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $side, $side)),
              (New-Object System.Drawing.Rectangle($x, $y, $side, $side)),
              [System.Drawing.GraphicsUnit]::Pixel)
$fg.Dispose()
Write-Host "  crop: $side x $side at ($x, $y)"

# ---------------------------------------------------------------
# high quality shrink
# ---------------------------------------------------------------
function Shrink {
  param([System.Drawing.Image]$From, [int]$Size)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($From, 0, 0, $Size, $Size)
  $g.Dispose()
  return $bmp
}

# ---------------------------------------------------------------
# snap every pixel to the nearest colour in a small palette
#
# The palette is not invented -- it is sampled from her own picture
# (pink hair, cream skin, the purple of her eye, the red heart), so the
# cleaned-up version still looks like her rather than like a filter.
# ---------------------------------------------------------------
$Palette = @(
  @(255, 255, 255),   # white / highlight
  @(255, 228, 236),   # pale pink (skin, background)
  @(255, 190, 214),   # light pink (hair highlight)
  @(244, 140, 184),   # mid pink (hair)
  @(214, 74, 132),    # deep pink (hair shadow, ribbon)
  @(176, 40, 96),     # dark red-pink (outline, heart shade)
  @(126, 96, 190),    # her eye purple
  @(70, 40, 110),     # eye dark
  @(255, 214, 224)    # blush
)

function Snap-Palette {
  param([System.Drawing.Bitmap]$Bmp)
  for ($py = 0; $py -lt $Bmp.Height; $py++) {
    for ($px = 0; $px -lt $Bmp.Width; $px++) {
      $c = $Bmp.GetPixel($px, $py)
      $best = $null
      $bestD = [double]::MaxValue
      foreach ($p in $Palette) {
        $dr = $c.R - $p[0]; $dg = $c.G - $p[1]; $db = $c.B - $p[2]
        # weight green a little higher: the eye reads as darker that way
        $d = ($dr * $dr) + ($dg * $dg * 1.4) + ($db * $db)
        if ($d -lt $bestD) { $bestD = $d; $best = $p }
      }
      $Bmp.SetPixel($px, $py, [System.Drawing.Color]::FromArgb(255, $best[0], $best[1], $best[2]))
    }
  }
  return $Bmp
}

$sizes = @(16, 24, 32, 48, 64, 256)
$pngBytes = @{}

foreach ($size in $sizes) {
  $small = Shrink -From $face -Size $size
  # Only clean up the small ones. At 256 the palette would band her face
  # badly -- there is enough room for the real colours there.
  if ($size -le 64) { $small = Snap-Palette -Bmp $small }

  $p = Join-Path $SrcDir ('pixel-' + $size + '.png')
  $small.Save($p, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "  wrote $p"

  $ms = New-Object System.IO.MemoryStream
  $small.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngBytes[$size] = $ms.ToArray()
  $ms.Dispose()
  $small.Dispose()
}

$face.Dispose()
$src.Dispose()

# pack an .ico out of 16/32/48/256 so you can see it in Explorer
$icoSizes = @(16, 32, 48, 256)
$out = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($out)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$icoSizes.Count)
$offset = 6 + (16 * $icoSizes.Count)
foreach ($size in $icoSizes) {
  $dim = if ($size -ge 256) { 0 } else { $size }
  $bw.Write([Byte]$dim); $bw.Write([Byte]$dim); $bw.Write([Byte]0); $bw.Write([Byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32)
  $bw.Write([UInt32]$pngBytes[$size].Length); $bw.Write([UInt32]$offset)
  $offset += $pngBytes[$size].Length
}
foreach ($size in $icoSizes) { $bw.Write($pngBytes[$size]) }
$bw.Flush()
$icoPath = Join-Path $SrcDir 'pixel.ico'
[System.IO.File]::WriteAllBytes($icoPath, $out.ToArray())
$bw.Dispose(); $out.Dispose()
Write-Host "  wrote $icoPath"
Write-Host ""
