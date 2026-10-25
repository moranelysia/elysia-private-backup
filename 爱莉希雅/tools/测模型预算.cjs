'use strict'
const assert = require('node:assert/strict')
const path = require('node:path'), { spawnSync } = require('node:child_process')
const { 创建严格凭据, 创建真实模型连接 } = require('../脑/模型连接.cjs')
const 消息们 = [{ role: 'user', content: '虚构测试' }], 凭据 = 创建严格凭据({ 读取: () => 'fixture-key-only-1234567890' })
const 回应 = (改 = {}) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '固定回复' } }], usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 }, ...改 }), { headers: { 'content-type': 'application/json' } })
function 建(参数 = {}) { const 账 = []; const 连接 = 创建真实模型连接({ 凭据, fetch函数: async () => 回应(), ...参数 }); 连接.绑定记录((一) => 账.push(一)); return { 连接, 账, 问: (中止) => 连接.要一轮({ 消息们, 中止 }) } }
let 数 = 0
async function 测(名, 做) { await 做(); 数++; console.log('✓ ' + 名) }
async function main() {
  await 测('显式严格凭据及记录器必需，不回退', async () => {
    assert.throws(() => 创建真实模型连接(), /CORE_CREDENTIAL_PROVIDER_REQUIRED/u)
    const 连接 = 创建真实模型连接({ 凭据 }); await assert.rejects(连接.要一轮({ 消息们 }), /CORE_LEDGER_REQUIRED/u)
    assert.throws(() => 建({ 凭据: { 取: () => 'fake' } }), /CORE_CREDENTIAL_PROVIDER_REQUIRED/u)
  })
  await 测('预算/模型白名单校验', () => {
    for (const 改 of [{ 最大请求: 0 }, { 最大请求: 65 }, { 输出Token: 4097 }, { 总超时毫秒: Infinity }, { 最大输入字节: 127 }, { 模型: 'unapproved' }]) assert.throws(() => 建(改), /CORE_(BUDGET|MODEL)_INVALID/u)
  })
  await 测('官方端点固定、禁重定向/思考/流式，Key只在头', async () => {
    let 收到; const 一 = 建({ fetch函数: async (url, 请求) => { 收到 = { url, 请求 }; return 回应() } })
    const 果 = await 一.问(); assert.equal(收到.url, 'https://api.deepseek.com/chat/completions'); assert.equal(收到.请求.redirect, 'error')
    const 体 = JSON.parse(收到.请求.body); assert.equal(体.max_tokens, 256); assert.equal(体.stream, false); assert.equal(体.thinking.type, 'disabled'); assert(!收到.请求.body.includes('fixture-key'))
    assert.equal(果.全文, '固定回复'); assert.equal(果.用量已登记, true); assert.equal(一.账[1].用量.total_tokens, 13)
    assert(!JSON.stringify(一.账).includes('固定回复')); assert(!JSON.stringify(一.账).includes('fixture-key'))
  })
  await 测('每连接默认仅一次，包括失败，不自动重试', async () => {
    let 次 = 0; const 一 = 建({ fetch函数: async () => { 次++; return new Response('PRIVATE-ERROR-SENTINEL', { status: 429 }) } })
    await assert.rejects(一.问(), /^Error: CORE_RATE_LIMITED$/u); await assert.rejects(一.问(), /CORE_REQUEST_BUDGET/u); assert.equal(次, 1)
  })
  await 测('并发调用不能穿透请求上限', async () => { const 一 = 建(); const 果 = await Promise.allSettled([一.问(), 一.问()]); assert.equal(果.filter((项) => 项.status === 'fulfilled').length, 1); assert.equal(一.连接.取状态().已发请求, 1) })
  await 测('超输入预算与空凭据在网络前拒绝', async () => {
    let 次 = 0; const 一 = 建({ 最大输入字节: 128, fetch函数: async () => { 次++; return 回应() } })
    await assert.rejects(一.连接.要一轮({ 消息们: [{ role: 'user', content: '测'.repeat(100) }] }), /CORE_INPUT_BUDGET/u)
    const 二 = 建({ 凭据: 创建严格凭据({ 读取: () => '' }), fetch函数: async () => { 次++; return 回应() } }); await assert.rejects(二.问(), /CORE_CREDENTIAL_UNAVAILABLE/u); assert.equal(次, 0)
  })
  await 测('started记账失败不能发送请求', async () => {
    let 次 = 0; const 一 = 创建真实模型连接({ 凭据, fetch函数: async () => { 次++; return 回应() } }); 一.绑定记录(() => { throw new Error('PRIVATE-DISK') })
    await assert.rejects(一.要一轮({ 消息们 }), /^Error: CORE_MODEL_FAILED$/u); assert.equal(次, 0)
  })
  await 测('结果记账失败不报告成功', async () => {
    const 一 = 创建真实模型连接({ 凭据, fetch函数: async () => 回应() }); 一.绑定记录((条) => { if (条.状态 !== 'started') throw new Error('PRIVATE-DISK') })
    await assert.rejects(一.要一轮({ 消息们 }), /^Error: CORE_MODEL_FAILED$/u)
  })
  await 测('不配合abort的fetch也在总超时后返回', async () => {
    const 一 = 建({ 总超时毫秒: 20, fetch函数: () => new Promise(() => {}) }), 开始 = performance.now()
    await assert.rejects(一.问(), /CORE_TIMEOUT/u); assert(performance.now() - 开始 < 1000); assert.deepEqual(一.账.map((条) => 条.状态), ['started'])
  })
  await 测('总预算跨多个请求和空闲时间计算', async () => {
    const 一 = 建({ 最大请求: 2, 总超时毫秒: 20 }); await 一.问(); await new Promise((好) => setTimeout(好, 25)); await assert.rejects(一.问(), /CORE_TIMEOUT/u); assert.equal(一.连接.取状态().已发请求, 1)
  })
  await 测('取消与关闭及时返回，迟到响应不能再记账', async () => {
    let 放行; const 一 = 建({ fetch函数: () => new Promise((好) => { 放行 = 好 }) }), 控制 = new AbortController()
    const 在途 = 一.问(控制.signal); 控制.abort(); await assert.rejects(在途, /CORE_ABORTED/u); 放行(回应()); await new Promise(setImmediate); assert.equal(一.账.length, 1)
    const 二 = 建(); 二.连接.关闭(); await assert.rejects(二.问(), /CORE_ABORTED/u)
  })
  await 测('已取消输入在网络前拒绝', async () => { const 控制 = new AbortController(); 控制.abort(); const 一 = 建(); await assert.rejects(一.问(控制.signal), /CORE_ABORTED/u); assert.equal(一.账.length, 0) })
  await 测('读取body期间也受总超时控制', async () => {
    const 一 = 建({ 总超时毫秒: 20, fetch函数: async () => new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } }) }); await assert.rejects(一.问(), /CORE_TIMEOUT/u)
  })
  await 测('响应字节上限、非法JSON和截断回复拒绝', async () => {
    for (const fetch函数 of [async () => new Response('x'.repeat(131073), { headers: { 'content-type': 'application/json' } }), async () => new Response('{broken', { headers: { 'content-type': 'application/json' } }), async () => 回应({ choices: [{ finish_reason: 'length', message: { content: '截断' } }] })]) await assert.rejects(建({ fetch函数 }).问(), /^Error: CORE_(RESPONSE_LIMIT|RESPONSE_INVALID|MODEL_FAILED)$/u)
  })
  await 测('HTTP错误与异常只返回固定代码，凭据和正文不进账', async () => {
    for (const [status, 代码] of [[401, 'CORE_AUTH_FAILED'], [402, 'CORE_BALANCE_EMPTY'], [500, 'CORE_HTTP_FAILED']]) await assert.rejects(建({ fetch函数: async () => new Response('PRIVATE-SENTINEL', { status }) }).问(), new RegExp('^Error: ' + 代码 + '$', 'u'))
    await assert.rejects(建({ fetch函数: async () => { throw new Error('CORE_PRIVATE_SENTINEL') } }).问(), /^Error: CORE_MODEL_FAILED$/u)
  })
  await 测('usage缺失保持未知，不编造token或金额', async () => { const 一 = 建({ fetch函数: async () => 回应({ usage: null }) }); const 果 = await 一.问(); assert.equal(果.用了, null); assert.equal(一.账[1].用量, null); assert(!JSON.stringify(一.账).includes('元')) })
  await 测('真实测试入口无显式开关或专用凭据时不会发请求', () => {
    const env = { ...process.env }; delete env.ELYSIA_HEADLESS_API_KEY
    for (const [参数, 代码] of [[[], 'LIVE_EXPLICIT_FLAG_REQUIRED'], [['--live'], 'LIVE_KEY_MISSING']]) {
      const 果 = spawnSync(process.execPath, [path.resolve(__dirname, 'test-headless-live.cjs'), ...参数], { env, encoding: 'utf8', windowsHide: true, timeout: 2000 })
      assert.ifError(果.error); assert.equal(果.status, 2); assert.equal(JSON.parse(果.stdout).代码, 代码); assert.equal(果.stderr, '')
    }
  })
  console.log(`模型预算：${数}/${数} 通过（全程假HTTP）`)
}
main().catch((错) => { console.error(错); process.exitCode = 1 })
