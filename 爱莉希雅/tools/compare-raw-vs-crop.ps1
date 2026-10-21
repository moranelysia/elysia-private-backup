<#
  compare-raw-vs-crop.ps1 -- whole picture vs cropped head, as icons

  WHY
    Fair question: why crop at all? So this builds both and puts them
    side by side at the sizes the Desktop (48) and the tray (16) really
    use. Then the answer is something you can look at instead of an
    argument.

    WHOLE : the entire picture squeezed into a square. Nothing is thrown
            away -- but the picture is a tall composition (head at the
            top, dress and arms at the bottom), so at 48 px the face ends
            up small and the empty background takes the corners.
    HEAD  : a square crop centred on her head, whole head in frame.

  PURE ASCII -- Windows PowerShell 5.1 decodes .ps1 with the system ANSI
  codepage (936/GBK), so Chinese inside the code would turn to garbage.
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$Here = $PSScriptRoot
$ProjectRoot = Split-Path -Parent $Here
$SrcDir = Join-Path $ProjectRoot 'icon-source'
$Src = Join-Path $SrcDir 'elysia.jpg'

$src = [System.Drawing.Image]::FromFile($Src)
$W = $src.Width
$H = $src.Height

function Scale-To {
  param([System.Drawing.Image]$From, [int]$Size)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($From, 0, 0, $Size, $Size)
  $g.Dispose()
  return $bmp
}

# ---- WHOLE: the entire picture, stretched/squeezed into a square ----
$whole = New-Object System.Drawing.Bitmap($W, $H)
$wg = [System.Drawing.Graphics]::FromImage($whole)
$wg.DrawImage($src, 0, 0, $W, $H)
$wg.Dispose()

# ---- HEAD: square crop, centred on her head, whole head inside ----
# 0.42 across / 0.41 down is the middle of her head (between the eyes,
# nudged up so the rose and the little hat are inside the frame).
# side 0.60 = 620 px here: enough to hold hair, ears and the heart top.
$Cx = $W * 0.42
$Cy = $H * 0.41
$side = [int]([Math]::Min($W, $H) * 0.60)
$x = [Math]::Max(0, [Math]::Min($W - $side, [int]($Cx - $side / 2)))
$y = [Math]::Max(0, [Math]::Min($H - $side, [int]($Cy - $side / 2)))

$head = New-Object System.Drawing.Bitmap($side, $side)
$hg = [System.Drawing.Graphics]::FromImage($head)
$hg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$hg.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $side, $side)),
              (New-Object System.Drawing.Rectangle($x, $y, $side, $side)),
              [System.Drawing.GraphicsUnit]::Pixel)
$hg.Dispose()

Write-Host "  picture: $W x $H"
Write-Host "  head crop: $side x $side at ($x, $y)"

# ---- write both at the real sizes ----
$sizes = @(16, 48, 64, 256)
foreach ($s in $sizes) {
  $a = Scale-To -From $whole -Size $s
  $a.Save((Join-Path $SrcDir ("raw-vs-crop-whole-" + $s + ".png")), [System.Drawing.Imaging.ImageFormat]::Png)
  $a.Dispose()

  $b = Scale-To -From $head -Size $s
  $b.Save((Join-Path $SrcDir ("raw-vs-crop-head-" + $s + ".png")), [System.Drawing.Imaging.ImageFormat]::Png)
  $b.Dispose()
}

# ---- comparison sheet, magnified 3x so the real pixels show ----
$scale = 3
$sheetW = 20 + (48 * $scale) + 30 + (48 * $scale) + 30 + (64 * $scale) + 20
$sheet = New-Object System.Drawing.Bitmap($sheetW, 300)
$sg = [System.Drawing.Graphics]::FromImage($sheet)
$sg.Clear([System.Drawing.Color]::FromArgb(255, 34, 34, 42))
$sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$font = New-Object System.Drawing.Font('Consolas', 10)
$brush = [System.Drawing.Brushes]::White

$cols = @(
  @{ Label = 'WHOLE 48'; Size = 48; Img = (Scale-To -From $whole -Size 48) },
  @{ Label = 'HEAD 48'; Size = 48; Img = (Scale-To -From $head -Size 48) },
  @{ Label = 'HEAD 64'; Size = 64; Img = (Scale-To -From $head -Size 64) }
)

$x0 = 20
foreach ($c in $cols) {
  $sg.DrawImage($c.Img, $x0, 40, ($c.Size * $scale), ($c.Size * $scale))
  $sg.DrawString($c.Label, $font, $brush, $x0, 14)
  $x0 += ($c.Size * $scale) + 30
}

$sheetPath = Join-Path $SrcDir 'raw-vs-crop-sheet.png'
$sheet.Save($sheetPath, [System.Drawing.Imaging.ImageFormat]::Png)
$sg.Dispose(); $sheet.Dispose(); $font.Dispose()
foreach ($c in $cols) { $c.Img.Dispose() }
$whole.Dispose(); $head.Dispose(); $src.Dispose()

Write-Host "  sheet: $sheetPath"
Write-Host ""
