// 抽取键盘模型.cjs —— 从那个 zip 里把 keyboard 小模型抽出来，并且修好两个问题
//
// 为什么要单独抽它：主模型（cat.moc3）只有"左手"一个手部参数，
// 而 keyboard 小模型有左右手两个，还带鼠标位置参数 —— 才能做"跟着你打字"。
//
// 抽的时候顺手修两处：
//   1. 它引用了 live2d_motion1.flac，但 zip 里根本没这个音频 → 删掉引用
//   2. 它的 LipSync 组是空的 → 补上嘴巴参数（以后要说话时用得上）
//
// 用法: node tools/抽取键盘模型.cjs

const fs = require("fs")
const path = require("path")

const ZIP = "C:\\Users\\moran\\.dsh\\attachments\\v1\\files\\30\\30010bc5bfa9b1e57ec10a38d939435610202dfe435bbe45e63a837c7d231109\\爱莉-无表情版.zip"
const 包内前缀 = "A-爱莉-无表情版/img/keyboard/cat_model/"
const 目标目录 = path.resolve(__dirname, "..", "renderer", "models", "elysia-keyboard")

async function main() {
  // Node 从 22 版开始自带解压（zlib 那套），但 zip 要用流式 API。
  // 简单起见，用 PowerShell 的 .NET 解压能力更省事 —— 这里改用 child_process 调一次。
  const { execFileSync } = require("child_process")

  if (!fs.existsSync(ZIP)) {
    console.log("找不到 zip: " + ZIP)
    process.exit(1)
  }

  fs.mkdirSync(目标目录, { recursive: true })

  // 用 PowerShell 解压这个子目录
  const ps = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("${ZIP}")
$prefix = "${包内前缀}"
$dest = "${目标目录}"
foreach ($e in $zip.Entries) {
  if (-not $e.FullName.StartsWith($prefix) -or $e.Length -eq 0) { continue }
  $rel = $e.FullName.Substring($prefix.Length)
  $target = Join-Path $dest $rel
  $dir = Split-Path $target -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, $target, $true)
  Write-Output ("  " + $rel)
}
$zip.Dispose()
`
  console.log("解压中……")
  const out = execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" })
  console.log(out.trim())

  // ---- 修 model3.json ----
  const modelJsonPath = path.join(目标目录, "cat.model3.json")
  if (!fs.existsSync(modelJsonPath)) {
    console.log("✗ 没找到 cat.model3.json")
    process.exit(1)
  }
  const json = JSON.parse(fs.readFileSync(modelJsonPath, "utf8"))

  // 1. 删掉指向不存在音频的 Sound 字段
  let 删掉的音频 = 0
  for (const motions of Object.values(json.FileReferences.Motions || {})) {
    for (const m of motions) {
      if (m.Sound) {
        delete m.Sound
        删掉的音频++
      }
    }
  }

  // 2. 补上 LipSync（它原来是空的）
  for (const g of json.Groups || []) {
    if (g.Name === "LipSync" && (!g.Ids || g.Ids.length === 0)) {
      g.Ids = ["ParamMouthForm", "ParamMouthOpenY"]
    }
  }

  fs.writeFileSync(modelJsonPath, JSON.stringify(json, null, 2), "utf8")

  console.log("")
  console.log(`✓ 删掉了 ${删掉的音频} 处指向不存在音频的引用`)
  console.log("✓ LipSync 组补上了嘴巴参数")
  console.log("")
  console.log("抽出来的文件：")
  const list = []
  ;(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else list.push(path.relative(目标目录, p) + "  " + Math.round(fs.statSync(p).size / 1024) + " KB")
    }
  })(目标目录)
  list.forEach((l) => console.log("  " + l))
  console.log("")
  console.log("目录: " + 目标目录)
}

main().catch((e) => {
  console.log("出错: " + e.message)
  process.exit(1)
})
