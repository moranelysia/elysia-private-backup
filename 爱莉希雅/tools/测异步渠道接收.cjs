'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), wt = require('node:worker_threads')
const NativeWorker = wt.Worker; let injection
class TestWorker extends NativeWorker {
  constructor(file, options) { const cfg = injection; injection = undefined; super(file, cfg ? { ...options, execArgv: ['--require', path.join(__dirname, 'fixtures/sqlite-worker-fault.cjs')], env: { ...options.env, SQLITE_FIXTURE_FAULT: JSON.stringify(cfg) } } : options); const emit = this.emit; this.fixture = []; this.emit = function (event, ...args) { if (event === 'message' && args[0]?.fixture === true) { this.fixture.push(args[0]); return emit.call(this, 'fixture', args[0]) } return emit.call(this, event, ...args) } }
}
wt.Worker = TestWorker
const { 新建隔离盘库 } = require('../storage/sqlite-disk.cjs'), { 启动隔离存储Worker, 内部Worker测试 } = require('../storage/sqlite-worker.cjs'), { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs'), { 创建渠道权限 } = require('../脑/渠道权限.cjs'), { 创建异步渠道接收 } = require('../core/异步渠道接收.cjs')
const sample = require('./fixtures/渠道契约-v1.json').本人私聊, ep = { 渠道: 'fake', 账号: 'local-fixture' }, msg = { ...sample, 端点: ep }, time = '2026-10-25T05:00:10.000Z'
const tests = [], roots = [], actors = [], test = (n, f) => tests.push([n, f])
async function setup() {
  const disk = 新建隔离盘库({ 用途: 'synthetic-sqlite-disk' }), dir = disk.目录; disk.关闭(); roots.push(dir)
  const a = await 启动隔离存储Worker({ 用途: 'synthetic-sqlite-disk', 目录: dir }); actors.push(a)
  const 权限 = 创建渠道权限({ 绑定: [{ 端点: ep, 本人编号: msg.发送者编号, 私聊会话编号: msg.会话.编号, 允许主动发送: false }], 取现在: () => new Date(time) }), ctx = { 回复许可: 权限.审查接收(msg).回复许可 }
  return { a, 权限, ctx, dir }
}
const open = (a, 权限) => 创建异步渠道接收(a, { 编号: 'fake', 端点: ep, 权限, 取现在: () => new Date(time) })
async function read(a) { const f = 创建异步仓储门面(a), m = await f.状态.打开后端('channel-map', 'fake'), t = await f.状态.打开后端('channel-tasks', 'fake'); try { return [(await m.读取分段快照()).数据, (await t.读取分段快照()).数据] } finally { await t.关闭(); await m.关闭() } }
test('接收许可与新映射和processing同事务，重复接收不创建第二条', async () => {
  const { a, 权限, ctx } = await setup(), r = await open(a, 权限), p = await r.准备接收(msg, ctx), result = await r.提交(p, { 操作编号: 'receive-one' })
  assert.equal(result.内部对话编号, p.内部对话编号); assert.deepEqual(await r.提交(p, { 操作编号: 'receive-one' }), result); r.释放计划(p)
  const duplicate = await r.准备接收({ ...msg, 接收于: '2026-10-25T05:00:02.000Z' }, ctx); assert.equal(duplicate.重复, true); assert.equal(duplicate.任务编号, p.任务编号)
  await r.关闭(); const [map, tasks] = await read(a); assert.equal(map.记录.length, 1); assert.equal(tasks.记录.length, 1); assert.equal(tasks.记录[0].内部对话编号, map.记录[0].内部对话编号); assert.equal(tasks.记录[0].状态, 'processing')
})
test('无许可不可读取计划或落盘，伪造计划拒绝', async () => {
  const { a, 权限 } = await setup(), r = await open(a, 权限); await assert.rejects(r.准备接收(msg, {}), { message: 'ASYNC_CHANNEL_RECEIVE_FORBIDDEN' }); assert.throws(() => r.提交({}, { 操作编号: 'fake' }), { message: 'ASYNC_CHANNEL_RECEIVE_PLAN_INVALID' }); await r.关闭(); assert.deepEqual(await read(a), [null, null])
})
test('同来源消息正文冲突拒绝，不覆盖原任务', async () => {
  const { a, 权限, ctx } = await setup(), r = await open(a, 权限), p = await r.准备接收(msg, ctx); await r.提交(p, { 操作编号: 'initial' }); r.释放计划(p)
  await assert.rejects(r.准备接收({ ...msg, 正文: '不同内容' }, ctx), { message: 'ASYNC_CHANNEL_RECEIVE_MESSAGE_CONFLICT' }); await r.关闭(); const [map, task] = await read(a); assert.equal(map.记录.length, 1); assert.equal(task.记录.length, 1)
})
test('许可在确认落盘前失效，不返回可处理结果；记录留作恢复', async () => {
  const { a, 权限, ctx } = await setup(); let calls = 0
  const p = { 核对接收许可: (...args) => ++calls >= 4 ? { 允许: false } : 权限.核对接收许可(...args) }, r = await open(a, p), plan = await r.准备接收(msg, ctx)
  await assert.rejects(r.提交(plan, { 操作编号: 'revoked-during-write' }), e => e.message === 'ASYNC_CHANNEL_RECEIVE_COMMITTED_BUT_NOT_AUTHORIZED' && e.操作编号 === 'revoked-during-write'); r.释放计划(plan); await r.关闭()
  assert.equal((await read(a))[1].记录[0].状态, 'processing'); assert(await a.查询回执('revoked-during-write'))
})
test('任务存档独占与单计划，关闭等待写入', async () => {
  const { a, 权限, ctx } = await setup(), r = await open(a, 权限); await assert.rejects(open(a, 权限), { message: 'SQLITE_STATE_LEASE_BUSY' }); const p = await r.准备接收(msg, ctx); await assert.rejects(r.准备接收(msg, ctx), { message: 'ASYNC_CHANNEL_RECEIVE_PLAN_IN_USE' })
  const write = r.提交(p, { 操作编号: 'during-close' }); const closing = r.关闭(); await assert.rejects(write, { message: 'ASYNC_CHANNEL_RECEIVE_COMMITTED_BUT_NOT_AUTHORIZED' }); await closing; assert.equal((await read(a))[1].记录.length, 1)
})
test('非法操作编号被拒绝，映射与任务均未写入', async () => {
  const { a, 权限, ctx } = await setup(), r = await open(a, 权限), p = await r.准备接收(msg, ctx)
  await assert.rejects(r.提交(p, { 操作编号: 'bad id' })); await r.关闭(); assert.deepEqual(await read(a), [null, null])
})
for (const stage of ['before', 'after']) test('提交' + stage + '时Worker中断，先查回执且两文档一致', async () => {
  const { a: initial, 权限, ctx, dir } = await setup(); await 创建异步仓储门面(initial).会话.登记对话('fixture-target', { 建于: '2026-10-25T05:00:00.000Z' }, { 操作编号: 'seed-fixture' }); await initial.关闭()
  injection = { stage }; const a = await 启动隔离存储Worker({ 用途: 'synthetic-sqlite-disk', 目录: dir }); actors.push(a); const r = await open(a, 权限), p = await r.准备接收(msg, ctx), w = 内部Worker测试(a).worker
  const write = r.提交(p, { 操作编号: 'receive-unknown' }), rejected = assert.rejects(write, e => e.状态 === 'unknown')
  if (!w.fixture.some(x => x.kind === 'phase')) await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('PHASE_TIMEOUT')), 10000); w.on('fixture', function got(m) { if (m.kind === 'phase') { clearTimeout(timer); w.off('fixture', got); resolve() } }) })
  await w.terminate(); await rejected; await a.恢复(); const receipt = await a.查询回执('receive-unknown'), [mapping, tasks] = await read(a)
  assert.equal(receipt !== null, stage === 'after'); assert.equal(mapping?.记录.length ?? 0, stage === 'after' ? 1 : 0); assert.equal(tasks?.记录.length ?? 0, stage === 'after' ? 1 : 0)
})
;(async () => { let pass = 0; try { for (const [n, fn] of tests) { try { await fn(); pass++; console.log('PASS ' + n) } catch (e) { process.exitCode = 1; console.error('FAIL ' + n, e) } } console.log(`S16D2C2B2A: ${pass}/${tests.length}`) } finally { for (const a of actors) try { await a.关闭() } catch {} for (const root of roots) { const real = fs.realpathSync(root); if (path.dirname(real) !== fs.realpathSync(os.tmpdir()) || !/^elysia-sqlite-disk-[a-zA-Z0-9]+$/u.test(path.basename(real)) || fs.lstatSync(root).isSymbolicLink()) throw Error('CLEANUP_OUTSIDE'); fs.rmSync(real, { recursive: true, force: true }) } wt.Worker = NativeWorker } })()
