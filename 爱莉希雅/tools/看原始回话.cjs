/**
 * 看原始回话.cjs —— 把模型吐回来的东西**原样**看一遍
 *
 * 【它治什么】
 *   我们的 要一轮() 只取 delta.content（"她说的话"），别的字段一律丢掉。
 *   所以当"她说的话是空的、而输出 token 却写满了 2000"这种情况发生时，
 *   从外面**什么都看不出来** —— 钱花了，屏幕上只剩一个空气泡，
 *   而且不知道为什么。（2026-10-07 就是这么卡住的。）
 *
 *   这个脚本把 SSE 的每一个包按字段统计一遍，
 *   一眼就能看出那些 token 到底花在哪个字段上。
 *
 * 【会花钱】一次很短的请求（max_tokens 卡在 500）。
 *
 * 用法:
 *   node tools\看原始回话.cjs                        （默认问 deepseek-flash 一句"你好"）
 *   node tools\看原始回话.cjs deepseek-chat "在吗"
 */
'use strict'

const path = require('node:path')
const { 拿钥匙, 遮住 } = require(path.join(__dirname, '..', '脑', '钥匙.cjs'))

const 全地址 = process.env.ELYSIA_LLM_URL || 'https://api.deepseek.com/v1/chat/completions'
const { 钥匙 } = 拿钥匙()

async function 主() {
  const 参数 = process.argv.slice(2)
  const 模型 = 参数[0] || 'deepseek-flash'
  const 问话 = 参数[1] || '你好'

  console.log('')
  console.log('  模型：' + 模型)
  console.log('  钥匙：' + 遮住(钥匙))
  console.log('  问的：' + 问话)
  console.log('')

  const 回应 = await fetch(全地址, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + 钥匙 },
    body: JSON.stringify({
      model: 模型,
      messages: [{ role: 'user', content: 问话 }],
      stream: true,
      max_tokens: 500,
    }),
  })

  if (!回应.ok) {
    console.log('  ✗ HTTP ' + 回应.status)
    console.log('  ' + (await 回应.text()).slice(0, 400))
    process.exit(1)
  }

  const 读 = 回应.body.getReader()
  const 解码 = new TextDecoder('utf-8')
  let 攒着 = ''
  const 字数 = new Map() // 字段名 → 攒了多少字
  let 结束原因 = ''
  let 用量 = null
  let 包数 = 0

  while (true) {
    const { done, value } = await 读.read()
    if (done) break
    攒着 += 解码.decode(value, { stream: true })

    const 行们 = 攒着.split('\n')
    攒着 = 行们.pop()

    for (const 行 of 行们) {
      const 干净 = 行.trim()
      if (!干净.startsWith('data:')) continue
      const 数据 = 干净.slice(5).trim()
      if (数据 === '[DONE]') continue

      let 包
      try {
        包 = JSON.parse(数据)
      } catch {
        continue
      }
      包数++
      if (包.usage) 用量 = 包.usage

      const 角 = 包.choices && 包.choices[0]
      if (!角) continue
      if (角.finish_reason) 结束原因 = 角.finish_reason

      const d = 角.delta
      if (!d) continue
      for (const [名, 值] of Object.entries(d)) {
        if (typeof 值 === 'string' && 值) {
          字数.set(名, (字数.get(名) || 0) + 值.length)
        }
      }
    }
  }

  console.log('  一共收到 ' + 包数 + ' 个包')
  console.log('')
  console.log('  ── 每个字段里到底有多少字 ──')
  if (!字数.size) {
    console.log('    （一个字的正文都没有）')
  } else {
    for (const [名, 数] of [...字数.entries()].sort((a, b) => b[1] - a[1])) {
      // 就是我们平时取的那个字段，标出来
      console.log('    ' + 名.padEnd(20) + 数 + ' 字' + (名 === 'content' ? '   ← 要一轮() 只取这个' : ''))
    }
  }
  console.log('')
  console.log('  结束原因 finish_reason：' + (结束原因 || '(没给)'))
  if (结束原因 === 'length') {
    console.log('    ↑ 这是"被 max_tokens 掐断了"，不是它自己说完了')
  }
  if (用量) {
    console.log('  用量：输入 ' + 用量.prompt_tokens + '，输出 ' + 用量.completion_tokens)
  }
  console.log('')
}

主().catch((错误) => {
  console.log('  ✗ ' + (错误 && 错误.message))
  process.exit(1)
})
