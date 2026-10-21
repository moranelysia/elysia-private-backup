/**
 * 画图标.cjs —— 自己画托盘上那个小图标
 *
 * 【为什么不找个图片文件放进来】
 *   一是我手上没有合适的素材，二是图片文件总是要跟着项目走、
 *   还得担心路径找不到。干脆用代码画：每次启动时现画一个，
 *   想要什么颜色改这里就行，永远不会"文件丢失"。
 *
 * 【PNG 是怎么装出来的】
 *   PNG 不是把像素直接写进去，而是"一行一行压缩"。流程是：
 *     1. 每个像素写成 4 个数字（红、绿、蓝、透明度）
 *     2. 每行前面加一个字节（0 表示"这行没做特殊处理"）
 *     3. 全部用 zlib 压一遍
 *     4. 外面再包上"这是 PNG""这是图片信息"几块说明
 *   块与块之间要算 CRC 校验（Windows 上是画不出来的，
 *   所以下面自己实现了一个 CRC32——这段是标准算法，照抄即可）。
 *
 * 用法: node tools\画图标.cjs        （画到 脑\图标.png，纯粹给你看看效果）
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

// ---------- CRC32（PNG 每一块末尾都要挂一个，用来查错） ----------
const CRC表 = (() => {
  const 表 = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    表[n] = c
  }
  return 表
})()

function crc32(缓冲) {
  let c = -1
  for (let i = 0; i < 缓冲.length; i++) c = CRC表[(c ^ 缓冲[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

/** 拼一个 PNG 块：长度 + 类型 + 内容 + 校验 */
function 块(类型, 内容) {
  const 长 = Buffer.alloc(4)
  长.writeUInt32BE(内容.length, 0)
  const 类型缓冲 = Buffer.from(类型, 'ascii')
  const 校验 = Buffer.alloc(4)
  校验.writeUInt32BE(crc32(Buffer.concat([类型缓冲, 内容])), 0)
  return Buffer.concat([长, 类型缓冲, 内容, 校验])
}

/**
 * 把一张 RGBA 像素表压成 PNG 文件内容
 * @param {number} 宽
 * @param {number} 高
 * @param {Buffer} 像素  长度 = 宽 × 高 × 4
 */
function 做PNG(宽, 高, 像素) {
  // 每行开头补一个 0（表示这一行的像素没做"差分"处理）
  const 带行头 = Buffer.alloc(高 * (宽 * 4 + 1))
  for (let y = 0; y < 高; y++) {
    const 目标 = y * (宽 * 4 + 1)
    带行头[目标] = 0
    像素.copy(带行头, 目标 + 1, y * 宽 * 4, (y + 1) * 宽 * 4)
  }

  const 文件头 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const 图片信息 = Buffer.alloc(13)
  图片信息.writeUInt32BE(宽, 0)
  图片信息.writeUInt32BE(高, 4)
  图片信息[8] = 8 // 每个颜色 8 位
  图片信息[9] = 6 // 颜色类型 6 = 带透明度的真彩色
  图片信息[10] = 0 // 压缩方式
  图片信息[11] = 0 // 滤波方式
  图片信息[12] = 0 // 不用隔行扫描

  return Buffer.concat([
    文件头,
    块('IHDR', 图片信息),
    块('IDAT', zlib.deflateSync(带行头, { level: 9 })),
    块('IEND', Buffer.alloc(0)),
  ])
}

// ---------- 她的图标：粉底 + 白色五瓣花 + 金心 ----------
// 花瓣的五个方向（均匀分布在一圈上），角度是"度"
const 花瓣方向 = [270, 342, 54, 126, 198].map((度) => {
  const 弧 = (度 * Math.PI) / 180
  return { x: 0.5 + Math.cos(弧) * 0.215, y: 0.5 + Math.sin(弧) * 0.215 }
})

