'use strict'

const fs = require('node:fs')
const path = require('node:path')
const AdmZip = require('adm-zip')

function 文本(值) {
  return String(值 == null ? '' : 值)
}

function Markdown安全(值) {
  return 文本(值).replace(/\r\n?/g, '\n').trim()
}

function 做Markdown(记录们, 导出时间) {
  const 行 = [
    '# 爱莉希雅长期记忆',
    '',
    `导出时间：${导出时间}`,
    `总数：${记录们.length} 条`,
    '',
  ]
  for (const 类别 of ['事实', '经历', '小本子']) {
    const 这一类 = 记录们.filter((一) => 一.类别 === 类别)
    行.push(`## ${类别}（${这一类.length}）`, '')
    if (!这一类.length) {
      行.push('还没有。', '')
      continue
    }
    for (const 一 of 这一类) {
      行.push(`### ${Markdown安全(一.时间) || '时间未记录'}${一.编号 ? ` · ${Markdown安全(一.编号)}` : ''}`)
      行.push('', Markdown安全(一.内容), '')
      行.push(`- 记录者：${Markdown安全(一.来源) || '未记录'}`)
      行.push(`- 记忆类型：${Markdown安全(一.记忆类型) || '未记录'}`)
      行.push(`- 关于谁：${Markdown安全(一.元数据 && 一.元数据.person) || '未记录'}`)
      行.push(`- 与用户关系：${Markdown安全(一.元数据 && 一.元数据.relationship) || '未记录'}`)
      行.push(`- 记录缘由：${Markdown安全(一.元数据 && 一.元数据.backstory) || '未记录'}`)
      行.push(`- 来源会话：${Markdown安全(一.会话标题) || '未记录'}`)
      if (一.修改于) 行.push(`- 修改于：${Markdown安全(一.修改于)}${一.修改来源 ? `（${Markdown安全(一.修改来源)}）` : ''}`)
      if (一.修改会话标题) 行.push(`- 更正来源会话：${Markdown安全(一.修改会话标题)}`)
      if (一.整理于) 行.push(`- 后台整理于：${Markdown安全(一.整理于)}${一.整理合并数量 ? `（合并 ${一.整理合并数量} 条）` : ''}`)
      行.push('')
    }
  }
  return 行.join('\n') + '\n'
}

/** 只导出长期记忆。聊天、附件、设置、API Key 和本机路径都不进入压缩包。 */
function 创建长期记忆导出({ 目标文件, 记录们, 现在 = new Date() }) {
  if (!目标文件) throw new Error('没有选择导出文件')
  if (!Array.isArray(记录们)) throw new Error('长期记忆数据格式不对')

  const 导出时间 = 现在.toISOString()
  const 安全记录 = 记录们.map((一) => ({
    编号: 文本(一 && 一.编号),
    时间: 文本(一 && 一.时间),
    类别: ['事实', '经历', '小本子'].includes(文本(一 && 一.类别)) ? 文本(一.类别) : '未分类',
    内容: 文本(一 && 一.内容),
    来源: 文本(一 && 一.来源) || '未记录',
    记忆类型: ['episodic', 'semantic', 'procedural'].includes(文本(一 && 一.记忆类型)) ? 文本(一.记忆类型) : 'semantic',
    元数据: {
      backstory: 文本(一 && 一.元数据 && 一.元数据.backstory),
      person: 文本(一 && 一.元数据 && 一.元数据.person),
      relationship: 文本(一 && 一.元数据 && 一.元数据.relationship),
    },
    对话: 文本(一 && 一.对话),
    会话标题: 文本(一 && 一.会话标题),
    修改于: 文本(一 && 一.修改于),
    修改来源: 文本(一 && 一.修改来源),
    修改对话: 文本(一 && 一.修改对话),
    修改会话标题: 文本(一 && 一.修改会话标题),
    整理于: 文本(一 && 一.整理于),
    整理来源: 文本(一 && 一.整理来源),
    整理合并数量: Number(一 && 一.整理合并数量) || 0,
  }))
  const 数据 = { 格式版本: 2, 导出时间, 总数: 安全记录.length, 长期记忆: 安全记录 }
  const zip = new AdmZip()
  zip.addFile('长期记忆.json', Buffer.from(JSON.stringify(数据, null, 2) + '\n', 'utf8'))
  zip.addFile('长期记忆.md', Buffer.from(做Markdown(安全记录, 导出时间), 'utf8'))
  zip.addFile('说明.txt', Buffer.from('这份压缩包只包含长期记忆（事实、经历和小本子）。\n不包含聊天记录、附件、API Key、程序设置或本机文件路径。\n', 'utf8'))

  const 目标 = path.resolve(目标文件)
  fs.mkdirSync(path.dirname(目标), { recursive: true })
  const 临时 = 目标 + '.tmp'
  try {
    zip.writeZip(临时)
    fs.rmSync(目标, { force: true })
    fs.renameSync(临时, 目标)
  } catch (错误) {
    try { fs.rmSync(临时, { force: true }) } catch { /* 保留原错误 */ }
    throw 错误
  }
  return { 目标文件: 目标, 条数: 安全记录.length, 压缩字节: fs.statSync(目标).size }
}

module.exports = { 创建长期记忆导出, 做Markdown }
