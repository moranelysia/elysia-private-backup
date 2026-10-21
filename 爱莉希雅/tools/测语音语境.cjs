/** 不联网截取模型请求：验证语音粗转写原样发送，键盘输入不受影响。 */
'use strict'

const path = require('node:path')
const 根 = path.resolve(__dirname, '..')
const 对话 = require(path.join(根, '脑', '对话.cjs'))
const 编码器 = new TextEncoder()
let 总数 = 0
let 通过 = 0
function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}

async function 截一轮(来自语音) {
  let 请求 = null
  const 真网 = globalThis.fetch
  globalThis.fetch = async (_地址, 选项) => {
    请求 = JSON.parse(选项.body)
    const 内容 = 编码器.encode('data: ' + JSON.stringify({ choices: [{ delta: { content: '听懂了。' } }] }) + '\n\ndata: [DONE]\n\n')
    let 完 = false
    return { ok: true, status: 200, text: async () => '', body: { getReader: () => ({ read: async () => 完 ? { done: true } : (完 = true, { done: false, value: 内容 }) }) } }
  }
  try {
    await 对话.说话({
      他说的话: '美比乌斯和牙医在说音节',
      历史: [],
      模式: 'chat',
      来自语音,
      记进记忆: false,
      写长期记忆: false,
    })
  } finally {
    globalThis.fetch = 真网
  }
  return 请求.messages
}

async function main() {
  const 语音 = await 截一轮(true)
  const 键盘 = await 截一轮(false)
  const 语音提示 = 语音.filter(x => x.role === 'system' && /近似听写/.test(String(x.content || '')))
  const 键盘提示 = 键盘.filter(x => x.role === 'system' && /近似听写/.test(String(x.content || '')))
  检查('语音消息附带一条近似听写提示', 语音提示.length === 1)
  检查('提示包含审核过的标准专名', /爱莉希雅/.test(语音提示[0].content) && /梅比乌斯/.test(语音提示[0].content))
  检查('提示要求歧义时追问', /两种以上合理理解/.test(语音提示[0].content))
  检查('ASR 粗转写原文不被程序改写', 语音.some(x => x.role === 'user' && x.content === '美比乌斯和牙医在说音节'))
  检查('键盘输入不附加语音提示', 键盘提示.length === 0)
  检查('键盘原文同样保持原样', 键盘.some(x => x.role === 'user' && x.content === '美比乌斯和牙医在说音节'))
  console.log(`\n语音语境：${通过}/${总数} 通过`)
}

main().catch((错误) => {
  console.error(错误.stack || 错误.message)
  process.exitCode = 1
})
