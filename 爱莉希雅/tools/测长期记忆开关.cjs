/**
 * 测长期记忆开关.cjs
 *
 * 全程使用系统临时目录和假模型回应：不碰真实记忆，不联网，也不花 token。
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-memory-switch-'))
process.env.ELYSIA_DATA_DIR = path.join(临时根, '记忆')
process.env.ELYSIA_CACHE_DIR = path.join(临时根, '缓存')
process.env.ELYSIA_SECURE_API_KEY = 'sk-test-only-memory-switch-1234567890'

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
  } catch {
    return []
  }
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

async function main() {
  const 记忆 = require(path.join(项目根, '脑', '记忆.cjs'))

  const 第一段 = 记忆.建新对话('第一段', '', 'chat')
  检查('新对话默认允许写长期记忆', 记忆.这段写长期记忆吗(第一段) === true)
  检查('能把当前对话的长期记忆关掉', 记忆.设这段写长期记忆(第一段, false) === false)
  检查('关掉的状态已经写进索引', 读数组(记忆.索引文件).find((x) => x.编号 === 第一段).写长期记忆 === false)

  while (Date.now().toString(36) === 第一段.slice(1)) { /* 等编号跨一毫秒，避免测试机上撞号 */ }
  const 第二段 = 记忆.建新对话('第二段', '', 'chat')
  检查('开关按对话隔离，新对话仍默认开启', 记忆.这段写长期记忆吗(第二段) === true)
  记忆.设当前对话(第一段)
  检查('切回第一段后仍保持关闭', 记忆.这段写长期记忆吗() === false)
  检查('对话列表把关闭状态交给界面', 记忆.对话列表().find((x) => x.编号 === 第一段).写长期记忆 === false)

  const 原fetch = global.fetch
  global.fetch = async () => 假回应('回答正文[记住:只供测试的事实][经历:只供测试的经历]')
  try {
    const { 说话 } = require(path.join(项目根, '脑', '对话.cjs'))

    const 关着 = await 说话({ 他说的话: '关闭时测试', 模式: 'chat', 记进记忆: true, 写长期记忆: false })
    检查('关闭时仍能正常得到并清理回复', 关着.她说的话 === '回答正文')
    检查('关闭时不写事实', 读数组(记忆.事实文件).length === 0)
    检查('关闭时不写经历', 读数组(记忆.经历文件).length === 0)
    检查('关闭时聊天记录仍保存一问一答', 记忆.读聊天记录(0).length === 2)

    await 说话({ 他说的话: '开启时测试', 模式: 'chat', 记进记忆: true, 写长期记忆: true })
    检查('重新开启后会写事实', 读数组(记忆.事实文件).length === 1)
    检查('重新开启后会写经历', 读数组(记忆.经历文件).length === 1)
    检查('重新开启后聊天记录继续追加', 记忆.读聊天记录(0).length === 4)
  } finally {
    global.fetch = 原fetch
  }

  const html = fs.readFileSync(path.join(项目根, 'renderer', 'index.html'), 'utf8')
  const 前端 = fs.readFileSync(path.join(项目根, 'renderer', 'chat.js'), 'utf8')
  const 预载 = fs.readFileSync(path.join(项目根, 'preload.js'), 'utf8')
  检查('界面有长期记忆开关', html.includes('id="记忆开关"'))
  检查('界面明确说明聊天记录仍保存', 前端.includes('聊天记录仍会保存'))
  检查('预载层只暴露布尔开关', /设长期记忆:\s*\(要写\).*Boolean\(要写\)/.test(预载))

  console.log(`\n长期记忆开关：${通过}/${总数} 通过`)
}

main()
  .catch((错误) => {
    console.error(错误.stack || 错误.message)
    process.exitCode = 1
  })
  .finally(() => {
    try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 测试结果更重要 */ }
  })
