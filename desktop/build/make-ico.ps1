# 将 build/icon.png 封装为 Windows 多尺寸 build/icon.ico（PNG 压缩帧，Vista+ 支持）
# 不依赖第三方库，手写 ICO 容器
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$src = Join-Path $PSScriptRoot 'icon.png'
$out = Join-Path $PSScriptRoot 'icon.ico'
$img = [System.Drawing.Image]::FromFile($src)

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$frames = @()
foreach ($s in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap($s, $s)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.DrawImage($img, 0, 0, $s, $s)
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $frames += ,@($s, $ms.ToArray())
  $ms.Dispose()
}
$img.Dispose()

# 组装 ICO：ICONDIR(6) + ICONDIRENTRY(16 each) + PNG data
$fs = [System.IO.File]::Create($out)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([UInt16]0)          # reserved
$bw.Write([UInt16]1)          # type: icon
$bw.Write([UInt16]$frames.Count) # count

$offset = 6 + 16 * $frames.Count
foreach ($f in $frames) {
  $s = $f[0]; $data = $f[1]
  $w = if ($s -ge 256) { 0 } else { $s }   # 256 用 0 表示
  $h = $w
  $bw.Write([Byte]$w)         # width
  $bw.Write([Byte]$h)         # height
  $bw.Write([Byte]0)          # color palette
  $bw.Write([Byte]0)          # reserved
  $bw.Write([UInt16]1)        # color planes
  $bw.Write([UInt16]32)       # bits per pixel
  $bw.Write([UInt32]$data.Length) # size of data
  $bw.Write([UInt32]$offset)  # offset of data
  $offset += $data.Length
}
foreach ($f in $frames) {
  $bw.Write($f[1])
}
$bw.Flush()
$bw.Close()
$fs.Close()
Write-Output "ico written: $out ($([math]::Round((Get-Item $out).Length/1KB,1)) KB)"
