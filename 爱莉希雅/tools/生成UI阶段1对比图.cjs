'use strict'

const path = require('node:path')
const sharp = require('sharp')

const 项目根 = path.resolve(__dirname, '..')
const 缓存 = path.join(项目根, '.cache')
const 改造前路径 = path.join(缓存, 'UI阶段1-改造前.png')
const 改造后路径 = path.join(缓存, 'UI阶段1-改造后.png')
const 输出路径 = path.join(缓存, 'UI阶段1-前后对比.png')

;(async () => {
  const 单图宽 = 900
  const 标题高 = 64
  const 间隔 = 4
  const 改造前 = await sharp(改造前路径).resize({ width: 单图宽 }).png().toBuffer()
  const 改造后 = await sharp(改造后路径).resize({ width: 单图宽 }).png().toBuffer()
  const { height: 单图高 } = await sharp(改造前).metadata()
  const 总宽 = 单图宽 * 2 + 间隔
  const 标题 = Buffer.from(`
    <svg width="${总宽}" height="${标题高}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${总宽}" height="${标题高}" fill="#fff7fb"/>
      <text x="${单图宽 / 2}" y="41" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="24" font-weight="600" fill="#8b5872">改造前</text>
      <text x="${单图宽 + 间隔 + 单图宽 / 2}" y="41" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="24" font-weight="600" fill="#c1548a">阶段 1 改造后</text>
    </svg>
  `)

  await sharp({
    create: { width: 总宽, height: 标题高 + 单图高, channels: 3, background: '#ead3df' },
  }).composite([
    { input: 标题, left: 0, top: 0 },
    { input: 改造前, left: 0, top: 标题高 },
    { input: 改造后, left: 单图宽 + 间隔, top: 标题高 },
  ]).png().toFile(输出路径)

  console.log(`✓ UI 阶段 1 前后对比图：${输出路径}`)
})().catch((错误) => {
  console.error('✗ ' + (错误.stack || 错误.message))
  process.exitCode = 1
})
