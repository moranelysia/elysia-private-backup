// qubai.cjs —— 把图片的白色背景变透明（洪水填充版）
//
// 【为什么不能用"颜色阈值"那么简单】
// 第一版是逐个像素判断"白不白"，结果把角色的脸也抠穿了——
// 因为浅色角色的皮肤、白衣服、白花，颜色跟白背景太接近。
// 光看颜色，程序分不清"这是背景"还是"这是她的脸"。
//
// 【正确思路：从边缘灌进去】
// 从图片最外圈开始，遇到白的就往里漫，像水一样。只有"跟边缘连着"的白色
// 才算背景，被线条围在中间的白（比如脸颊高光）会保住。
// 这个算法叫洪水填充（flood fill），画图软件里的"油漆桶"就是它。
//
// 用法：
//   node tools/qubai.cjs <输入图> <输出图> [阈值] [--preview]
//
// 阈值默认 238。往大了调（245+）更保守，脸保得住但边缘可能留白边；
// 往小了调（225-）抠得干净但可能咬进角色。

const fs = require("fs")

let sharp
try {
  sharp = require("sharp")
} catch {
  console.log("缺 sharp，先跑: npm.cmd install sharp")
  process.exit(1)
}

const args = process.argv.slice(2).filter((a) => a !== "--preview")
const wantPreview = process.argv.includes("--preview")
const [input, output, thresholdArg] = args
const threshold = Number(thresholdArg) || 238

if (!input || !output) {
  console.log("用法: node tools/qubai.cjs <输入图> <输出图> [阈值] [--preview]")
  process.exit(1)
}
if (!fs.existsSync(input)) {
  console.log("找不到文件: " + input)
  process.exit(1)
}

function withTimeout(label, promise, ms = 60000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 卡住超过 ${ms / 1000} 秒`)), ms)
    ),
  ])
}

async function main() {
  console.log(`输入: ${input}`)
  console.log(`阈值: ${threshold}（越高越保守）`)
  console.log("")

  console.log("1/5 读图片信息…")
  const meta = await withTimeout("读取信息", sharp(input).metadata())
  const width = meta.width
  const height = meta.height
  const total = width * height
  console.log(`    ${width} x ${height}`)

  console.log("2/5 读出像素…")
  const data = await withTimeout("读取像素", sharp(input).ensureAlpha().raw().toBuffer())

  console.log("3/5 从四条边往里灌（洪水填充）…")

  // visited[i] = 这个像素处理过没有。用 Uint8Array 省内存，一亿个也只占 100 MB。
  const visited = new Uint8Array(total)
  // 待处理队列。用普通数组 + 读指针，比 shift() 快得多（shift 每次都搬整个数组）
  const queue = new Int32Array(total)
  let qHead = 0
  let qTail = 0

  /** 这个像素算不算"背景白" */
  const isWhite = (idx) => {
    const p = idx * 4
    return Math.min(data[p], data[p + 1], data[p + 2]) >= threshold
  }

  /** 把一个像素放进队列（如果它够白、还没处理过） */
  const push = (idx) => {
    if (visited[idx]) return
    visited[idx] = 1
    if (!isWhite(idx)) return // 不是白的，漫不过去，但它算"边界"，不动它
    queue[qTail++] = idx
  }

  // 四条边全放进去当种子
  for (let x = 0; x < width; x++) {
    push(x) // 上边
    push((height - 1) * width + x) // 下边
  }
  for (let y = 0; y < height; y++) {
    push(y * width) // 左边
    push(y * width + width - 1) // 右边
  }

  // 开始漫
  let cleared = 0
  while (qHead < qTail) {
    const idx = queue[qHead++]
    data[idx * 4 + 3] = 0 // 透明
    cleared++

    const x = idx % width
    const y = (idx - x) / width

    if (x > 0) push(idx - 1)
    if (x < width - 1) push(idx + 1)
    if (y > 0) push(idx - width)
    if (y < height - 1) push(idx + width)
  }

  const pct = ((cleared / total) * 100).toFixed(1)
  console.log(`    抠掉 ${cleared} 个像素（占 ${pct}%）`)
  if (Number(pct) > 90) {
    console.log(`    ⚠ 抠掉九成以上，阈值可能太低，把人也吃进去了。试试调大：… ${output} 245`)
  } else if (Number(pct) < 15) {
    console.log(`    ⚠ 只抠掉一点点，白底可能没连到边缘（或者阈值太高）。试试调小：… ${output} 225`)
  }

  console.log("4/5 边缘柔化…")
  // 洪水填充是"一刀切"，边缘会有硬锯齿。给紧邻透明区的半白像素
  // 一点半透明，看起来柔和些。
  let softened = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      if (data[idx * 4 + 3] !== 0) continue // 自己不是透明的，跳过
      // 看它右边和下边那个不透明的邻居，给它一点渐变的透明
      const right = (idx + 1) * 4
      const down = (idx + width) * 4
      for (const p of [right, down]) {
        if (data[p + 3] === 0) continue
        const minC = Math.min(data[p], data[p + 1], data[p + 2])
        if (minC > threshold - 40) {
          const t = (minC - (threshold - 40)) / 40
          data[p + 3] = Math.round(data[p + 3] * (1 - t * 0.6))
          softened++
        }
      }
    }
  }
  console.log(`    柔化了 ${softened} 个边缘像素`)

  console.log("5/5 写文件…")
  const raw = { raw: { width, height, channels: 4 } }
  await withTimeout("写 PNG", sharp(data, raw).png().toFile(output))
  console.log(`    ✓ ${output}  (${Math.round(fs.statSync(output).size / 1024)} KB)`)

  if (wantPreview) {
    const previewPath = output.replace(/\.png$/i, "") + "-预览.png"
    await withTimeout(
      "写预览图",
      sharp({
        create: { width, height, channels: 4, background: { r: 55, g: 55, b: 65, alpha: 1 } },
      })
        .composite([{ input: data, raw: { width, height, channels: 4 }, blend: "over" }])
        .png()
        .toFile(previewPath)
    )
    console.log(`    ✓ 预览图 ${previewPath}`)
  }

  console.log("")
  console.log("完成。")
}

main().catch((err) => {
  console.log("")
  console.log("✗ " + err.message)
  process.exit(1)
})
