// 量键盘位置.cjs —— 在模型贴图里找出那个键盘的精确范围
//
// 为什么要量：要把那 25 张手部素材叠到她键盘上，
// 必须先知道键盘在贴图里占哪一块 —— 贴图坐标 → 页面坐标 才能换算。
//
// 找法：贴图上一大片背景是白色/透明，键盘是紫色系。
// 扫出"明显的紫色像素"的包围盒，那就是键盘。
//
// 用法: node tools/量键盘位置.cjs

const sharp = require("sharp")

const 源 = "renderer/models/elysia/cat.8192/texture_00.png"

async function main() {
  const { data, info } = await sharp(源).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const C = info.channels
  console.log(`贴图 ${W} x ${H}`)

  // 只看右下这一带（键盘在那里），省时间
  const X0 = 900, X1 = 2000, Y0 = 1200, Y1 = 2000

  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1
  let 命中 = 0

  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x < X1; x++) {
      const i = (y * W + x) * C
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
      if (a < 30) continue
      // 紫色系：蓝比绿明显高，且不是纯白
      const 是紫 = b > g + 25 && r > 80 && b > 120 && !(r > 245 && g > 245 && b > 245)
      // 米/橙色按键（Shift/Ctrl/Alt 那几个）
      const 是米 = r > 200 && g > 170 && b < 190 && g > b + 20
      if (!是紫 && !是米) continue
      命中++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (maxX < 0) {
    console.log("没找到紫色区域，得换个找法")
    return
  }

  console.log("")
  console.log("=== 键盘在贴图里的范围 ===")
  console.log(`  x: ${minX} ~ ${maxX}   （宽 ${maxX - minX + 1}）`)
  console.log(`  y: ${minY} ~ ${maxY}   （高 ${maxY - minY + 1}）`)
  console.log(`  命中像素: ${命中}`)
  console.log("")
  console.log("这组数字就是贴图坐标，之后要靠它把手部素材换算到页面上。")

  // 验证一下：把这块裁出来看看是不是键盘
  const 出 = "D:\\新建文件夹\\工具研究\\爱莉包-检查\\键盘-量出来的范围.png"
  const padding = 40
  await sharp(源)
    .extract({
      left: Math.max(0, minX - padding),
      top: Math.max(0, minY - padding),
      width: Math.min(W - (minX - padding), maxX - minX + 1 + padding * 2),
      height: Math.min(H - (minY - padding), maxY - minY + 1 + padding * 2),
    })
    .resize(800)
    .png()
    .toFile(出)
  console.log("裁出来验证: " + 出)
}

main().catch((e) => {
  console.log("出错: " + e.message)
  process.exit(1)
})