function 取色(x, y) {
  // ---- 底色：粉色的圆，越靠边越淡 ----
  const 离中心 = Math.hypot(x - 0.5, y - 0.5)
  const 圆边 = 0.482
  if (离中心 > 圆边 + 0.008) return [0, 0, 0, 0] // 圆外：全透明

  const 边缘渐隐 = Math.min(1, Math.max(0, (圆边 - 离中心) / 0.012))
  // 从浅粉到深一点的粉，做出一点立体感（左上亮）
  const 光 = Math.min(1, Math.max(0, 1 - (x * 0.6 + y * 0.9) / 1.5))
  let 红 = 246 - 26 * (1 - 光)
  let 绿 = 148 - 46 * (1 - 光)
  let 蓝 = 196 - 40 * (1 - 光)

  // ---- 白色五瓣花 ----
  let 花瓣值 = 0
  for (const 方向 of 花瓣方向) {
    const 距离 = Math.hypot(x - 方向.x, y - 方向.y)
    // 每个花瓣是个小圆，半径 0.155
    花瓣值 = Math.max(花瓣值, Math.min(1, Math.max(0, (0.158 - 距离) / 0.018)))
  }

  // ---- 花心：一小点金色 ----
  const 心距离 = Math.hypot(x - 0.5, y - 0.5)
  const 金心 = Math.min(1, Math.max(0, (0.075 - 心距离) / 0.014))

  if (花瓣值 > 0) {
    红 = 红 * (1 - 花瓣值) + 255 * 花瓣值
    绿 = 绿 * (1 - 花瓣值) + 252 * 花瓣值
    蓝 = 蓝 * (1 - 花瓣值) + 250 * 花瓣值
  }
  if (金心 > 0) {
    红 = 红 * (1 - 金心) + 255 * 金心
    绿 = 绿 * (1 - 金心) + 214 * 金心
    蓝 = 蓝 * (1 - 金心) + 120 * 金心
  }

  return [红, 绿, 蓝, 255 * 边缘渐隐]
}

/**
 * 画一张图标
 * @param {number} 尺寸 边长（像素）
 * @returns {Buffer} PNG 内容
 */
function 画图标(尺寸 = 32) {
  const 像素 = Buffer.alloc(尺寸 * 尺寸 * 4)
  const 采样 = 3 // 每个像素在 3×3 个点上取样，边缘才不会毛毛的

  for (let py = 0; py < 尺寸; py++) {
    for (let px = 0; px < 尺寸; px++) {
      let 红 = 0
      let 绿 = 0
      let 蓝 = 0
      let 透明 = 0

      for (let sy = 0; sy < 采样; sy++) {
        for (let sx = 0; sx < 采样; sx++) {
          const x = (px + (sx + 0.5) / 采样) / 尺寸
          const y = (py + (sy + 0.5) / 采样) / 尺寸
          const [r, g, b, a] = 取色(x, y)
          // 透明的地方不参与平均颜色，否则边缘会发灰
          const 权重 = a / 255
          红 += r * 权重
          绿 += g * 权重
          蓝 += b * 权重
          透明 += a
        }
      }

      const 总采样 = 采样 * 采样
      const 平均透明 = 透明 / 总采样
      const 权重和 = 透明 / 255
      const 位置 = (py * 尺寸 + px) * 4

      if (权重和 > 0) {
        像素[位置] = Math.round(红 / 权重和)
        像素[位置 + 1] = Math.round(绿 / 权重和)
        像素[位置 + 2] = Math.round(蓝 / 权重和)
      }
      像素[位置 + 3] = Math.round(平均透明)
    }
  }

  return 做PNG(尺寸, 尺寸, 像素)
}

/**
 * 把图片包成 .ico（Windows 图标文件）
 *
 * 【为什么不能直接把 png 改名成 ico】
 *   .ico 有它自己的结构：文件头 + 一张目录表 + 一张张图。
 *   目录表里写明"每张图多大、有多少字节、放在文件第几个字节"。
 *   所以下面得自己拼这几段。
 *
 * 【为什么这里用 PNG 格式存进 ico 里】
 *   老的 ico 存的是"没压缩的位图"，还得配一个叫 AND 掩码的黑白图。
 *   从 Vista 起，256×256 的图标可以**直接塞一张 PNG 进去**。
 *   省事、体积也小 —— 不用手写掩码那一套容易错的东西。
 *
 * @param {Array<{尺寸:number, png:Buffer}>} 图们
 */
