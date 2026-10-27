'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), wt = require('node:worker_threads')
const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elysia-S16D3-usage-fixture-'))
for (const [k, v] of Object.entries({ ELYSIA_WORKSPACE_ROOT: root, ELYSIA_CONFIG_FILE: path.join(root, 'absent.json'), ELYSIA_PERSONA_PATH: path.join(root, 'absent-persona.json'), ELYSIA_DATA_DIR: path.join(root, 'data'), ELYSIA_CACHE_DIR: path.join(root, 'cache') })) process.env[k] = v
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
const { 新建隔离盘库 } = require('../storage/sqlite-disk.cjs'), { 启动隔离存储Worker, 内部Worker测试 } = require('../storage/sqlite-worker.cjs'), { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs'), { 创建假模型连接 } = require('../脑/模型连接.cjs'), { 创建隔离异步模型用量关口 } = require('../core/隔离异步模型用量关口.cjs')
const roots = new Set([root]), actors = new Set(), tests = [], test = (n, f) => tests.push([n, f]), time = '2026-10-28T00:00:00.000Z', messages = [{ role: 'user', content: '虚构测试正文' }]
function fresh() { const d = 新建隔离盘库({ 用途: 'synthetic-sqlite-disk' }); d.关闭(); roots.add(d.目录); return { 用途: 'synthetic-sqlite-disk', 目录: d.目录 } }
async function start(o = fresh()) { const a = await 启动隔离存储Worker(o); actors.add(a); return a }
async function seed(a) { await 创建异步仓储门面(a).会话.登记对话('fixture-target', { 建于: time }, { 操作编号: 'usage-seed' }) }
const gate = (a, generate) => 创建隔离异步模型用量关口({ actor: a, 模型连接: 创建假模型连接({ 生成: generate }), 取现在: () => new Date(time) })
async function phase(a) { const w = 内部Worker测试(a).worker; if (w.fixture.some(x => x.kind === 'phase')) return; await new Promise((resolve, reject) => { const t = setTimeout(() => reject(Error('PHASE_TIMEOUT')), 10000); w.on('fixture', function got(m) { if (m.kind === 'phase') { clearTimeout(t); w.off('fixture', got); resolve() } }) }) }
test('started已提交后才调用假模型，成功回执持久化且账本不含正文', async () => {
  const a = await start(); let g, calls = 0; g = await gate(a, async () => { calls++; assert.deepEqual((await g.读取用量()).数据.map(x => x.状态), ['started']); return '虚构回复' })
  assert.equal((await g.要一轮({ 消息们: messages })).全文, '虚构回复'); const rows = (await g.读取用量()).数据; assert.deepEqual(rows.map(x => x.状态), ['started', 'succeeded']); assert.equal(rows[0].请求编号, rows[1].请求编号); assert.equal(rows[1].用量, null); assert(!JSON.stringify(rows).includes('虚构测试正文')); assert.equal(calls, 1); await g.关闭()
})
test('假模型失败记录unknown，不伪造零用量', async () => {
  const a = await start(), g = await gate(a, async () => { throw Error('fixture') }); await assert.rejects(g.要一轮({ 消息们: messages }), { message: 'ISOLATED_MODEL_USAGE_MODEL_FAILED' }); const rows = (await g.读取用量()).数据; assert.deepEqual(rows.map(x => x.状态), ['started', 'unknown']); assert.equal(rows[1].代码, 'CORE_MODEL_FAILED'); assert.equal(rows[1].用量, null); await g.关闭()
})
test('关闭中止不合作的假模型，记录unknown且迟到结果不再写账', async () => {
  const a = await start(); let begun, release; const ready = new Promise(r => { begun = r }), wait = new Promise(r => { release = r }), g = await gate(a, async () => { begun(); await wait; return '迟到回复' })
  const p = g.要一轮({ 消息们: messages }), bad = assert.rejects(p, { message: 'ISOLATED_MODEL_USAGE_ABORTED' }); await ready; const close = g.关闭(); await bad; await close; release(); await new Promise(r => setImmediate(r))
  const raw = await 创建异步仓储门面(a).状态.打开后端('usage', 'headless'), rows = (await raw.读取分段快照()).数据; assert.deepEqual(rows.map(x => x.状态), ['started', 'unknown']); assert.equal(rows[1].代码, 'CORE_ABORTED'); await raw.关闭()
})
test('并发请求拒绝，非假模型与畸形输入不调用', async () => {
  const a = await start(); await assert.rejects(创建隔离异步模型用量关口({ actor: a, 模型连接: { 要一轮() {} } }), { message: 'ISOLATED_MODEL_USAGE_DEPENDENCY_INVALID' })
  let begun, release; const ready = new Promise(r => { begun = r }), wait = new Promise(r => { release = r }), g = await gate(a, async () => { begun(); await wait; return '好' })
  assert.throws(() => g.要一轮({ 消息们: [{ role: 'tool', content: 'x' }] }), { message: 'ISOLATED_MODEL_USAGE_INPUT_INVALID' }); const p = g.要一轮({ 消息们: messages }); await ready; assert.throws(() => g.要一轮({ 消息们: messages }), { message: 'ISOLATED_MODEL_USAGE_BUSY' }); release(); await p; await g.关闭()
})
test('started回执写入失败时绝不调用模型', async () => {
  const o = fresh(), initial = await start(o); await seed(initial); await initial.关闭(); injection = { stage: 'journal-fail' }; const a = await start(o); let calls = 0; const g = await gate(a, async () => { calls++; return '好' })
  await assert.rejects(g.要一轮({ 消息们: messages }), { message: 'SQLITE_CONTEXT_TRANSACTION_FAILED' }); assert.equal(calls, 0); assert.equal((await g.读取用量()).数据.length, 0); assert.throws(() => g.要一轮({ 消息们: messages }), { message: 'ISOLATED_MODEL_USAGE_LEDGER_UNCERTAIN' }); await g.关闭()
})
test('成功记账失败不返回模型回复，也不伪造unknown', async () => {
  const o = fresh(), initial = await start(o); await seed(initial); await initial.关闭(); injection = { stage: 'journal-fail-second' }; const a = await start(o); let calls = 0; const g = await gate(a, async () => { calls++; return '虚构回复' })
  await assert.rejects(g.要一轮({ 消息们: messages }), { message: 'SQLITE_CONTEXT_TRANSACTION_FAILED' }); assert.equal(calls, 1); assert.deepEqual((await g.读取用量()).数据.map(x => x.状态), ['started']); assert.throws(() => g.要一轮({ 消息们: messages }), { message: 'ISOLATED_MODEL_USAGE_LEDGER_UNCERTAIN' }); await g.关闭()
})
for (const stage of ['before', 'after']) test('started提交' + stage + '终止Worker，未知回执未确认前绝不请求', async () => {
  const o = fresh(), initial = await start(o); await seed(initial); await initial.关闭(); injection = { stage }; const a = await start(o); let calls = 0, failure; const g = await gate(a, async () => { calls++; return '好' })
  const p = g.要一轮({ 消息们: messages }), bad = assert.rejects(p, e => { failure = e; return e.状态 === 'unknown' }); await phase(a); await 内部Worker测试(a).worker.terminate(); await bad; assert.equal(calls, 0); await a.恢复(); assert.equal(!!(await a.查询回执(failure.操作编号)), stage === 'after'); assert.equal(calls, 0); assert.throws(() => g.要一轮({ 消息们: messages }), { message: 'ISOLATED_MODEL_USAGE_LEDGER_UNCERTAIN' }); await assert.rejects(g.关闭(), { message: 'SQLITE_STATE_CAPABILITY_INVALID' })
})
for (const stage of ['before', 'after']) test('结果记账' + stage + '终止Worker，不返回答案或重复发请求', async () => {
  const o = fresh(), initial = await start(o); await seed(initial); await initial.关闭(); injection = { stage, skip: 1 }; const a = await start(o); let calls = 0, failure; const g = await gate(a, async () => { calls++; return '虚构回复' })
  const p = g.要一轮({ 消息们: messages }), bad = assert.rejects(p, e => { failure = e; return e.状态 === 'unknown' }); await phase(a); await 内部Worker测试(a).worker.terminate(); await bad; assert.equal(calls, 1); await a.恢复(); assert.equal(!!(await a.查询回执(failure.操作编号)), stage === 'after')
  const raw = await 创建异步仓储门面(a).状态.打开后端('usage', 'headless'); assert.deepEqual((await raw.读取分段快照()).数据.map(x => x.状态), stage === 'after' ? ['started', 'succeeded'] : ['started']); await raw.关闭(); assert.throws(() => g.要一轮({ 消息们: messages }), { message: 'ISOLATED_MODEL_USAGE_LEDGER_UNCERTAIN' }); await assert.rejects(g.关闭(), { message: 'SQLITE_STATE_CAPABILITY_INVALID' })
})
test('关闭发生在started提交期间，确认落盘后绝不调用模型', async () => {
  const o = fresh(), initial = await start(o); await seed(initial); await initial.关闭(); injection = { stage: 'before', delay: 500 }; const a = await start(o); let calls = 0; const g = await gate(a, async () => { calls++; return '好' })
  const p = g.要一轮({ 消息们: messages }), bad = assert.rejects(p, { message: 'ISOLATED_MODEL_USAGE_CLOSED' }); await phase(a); const close = g.关闭(); await bad; await close; assert.equal(calls, 0)
  const raw = await 创建异步仓储门面(a).状态.打开后端('usage', 'headless'); assert.deepEqual((await raw.读取分段快照()).数据.map(x => x.状态), ['started']); await raw.关闭()
})
;(async () => { let passed = 0; try { for (const [name, fn] of tests) { try { await fn(); passed++; console.log('PASS ' + name) } catch (e) { process.exitCode = 1; console.error('FAIL ' + name, e) } } console.log(`S16D3 isolated model usage: ${passed}/${tests.length}`) } finally { for (const a of actors) try { await a.关闭() } catch {} for (const dir of roots) { const real = fs.realpathSync(dir); if (path.dirname(real) !== fs.realpathSync(os.tmpdir()) || !/^elysia-(sqlite-disk|S16D3-usage-fixture)-[a-zA-Z0-9]+$/u.test(path.basename(real)) || fs.lstatSync(dir).isSymbolicLink()) throw Error('CLEANUP_OUTSIDE'); fs.rmSync(real, { recursive: true, force: true }) } wt.Worker = NativeWorker } })()
