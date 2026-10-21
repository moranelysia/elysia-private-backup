/** 记忆修改与遗忘：使用隔离目录，不碰真实记忆。 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-memory-edit-'))
process.env.ELYSIA_DATA_DIR = path.join(临时根, '记忆')
process.env.ELYSIA_CACHE_DIR = path.join(临时根, '缓存')

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件, 细节 = '') {
  总数++
  if (!条件) throw new Error('✗ ' + 说明 + (细节 ? '：' + 细节 : ''))
  通过++
  console.log('✓ ' + 说明)
}

function 原文(文件) {
  try { return fs.readFileSync(文件, 'utf8') } catch { return '' }
}

function 抛错(做) {
  try { 做(); return false } catch { return true }
}

async function main() {
  const 记忆 = require(path.join(项目根, '脑', '记忆.cjs'))
  const 会话 = 记忆.建新对话('来源会话', '', 'chat')
  const 甲 = 记忆.记一条('事实', '旧内容', '她', { 对话: 会话 })
  const 乙 = 记忆.记一条('事实', '不能误伤', '我')
  const 经历 = 记忆.记一条('经历', '另一类记忆', '她', { 对话: 会话 })

  const 改果 = 记忆.改一条('事实', 甲.编号, '  新内容  ')
  检查('能按类别和编号修改正文', 改果.好 && 改果.条.内容 === '新内容')
  检查('修改保留最初时间', 改果.条.时间 === 甲.时间)
  检查('修改保留最初记录者', 改果.条.来源 === '她')
  检查('修改保留来源会话', 改果.条.对话 === 会话)
  检查('修改记录修改时间和操作者', !!改果.条.修改于 && 改果.条.修改来源 === '我')
  检查('同类其他记忆没有被误改', 记忆.列长期记忆({ 类别: '事实', 搜索: '不能误伤' }).总数 === 1)
  检查('查询结果带回修改时间', !!记忆.列长期记忆({ 搜索: '新内容' }).列表[0].修改于)

  const 修改后原文 = 原文(记忆.事实文件)
  const 同文 = 记忆.改一条('事实', 甲.编号, '新内容')
  检查('内容没变化时不会重写文件', 同文.好 && 同文.没变化 && 原文(记忆.事实文件) === 修改后原文)
  检查('空内容会被拒绝', !记忆.改一条('事实', 甲.编号, '   ').好)
  检查('超过 2000 字会被拒绝', !记忆.改一条('事实', 甲.编号, 'a'.repeat(2001)).好)
  检查('不存在的编号会被拒绝', !记忆.改一条('事实', '不存在', '内容').好)
  检查('类别不对会被拒绝', 抛错(() => 记忆.改一条('聊天', 甲.编号, '内容')))
  检查('失败修改不会改变文件', 原文(记忆.事实文件) === 修改后原文)

  const 经历原文 = 原文(记忆.经历文件)
  检查('拿事实编号删经历不会误伤', 记忆.删一条('经历', 甲.编号) === false && 原文(记忆.经历文件) === 经历原文)
  检查('空编号不会删除', 记忆.删一条('事实', '') === false)
  检查('能遗忘指定记忆', 记忆.删一条('事实', 甲.编号) === true)
  const 剩下事实 = 记忆.列长期记忆({ 类别: '事实' })
  检查('遗忘只删指定编号', 剩下事实.总数 === 1 && 剩下事实.列表[0].编号 === 乙.编号)
  检查('重复遗忘明确失败', 记忆.删一条('事实', 甲.编号) === false)
  检查('原子写入没有留下临时文件', !fs.existsSync(记忆.事实文件 + '.tmp') && !fs.existsSync(记忆.经历文件 + '.tmp'))
  检查('另一类别始终还在', 记忆.列长期记忆({ 类别: '经历' }).列表[0].编号 === 经历.编号)

  const 主进程 = fs.readFileSync(path.join(项目根, 'main.js'), 'utf8')
  const 预载 = fs.readFileSync(path.join(项目根, 'preload.js'), 'utf8')
  const 前端 = fs.readFileSync(path.join(项目根, 'renderer', 'chat.js'), 'utf8')
  检查('主进程有两个独立写入口', 主进程.includes("ipcMain.handle('修改长期记忆'") && 主进程.includes("ipcMain.handle('遗忘长期记忆'"))
  检查('主进程同时校验类别、编号和长度', 主进程.includes("['事实', '经历', '小本子'].includes(类别)") && 主进程.includes('不能超过 2000 字'))
  检查('预载限制编号和正文长度', 预载.includes("编号: String(请求.编号 || '').slice(0, 120)") && 预载.includes("内容: String(请求.内容 || '').slice(0, 2001)"))
  检查('界面编辑器限制 2000 字', 前端.includes('输入框.maxLength = 2000'))
  检查('遗忘前必须明确确认', 前端.includes('window.confirm(`遗忘这条'))
  检查('旧记录没编号时不给写按钮', 前端.includes('这条旧记忆没有编号，请在记忆文件中手动修改'))

  console.log(`\n记忆修改与遗忘：${通过}/${总数} 通过`)
}

main()
  .catch((错误) => {
    console.error(错误.stack || 错误.message)
    process.exitCode = 1
  })
  .finally(() => {
    try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 测试结果更重要 */ }
  })