function 做ICO(图们) {
  const 头 = Buffer.alloc(6)
  头.writeUInt16LE(0, 0) // 保留位，必须是 0
  头.writeUInt16LE(1, 2) // 1 = 图标（2 是光标，我们用不上）
  头.writeUInt16LE(图们.length, 4)

  const 目录 = Buffer.alloc(16 * 图们.length)
  let 偏移 = 6 + 目录.length

  图们.forEach((图, i) => {
    const 位置 = i * 16
    // 尺寸那一栏：256 要写成 0（一个字节装不下 256）
    目录[位置] = 图.尺寸 >= 256 ? 0 : 图.尺寸
    目录[位置 + 1] = 图.尺寸 >= 256 ? 0 : 图.尺寸
    目录[位置 + 2] = 0 // 调色板数量：真彩色没有调色板
    目录[位置 + 3] = 0 // 保留位
    目录.writeUInt16LE(1, 位置 + 4) // 颜色层数
    目录.writeUInt16LE(32, 位置 + 6) // 每像素多少位
    目录.writeUInt32LE(图.png.length, 位置 + 8) // 这张图有多少字节
    目录.writeUInt32LE(偏移, 位置 + 12) // 它从第几个字节开始
    偏移 += 图.png.length
  })

  return Buffer.concat([头, 目录, ...图们.map((图) => 图.png)])
}

module.exports = { 画图标, 做PNG, 做ICO }

if (require.main === module) {
  const 输出 = path.resolve(__dirname, '..', '脑', '图标.png')
  fs.mkdirSync(path.dirname(输出), { recursive: true })

  // 只画 ico —— 给 repair-icon.cmd 用。
  // 为什么单独一条路：.cmd 里不能出现中文文件名，所以那边只能用
  // `node tools\*.cjs --ico` 这种不带中文的写法（它自己在 tools 里找）。
  if (process.argv.includes('--ico')) {
    const ico路径 = path.resolve(__dirname, '..', 'icon.ico')
    fs.writeFileSync(
      ico路径,
      做ICO([
        { 尺寸: 16, png: 画图标(16) },
        { 尺寸: 32, png: 画图标(32) },
        { 尺寸: 48, png: 画图标(48) },
        { 尺寸: 256, png: 画图标(256) },
      ]),
    )
    console.log('图标重画好了: ' + ico路径 + '  (' + fs.statSync(ico路径).size + ' 字节)')
    process.exit(0)
  }

  // 画三档：16 给任务栏，32 给托盘，256 给以后可能用到的别处
  fs.writeFileSync(输出, 画图标(256))
  fs.writeFileSync(path.join(path.dirname(输出), '图标-32.png'), 画图标(32))
  fs.writeFileSync(path.join(path.dirname(输出), '图标-16.png'), 画图标(16))

  // 再包一个 .ico 出来 —— 桌面快捷方式要用它当图标
  // 注意这里放到项目根，文件名用 ASCII（icon.ico）：
  // 因为 .ps1 里的中文路径在 GBK 解码下会变成乱码，路径就不存在了。
  const ico路径 = path.resolve(__dirname, '..', 'icon.ico')
  fs.writeFileSync(
    ico路径,
    做ICO([
      { 尺寸: 16, png: 画图标(16) },
      { 尺寸: 32, png: 画图标(32) },
      { 尺寸: 48, png: 画图标(48) },
      { 尺寸: 256, png: 画图标(256) },
    ]),
  )

  console.log('画好了:')
  console.log('  ' + 输出)
  console.log('  ' + path.join(path.dirname(输出), '图标-32.png'))
  console.log('  ' + path.join(path.dirname(输出), '图标-16.png'))
  console.log('  ' + ico路径 + '   ← 快捷方式用这个当图标')
  console.log('文件大小 ' + fs.statSync(输出).size + ' 字节 / ico ' + fs.statSync(ico路径).size + ' 字节')
}
