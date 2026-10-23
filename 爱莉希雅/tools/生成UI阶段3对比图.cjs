'use strict'

const path = require('node:path')
const sharp = require('sharp')

const 项目根 = path.resolve(__dirname, '..')
const 缓存 = path.join(项目根, '.cache')
const 输出路径 = path.join(缓存, 'UI阶段3-前后对比.png')

;(async () => {
  const 单图宽 = 620
  const 列间隔 = 4
  const 总宽 = 单图宽 * 2 + 列间隔
  const 顶标题高 = 54
  const 行标题高 = 28
  const 行间隔 = 4
  const 场景们 = ['文件', '工作索引', '工具记录', '上下文', '设置', '表达反馈']
  const 行们 = []
  let 单图高 = 0

  for (const 场景 of 场景们) {
    const 前 = await sharp(path.join(缓存, `UI阶段3-改造前-${场景}.png`)).resize({ width: 单图宽 }).png().toBuffer()
    const 后 = await sharp(path.join(缓存, `UI阶段3-改造后-${场景}.png`)).resize({ width: 单图宽 }).png().toBuffer()
    if (!单图高) ({ height: 单图高 } = await sharp(前).metadata())
    行们.push({ 场景, 前, 后 })
  }

  const 行高 = 行标题高 + 单图高
  const 总高 = 顶标题高 + 行高 * 行们.length + 行间隔 * (行们.length - 1)
  const 顶标题 = Buffer.from(`
    <svg width="${总宽}" height="${顶标题高}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${总宽}" height="${顶标题高}" fill="#fff7fb"/>
      <text x="${单图宽 / 2}" y="36" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="21" font-weight="600" fill="#8b5872">阶段 3 改造前</text>
      <text x="${单图宽 + 列间隔 + 单图宽 / 2}" y="36" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="21" font-weight="600" fill="#c1548a">阶段 3 改造后</text>
    </svg>
  `)
  const 合成 = [{ input: 顶标题, left: 0, top: 0 }]

  行们.forEach((行, 序号) => {
    const top = 顶标题高 + 序号 * (行高 + 行间隔)
    const 行标题 = Buffer.from(`
      <svg width="${总宽}" height="${行标题高}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${总宽}" height="${行标题高}" fill="#f9eaf2"/>
        <text x="${总宽 / 2}" y="20" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="15" font-weight="600" fill="#9c6681">${行.场景}</text>
      </svg>
    `)
    合成.push(
      { input: 行标题, left: 0, top },
      { input: 行.前, left: 0, top: top + 行标题高 },
      { input: 行.后, left: 单图宽 + 列间隔, top: top + 行标题高 },
    )
  })

  await sharp({ create: { width: 总宽, height: 总高, channels: 3, background: '#ead3df' } })
    .composite(合成)
    .png()
    .toFile(输出路径)

  console.log(`✓ UI 阶段 3 前后对比图：${输出路径}`)
})().catch((错误) => {
  console.error('✗ ' + (错误.stack || 错误.message))
  process.exitCode = 1
})
