/**
 * 切图.cjs —— 把一张糊图切成几块，好让看图的那个脑子看清上面的小字
 *
 * 【它治什么】
 *   模型看图有个**硬上限**：不管原图多大，送到它面前之前都会被缩到
 *   大约 1300×1300 的像素量，一张图最多算 1024 个 token。
 *   （DeepSeek 官方文档 Vision 那一页写着，见 脑\附件.cjs 里那段注释。）
 *
 *   所以一张密密麻麻的课表截图发过去，她只能看出"这是一张课表、分成几列"，
 *   格子里写的是哪门课、哪个教室 —— 字只剩几个像素高，认不出来。
 *   她不会说"我看不清"，她会说一个**听起来很像那么回事**的答案。
 *
 * 【切开为什么有用】
 *   因为缩小是按"整块图"算的。一张 2538×1503 切成 3×2 之后，
 *   每一块只有 846×751 —— 送到她面前时那一块会被**放大**到同样的
 *   像素预算里，等于小字凭空大了两三倍。
 *
 * 【注意】切开不会变出新的信息，它只是把有限的那点像素预算
 *   用在更小的一块地方上。所以块数不是越多越好：
 *   切太碎，每块都没头没尾，她反而不知道自己在看什么。
 *
 * 用法:
 *   node tools\切图.cjs <图片路径> [横切几块] [竖切几块]
 *   例：node tools\切图.cjs 记忆\附件\课表.jpg 3 2
 *
 *   切出来的块放在 .cache\看图\ 里，文件名是 <原名>-横-竖.png
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 输出目录 = path.join(项目根, '.cache', '看图')

async function 主() {
  const 参数 = process.argv.slice(2)
  const 输入 = 参数[0]
  const 横 = Math.max(1, Math.min(6, Number(参数[1]) || 2))
  const 竖 = Math.max(1, Math.min(6, Number(参数[2]) || 2))

  if (!输入) {
    console.log('')
    console.log('  用法: node tools\\切图.cjs <图片路径> [横切几块] [竖切几块]')
    console.log('  例：  node tools\\切图.cjs 记忆\\附件\\课表.jpg 3 2')
    console.log('')
    process.exit(1)
  }

  const 全路径 = path.isAbsolute(输入) ? 输入 : path.join(项目根, 输入)
  if (!fs.existsSync(全路径)) {
    console.log('')
    console.log('  ✗ 找不到这张图：' + 全路径)
    console.log('')
    process.exit(1)
  }

  let sharp
  try {
    sharp = require('sharp')
  } catch {
    console.log('  ✗ 这台机器上没有 sharp，切不了')
    process.exit(1)
  }

  const 元 = await sharp(全路径).metadata()
  const 宽 = 元.width
  const 高 = 元.height
  if (!宽 || !高) {
    console.log('  ✗ 这张图读不出尺寸')
    process.exit(1)
  }

  fs.mkdirSync(输出目录, { recursive: true })

  // 【尺寸取整要小心】宽 2538 分 3 份是 846 整，可 2537 分 3 份就有余数。
  //   余数全塞给最后一块，不然最后会少一条边。
  const 每块宽 = Math.floor(宽 / 横)
  const 每块高 = Math.floor(高 / 竖)
  const 干名 = path.basename(全路径, path.extname(全路径))
  const 切出来的 = []

  for (let 行 = 0; 行 < 竖; 行++) {
    for (let 列 = 0; 列 < 横; 列++) {
      const 左 = 列 * 每块宽
      const 上 = 行 * 每块高
      const 这宽 = 列 === 横 - 1 ? 宽 - 左 : 每块宽
      const 这高 = 行 === 竖 - 1 ? 高 - 上 : 每块高
      const 存成 = path.join(输出目录, `${干名}-${行 + 1}-${列 + 1}.png`)

      await sharp(全路径)
        .extract({ left: 左, top: 上, width: 这宽, height: 这高 })
        // 【不要在这儿放大 —— 我第一版就是错的】
        //   第一版我把每一块拉到 1300 宽，想的是"多给她一点像素"。
        //   可模型那边本来就按"整块图的像素量"往同一个预算上缩放：
        //   我先插值放大，它再缩回去，中间白糊一道，反而更差。
        //   原样切出来就够了 —— 切块本身已经把那份像素预算
        //   集中到了更小的一块地方，这才是它的意义。
        .png()
        .toFile(存成)

      切出来的.push(存成)
    }
  }

  console.log('')
  console.log('  原图 ' + 宽 + '×' + 高 + '，切成 ' + 横 + '×' + 竖 + ' = ' + 切出来的.length + ' 块')
  console.log('  每块大约 ' + 每块宽 + '×' + 每块高 + '，放大后存到：')
  console.log('')
  for (const 一个 of 切出来的) {
    console.log('    ' + 一个)
  }
  console.log('')
  console.log('  发给她的办法：把这些图一块一块当附件发过去，跟她说"这是同一张图的第几块"。')
  console.log('')
}

主().catch((错误) => {
  console.log('  ✗ ' + (错误 && 错误.message))
  process.exit(1)
})
