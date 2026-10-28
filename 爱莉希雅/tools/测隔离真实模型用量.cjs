'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), wt = require('node:worker_threads')
const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elysia-S16D3-real-fixture-'))
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
const { 新建隔离盘库 } = require('../storage/sqlite-disk.cjs'), { 启动隔离存储Worker, 内部Worker测试 } = require('../storage/sqlite-worker.cjs'), { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs')
const { 创建严格凭据, 创建真实模型连接 } = require('../脑/模型连接.cjs'), { 创建隔离真实模型用量适配, 操作编号 } = require('../core/隔离真实模型用量适配.cjs')
const roots = new Set([root]), actors = new Set(), tests = [], test = (n, f) => tests.push([n, f]), time = '2026-10-28T00:00:00.000Z', messages = [{ role: 'user', content: '虚构测试正文' }]
const credential = 创建严格凭据({ 读取: () => 'fixture-key-only-1234567890' })
const response = () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '虚构回复' } }], usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 } }), { headers: { 'content-type': 'application/json' } })
function fresh() { const d = 新建隔离盘库({ 用途: 'synthetic-sqlite-disk' }); d.关闭(); roots.add(d.目录); return { 用途: 'synthetic-sqlite-disk', 目录: d.目录 } }
async function start(o = fresh()) { const a = await 启动隔离存储Worker(o); actors.add(a); return a }
async function seed(a) { await 创建异步仓储门面(a).会话.登记对话('fixture-target', { 建于: time }, { 操作编号: 'usage-seed' }) }
async function setup(a, fetch函数, options = {}) { const model = 创建真实模型连接({ 凭据: credential, fetch函数, ...options }); const gate = await 创建隔离真实模型用量适配({ actor: a, 模型连接: model, 取现在: () => new Date(time) }); return { model, gate } }
async function phase(a) { const w = 内部Worker测试(a).worker; if (w.fixture.some(x => x.kind === 'phase')) return; await new Promise((resolve, reject) => { const t = setTimeout(() => reject(Error('PHASE_TIMEOUT')), 10000); w.on('fixture', function got(m) { if (m.kind === 'phase') { clearTimeout(t); w.off('fixture', got); resolve() } }) }) }
test('真实连接经Worker先提交started，假HTTP结果提交后返回，重开可读', async () => {
  const o = fresh(), a = await start(o); let g, calls = 0
  const { model, gate } = await setup(a, async () => { calls++; assert.deepEqual((await g.读取用量()).数据.map(x => x.状态), ['started']); return response() }); g = gate
  assert.equal((await model.要一轮({ 消息们: messages })).全文, '虚构回复'); const rows = (await gate.读取用量()).数据
  assert.deepEqual(rows.map(x => x.状态), ['started', 'succeeded']); assert.equal(rows[0].请求编号, rows[1].请求编号); assert.equal(rows[1].用量.total_tokens, 6); assert.equal(calls, 1); assert(!JSON.stringify(rows).includes('虚构测试正文')); assert(!JSON.stringify(rows).includes('fixture-key'))
  await gate.关闭(); await a.关闭(); const b = await start(o), raw = await 创建异步仓储门面(b).状态.打开后端('usage', 'headless'); assert.deepEqual((await raw.读取分段快照()).数据.map(x => x.状态), ['started', 'succeeded']); await raw.关闭()
})
test('假HTTP失败记录unknown并保留真实错误码', async () => {
  const a = await start(), { model, gate } = await setup(a, async () => new Response('fixture', { status: 429 })); await assert.rejects(model.要一轮({ 消息们: messages }), { message: 'CORE_RATE_LIMITED' }); const rows = (await gate.读取用量()).数据; assert.deepEqual(rows.map(x => x.状态), ['started', 'unknown']); assert.equal(rows[1].代码, 'CORE_RATE_LIMITED'); await gate.关闭()
})
for (const terminal of [false, true]) test((terminal ? '终态' : '开始') + '回执失败时封闭且不伪造其他终态', async () => {
  const o = fresh(), initial = await start(o); await seed(initial); await initial.关闭(); injection = { stage: terminal ? 'journal-fail-second' : 'journal-fail' }; const a = await start(o); let calls = 0
  const { model, gate } = await setup(a, async () => { calls++; return response() }, { 最大请求: 2 }); await assert.rejects(model.要一轮({ 消息们: messages }), { message: 'CORE_LEDGER_FAILED', 状态: 'unknown' }); assert.equal(calls, terminal ? 1 : 0); assert.deepEqual((await gate.读取用量()).数据.map(x => x.状态), terminal ? ['started'] : []); await assert.rejects(model.要一轮({ 消息们: messages }), { message: 'CORE_LEDGER_FAILED' }); await gate.关闭()
})
for (const stage of ['before', 'after']) for (const terminal of [false, true]) test((terminal ? '终态' : '开始') + stage + '终止Worker后可查回执且不重复发送', async () => {
  const o = fresh(), initial = await start(o); await seed(initial); await initial.关闭(); injection = { stage, ...(terminal ? { skip: 1 } : {}) }; const a = await start(o); let calls = 0, failure
  const { model, gate } = await setup(a, async () => { calls++; return response() }, { 最大请求: 2 })
  const p = model.要一轮({ 消息们: messages }), bad = assert.rejects(p, e => { failure = e; return e.状态 === 'unknown' && !!e.请求编号 }); await phase(a); await 内部Worker测试(a).worker.terminate(); await bad
  assert.equal(calls, terminal ? 1 : 0); await a.恢复(); const id = 操作编号(failure.请求编号, failure.记账阶段); assert.equal(!!(await a.查询回执(id)), stage === 'after'); await assert.rejects(model.要一轮({ 消息们: messages }), { message: 'CORE_LEDGER_FAILED' }); assert.equal(calls, terminal ? 1 : 0)
  const raw = await 创建异步仓储门面(a).状态.打开后端('usage', 'headless'); assert.deepEqual(((await raw.读取分段快照()).数据 || []).map(x => x.状态), terminal ? (stage === 'after' ? ['started', 'succeeded'] : ['started']) : (stage === 'after' ? ['started'] : [])); await raw.关闭(); await assert.rejects(gate.关闭(), { message: 'SQLITE_STATE_CAPABILITY_INVALID' })
})
test('关闭时等待写入排空且迟到started不发送HTTP', async () => {
  const o = fresh(), initial = await start(o); await seed(initial); await initial.关闭(); injection = { stage: 'before', delay: 500 }; const a = await start(o); let calls = 0; const { model, gate } = await setup(a, async () => { calls++; return response() })
  const p = model.要一轮({ 消息们: messages }), bad = assert.rejects(p, { message: 'CORE_ABORTED', 状态: 'unknown', 记账阶段: 'started' }); await phase(a); const done = gate.关闭(); await bad; await done; assert.equal(calls, 0); const raw = await 创建异步仓储门面(a).状态.打开后端('usage', 'headless'); assert.deepEqual((await raw.读取分段快照()).数据.map(x => x.状态), ['started']); await raw.关闭()
})
test('请求取消后保留started并封闭重试', async () => {
  const a = await start(); let begin, release, calls = 0; const ready = new Promise(r => { begin = r }), wait = new Promise(r => { release = r }); const { model, gate } = await setup(a, async () => { calls++; begin(); await wait; return response() }, { 最大请求: 2 }); const ctrl = new AbortController()
  const p = model.要一轮({ 消息们: messages, 中止: ctrl.signal }), bad = assert.rejects(p, { message: 'CORE_ABORTED', 状态: 'unknown' }); await ready; ctrl.abort(); await bad; await assert.rejects(model.要一轮({ 消息们: messages }), { message: 'CORE_REQUEST_UNCERTAIN' }); release(); await new Promise(setImmediate); assert.equal(calls, 1); assert.deepEqual((await gate.读取用量()).数据.map(x => x.状态), ['started']); await gate.关闭()
})
;(async () => { let passed = 0; try { for (const [name, fn] of tests) { try { await fn(); passed++; console.log('PASS ' + name) } catch (e) { process.exitCode = 1; console.error('FAIL ' + name, e) } } console.log(`S16D3 isolated real model usage: ${passed}/${tests.length}; fake HTTP only`) } finally { for (const a of actors) try { await a.关闭() } catch {} for (const dir of roots) { const real = fs.realpathSync(dir); if (path.dirname(real) !== fs.realpathSync(os.tmpdir()) || !/^elysia-(sqlite-disk|S16D3-real-fixture)-[a-zA-Z0-9]+$/u.test(path.basename(real)) || fs.lstatSync(dir).isSymbolicLink()) throw Error('CLEANUP_OUTSIDE'); fs.rmSync(real, { recursive: true, force: true }) } wt.Worker = NativeWorker } })()
