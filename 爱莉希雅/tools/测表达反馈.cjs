/** 表达反馈库隔离测试：只用系统临时目录，不碰真实 .cache。 */
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { 固定标签, 正规标签, 创建反馈库 } = require('../脑/表达反馈.cjs')

let 数量 = 0
function 检查(说明, 条件) { assert.ok(条件, 说明); 数量++; console.log('✓ ' + 说明) }

const 目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-style-feedback-'))
try {
  const 文件 = path.join(目录, '表达反馈.json')
  const 库 = 创建反馈库(文件, { 现在: () => '2026-10-16T10:00:00.000Z' })
  const 样本 = { 对话: 'chat-1', 消息时间: '2026-10-16 18:00', 内容: '你做什么都特别棒呀。' }

  检查('固定提供五个有针对性的人工标签', 固定标签.length === 5 && 固定标签.includes('讨好腔') && 固定标签.includes('不像爱莉希雅'))
  检查('不存在的文件视为空库且不会抢先创建', 库.查(样本).好 && !fs.existsSync(文件))
  检查('未知标签会在本地边界被丢弃', JSON.stringify(正规标签(['讨好腔', '伪造标签', '讨好腔'])) === JSON.stringify(['讨好腔']))

  const 首次 = 库.保存({ ...样本, 标签: ['讨好腔', '空洞', '伪造标签'] })
  检查('保存有效标签成功', 首次.好 && JSON.stringify(首次.标签) === JSON.stringify(['讨好腔', '空洞']))
  const 数据 = JSON.parse(fs.readFileSync(文件, 'utf8'))
  检查('评测文件保留原回复和来源会话以供人工复核', 数据.条目.length === 1 && 数据.条目[0].内容 === 样本.内容 && 数据.条目[0].对话 === 样本.对话)
  检查('查询同一回复能恢复标签', JSON.stringify(库.查(样本).标签) === JSON.stringify(['讨好腔', '空洞']))
  const 列表 = 库.列表()
  检查('只读列表返回完整样本与统计', 列表.好 && 列表.总数 === 1 && 列表.条目[0].内容 === 样本.内容)

  const 更新 = 库.保存({ ...样本, 标签: ['套路句式'] })
  检查('重复标记会原位更新而不复制样本', 更新.好 && JSON.parse(fs.readFileSync(文件, 'utf8')).条目.length === 1)
  检查('清空标签会删除该评测样本', 库.保存({ ...样本, 标签: [] }).已删除 && JSON.parse(fs.readFileSync(文件, 'utf8')).条目.length === 0)
  检查('删除后只读列表立即变为空态', 库.列表().总数 === 0)
  检查('缺少正式回复定位信息时拒绝保存', !库.保存({ 内容: '随便塞一句', 标签: ['空洞'] }).好)
  检查('超长正文不会进入评测集', !库.保存({ ...样本, 内容: '字'.repeat(12001), 标签: ['空洞'] }).好)

  fs.writeFileSync(文件, '{坏掉了', 'utf8')
  const 坏文件原文 = fs.readFileSync(文件, 'utf8')
  检查('损坏文件会明确报错', !库.查(样本).好)
  检查('损坏文件不会被一次新保存静默覆盖', !库.保存({ ...样本, 标签: ['空洞'] }).好 && fs.readFileSync(文件, 'utf8') === 坏文件原文)
} finally {
  fs.rmSync(目录, { recursive: true, force: true })
}

console.log(`\n表达反馈：${数量}/${数量} 通过`)
