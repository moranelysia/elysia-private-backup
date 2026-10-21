/**
 * 看模型.cjs —— 这把钥匙到底能用哪些模型
 *
 * 【为什么需要它】
 *   换模型之前得先知道有哪些可换。凭印象报型号名是很危险的 ——
 *   名字记错一个字，请求直接 400，而报错未必说清楚是名字的问题。
 *
 *   这个只问一次 /models，**不花钱**（不发对话请求，不计 token）。
 *
 * 用法: node tools\看模型.cjs
 */
'use strict'

const path = require('node:path')
const { 拿钥匙, 遮住 } = require(path.join(__dirname, '..', '脑', '钥匙.cjs'))

const 全地址 = process.env.ELYSIA_LLM_URL || 'https://api.deepseek.com/v1/chat/completions'
const 根 = 全地址.replace(/\/chat\/completions.*$/, '')
const { 钥匙 } = 拿钥匙()

async function 主() {
  console.log('')
  console.log('  地址：' + 根)
  console.log('  钥匙：' + 遮住(钥匙))
  console.log('')

  const 回应 = await fetch(根 + '/models', {
    headers: { authorization: 'Bearer ' + 钥匙 },
  })
  const 文 = await 回应.text()

  if (!回应.ok) {
    console.log('  ✗ HTTP ' + 回应.status)
    console.log('  ' + 文.slice(0, 300))
    process.exit(1)
  }

  const 数据 = JSON.parse(文)
  const 名单 = 数据.data || []

  console.log('  能用 ' + 名单.length + ' 个模型：')
  console.log('')
  for (const 一个 of 名单) {
    console.log('    ' + 一个.id + (一个.owned_by ? '   （' + 一个.owned_by + '）' : ''))
  }
  console.log('')

  // 她这会儿用的是哪个
  const 现在用的 = process.env.ELYSIA_LLM_MODEL || 'deepseek-chat'
  const 在名单里 = 名单.some((x) => x.id === 现在用的)
  console.log('  她现在用的是：' + 现在用的 + (在名单里 ? '   ✓ 在名单里' : '   ✗ **不在名单里**'))
  console.log('')
}

主().catch((错误) => {
  console.log('  ✗ ' + (错误 && 错误.message))
  process.exit(1)
})
