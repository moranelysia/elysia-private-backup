// 切手部素材.cjs —— 把 25 张 hand/N.png 切成"按键图标"和"她的手"
//
// 每张源图是 1400x1400，里面两样东西：
//   · 左上角：爱心按键图标（所有图位置固定）
//   · 右下角：她的手（位置随按键变化）
//
// 做法：不按死框切，而是先把每个区域的实际内容边界测出来，再按边界切 ——
// 这样不管作者的素材怎么留白，都不会切歪或者切到空白。
//
// 用法: node tools/切手部素材.cjs

const fs = require("fs")
const path = require("path")
const sharp = require("sharp")

const 源目录 = "D:\\新建文件夹\\工具研究\\爱莉包-检查\\手部素材"
const 输出根 = path.resolve(__dirname, "..", "renderer", "assets", "keyboard")

// 源图尺寸是 1400x1400。用坐标把"图标"和"手"两个区域分开：
//   x < 500 且 y < 650  → 图标
//   其余（右下）        → 手
const 分界X = 500
const 分界Y = 650

// 编号 → 按键名（从按键图标总览图里读出来的）
const 映射 = [
  "Shift", "Ctrl", "Alt", "Space", "Enter",
  "Z", "X", "C", "V", "B",
  "A", "S", "D", "F", "G",
  "Q", "W", "E", "R", "T",
  "1", "2", "3", "4", "5",
]

/** 读一张图，分别算出"图标区域"和"手区域"的内容边界 */
async function 测边界(文件) {
  const { data, info } = await sharp(文件).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const C = info.channels

  const 图标 = { minX: W, maxX: -1, minY: H, maxY: -1 }
  const 手 = { minX: W, maxX: -1, minY: H, maxY: -1 }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C
      if (data[i + 3] <= 20) continue // 透明的跳过
      if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) continue // 纯白跳过

      const 是图标 = x < 分界X && y < 分界Y
      const 区 = 是图标 ? 图标 : 手
      if (x < 区.minX) 区.minX = x
      if (x > 区.maxX) 区.maxX = x
      if (y < 区.minY) 区.minY = y
      if (y > 区.maxY) 区.maxY = y
    }
  }
  return { 图标, 手, W, H }
}

/** 把边界变成 sharp 能用的 extract 参数（带 padding，并夹在图内） */
function 成框(区, W, H, padding = 6) {
  if (区.maxX < 0) return null // 空区域
  const left = Math.max(0, 区.minX - padding)
  const top = Math.max(0, 区.minY - padding)
  const width = Math.min(W - left, 区.maxX - 区.minX + 1 + padding * 2)
  const height = Math.min(H - top, 区.maxY - 区.minY + 1 + padding * 2)
  return { left, top, width, height }
}

async function main() {
  fs.mkdirSync(path.join(输出根, "keys"), { recursive: true })
  fs.mkdirSync(path.join(输出根, "hands"), { recursive: true })

  const 文件们 = fs
    .readdirSync(源目录)
    .filter((f) => /^\d+\.png$/.test(f))
    .sort((a, b) => Number(a.replace(".png", "")) - Number(b.replace(".png", "")))

  console.log(`找到 ${文件们.length} 张源图\n`)
  console.log("编号  按键     图标尺寸        手的尺寸")
  console.log("────────────────────────────────────────────")

  let 成功 = 0
  const 记录 = []

  for (const f of 文件们) {
    const i = Number(f.replace(".png", ""))
    const 键名 = 映射[i]
    if (!键名) continue

    const 源 = path.join(源目录, f)
    const { 图标, 手, W, H } = await 测边界(源)

    const 图标框 = 成框(图标, W, H)
    const 手框 = 成框(手, W, H)

    if (!图标框 || !手框) {
      console.log(`  ${String(i).padStart(2)}  ${键名}  ⚠ 有区域是空的，跳过`)
      continue
    }

    // 切图标
    await sharp(源).extract(图标框).png().toFile(path.join(输出根, "keys", `${键名}.png`))
    // 切手
    await sharp(源).extract(手框).png().toFile(path.join(输出根, "hands", `${键名}.png`))

    const kMeta = await sharp(path.join(输出根, "keys", `${键名}.png`)).metadata()
    const hMeta = await sharp(path.join(输出根, "hands", `${键名}.png`)).metadata()

    记录.push({
      编号: i,
      按键: 键名,
      图标框,
      手框,
      图标尺寸: `${kMeta.width}x${kMeta.height}`,
      手尺寸: `${hMeta.width}x${hMeta.height}`,
    })

    console.log(
      `  ${String(i).padStart(2)}  ${键名.padEnd(6)} ${(kMeta.width + "x" + kMeta.height).padEnd(14)} ${hMeta.width}x${hMeta.height}`
    )
    成功++
  }

  console.log("────────────────────────────────────────────")
  console.log(`✓ 切好 ${成功} 组（${成功 * 2} 个文件）`)
  console.log("  图标: " + path.join(输出根, "keys"))
  console.log("  手:   " + path.join(输出根, "hands"))

  // 写映射表给页面用
  const 表 = {}
  映射.forEach((键) => (表[键] = { 图标: `keys/${键}.png`, 手: `hands/${键}.png` }))
  fs.writeFileSync(
    path.join(输出根, "map.json"),
    JSON.stringify({ 说明: "按键名 → 图片路径。页面里按下某个键就取对应的图。", 映射: 表 }, null, 2),
    "utf8"
  )
  fs.writeFileSync(path.join(输出根, "切图记录.json"), JSON.stringify(记录, null, 2), "utf8")
  console.log("  映射: " + path.join(输出根, "map.json"))
}

main().catch((e) => {
  console.log("出错: " + e.message)
  process.exit(1)
})
