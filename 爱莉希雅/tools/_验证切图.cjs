const fs = require("fs")
const path = require("path")
const sharp = require("sharp")

const 根 = "D:\\新建文件夹\\爱莉希雅\\renderer\\assets\\keyboard"
const 输出 = "D:\\新建文件夹\\工具研究\\爱莉包-检查\\切图验证.png"

const 映射 = ["Shift","Ctrl","Alt","Space","Enter","Z","X","C","V","B","A","S","D","F","G","Q","W","E","R","T","1","2","3","4","5"]

async function main() {
  const 格 = 130
  const 列 = 5
  const 行 = 5
  const W = 格 * 列
  const H = 格 * 行 * 2 + 20   // 上半：图标  下半：手

  const 底 = sharp({
    create: { width: W, height: H, channels: 4, background: { r: 250, g: 245, b: 250, alpha: 1 } },
  })

  const 图层 = []
  for (let i = 0; i < 映射.length; i++) {
    const 键 = 映射[i]
    const 列号 = i % 列
    const 行号 = Math.floor(i / 列)

    // 图标
    const k = await sharp(path.join(根, "keys", 键 + ".png"))
      .resize(格 - 10, 格 - 10, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer()
    图层.push({ input: k, left: 列号 * 格 + 5, top: 行号 * 格 + 5 })

    // 手
    const h = await sharp(path.join(根, "hands", 键 + ".png"))
      .resize(格 - 10, 格 - 10, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer()
    图层.push({ input: h, left: 列号 * 格 + 5, top: 格 * 行 + 20 + 行号 * 格 + 5 })
  }

  await 底.composite(图层).png().toFile(输出)
  console.log("拼好了: " + 输出)
  console.log("上半部分是按键图标，下半部分是对应的手（同一个位置=同一个按键）")
  console.log(`尺寸 ${W} x ${H}`)
}
main().catch(e => { console.log("出错: " + e.message); process.exit(1) })
