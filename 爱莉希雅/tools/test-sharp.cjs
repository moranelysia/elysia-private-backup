// test-sharp.cjs —— 最小测试：sharp 能不能正常干活
//
// 用法: node tools/test-sharp.cjs renderer/elysia.jpg
//
// 它会一步步打印进度，哪一步停住，问题就在哪一步。

const fs = require("fs")

const input = process.argv[2] || "renderer/elysia.jpg"

// 每一步都加超时，卡住就报出来，不让你干等
function withTimeout(label, promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`【超时】${label} 超过 ${ms / 1000} 秒没反应`)), ms)
    ),
  ])
}

async function main() {
  console.log("第 1 步：文件在不在")
  if (!fs.existsSync(input)) {
    console.log(`  ✗ 找不到 ${input}`)
    process.exit(1)
  }
  console.log(`  ✓ 找到了，${Math.round(fs.statSync(input).size / 1024)} KB`)

  console.log("")
  console.log("第 2 步：加载 sharp")
  let sharp
  try {
    sharp = require("sharp")
  } catch (e) {
    console.log("  ✗ 加载失败：" + e.message)
    console.log("    说明 sharp 没装好，跑: npm.cmd install sharp")
    process.exit(1)
  }
  console.log("  ✓ 加载成功")

  console.log("")
  console.log("第 3 步：读图片信息（这一步最容易卡）")
  const meta = await withTimeout("读取图片信息", sharp(input).metadata())
  console.log(`  ✓ ${meta.width} x ${meta.height}，格式 ${meta.format}，通道 ${meta.channels}`)

  console.log("")
  console.log("第 4 步：读出原始像素")
  const buf = await withTimeout(
    "读取像素",
    sharp(input).ensureAlpha().raw().toBuffer()
  )
  console.log(`  ✓ 拿到 ${Math.round(buf.length / 1024 / 1024 * 10) / 10} MB 像素数据`)
  console.log(`    预期大小: ${meta.width * meta.height * 4} 字节，实际: ${buf.length} 字节`)

  console.log("")
  console.log("第 5 步：随便改一个像素的颜色，看能不能写出去")
  buf[0] = 255
  buf[1] = 0
  buf[2] = 255
  await withTimeout(
    "写文件",
    sharp(buf, { raw: { width: meta.width, height: meta.height, channels: 4 } })
      .png()
      .toFile("tools/_test-out.png")
  )
  const outSize = Math.round(fs.statSync("tools/_test-out.png").size / 1024)
  console.log(`  ✓ 写出去了，tools/_test-out.png (${outSize} KB)`)

  console.log("")
  console.log("全部通过 —— sharp 没问题，是 qubai.cjs 的写法要改。")
}

main().catch((err) => {
  console.log("")
  console.log("✗ " + err.message)
  console.log("")
  console.log("把上面这几步的输出发给我，就知道卡在哪了。")
  process.exit(1)
})
