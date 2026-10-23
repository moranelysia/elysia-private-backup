'use strict'

const path = require('node:path')
const sharp = require('sharp')

const 项目根 = path.resolve(__dirname, '..')
const 缓存 = path.join(项目根, '.cache')
const 输出 = path.join(缓存, 'UI阶段5-Live2D-前后对比.png')

function 标题条(宽, 高, 左标题, 右标题, 左中心, 右中心) {
  return Buffer.from(`
    <svg width="${宽}" height="${高}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${宽}" height="${高}" rx="18" fill="#fff7fb"/>
      <text x="${左中心}" y="39" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="21" font-weight="600" fill="#8b5872">${左标题}</text>
      <text x="${右中心}" y="39" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="21" font-weight="600" fill="#c1548a">${右标题}</text>
    </svg>
  `)
}

;(async () => {
  const 间隔 = 10
  const 标题高 = 58
  const 快聊宽 = 520
  const 加载宽 = 520

  const 读并缩放 = (名字, 宽) => sharp(path.join(缓存, 名字)).resize({ width: 宽 }).png().toBuffer()
  const 加载前 = await 读并缩放('UI阶段5-Live2D-改造前-加载提示.png', 加载宽)
  const 加载后 = await 读并缩放('UI阶段5-Live2D-改造后-加载提示.png', 加载宽)
  const 快聊前 = await 读并缩放('UI阶段5-Live2D-改造前-快聊.png', 快聊宽)
  const 快聊后 = await 读并缩放('UI阶段5-Live2D-改造后-快聊.png', 快聊宽)
  const { height: 加载高 } = await sharp(加载前).metadata()
  const { height: 快聊高 } = await sharp(快聊前).metadata()
  const 总宽 = 快聊宽 * 2 + 间隔
  const 第二行顶 = 标题高 + 加载高 + 间隔
  const 总高 = 第二行顶 + 标题高 + 快聊高
  const 左中心 = 快聊宽 / 2
  const 右中心 = 快聊宽 + 间隔 + 快聊宽 / 2

  await sharp({ create: { width: 总宽, height: 总高, channels: 3, background: '#ead3df' } })
    .composite([
      { input: 标题条(总宽, 标题高, '加载提示 · 改造前', '加载提示 · 改造后', 左中心, 右中心), left: 0, top: 0 },
      { input: 加载前, left: 0, top: 标题高 },
      { input: 加载后, left: 快聊宽 + 间隔, top: 标题高 },
      { input: 标题条(总宽, 标题高, '双击快聊 · 改造前', '双击快聊 · 改造后', 左中心, 右中心), left: 0, top: 第二行顶 },
      { input: 快聊前, left: 0, top: 第二行顶 + 标题高 },
      { input: 快聊后, left: 快聊宽 + 间隔, top: 第二行顶 + 标题高 },
    ])
    .png()
    .toFile(输出)

  console.log(`✓ 阶段 5 Live2D 小界面前后对比图：${输出}`)
})().catch((错误) => {
  console.error('✗ ' + (错误.stack || 错误.message))
  process.exitCode = 1
})
