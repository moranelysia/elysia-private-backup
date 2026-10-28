'use strict'
const assert = require('node:assert/strict')
const { 创建严格凭据, 创建真实模型连接 } = require('../脑/模型连接.cjs')
const credentials = 创建严格凭据({ 读取: () => 'fixture-key-only-1234567890' }), messages = [{ role: 'user', content: '虚构消息' }]
const response = (usage = { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 }) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '虚构回复' } }], usage }), { headers: { 'content-type': 'application/json' } })
const tests = [], test = (n, f) => tests.push([n, f]), ack = x => ({ 好: true, 状态: x.状态 })
function make({ ledger, fetch函数 = async () => response(), ...rest } = {}) {
  const c = 创建真实模型连接({ 凭据: credentials, fetch函数, ...rest }); c.绑定异步记录(ledger || (async x => ack(x))); return c
}
test('开始回执确认前不调用假HTTP，成功落盘后才返回', async () => {
  let release, seen, calls = 0, finish; const ready = new Promise(r => { seen = r }), wait = new Promise(r => { release = r }), end = new Promise(r => { finish = r }), events = []
  const c = make({ ledger: async e => { events.push(e); if (e.状态 === 'started') { seen(); await wait } else { await end } return ack(e) }, fetch函数: async () => { calls++; return response() } })
  let done = false; const p = c.要一轮({ 消息们: messages }).then(x => { done = true; return x }); await ready; assert.equal(calls, 0); release(); while (events.length < 2) await new Promise(setImmediate); assert.equal(calls, 1); assert.equal(done, false); finish()
  assert.equal((await p).全文, '虚构回复'); assert.deepEqual(events.map(x => x.状态), ['started', 'succeeded']); assert(!JSON.stringify(events).includes('fixture-key')); assert(!JSON.stringify(events).includes('虚构消息')); c.关闭(); await c.等待记账排空()
})
test('错误或无确认的started拒绝发送并封闭账本', async () => {
  for (const ledger of [async () => null, async () => ({ 好: true, 状态: 'succeeded' }), async () => { throw Error('secret') }]) { let calls = 0; const c = make({ ledger, fetch函数: async () => { calls++; return response() } }); await assert.rejects(c.要一轮({ 消息们: messages }), e => e.message === 'CORE_LEDGER_FAILED' && e.状态 === 'unknown' && !!e.请求编号); await assert.rejects(c.要一轮({ 消息们: messages }), { message: 'CORE_LEDGER_FAILED' }); assert.equal(calls, 0); c.关闭(); await c.等待记账排空() }
})
test('同步记录器返回Promise被拒绝，不提前发请求', async () => {
  let calls = 0; const c = 创建真实模型连接({ 凭据: credentials, fetch函数: async () => { calls++; return response() } }); c.绑定记录(() => Promise.reject(Error('fixture'))); await assert.rejects(c.要一轮({ 消息们: messages }), { message: 'CORE_MODEL_FAILED' }); await assert.rejects(c.要一轮({ 消息们: messages }), { message: 'CORE_LEDGER_FAILED' }); assert.equal(calls, 0); await new Promise(setImmediate); c.关闭()
})
test('慢started期间并发被拒绝，已发送请求上限不穿透', async () => {
  let started, release, calls = 0; const begin = new Promise(r => { started = r }), wait = new Promise(r => { release = r }), c = make({ ledger: async x => { if (x.状态 === 'started') { started(); await wait } return ack(x) }, fetch函数: async () => { calls++; return response() } })
  const p = c.要一轮({ 消息们: messages }); await begin; await assert.rejects(c.要一轮({ 消息们: messages }), { message: 'CORE_REQUEST_BUSY' }); release(); await p; await assert.rejects(c.要一轮({ 消息们: messages }), { message: 'CORE_REQUEST_BUDGET' }); assert.equal(calls, 1); c.关闭(); await c.等待记账排空()
})
test('started写入期间关闭有界返回，可等待迟到写入排空，绝不发送', async () => {
  let ready, release, calls = 0, written = false; const begin = new Promise(r => { ready = r }), wait = new Promise(r => { release = r }), c = make({ ledger: async e => { ready(); await wait; written = true; return ack(e) }, fetch函数: async () => { calls++; return response() } })
  const p = c.要一轮({ 消息们: messages }), bad = assert.rejects(p, e => e.message === 'CORE_ABORTED' && e.状态 === 'unknown' && e.记账阶段 === 'started'); await begin; c.关闭(); await bad; let drained = false; const d = c.等待记账排空().then(() => { drained = true }); await new Promise(setImmediate); assert.equal(drained, false); assert.equal(calls, 0); release(); await d; assert.equal(written, true); assert.equal(calls, 0)
})
test('started超时后迟到确认不能触发HTTP，也不能继续使用', async () => {
  let release, calls = 0; const wait = new Promise(r => { release = r }), c = make({ 总超时毫秒: 30, ledger: async e => { await wait; return ack(e) }, fetch函数: async () => { calls++; return response() } })
  await assert.rejects(c.要一轮({ 消息们: messages }), { message: 'CORE_TIMEOUT', 状态: 'unknown' }); await assert.rejects(c.要一轮({ 消息们: messages }), { message: 'CORE_LEDGER_FAILED' }); release(); c.关闭(); await c.等待记账排空(); assert.equal(calls, 0)
})
test('成功终态提交失败时不再写unknown并保留可查操作编号', async () => {
  const events = [], c = make({ ledger: async e => { events.push(e); if (e.状态 === 'succeeded') throw Object.assign(Error('secret-data'), { 状态: 'unknown', 操作编号: 'usage-fixture-1' }); return ack(e) } })
  await assert.rejects(c.要一轮({ 消息们: messages }), e => e.message === 'CORE_LEDGER_FAILED' && e.状态 === 'unknown' && e.操作编号 === 'usage-fixture-1' && !e.message.includes('secret')); assert.deepEqual(events.map(x => x.状态), ['started', 'succeeded']); c.关闭(); await c.等待记账排空()
})
test('成功终态超时后迟到提交不生成第二个终态', async () => {
  let release, ready; const wait = new Promise(r => { release = r }), begin = new Promise(r => { ready = r }), events = []
  const c = make({ 总超时毫秒: 40, ledger: async e => { events.push(e); if (e.状态 === 'succeeded') { ready(); await wait } return ack(e) } }); const p = c.要一轮({ 消息们: messages }), bad = assert.rejects(p, { message: 'CORE_TIMEOUT', 状态: 'unknown', 记账阶段: 'succeeded' }); await begin; await bad; release(); c.关闭(); await c.等待记账排空(); assert.deepEqual(events.map(x => x.状态), ['started', 'succeeded'])
})
test('HTTP失败先写unknown再返回错误，写账失败时不伪造成功', async () => {
  const events = [], c = make({ ledger: async e => { events.push(e); return ack(e) }, fetch函数: async () => new Response('private', { status: 429 }) }); await assert.rejects(c.要一轮({ 消息们: messages }), { message: 'CORE_RATE_LIMITED' }); assert.deepEqual(events.map(x => x.状态), ['started', 'unknown']); assert.equal(events[1].代码, 'CORE_RATE_LIMITED'); c.关闭(); await c.等待记账排空()
})
test('请求取消和迟到HTTP不写第二终态，已有started不代表已收费', async () => {
  let ready, release; const begin = new Promise(r => { ready = r }), wait = new Promise(r => { release = r }), events = [], c = make({ 最大请求: 2, ledger: async e => { events.push(e); return ack(e) }, fetch函数: async () => { ready(); await wait; return response() } })
  const ctrl = new AbortController(), p = c.要一轮({ 消息们: messages, 中止: ctrl.signal }), bad = assert.rejects(p, e => e.message === 'CORE_ABORTED' && e.状态 === 'unknown' && e.请求编号 === events[0].请求编号); await begin; ctrl.abort(); await bad; await assert.rejects(c.要一轮({ 消息们: messages }), { message: 'CORE_REQUEST_UNCERTAIN' }); release(); await new Promise(setImmediate); assert.deepEqual(events.map(x => x.状态), ['started']); c.关闭(); await c.等待记账排空()
})
test('成功无usage保留null及异步绑定不能重复', async () => {
  const events = [], c = make({ ledger: async e => { events.push(e); return ack(e) }, fetch函数: async () => response(null) }); assert.throws(() => c.绑定记录(() => {}), { message: 'CORE_LEDGER_REQUIRED' }); assert.throws(() => c.绑定异步记录(() => {}), { message: 'CORE_LEDGER_REQUIRED' }); const r = await c.要一轮({ 消息们: messages }); assert.equal(r.用了, null); assert.equal(events[1].用量, null); c.关闭(); await c.等待记账排空()
})
;(async () => { let passed = 0; for (const [name, fn] of tests) { try { await fn(); passed++; console.log('PASS ' + name) } catch (e) { process.exitCode = 1; console.error('FAIL ' + name, e) } } console.log(`S16D3 async real-connection interface: ${passed}/${tests.length}; fake HTTP only`) })()
