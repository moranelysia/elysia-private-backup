'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), wt = require('node:worker_threads')
const NativeWorker = wt.Worker; let injection
class TestWorker extends NativeWorker {
  constructor(file, options) { const cfg = injection; injection = undefined; super(file, cfg ? { ...options, execArgv: ['--require', path.join(__dirname, 'fixtures/渠道调度Worker故障.cjs')], env: { ...options.env, CHANNEL_FAULT_FIXTURE: JSON.stringify(cfg) } } : options); const emit = this.emit; this.fixture = []; this.emit = function (event, ...args) { if (event === 'message' && args[0]?.fixture === true) { this.fixture.push(args[0]); return emit.call(this, 'fixture', args[0]) } return emit.call(this, event, ...args) } }
}
wt.Worker = TestWorker
const { 新建隔离盘库 } = require('../storage/sqlite-disk.cjs'), { 启动隔离存储Worker, 内部Worker测试 } = require('../storage/sqlite-worker.cjs'), { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs'), { 创建渠道权限 } = require('../脑/渠道权限.cjs'), { 创建隔离异步渠道调度 } = require('../core/隔离异步渠道调度.cjs')
const sample = require('./fixtures/渠道契约-v1.json'), ep = { 渠道: 'fake', 账号: 'local-fixture' }, msg = { ...sample.本人私聊, 端点: ep }, capability = { ...sample.主动能力未知, 端点: ep }, time = '2026-10-25T05:00:10.000Z'
const tests = [], roots = [], actors = [], test = (name, fn) => tests.push([name, fn])
async function setup(cfg) {
  const d = 新建隔离盘库({ 用途: 'synthetic-sqlite-disk' }), dir = d.目录; d.关闭(); roots.push(dir); injection = cfg
  const actor = await 启动隔离存储Worker({ 用途: 'synthetic-sqlite-disk', 目录: dir }); actors.push(actor)
  const policy = 创建渠道权限({ 绑定: [{ 端点: ep, 本人编号: msg.发送者编号, 私聊会话编号: msg.会话.编号, 允许主动发送: false }], 取现在: () => new Date(time) }), ctx = { 回复许可: policy.审查接收(msg).回复许可 }
  let handled = 0, sent = 0
  const guard = { 取能力: () => capability, 发送: async send => { sent++; return { 版本: 1, 端点: ep, 请求编号: send.请求编号, 状态: 'sent', 渠道消息编号: 'fake-ack', 错误代码: null, 可重试: false, 结束于: time } } }
  const options = { 编号: 'fake', 守卫: guard, 权限: policy, 取现在: () => new Date(time), 处理: async () => { handled++; return { 可见性: 'shared', 正文: '模拟回复', 附件: [] } } }
  return { actor, policy, ctx, options, counts: () => ({ handled, sent }) }
}
async function phase(w) { if (w.fixture.some(x => x.kind === 'phase')) return; await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('PHASE_TIMEOUT')), 10000); w.on('fixture', function got(m) { if (m.kind === 'phase') { clearTimeout(timer); w.off('fixture', got); resolve() } }) }) }
async function read(actor) { const f = 创建异步仓储门面(actor), m = await f.状态.打开后端('channel-map', 'fake'), t = await f.状态.打开后端('channel-tasks', 'fake'); try { return [(await m.读取分段快照()).数据, (await t.读取分段快照()).数据] } finally { await t.关闭(); await m.关闭() } }
const prior = { processing: null, queued: 'processing', sending: 'queued', sent: 'sending' }
for (const state of ['processing', 'queued', 'sending', 'sent']) for (const stage of ['before', 'after']) test(state + '事务' + stage + '终止，不臆测副作用', async () => {
  const x = await setup({ state, stage }), c = await 创建隔离异步渠道调度(x.actor, x.options), w = 内部Worker测试(x.actor).worker
  let failure; const p = c.接收(msg, x.ctx), failed = assert.rejects(p, e => { failure = e; return e.状态 === 'unknown' }); await phase(w); await w.terminate(); await failed
  assert.equal(x.counts().handled, state === 'processing' ? 0 : 1); assert.equal(x.counts().sent, state === 'sent' ? 1 : 0)
  try { await c.关闭() } catch {} await x.actor.恢复(); assert.match(failure.操作编号, /^(coord-receive|coord-step|send-step)-/u); const receipt = await x.actor.查询回执(failure.操作编号); assert.equal(receipt !== null, stage === 'after')
  const [mapping, before] = await read(x.actor), expected = stage === 'before' ? prior[state] : state
  assert.equal(before?.记录[0]?.状态 ?? null, expected); assert.equal(mapping?.记录.length ?? 0, expected === null ? 0 : 1)
  const next = await 创建隔离异步渠道调度(x.actor, x.options); await next.关闭(); const [, after] = await read(x.actor)
  assert.equal(after.记录[0]?.状态 ?? null, expected === 'processing' ? 'interrupted' : expected === 'sending' ? 'unknown' : expected)
  assert.equal(x.counts().sent, state === 'sent' ? 1 : 0)
})
test('接收事务提交前撤权：落盘后不调用处理或发送', async () => {
  const x = await setup({ state: 'processing', stage: 'before', delay: 500 }), c = await 创建隔离异步渠道调度(x.actor, x.options), w = 内部Worker测试(x.actor).worker
  const p = c.接收(msg, x.ctx), bad = assert.rejects(p, { message: 'ASYNC_CHANNEL_RECEIVE_COMMITTED_BUT_NOT_AUTHORIZED' }); await phase(w); x.policy.更新绑定([]); await bad; await c.关闭(); const [, tasks] = await read(x.actor); assert.equal(tasks.记录[0].状态, 'processing'); assert.deepEqual(x.counts(), { handled: 0, sent: 0 })
})
test('queued提交前撤权：不得发送并在关闭前阻断任务', async () => {
  const x = await setup({ state: 'queued', stage: 'before', delay: 500 }), c = await 创建隔离异步渠道调度(x.actor, x.options), w = 内部Worker测试(x.actor).worker
  const p = c.接收(msg, x.ctx), bad = assert.rejects(p, { message: 'ASYNC_CHANNEL_SEND_FORBIDDEN' }); await phase(w); x.policy.更新绑定([]); await bad; await c.关闭(); const [, tasks] = await read(x.actor); assert.equal(tasks.记录[0].状态, 'blocked'); assert.deepEqual(x.counts(), { handled: 1, sent: 0 })
})
test('sending提交前撤权：保守unknown，不能调用发送器', async () => {
  const x = await setup({ state: 'sending', stage: 'before', delay: 500 }), c = await 创建隔离异步渠道调度(x.actor, x.options), w = 内部Worker测试(x.actor).worker
  const p = c.接收(msg, x.ctx); await phase(w); x.policy.更新绑定([]); assert.equal((await p).状态, 'unknown'); await c.关闭(); const [, tasks] = await read(x.actor); assert.equal(tasks.记录[0].状态, 'unknown'); assert.deepEqual(x.counts(), { handled: 1, sent: 0 })
})
test('假发送已完成但成功回执写入故障：整组回滚，重启标记unknown', async () => {
  const x = await setup({ state: 'sent', stage: 'journal-fail' }), c = await 创建隔离异步渠道调度(x.actor, x.options)
  await assert.rejects(c.接收(msg, x.ctx)); assert.equal(x.counts().sent, 1); await c.关闭(); const [, old] = await read(x.actor); assert.equal(old.记录[0].状态, 'sending')
  const next = await 创建隔离异步渠道调度(x.actor, x.options); assert.deepEqual(await next.接收(msg, x.ctx), { 好: true, 重复: true, 状态: 'unknown' }); await next.关闭(); assert.equal(x.counts().sent, 1)
})
test('等待队列达到32时明确拒绝第33项并可安全关闭', async () => {
  const x = await setup({}), begun = {}; begun.promise = new Promise(r => { begun.resolve = r }); x.options.处理 = async () => { begun.resolve(); return new Promise(() => {}) }
  const c = await 创建隔离异步渠道调度(x.actor, x.options), pending = []; pending.push(c.接收(msg, x.ctx)); await begun.promise
  for (let i = 0; i < 31; i++) pending.push(c.接收(msg, x.ctx)); const all = Promise.allSettled(pending)
  await assert.rejects(c.接收(msg, x.ctx), { message: 'ASYNC_CHANNEL_COORDINATOR_QUEUE_FULL' }); await c.关闭(); const results = await all; assert.equal(results.length, 32); assert.equal(results.filter(r => r.status === 'rejected').length, 31); assert.equal(x.counts().sent, 0)
})
;(async () => { let pass = 0; try { for (const [name, fn] of tests) { try { await fn(); pass++; console.log('PASS ' + name) } catch (e) { process.exitCode = 1; console.error('FAIL ' + name, e) } } console.log(`S16D2C fault: ${pass}/${tests.length}`) } finally { for (const a of actors) try { await a.关闭() } catch {} for (const root of roots) { const real = fs.realpathSync(root); if (path.dirname(real) !== fs.realpathSync(os.tmpdir()) || !/^elysia-sqlite-disk-[a-zA-Z0-9]+$/u.test(path.basename(real)) || fs.lstatSync(root).isSymbolicLink()) throw Error('CLEANUP_OUTSIDE'); fs.rmSync(real, { recursive: true, force: true }) } wt.Worker = NativeWorker } })()
