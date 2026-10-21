// 量手部素材.cjs —— 精确量出每张图里"爱心"和"手"的位置与大小
//
// 为什么要量：原图里手和爱心的相对位置是作者摆好的。
// 我要是凭感觉设宽度和偏移，会一直对不准 —— 必须把真实数值测出来。
//
// 用法: node tools/量手部素材.cjs

const fs = require("fs")
const path = require("path")
const sharp = require("sharp")

const 源目录 = "D:\\新建文件夹\\工具研究\\爱莉包-检查\\手部素材"

/** 测一块区域的内容边界（忽略透明和纯白） */
async function 量区域(文件, 区域) {
  const { data, info } = await sharp(文件).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const C = info.channels
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1

  for (let y = 区域.y0; y < 区域.y1; y++) {
    for (let x = 区域.x0; x < 区域.x1; x++) {
      const i = (y * W + x) * C
      if (data[i + 3] <= 20) continue
      if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, 宽: maxX - minX + 1, 高: maxY - minY + 1 }
}

async function main() {
  const 文件们 = fs.readdirSync(源目录).filter(f => /^\d+\.png$/.test(f))
    .sort((a, b) => Number(a.replace(".png", "")) - Number(b.replace(".png", "")))

  console.log("编号  爱心(位置/大小)              手(位置/大小)              手/爱心 尺寸比")
  console.log("─".repeat(96))

  const 结果 = []
  for (const f of 文件们) {
    const 全路径 = path.join(源目录, f)
    // 图是 1400x1400：爱心在左上，手在右下
    const 爱心 = await 量区域(全路径, { x0: 0, y0: 0, x1: 500, y1: 700 })
    const 手 = await 量区域(全路径, { x0: 500, y0: 700, x1: 1400, y1: 1400 })
    if (!爱心 || !手) { console.log(`  ${f}  区域为空，跳过`); continue }

    const 键名 = ["Shift","Ctrl","Alt","Space","Enter","Z","X","C","V","B","A","S","D","F","G","Q","W","E","R","T","1","2","3","4","5"][Number(f.replace(".png",""))]

    结果.push({ 编号: Number(f.replace(".png", "")), 键名, 爱心, 手 })

    console.log(
      `${String(结果[结果.length-1].编号).padStart(2)} ${String(键名).padEnd(6)} ` +
      `x${String(爱心.x).padStart(4)} y${String(爱心.y).padStart(4)} ${String(爱心.宽).padStart(4)}x${String(爱心.高).padEnd(4)}  ` +
      `x${String(手.x).padStart(4)} y${String(手.y).padStart(4)} ${String(手.宽).padStart(4)}x${String(手.高).padEnd(4)}  ` +
      `${(手.宽 / 爱心.宽).toFixed(2)}x`
    )
  }

  console.log("─".repeat(96))
  // 统计
  const 爱心宽 = 结果.map(r => r.爱心.宽)
  const 手宽 = 结果.map(r => r.手.宽)
  const 比 = 结果.map(r => r.手.宽 / r.爱心.宽)
  console.log(`爱心宽度: ${Math.min(...爱心宽)} ~ ${Math.max(...爱心宽)}`)
  console.log(`手宽度:   ${Math.min(...手宽)} ~ ${Math.max(...手宽)}`)
  console.log(`手/爱心:  ${Math.min(...比).toFixed(2)} ~ ${Math.max(...比).toFixed(2)}`)

  fs.writeFileSync(
    path.resolve(__dirname, "..", "renderer", "assets", "keyboard", "测量.json"),
    JSON.stringify(结果, null, 2),
    "utf8"
  )
  console.log("\n原始数据已存: renderer/assets/keyboard/测量.json")
}

main().catch(e => { console.log("出错: " + e.message); process.exit(1) })
