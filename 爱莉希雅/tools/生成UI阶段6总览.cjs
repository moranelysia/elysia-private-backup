'use strict'

const path = require('node:path')
const sharp = require('sharp')

const 根 = path.resolve(__dirname, '..')
const 缓存 = path.join(根, '.cache')
const 输出 = path.join(缓存, 'UI阶段6-全界面总览.png')
const 单宽 = 420
const 单高 = 350
const 标题高 = 46
const 间隔 = 10
const 项目 = [
  ['主界面', 'UI阶段1-改造后.png'],
  ['聊天内容', 'UI阶段2-改造后-聊天.png'],
  ['任务抽屉', 'UI阶段2-改造后-任务.png'],
  ['设置弹层', 'UI阶段3-改造后-设置.png'],
  ['长期记忆', 'UI阶段4-改造后-长期列表.png'],
  ['记忆关系图', 'UI阶段4-改造后-关系图.png'],
  ['固定账本', 'UI阶段5-账本-改造后.png'],
  ['Live2D 快聊', 'UI阶段5-Live2D-改造后-快聊.png'],
  ['Live2D 加载提示', 'UI阶段5-Live2D-改造后-加载提示.png'],
]

function 标签(文字) {
  return Buffer.from(`
    <svg width="${单宽}" height="${标题高}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${单宽}" height="${标题高}" rx="15" fill="#fff8fc"/>
      <text x="${单宽 / 2}" y="31" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="18" font-weight="600" fill="#a4547d">${文字}</text>
    </svg>
  `)
}

;(async () => {
  const 图层 = []
  for (let 索引 = 0; 索引 < 项目.length; 索引++) {
    const [名字, 文件] = 项目[索引]
    const 列 = 索引 % 3
    const 行 = Math.floor(索引 / 3)
    const 左 = 列 * (单宽 + 间隔)
    const 上 = 行 * (单高 + 间隔)
    const 图片 = await sharp(path.join(缓存, 文件))
      .flatten({ background: '#fff8fc' })
      .resize(单宽, 单高 - 标题高, { fit: 'contain', background: '#f7e7ef' })
      .png()
      .toBuffer()
    图层.push({ input: 标签(名字), left: 左, top: 上 })
    图层.push({ input: 图片, left: 左, top: 上 + 标题高 })
  }
  const 总宽 = 单宽 * 3 + 间隔 * 2
  const 总高 = 单高 * 3 + 间隔 * 2
  await sharp({ create: { width: 总宽, height: 总高, channels: 3, background: '#ead3df' } })
    .composite(图层)
    .png()
    .toFile(输出)
  console.log(`✓ UI 阶段 6 全界面总览：${输出}`)
})().catch((错误) => {
  console.error('✗ ' + (错误.stack || 错误.message))
  process.exitCode = 1
})
