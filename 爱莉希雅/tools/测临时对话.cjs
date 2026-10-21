/**
 * 测临时对话.cjs
 *
 * 全程使用系统临时目录和假模型回应：不碰真实记忆、学习区，不联网、不花 token。
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-temporary-chat-'))
process.env.ELYSIA_DATA_DIR = path.join(临时根, '记忆')
process.env.ELYSIA_CACHE_DIR = path.join(临时根, '缓存')
process.env.ELYSIA_学习区 = path.join(临时根, '学习')
process.env.ELYSIA_SECURE_API_KEY = 'sk-test-only-temporary-chat-1234567890'

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件, 细节 = '') {
  总数++
  if (!条件) throw new Error('✗ ' + 说明 + (细节 ? '：' + 细节 : ''))
  通过++
  console.log('✓ ' + 说明)
}

function 假回应(正文) {
  const 包们 = [
    { choices: [{ delta: { content: 正文 } }] },
    {
      choices: [{ delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28, prompt_cache_hit_tokens: 0 },
    },
  ]
  const sse = 包们.map((包) => 'data: ' + JSON.stringify(包) + '\n\n').join('') + 'data: [DONE]\n\n'
  return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function 读数组(文件) {
  try {
    const 值 = JSON.parse(fs.readFileSync(文件, 'utf8'))
    return Array.isArray(值) ? 值 : []
  } catch {
    return []
  }
}

async function main() {
  const 临时对话 = require(path.join(项目根, '脑', '临时对话.cjs'))
  const 附件 = require(path.join(项目根, '脑', '附件.cjs'))
  const 记忆 = require(path.join(项目根, '脑', '记忆.cjs'))

  const 甲 = 临时对话.建({ 模式: 'learn', 模型: 'deepseek-flash' })
  const 乙 = 临时对话.建({ 模式: 'chat', 模型: 'deepseek-chat' })
  检查('能在内存中建立两段临时对话', 临时对话.有(甲) && 临时对话.有(乙) && 甲 !== 乙)
  检查('临时对话明确禁止长期记忆写入', 临时对话.取(甲).写长期记忆 === false)
  检查('模式和模型跟着各自的临时对话', 临时对话.取(甲).模式 === 'learn' && 临时对话.取(甲).模型 === 'deepseek-flash')

  临时对话.记一轮(甲, '复习高数\n[附件] a.png', '从第一章开始吧')
  检查('聊天只进入对应临时段的内存', 临时对话.给模型(甲).length === 2 && 临时对话.给模型(乙).length === 0)
  检查('第一句会成为临时段标题', 临时对话.取(甲).标题 === '复习高数')
  检查('给界面的消息保持角色、内容和对话号', 临时对话.给界面(甲)[0].角色 === 'user' && 临时对话.给界面(甲)[0].对话 === 甲)
  检查('临时对话会出现在本次运行的列表里', 临时对话.列表().length === 2 && 临时对话.列表().every((一) => 一.临时))
  检查('同一分钟连开时仍是最新一段在最前', 临时对话.列表()[0].编号 === 乙)
  检查('可以单独修改临时段模式', 临时对话.设模式(乙, 'work') === 'work' && 临时对话.取(甲).模式 === 'learn')

  const 临时附件目录 = 临时对话.附件目录(甲)
  const 存果 = 附件.存({ 名字: '临时.txt', 类型: 'text/plain', 字节: Buffer.from('只活一会儿') }, 临时附件目录)
  检查('临时附件写入缓存目录', 存果.好 && 存果.路径.startsWith(process.env.ELYSIA_CACHE_DIR))
  检查('临时附件没有写进记忆目录', 存果.好 && !存果.路径.startsWith(process.env.ELYSIA_DATA_DIR))
  检查('临时附件仍能由界面预览接口读回', 附件.读预览(存果.存成, 临时附件目录).好)
  检查('附件路径仍拦住目录穿越', !附件.读预览('..\\..\\钥匙.txt', 临时附件目录).好)
  检查('删除非临时编号不会误伤', 临时对话.删('正式对话') === false && 临时对话.有(甲))
  检查('能删除指定临时对话', 临时对话.删(甲) === true && !临时对话.有(甲) && 临时对话.有(乙))
  检查('删除时一并清掉该段附件', !fs.existsSync(临时附件目录))
  检查('重复删除会明确失败', 临时对话.删(甲) === false)
  检查('清理会移除整棵临时附件目录', 临时对话.清附件() && !fs.existsSync(临时对话.临时附件根))

  const 原fetch = global.fetch
  global.fetch = async () => 假回应('回答正文[记住:临时事实][经历:临时经历]')
  try {
    const { 说话 } = require(path.join(项目根, '脑', '对话.cjs'))
    const 回复 = await 说话({
      他说的话: '临时学习测试',
      模式: 'learn',
      记进记忆: false,
      写长期记忆: false,
      模型: 'deepseek-chat',
    })
    检查('临时对话仍能正常得到并清理回复', 回复.她说的话 === '回答正文')
  } finally {
    global.fetch = 原fetch
  }

  检查('临时对话不写事实', 读数组(记忆.事实文件).length === 0)
  检查('临时对话不写经历', 读数组(记忆.经历文件).length === 0)
  检查('临时对话不写聊天记录', 记忆.读聊天记录(0).length === 0)
  检查('临时学习不会创建进度文件', !fs.existsSync(path.join(process.env.ELYSIA_学习区, '进度.md')))
  检查('临时学习不会创建任务文件', !fs.existsSync(path.join(process.env.ELYSIA_学习区, '任务.md')))
  检查('临时对话没有进入正式对话索引', !记忆.对话列表().some((一) => 一.编号 === 甲 || 一.编号 === 乙))

  const 主进程 = fs.readFileSync(path.join(项目根, 'main.js'), 'utf8')
  const 预载 = fs.readFileSync(path.join(项目根, 'preload.js'), 'utf8')
  const html = fs.readFileSync(path.join(项目根, 'renderer', 'index.html'), 'utf8')
  const 前端 = fs.readFileSync(path.join(项目根, 'renderer', 'chat.js'), 'utf8')
  检查('主进程注册了临时对话入口', 主进程.includes("ipcMain.handle('开临时对话'"))
  检查('主进程只接受临时编号并注册删除入口', 主进程.includes("ipcMain.handle('删临时对话'") && 主进程.includes('这不是临时对话'))
  检查('正在回复时不允许删除当前临时段', 主进程.includes("if (正在当前段 && 正在说)"))
  检查('临时发送明确关闭全部记忆写入', 主进程.includes('记进记忆: !这轮是临时') && 主进程.includes('写长期记忆: !这轮是临时'))
  检查('切换对话会同步该段模式', 主进程.includes('function 发当前模式') && /换对话[\s\S]*?发当前模式\(这一窗\)/.test(主进程))
  检查('启动和退出都会清临时附件', (主进程.match(/临时对话\.清附件\(\)/g) || []).length >= 2)
  检查('预载层暴露了临时对话入口', 预载.includes("开临时对话: () => ipcRenderer.invoke('开临时对话')"))
  检查('预载层暴露了受限删除入口', 预载.includes("删临时对话: (编号) => ipcRenderer.invoke('删临时对话'"))
  检查('左侧有独立临时按钮', html.includes('id="开临时对话"'))
  检查('界面明确显示临时段不保存', 前端.includes("一.临时 ? ' · 不保存'"))
  检查('界面只给临时段画删除按钮并要求确认', 前端.includes("if (一.临时)") && 前端.includes("window.confirm"))

  console.log(`\n临时对话：${通过}/${总数} 通过`)
}

main()
  .catch((错误) => {
    console.error(错误.stack || 错误.message)
    process.exitCode = 1
  })
  .finally(() => {
    try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 测试结果更重要 */ }
  })
