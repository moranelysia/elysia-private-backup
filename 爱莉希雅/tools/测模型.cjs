/**
 * 测模型.cjs —— 先确认"能把话递到模型那儿"再写别的
 *
 * 这是最小的一步：不搞界面、不搞记忆，就发一句话过去，看它回不回。
 * 万一网络不通或者钥匙不对，在这一步就暴露，而不是等界面写完才发现。
 *
 * 用法: node tools\测模型.cjs
 *       node tools\测模型.cjs "换个问题"
 */
'use strict'

const { 拿钥匙, 遮住 } = require('../脑/钥匙.cjs')

const 地址 = process.env.ELYSIA_LLM_URL || 'https://api.deepseek.com/v1/chat/completions'
const 模型 = process.env.ELYSIA_LLM_MODEL || 'deepseek-chat'

const 问题 = process.argv[2] || '用一句话介绍一下你自己，别超过 20 个字。'

async function main() {
  const { 钥匙, 来源 } = 拿钥匙()
  console.log('钥匙来源: ' + 来源)
  console.log('钥匙: ' + 遮住(钥匙))
  console.log('地址: ' + 地址)
  console.log('模型: ' + 模型)
  console.log('')

  if (!钥匙) {
    console.log('✗ 没有钥匙，发不出去')
    process.exit(1)
  }

  console.log('问: ' + 问题)
  const 开始 = Date.now()

  let 回应
  try {
    回应 = await fetch(地址, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + 钥匙,
      },
      body: JSON.stringify({
        model: 模型,
        messages: [{ role: 'user', content: 问题 }],
        max_tokens: 200,
      }),
    })
  } catch (错误) {
    console.log('')
    console.log('✗ 连不上去: ' + 错误.message)
    console.log('  （本机 github 是不通的，但 api.deepseek.com 应该通；')
    console.log('    如果这里失败，可能是网络、也可能是需要梯子）')
    process.exit(1)
  }

  const 用时 = ((Date.now() - 开始) / 1000).toFixed(1)
  const 文字 = await 回应.text()

  if (!回应.ok) {
    console.log('')
    console.log(`✗ HTTP ${回应.status}（用时 ${用时}s）`)
    console.log(文字.slice(0, 600))
    process.exit(1)
  }

  let 数据
  try {
    数据 = JSON.parse(文字)
  } catch {
    console.log('✗ 回来的不是 JSON:')
    console.log(文字.slice(0, 600))
    process.exit(1)
  }

  const 回答 = 数据.choices && 数据.choices[0] && 数据.choices[0].message.content
  console.log('答: ' + (回答 || '(空的)'))
  console.log('')
  console.log(`✓ 通了。用时 ${用时}s`)
  if (数据.usage) {
    console.log(
      `  用了 ${数据.usage.prompt_tokens} + ${数据.usage.completion_tokens} = ${数据.usage.total_tokens} tokens`,
    )
  }
}

main()
