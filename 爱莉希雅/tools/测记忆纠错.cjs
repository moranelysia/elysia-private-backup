/** 用户纠正旧事实：离线假响应、系统临时目录，不联网、不碰真实记忆。 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-memory-correction-'))
process.env.ELYSIA_DATA_DIR = path.join(临时根, '记忆')
process.env.ELYSIA_CACHE_DIR = path.join(临时根, '缓存')
process.env.ELYSIA_SECURE_API_KEY = 'sk-test-only-memory-correction-1234567890'

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}

function 读数组(文件) {
  try {
    const 值 = JSON.parse(fs.readFileSync(文件, 'utf8'))
    return Array.isArray(值) ? 值 : []
  } catch { return [] }
}

function 假回应(正文) {
  const 包们 = [
    { choices: [{ delta: { content: 正文 } }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 } },
  ]
  const sse = 包们.map((包) => 'data: ' + JSON.stringify(包) + '\n\n').join('') + 'data: [DONE]\n\n'
  return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

async function main() {
  const 记忆 = require(path.join(项目根, '脑', '记忆.cjs'))
  const 旧会话 = 记忆.建新对话('初次认识', '', 'chat')
  const 旧事实 = 记忆.记一条('事实', '他的名字是小明', '她', { 对话: 旧会话 })
  const 相似事实 = 记忆.记一条('事实', '他的同学叫小明', '她', { 对话: 旧会话 })
  const 更正会话 = 记忆.建新对话('纠正名字', '', 'chat')

  const 给模型 = 记忆.取记忆().关于他
  检查('事实片段带稳定编号', 给模型.includes(`[事实编号:${旧事实.编号}]`))
  检查('相似事实有自己的不同编号', 给模型.includes(`[事实编号:${相似事实.编号}]`))

  const { 说话, 拆标记 } = require(path.join(项目根, '脑', '对话.cjs'))
  const 拆 = 拆标记(`知道啦。\n【更正事实：${旧事实.编号}|他的名字是小岚】`)
  检查('中英文括号和冒号都能解析纠错标记', 拆.更正事实.length === 1 && 拆.更正事实[0].编号 === 旧事实.编号)
  检查('纠错标记不会显示给用户', 拆.正文 === '知道啦。')

  let 系统提示 = ''
  const 原fetch = global.fetch
  global.fetch = async (_地址, 选项) => {
    const 请求 = JSON.parse(选项.body)
    系统提示 = 请求.messages[0].content
    // 故意同时写同内容的“记住”，验证不会生成重复记录。
    return 假回应(`好呀，记住了。\n[更正事实:${旧事实.编号}|他的名字是小岚]\n[记住:他的名字是小岚]`)
  }
  try {
    const 结果 = await 说话({
      他说的话: '不是小明，我叫小岚', 模式: 'chat', 记进记忆: true,
      写长期记忆: true, 对话编号: 更正会话,
    })
    检查('提示明确要求按编号纠正且不得重复新增', 系统提示.includes('[更正事实:事实编号|完整的新事实]') && 系统提示.includes('不要再额外写一条“记住”'))
    检查('模型确实看得到待纠正事实编号', 系统提示.includes(`[事实编号:${旧事实.编号}]`))
    检查('回复正文不泄露内部纠错标记', 结果.她说的话 === '好呀，记住了。')
    检查('结果记录本轮纠错动作', 结果.更正事实.length === 1 && 结果.更正事实[0].编号 === 旧事实.编号)
  } finally {
    global.fetch = 原fetch
  }

  const 改后 = 读数组(记忆.事实文件)
  const 新事实 = 改后.find((一) => 一.编号 === 旧事实.编号)
  检查('旧事实被原位改成第一人称视角的新事实', 新事实 && 新事实.内容 === '你的名字是小岚')
  检查('旧名字不再作为那条事实被召回', !记忆.取记忆().关于他.includes('你的名字是小明'))
  检查('新名字会在下一轮以她的视角被召回', 记忆.取记忆().关于他.includes('你的名字是小岚'))
  检查('纠错没有新增重复事实', 改后.filter((一) => 一.内容 === '你的名字是小岚').length === 1)
  检查('相似但不同的事实没有被误改', 改后.find((一) => 一.编号 === 相似事实.编号).内容 === '你的同学叫小明')
  检查('保留原始时间、记录者和来源会话', 新事实.时间 === 旧事实.时间 && 新事实.来源 === '她' && 新事实.对话 === 旧会话)
  检查('另记修改时间与纠错会话', !!新事实.修改于 && 新事实.修改来源 === '我' && 新事实.修改对话 === 更正会话)
  检查('管理列表能显示纠错来源会话', 记忆.全部长期记忆().find((一) => 一.编号 === 旧事实.编号).修改会话标题 === '纠正名字')

  const 改前无效 = fs.readFileSync(记忆.事实文件, 'utf8')
  global.fetch = async () => 假回应('好的。[更正事实:不存在的编号|他的名字是错误值]')
  try {
    const 无效 = await 说话({ 他说的话: '测试坏编号', 模式: 'chat', 记进记忆: true, 写长期记忆: true, 对话编号: 更正会话 })
    检查('不存在编号的标记仍不会泄露到气泡', 无效.她说的话 === '好的。')
  } finally { global.fetch = 原fetch }
  检查('不存在的编号不会改动事实文件', fs.readFileSync(记忆.事实文件, 'utf8') === 改前无效)

  global.fetch = async () => 假回应(`[更正事实:${旧事实.编号}|他的名字是不会写入的值]`)
  try {
    await 说话({ 他说的话: '关闭记忆时测试', 模式: 'chat', 记进记忆: true, 写长期记忆: false, 对话编号: 更正会话 })
  } finally { global.fetch = 原fetch }
  检查('关闭长期记忆时也会阻止纠错写入', 读数组(记忆.事实文件).find((一) => 一.编号 === 旧事实.编号).内容 === '你的名字是小岚')

  const 导出模块 = fs.readFileSync(path.join(项目根, 'main', 'memory-export.cjs'), 'utf8')
  const 前端 = fs.readFileSync(path.join(项目根, 'renderer', 'chat.js'), 'utf8')
  检查('长期记忆导出保留纠错来源', 导出模块.includes('修改对话:') && 导出模块.includes('更正来源会话'))
  检查('记忆管理页显示纠错来源会话', 前端.includes('更正来自会话'))

  console.log(`\n记忆纠错：${通过}/${总数} 通过`)
}

main()
  .catch((错误) => {
    console.error(错误.stack || 错误.message)
    process.exitCode = 1
  })
  .finally(() => {
    try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 测试结果更重要 */ }
  })
