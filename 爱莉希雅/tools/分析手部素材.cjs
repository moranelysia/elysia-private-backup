// 分析手部素材.cjs —— 看清那 25 张 hand/N.png 的结构
//
// 目标：把每张图里"爱心按键图标"和"她的手"分开。
// 它们每张都是 1400x1400，位置应该是一致的，所以先测清楚边界再批量裁。
//
// 用法: node tools/分析手部素材.cjs

const fs = require("fs")
const path = require("path")
const sharp = require("sharp")

const 源目录 = process.argv[2] || "D:\\新建文件夹\\工具研究\\爱莉包-检查\\手部素材"

async function 分析一张(文件) {
  const { data, info } = await sharp(文件).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const C = info.channels

  let 有透明像素 = false
  let 非白总数 = 0
  // 分四象限统计内容分布，看内容大概在哪
  const 区 = { 左上: 0, 右上: 0, 左下: 0, 右下: 0 }
  let minX = W, maxX = -1, minY = H, maxY = -1
  let 左上minX = W, 左上maxX = -1, 左上minY = H, 左上maxY = -1
  let 右下minX = W, 右下maxX = -1, 右下minY = H, 右下maxY = -1

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C
      const a = data[i + 3]
      if (a < 255) 有透明像素 = true
      // "有内容" = 不透明 且 不是纯白
      const 是内容 = a > 20 && !(data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245)
      if (!是内容) continue
      非白总数++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      const 左 = x < W / 2
      const 上 = y < H / 2
      if (上 && 左) {
        区.左上++
        if (x < 左上minX) 左上minX = x
        if (x > 左上maxX) 左上maxX = x
        if (y < 左上minY) 左上minY = y
        if (y > 左上maxY) 左上maxY = y
      } else if (上 && !左) 区.右上++
      else if (!上 && 左) 区.左下++
      else {
        区.右下++
        if (x < 右下minX) 右下minX = x
        if (x > 右下maxX) 右下maxX = x
        if (y < 右下minY) 右下minY = y
        if (y > 右下maxY) 右下maxY = y
      }
    }
  }

  return {
    文件: path.basename(文件),
    尺寸: `${W}x${H}`,
    有透明: 有透明像素,
    内容占比: ((非白总数 / (W * H)) * 100).toFixed(2) + "%",
    整体边界: maxX < 0 ? "空图" : `x ${minX}~${maxX}, y ${minY}~${maxY}`,
    左上区: 区.左上 === 0 ? "无" : `${区.左上} 像素, x ${左上minX}~${左上maxX}, y ${左上minY}~${左上maxY}`,
    右下区: 区.右下 === 0 ? "无" : `${区.右下} 像素, x ${右下minX}~${右下maxX}, y ${右下minY}~${右下maxY}`,
    四象限: 区,
  }
}

async function main() {
  const 文件们 = fs
    .readdirSync(源目录)
    .filter((f) => /^\d+\.png$/.test(f))
    .sort((a, b) => Number(a.replace(".png", "")) - Number(b.replace(".png", "")))

  if (文件们.length === 0) {
    console.log("目录里没有 数字.png 这样的文件: " + 源目录)
    console.log("先把 25 张 hand 图抽出来放进去。")
    process.exit(1)
  }

  console.log(`发现 ${文件们.length} 张图，分析前 3 张和最后 1 张：\n`)
  const 样本 = [文件们[0], 文件们[1], 文件们[2], 文件们[文件们.length - 1]]
  for (const f of 样本) {
    const r = await 分析一张(path.join(源目录, f))
    console.log("── " + r.文件 + "  " + r.尺寸)
    console.log("   有透明通道: " + r.有透明)
    console.log("   内容占比: " + r.内容占比)
    console.log("   整体边界: " + r.整体边界)
    console.log("   左上区内容: " + r.左上区)
    console.log("   右下区内容: " + r.右下区)
    console.log("   四象限像素数: " + JSON.stringify(r.四象限))
    console.log("")
  }
}

main().catch((e) => {
  console.log("出错: " + e.message)
  process.exit(1)
})
