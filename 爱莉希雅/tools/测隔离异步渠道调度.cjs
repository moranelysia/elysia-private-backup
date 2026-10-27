'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { 新建隔离盘库 } = require('../storage/sqlite-disk.cjs'), { 启动隔离存储Worker } = require('../storage/sqlite-worker.cjs'), { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs'), { 创建渠道权限 } = require('../脑/渠道权限.cjs'), { 创建隔离异步渠道调度 } = require('../core/隔离异步渠道调度.cjs')
const { 创建渠道权限守卫 } = require('../脑/渠道权限.cjs'), { 创建假渠道适配器 } = require('../脑/假渠道适配器.cjs')
const sample = require('./fixtures/渠道契约-v1.json'), ep = { 渠道: 'fake', 账号: 'local-fixture' }, msg = { ...sample.本人私聊, 端点: ep }, capability = { ...sample.主动能力未知, 端点: ep }
const tests = [], roots = [], actors = [], test = (name, fn) => tests.push([name, fn]), initial = Date.parse('2026-10-25T05:00:10.000Z')
async function setup() {
  const d = 新建隔离盘库({ 用途: 'synthetic-sqlite-disk' }), dir = d.目录; d.关闭(); roots.push(dir); const a = await 启动隔离存储Worker({ 用途: 'synthetic-sqlite-disk', 目录: dir }); actors.push(a)
  const clock = { value: initial }, 权限 = 创建渠道权限({ 绑定: [{ 端点: ep, 本人编号: msg.发送者编号, 私聊会话编号: msg.会话.编号, 允许主动发送: false }], 取现在: () => new Date(clock.value) }), ctx = { 回复许可: 权限.审查接收(msg).回复许可 }
  return { a, 权限, ctx, clock }
}
function receipt(send, status, clock) { return { 版本: 1, 端点: ep, 请求编号: send.请求编号, 状态: status, 渠道消息编号: status === 'sent' ? 'delivered' : null, 错误代码: status === 'sent' ? null : 'SEND_FAILED', 可重试: status !== 'sent', 结束于: new Date(clock.value).toISOString() } }
async function archive(a) { const b = await 创建异步仓储门面(a).状态.打开后端('channel-tasks', 'fake'); try { return (await b.读取分段快照()).数据 } finally { await b.关闭() } }
const draft = () => ({ 可见性: 'shared', 正文: '模拟答复', 附件: [] })
async function open({ a, 权限, clock }, extra = {}) { return 创建隔离异步渠道调度(a, { 编号: 'fake', 权限, 取现在: () => new Date(clock.value), 处理: async () => draft(), 守卫: { 取能力: () => capability, 发送: async x => receipt(x, 'sent', clock) }, ...extra }) }
test('共享独占存储完成接收、处理、发送及去重', async () => {
  const x = await setup(); let processed = 0, sent = 0; const c = await open(x, { 处理: async () => { processed++; return draft() }, 守卫: { 取能力: () => capability, 发送: async m => { sent++; return receipt(m, 'sent', x.clock) } } })
  await assert.rejects(创建异步仓储门面(x.a).状态.打开后端('channel-tasks', 'fake'), { message: 'SQLITE_STATE_LEASE_BUSY' }); assert.equal((await c.接收(msg, x.ctx)).状态, 'sent'); assert.deepEqual(await c.接收(msg, x.ctx), { 好: true, 重复: true, 状态: 'sent' }); assert.equal(processed, 1); assert.equal(sent, 1); await c.关闭(); assert.equal((await archive(x.a)).记录[0].状态, 'sent')
})
test('并发重复输入串行去重，仅处理及发送一次', async () => {
  const x = await setup(); let handled = 0, sent = 0, release, started; const begun = new Promise(r => { started = r }), wait = new Promise(r => { release = r })
  const c = await open(x, { 处理: async () => { handled++; started(); await wait; return draft() }, 守卫: { 取能力: () => capability, 发送: async m => { sent++; return receipt(m, 'sent', x.clock) } } })
  const first = c.接收(msg, x.ctx); await begun; const second = c.接收(msg, x.ctx); release(); assert.equal((await first).状态, 'sent'); assert.equal((await second).重复, true); assert.equal(handled, 1); assert.equal(sent, 1); await c.关闭()
})
test('可重试失败等待间隔并使用原许可推进', async () => {
  const x = await setup(); let calls = 0; const c = await open(x, { 守卫: { 取能力: () => capability, 发送: async m => receipt(m, ++calls === 1 ? 'failed' : 'sent', x.clock) } })
  const first = await c.接收(msg, x.ctx); assert.equal(first.状态, 'queued'); await assert.rejects(c.推进(first.任务编号), { message: 'ASYNC_CHANNEL_SEND_NOT_READY' }); x.clock.value += 2000; assert.equal((await c.推进(first.任务编号)).状态, 'sent'); await c.关闭(); assert.equal(calls, 2)
})
test('重复来源内容冲突会阻断待发任务', async () => {
  const x = await setup(), c = await open(x, { 守卫: { 取能力: () => capability, 发送: async m => receipt(m, 'failed', x.clock) } }); const r = await c.接收(msg, x.ctx); assert.equal(r.状态, 'queued')
  await assert.rejects(c.接收({ ...msg, 正文: '另一内容' }, x.ctx), { message: 'ASYNC_CHANNEL_RECEIVE_MESSAGE_CONFLICT' }); await assert.rejects(c.推进(r.任务编号), { message: 'ASYNC_CHANNEL_COORDINATOR_FRESH_PERMISSION_REQUIRED' }); await c.关闭(); assert.equal((await archive(x.a)).记录[0].状态, 'blocked')
})
test('处理器忽略中止时关闭仍可结束，不调用发送', async () => {
  const x = await setup(); let ready, calls = 0; const started = new Promise(r => { ready = r }), c = await open(x, { 处理: async () => { ready(); return new Promise(() => {}) }, 守卫: { 取能力: () => capability, 发送: async m => { calls++; return receipt(m, 'sent', x.clock) } } })
  const p = c.接收(msg, x.ctx); await started; await c.关闭(); assert.equal((await p).状态, 'processing'); assert.equal(calls, 0); assert.equal((await archive(x.a)).记录[0].状态, 'processing')
})
test('发送器忽略中止时关闭仍结束，状态unknown不自动重发', async () => {
  const x = await setup(); let ready, calls = 0; const started = new Promise(r => { ready = r }), guard = { 取能力: () => capability, 发送: async () => { calls++; ready(); return new Promise(() => {}) } }, c = await open(x, { 守卫: guard })
  const p = c.接收(msg, x.ctx); await started; await c.关闭(); assert.equal((await p).状态, 'unknown'); assert.equal((await archive(x.a)).记录[0].状态, 'unknown'); const next = await open(x, { 守卫: guard }); assert.deepEqual(await next.接收(msg, x.ctx), { 好: true, 重复: true, 状态: 'unknown' }); await next.关闭(); assert.equal(calls, 1)
})
test('处理阶段撤权中止并阻止发送', async () => {
  const x = await setup(); let ready, calls = 0; const started = new Promise(r => { ready = r }), c = await open(x, { 处理: async () => { ready(); return new Promise(() => {}) }, 守卫: { 取能力: () => capability, 发送: async m => { calls++; return receipt(m, 'sent', x.clock) } } })
  const p = c.接收(msg, x.ctx); await started; x.权限.更新绑定([]); assert.equal((await p).状态, 'blocked'); await c.关闭(); assert.equal(calls, 0); assert.equal((await archive(x.a)).记录[0].状态, 'blocked')
})
test('待发期间撤权会在下一次推进前阻断任务', async () => {
  const x = await setup(), c = await open(x, { 守卫: { 取能力: () => capability, 发送: async m => receipt(m, 'failed', x.clock) } }); const result = await c.接收(msg, x.ctx); assert.equal(result.状态, 'queued')
  x.权限.更新绑定([]); await assert.rejects(c.推进(result.任务编号), { message: 'ASYNC_CHANNEL_COORDINATOR_FRESH_PERMISSION_REQUIRED' }); await c.关闭(); assert.equal((await archive(x.a)).记录[0].状态, 'blocked')
})
test('发送器永不返回时超时退出并保守记unknown', async () => {
  const x = await setup(), c = await open(x, { 发送超时毫秒: 20, 守卫: { 取能力: () => capability, 发送: async () => new Promise(() => {}) } })
  assert.equal((await c.接收(msg, x.ctx)).状态, 'unknown'); await c.关闭(); assert.equal((await archive(x.a)).记录[0].状态, 'unknown')
})
test('关闭后迟到发送回执不能再改写已保存unknown', async () => {
  const x = await setup(); let ready, deliver; const begun = new Promise(r => { ready = r }), wait = new Promise(r => { deliver = r })
  const c = await open(x, { 守卫: { 取能力: () => capability, 发送: async m => { ready(); await wait; return receipt(m, 'sent', x.clock) } } }); const pending = c.接收(msg, x.ctx); await begun; await c.关闭(); assert.equal((await pending).状态, 'unknown'); deliver(); await new Promise(r => setImmediate(r)); assert.equal((await archive(x.a)).记录[0].状态, 'unknown')
})
test('真实原守卫配合假渠道订阅完成一次接收和发送', async () => {
  const x = await setup(), adapter = 创建假渠道适配器({ 取现在: () => new Date(x.clock.value) }), guard = 创建渠道权限守卫({ 适配器: adapter, 权限: x.权限, 取现在: () => new Date(x.clock.value) })
  const c = await open(x, { 守卫: guard }); const unsub = guard.订阅接收((m, ctx) => c.接收(m, ctx))
  const incoming = await adapter.注入接收(msg); assert.equal(incoming.好, true); assert.equal(incoming.失败数, 0); assert.equal(adapter.取观测().模拟送达数, 1)
  unsub(); await c.关闭(); guard.关闭(); adapter.关闭(); assert.equal((await archive(x.a)).记录[0].状态, 'sent')
})
test('重新打开待发任务不能自造许可，可信重放后才能继续', async () => {
  const x = await setup(); let calls = 0; const guard = { 取能力: () => capability, 发送: async m => receipt(m, ++calls === 1 ? 'failed' : 'sent', x.clock) }; let c = await open(x, { 守卫: guard })
  const first = await c.接收(msg, x.ctx); assert.equal(first.状态, 'queued'); await c.关闭(); c = await open(x, { 守卫: guard }); x.clock.value += 2000
  await assert.rejects(c.推进(first.任务编号), { message: 'ASYNC_CHANNEL_COORDINATOR_FRESH_PERMISSION_REQUIRED' }); const fresh = { 回复许可: x.权限.审查接收(msg).回复许可 }; assert.equal((await c.接收(msg, fresh)).状态, 'sent'); await c.关闭(); assert.equal(calls, 2)
})
test('中断的处理重开后标记interrupted，不重新执行处理器', async () => {
  const x = await setup(); let ready, calls = 0; const begun = new Promise(r => { ready = r }); let c = await open(x, { 处理: async () => { calls++; ready(); return new Promise(() => {}) } })
  const pending = c.接收(msg, x.ctx); await begun; await c.关闭(); await pending; c = await open(x, { 处理: async () => { calls++; return draft() } }); assert.deepEqual(await c.接收(msg, x.ctx), { 好: true, 重复: true, 状态: 'interrupted' }); await c.关闭(); assert.equal(calls, 1)
})
test('到达重试上限后失败，不继续发送', async () => {
  const x = await setup(); let calls = 0; const c = await open(x, { 最大尝试: 2, 守卫: { 取能力: () => capability, 发送: async m => { calls++; return receipt(m, 'failed', x.clock) } } })
  const first = await c.接收(msg, x.ctx); assert.equal(first.状态, 'queued'); x.clock.value += 2000; assert.equal((await c.推进(first.任务编号)).状态, 'failed'); await c.关闭(); assert.equal(calls, 2); assert.equal((await archive(x.a)).记录[0].状态, 'failed')
})
;(async () => { let pass = 0; try { for (const [name, fn] of tests) { try { await fn(); pass++; console.log('PASS ' + name) } catch (e) { process.exitCode = 1; console.error('FAIL ' + name, e) } } console.log(`S16D2C2B2B: ${pass}/${tests.length}`) } finally { for (const a of actors) try { await a.关闭() } catch {} for (const root of roots) { const real = fs.realpathSync(root); if (path.dirname(real) !== fs.realpathSync(os.tmpdir()) || !/^elysia-sqlite-disk-[a-zA-Z0-9]+$/u.test(path.basename(real)) || fs.lstatSync(root).isSymbolicLink()) throw Error('CLEANUP_OUTSIDE'); fs.rmSync(real, { recursive: true, force: true }) } } })()
