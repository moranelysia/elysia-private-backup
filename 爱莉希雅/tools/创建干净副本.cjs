/**
 * 创建一个不带当前机器记忆、钥匙、授权和私人角色卡的可迁移副本。
 *
 * 用法：node tools/创建干净副本.cjs D:\elysia-clean
 * 目标目录必须不存在或为空，避免覆盖已有资料。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 目标工作区 = path.resolve(process.argv[2] || '')

if (!process.argv[2]) {
  console.error('用法：node tools/创建干净副本.cjs <目标工作区>')
  process.exit(2)
}

if (目标工作区 === path.parse(目标工作区).root) {
  console.error('目标不能是磁盘根目录。')
  process.exit(2)
}

if (fs.existsSync(目标工作区) && fs.readdirSync(目标工作区).length) {
  console.error('目标目录不是空的，已停止：' + 目标工作区)
  process.exit(2)
}

const 目标项目 = path.join(目标工作区, '爱莉希雅')
const 要复制的目录 = ['脑', 'main', 'renderer', 'icon-source', 'templates']
const 要复制的文件 = [
  '.npmrc',
  'package.json',
  'package-lock.json',
  'main.js',
  'preload.js',
  'preload-账本.js',
  'desktop-icon.ico',
  'icon.ico',
]
const 运行时工具 = ['bridge.cjs', '画图标.cjs']

const 排除目录 = new Set(['node_modules', '.cache', 'backups', '记忆', '人格', '_完整工作区源码'])
const 排除文件 = new Set(['钥匙.txt', '钥匙.json', '.credentials.yaml'])

function 可以复制(来源) {
  const 名 = path.basename(来源)
  if (排除目录.has(名) || 排除文件.has(名)) return false
  if (/\.(log|tmp)$/i.test(名)) return false
  return true
}

fs.mkdirSync(目标项目, { recursive: true })
for (const 名 of 要复制的目录) {
  const 来源 = path.join(项目根, 名)
  if (fs.existsSync(来源)) {
    fs.cpSync(来源, path.join(目标项目, 名), { recursive: true, filter: 可以复制 })
  }
}
for (const 名 of 要复制的文件) {
  const 来源 = path.join(项目根, 名)
  if (fs.existsSync(来源)) fs.copyFileSync(来源, path.join(目标项目, 名))
}
fs.mkdirSync(path.join(目标项目, 'tools'), { recursive: true })
for (const 名 of 运行时工具) {
  fs.copyFileSync(path.join(项目根, 'tools', 名), path.join(目标项目, 'tools', 名))
}

fs.copyFileSync(
  path.join(项目根, 'templates', 'elysia.clean.json'),
  path.join(目标工作区, 'elysia.cosplay.v2.json'),
)

const 配置 = {
  personaFile: 'elysia.cosplay.v2.json',
  learningDir: '学习',
  dataDir: '爱莉希雅\\记忆',
  cacheDir: '爱莉希雅\\.cache',
  petDir: 'zhuochong\\A-爱莉-带表情版',
  voiceBridgeUrl: 'http://127.0.0.1:9881'
}
fs.writeFileSync(
  path.join(目标工作区, 'elysia.config.json'),
  JSON.stringify(配置, null, 2) + '\n',
  'utf8',
)

const 记忆目录 = path.join(目标项目, '记忆')
const 聊天目录 = path.join(记忆目录, '聊天记录')
fs.mkdirSync(聊天目录, { recursive: true })
for (const 名 of ['事实.json', '经历.json', '小本子.json']) {
  fs.writeFileSync(path.join(记忆目录, 名), '[]\n', 'utf8')
}
fs.writeFileSync(path.join(聊天目录, '聊天记录.jsonl'), '', 'utf8')
fs.writeFileSync(path.join(聊天目录, '对话索引.json'), '[]\n', 'utf8')

for (const 名 of ['材料', '笔记', '练习']) {
  fs.mkdirSync(path.join(目标工作区, '学习', 名), { recursive: true })
}

const 说明 = `# 干净迁移副本

这是一个全新安装：没有原机器的用户资料、共同经历、聊天记录、附件、用量、任务、授权目录或 API Key。

进入 \`爱莉希雅\` 目录安装依赖并启动。首次对话会从询问称呼开始。
`
fs.writeFileSync(path.join(目标工作区, 'README.md'), 说明, 'utf8')

console.log('干净副本已经创建：' + 目标工作区)
console.log('角色卡：全新，无旧用户记忆')
console.log('运行数据：空')
console.log('API Key：未复制')
