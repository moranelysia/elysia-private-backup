'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), wt = require('node:worker_threads'), { createHash } = require('node:crypto')
const NativeWorker = wt.Worker; let injection
class TestWorker extends NativeWorker {
  constructor(file, options) {
    const cfg = injection; injection = undefined
    super(file, cfg ? { ...options, execArgv: ['--require', path.join(__dirname, 'fixtures/sqlite-worker-fault.cjs')], env: { ...options.env, SQLITE_FIXTURE_FAULT: JSON.stringify(cfg) } } : options)
    const emit = this.emit; this.fixture = []
    this.emit = function (event, ...args) { if (event === 'message' && args[0]?.fixture === true) { this.fixture.push(args[0]); return emit.call(this, 'fixture', args[0]) } return emit.call(this, event, ...args) }
  }
}
wt.Worker = TestWorker
const { 新建隔离盘库 } = require('../storage/sqlite-disk.cjs'), { 启动隔离存储Worker, 内部Worker测试 } = require('../storage/sqlite-worker.cjs'), { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs'), { 创建异步后台缓冲 } = require('../core/异步后台缓冲.cjs')
const roots = new Set(), actors = new Set(), tests = [], test = (n, f) => tests.push([n, f]), time = '2026-10-27T00:00:00.000Z'
const item = (id, text = '虚构内容') => ({ 对话: 'channel-fake', 消息编号: id, 用户原话: text, 她的回复: '嗯', 接收于: time, 发生于: time })
function fresh() { const d = 新建隔离盘库({ 用途: 'synthetic-sqlite-disk' }); d.关闭(); roots.add(d.目录); return { 用途: 'synthetic-sqlite-disk', 目录: d.目录 } }
async function start(o = fresh()) { const a = await 启动隔离存储Worker(o); actors.add(a); return a }
async function seed(a) { await 创建异步仓储门面(a).会话.登记对话('fixture-target', { 建于: time }, { 操作编号: 'seed-fixture' }) }
async function phase(a) { const w = 内部Worker测试(a).worker; if (w.fixture.some(x => x.kind === 'phase')) return; await new Promise((resolve, reject) => { const t = setTimeout(() => reject(Error('PHASE_TIMEOUT')), 10000); w.on('fixture', function got(m) { if (m.kind === 'phase') { clearTimeout(t); w.off('fixture', got); resolve() } }) }) }
test('新建、重复输入和稳定操作回执，公开计划不含正文', async () => {
  const a = await start(), b = await 创建异步后台缓冲(a), plan = await b.准备记录(item('m1'))
  assert.equal(JSON.stringify(plan).includes('虚构内容'), false); const first = await b.提交(plan, { 操作编号: 'add-1' }); assert.deepEqual(first, { 好: true, 新增: true, 数量: 1, 版本: 1 }); assert.deepEqual(await b.提交(plan, { 操作编号: 'add-1' }), first)
  const repeat = await b.准备记录(item('m1')); assert.equal(repeat.改变, false); assert.equal((await b.提交(repeat, { 操作编号: 'duplicate' })).新增, false); assert.equal(await a.查询回执('duplicate'), null); assert.equal((await b.读取()).数据.轮次.length, 1)
})
test('提取期间有新轮次时旧清除计划冲突，重计划只删除指定批次', async () => {
  const a = await start(), x = await 创建异步后台缓冲(a), y = await 创建异步后台缓冲(a)
  for (const id of ['m1', 'm2', 'm3']) await x.提交(await x.准备记录(item(id)), { 操作编号: 'add-' + id })
  const batch = ['m1', 'm2', 'm3'].map(消息编号 => ({ 对话: 'channel-fake', 消息编号 })), stale = await x.准备清除(batch)
  await y.提交(await y.准备记录(item('m4')), { 操作编号: 'add-new' })
  await assert.rejects(x.提交(stale, { 操作编号: 'clear-batch' }), { message: 'SQLITE_STATE_VERSION_CONFLICT' }); assert.equal(await a.查询回执('clear-batch'), null)
  const next = await x.准备清除(batch); assert.equal((await x.提交(next, { 操作编号: 'clear-batch' })).清除, 3); assert.deepEqual((await x.读取()).数据.轮次.map(r => r.消息编号), ['m4'])
})
test('旧成功计划重试返回原回执，不覆盖随后追加的轮次', async () => {
  const a = await start(), b = await 创建异步后台缓冲(a), p = await b.准备记录(item('m1')), saved = await b.提交(p, { 操作编号: 'stable-add' })
  await b.提交(await b.准备记录(item('m2')), { 操作编号: 'later-add' }); assert.deepEqual(await b.提交(p, { 操作编号: 'stable-add' }), saved); assert.deepEqual((await b.读取()).数据.轮次.map(x => x.消息编号), ['m1', 'm2'])
})
test('并发相同版本仅一项成功；无修改的旧计划也不得报告新状态', async () => {
  const a = await start(), x = await 创建异步后台缓冲(a), y = await 创建异步后台缓冲(a), p = await x.准备记录(item('m1')), q = await y.准备记录(item('m2'))
  const r = await Promise.allSettled([x.提交(p, { 操作编号: 'race-1' }), y.提交(q, { 操作编号: 'race-2' })]); assert.equal(r.filter(v => v.status === 'fulfilled').length, 1); assert.equal((await x.读取()).数据.轮次.length, 1)
  const noChange = await x.准备清除([{ 对话: 'channel-fake', 消息编号: 'absent' }]); await y.提交(await y.准备记录(item('m3')), { 操作编号: 'race-3' }); await assert.rejects(x.提交(noChange, { 操作编号: 'stale-noop' }), { message: 'ASYNC_BUFFER_VERSION_CONFLICT' })
})
test('大缓冲、长度截断及历史扩展字段保留', async () => {
  const a = await start(), f = 创建异步仓储门面(a), raw = await f.状态.打开后端('extraction-buffer'), rows = Array.from({ length: 70 }, (_, i) => ({ ...item('old-' + i, '字'.repeat(6000)), 消息时间: time }))
  await raw.保存分段快照({ 版本: 1, 轮次: rows, 扩展: { 空: null } }, { 预期版本: 0, 操作编号: 'seed-large-buffer' }); const b = await 创建异步后台缓冲(a)
  await b.提交(await b.准备记录(item('new', '新'.repeat(7000))), { 操作编号: 'append-large-buffer' }); const x = await b.读取(); assert.equal(x.数据.轮次.length, 71); assert.equal(x.数据.轮次[70].用户原话.length, 6000); assert.deepEqual(x.数据.扩展, { 空: null })
})
test('满100条、非法输入、伪造计划、getter和关闭均拒绝，不写回执', async () => {
  const a = await start(), f = 创建异步仓储门面(a), raw = await f.状态.打开后端('extraction-buffer'), rows = Array.from({ length: 100 }, (_, i) => ({ ...item('m' + i), 消息时间: time }))
  await raw.保存分段快照({ 版本: 1, 轮次: rows }, { 预期版本: 0, 操作编号: 'seed-full' }); const b = await 创建异步后台缓冲(a)
  await assert.rejects(b.准备记录(item('overflow')), { message: 'ASYNC_BUFFER_FULL' }); await assert.rejects(b.准备清除([])); await assert.rejects(b.提交({}, { 操作编号: 'forged' })); let calls = 0; await assert.rejects(b.准备记录({ get 对话() { calls++; return 'channel-fake' } })); assert.equal(calls, 0); assert.equal(await a.查询回执('forged'), null); await b.关闭(); await assert.rejects(b.读取(), { message: 'ASYNC_BUFFER_CLOSED' })
})
test('同一Worker的待处理计划有界，显式释放后可继续且旧计划失效', async () => {
  const a = await start(), x = await 创建异步后台缓冲(a), y = await 创建异步后台缓冲(a), list = []
  for (let i = 0; i < 16; i++) list.push(await x.准备记录(item('p' + i)))
  await assert.rejects(y.准备记录(item('overflow')), { message: 'ASYNC_BUFFER_PLAN_LIMIT' }); y.释放计划(list[0]); await assert.rejects(x.提交(list[0], { 操作编号: 'released' }), { message: 'ASYNC_BUFFER_PLAN_INVALID' }); assert.ok(await y.准备记录(item('new-plan')))
})
test('隔离审计阻断业务配置、模型、网络和根外正文读取', async () => {
  injection = { audit: true }; const a = await start(), b = await 创建异步后台缓冲(a); await b.提交(await b.准备记录(item('audit')), { 操作编号: 'audit-buffer' }); assert.equal((await b.读取()).数据.轮次.length, 1)
})
test('独立Node重开后缓冲完整，计划本身不当作持久凭据', async () => {
  const o = fresh(), a = await start(o), b = await 创建异步后台缓冲(a); await b.提交(await b.准备记录(item('reopen')), { 操作编号: 'buffer-reopen' }); const saved = await b.读取(); await a.关闭()
  const child = cp.spawnSync(process.execPath, [path.join(__dirname, 'fixtures/async-buffer-reader.cjs'), o.目录], { encoding: 'utf8', timeout: 15000 }); assert.equal(child.status, 0, child.stderr); assert.deepEqual(JSON.parse(child.stdout), { 版本: saved.版本, 数量: 1, 指纹: createHash('sha256').update(JSON.stringify(saved.数据)).digest('hex') })
})
for (const stage of ['before', 'after']) test('提交'+stage+'真实终止后查回执，新适配器可重传旧计划', async () => {
  const o = fresh(), first = await start(o); await seed(first); await first.关闭(); injection = { stage }; const a = await start(o), b = await 创建异步后台缓冲(a), p = await b.准备记录(item('unknown')), pending = b.提交(p, { 操作编号: 'buffer-unknown' }), bad = assert.rejects(pending, e => e.状态 === 'unknown')
  await phase(a); await 内部Worker测试(a).worker.terminate(); await bad; await a.恢复(); const receipt = await a.查询回执('buffer-unknown'); assert.equal(receipt !== null, stage === 'after')
  const next = await 创建异步后台缓冲(a), result = await next.提交(p, { 操作编号: 'buffer-unknown' }); assert.equal(result.版本, 1); assert.equal((await next.读取()).数据.轮次.length, 1)
})
;(async () => { let pass = 0; try { for (const [n, f] of tests) { try { await f(); pass++; console.log('PASS ' + n) } catch (e) { console.error('FAIL ' + n, e); process.exitCode = 1 } } console.log(`SQLite S-16D2B3A: ${pass}/${tests.length}; async buffer domain only`) } finally { for (const a of actors) try { await a.关闭() } catch {} for (const r of roots) { const real = fs.realpathSync(r); if (path.dirname(real) !== fs.realpathSync(os.tmpdir()) || !/^elysia-sqlite-disk-[a-zA-Z0-9]+$/u.test(path.basename(real)) || fs.lstatSync(r).isSymbolicLink()) throw Error('CLEANUP_OUTSIDE'); fs.rmSync(real, { recursive: true, force: true }) } wt.Worker = NativeWorker } })()
