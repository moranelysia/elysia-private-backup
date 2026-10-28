'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), wt = require('node:worker_threads')
const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elysia-S16D3-chain-fixture-'))
for (const [k, v] of Object.entries({ ELYSIA_WORKSPACE_ROOT: root, ELYSIA_CONFIG_FILE: path.join(root, 'absent.json'), ELYSIA_PERSONA_PATH: path.join(root, 'absent-persona.json'), ELYSIA_DATA_DIR: path.join(root, 'data'), ELYSIA_CACHE_DIR: path.join(root, 'cache') })) process.env[k] = v
const NativeWorker = wt.Worker; let injection
class TestWorker extends NativeWorker {
  constructor(file, options) { const cfg = injection; injection = undefined; super(file, cfg ? { ...options, execArgv: ['--require', path.join(__dirname, 'fixtures/sqlite-worker-fault.cjs')], env: { ...options.env, SQLITE_FIXTURE_FAULT: JSON.stringify(cfg) } } : options); const emit = this.emit; this.fixture = []; this.emit = function (event, ...args) { if (event === 'message' && args[0]?.fixture === true) { this.fixture.push(args[0]); return emit.call(this, 'fixture', args[0]) } return emit.call(this, event, ...args) } }
}
wt.Worker = TestWorker
const { 新建隔离盘库 } = require('../storage/sqlite-disk.cjs'), { 启动隔离存储Worker, 内部Worker测试 } = require('../storage/sqlite-worker.cjs'), { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs')
const { 创建严格凭据, 创建真实模型连接 } = require('../脑/模型连接.cjs'), { 创建隔离真实模型用量适配, 操作编号 } = require('../core/隔离真实模型用量适配.cjs'), { 创建异步假对话核心 } = require('../core/异步假对话核心.cjs')
const { 创建隔离输出标记 } = require('../core/隔离输出标记.cjs'), 原对话 = require('../脑/对话.cjs'), 原工具 = require('../脑/解析工具调用.cjs')
const output = 创建隔离输出标记({ 拆标记: 原对话.拆标记, 拆工具: x => 原工具.拆(x, () => null) })
const sample = require('./fixtures/渠道契约-v1.json').本人私聊, msg = { ...sample, 端点: { 渠道: 'fake', 账号: 'local-fixture' } }, time = '2026-10-28T00:00:00.000Z', ctx = { 内部对话编号: 'channel-a' }, roots = new Set([root]), actors = new Set(), tests = [], test = (n, fn) => tests.push([n, fn])
const credential = 创建严格凭据({ 读取: () => 'fixture-key-only-1234567890' }), prompt = ({ 输入 }) => [{ role: 'user', content: 输入 }]
function response(content = '好呀！[记住:你喜欢花]【经历：我们一起赏花】') { return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }], usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 } }), { headers: { 'content-type': 'application/json' } }) }
function fresh() { const d = 新建隔离盘库({ 用途: 'synthetic-sqlite-disk' }); d.关闭(); roots.add(d.目录); return { 用途: 'synthetic-sqlite-disk', 目录: d.目录 } }
async function start(o = fresh()) { const a = await 启动隔离存储Worker(o); actors.add(a); return a }
async function seed(a, enabled = true) { const f = 创建异步仓储门面(a); await f.会话.登记对话('channel-a', { 建于: time, 写长期记忆: enabled }, { 操作编号: 'chain-seed' }); return f }
async function setup(a, fetch函数) { const model = 创建真实模型连接({ 凭据: credential, fetch函数, 最大请求: 3 }); const adapter = await 创建隔离真实模型用量适配({ actor: a, 模型连接: model, 取现在: () => new Date(time) }); const core = 创建异步假对话核心({ actor: a, 模型连接: adapter, 拼提示: prompt, 输出标记: output, 取现在: () => new Date(time) }); return { model, adapter, core } }
async function phase(a) { const w = 内部Worker测试(a).worker; if (w.fixture.some(x => x.kind === 'phase')) return; await new Promise((resolve, reject) => { const t = setTimeout(() => reject(Error('PHASE_TIMEOUT')), 10000); w.on('fixture', function got(m) { if (m.kind === 'phase') { clearTimeout(t); w.off('fixture', got); resolve() } }) }) }
test('同Worker假HTTP先记账，再原子保存聊天和记忆，重放不再次请求', async () => {
  const a = await start(), f = await seed(a); let calls = 0, adapter; const chain = await setup(a, async () => { calls++; assert.deepEqual((await adapter.读取用量()).数据.map(x => x.状态), ['started']); return response() }); adapter = chain.adapter
  assert.equal((await chain.core.处理(msg, ctx)).正文, '好呀！'); assert.equal((await chain.core.处理(msg, ctx)).正文, '好呀！'); assert.equal(calls, 1); assert.deepEqual((await adapter.读取用量()).数据.map(x => x.状态), ['started', 'succeeded']); assert.equal((await f.会话.取统计()).轮次数, 1); assert.equal((await f.记忆.列长期({ 类别: '事实' })).列表[0].内容, '你喜欢花'); assert.equal((await f.记忆.列长期({ 类别: '经历' })).列表[0].内容, '我们一起赏花'); await chain.core.关闭()
})
test('关闭记忆只保存聊天，不保存模型标记', async () => {
  const a = await start(), f = await seed(a, false), { core, adapter } = await setup(a, async () => response()); assert.equal((await core.处理(msg, ctx)).正文, '好呀！'); assert.equal((await f.会话.取统计()).轮次数, 1); assert.equal((await f.记忆.取统计()).长期数, 0); assert.deepEqual((await adapter.读取用量()).数据.map(x => x.状态), ['started', 'succeeded']); await core.关闭()
})
test('未授权适配器、跨Worker和重复领取拒绝', async () => {
  const a = await start(), b = await start(); let calls = 0; const model = 创建真实模型连接({ 凭据: credential, fetch函数: async () => { calls++; return response() } }); assert.throws(() => 创建异步假对话核心({ actor: a, 模型连接: model, 拼提示: prompt }), { message: 'ASYNC_FAKE_CORE_DEPENDENCY_INVALID' })
  const adapter = await 创建隔离真实模型用量适配({ actor: a, 模型连接: model }); assert.throws(() => 创建异步假对话核心({ actor: b, 模型连接: adapter, 拼提示: prompt }), { message: 'ASYNC_FAKE_CORE_DEPENDENCY_INVALID' }); const core = 创建异步假对话核心({ actor: a, 模型连接: adapter, 拼提示: prompt }); assert.throws(() => 创建异步假对话核心({ actor: a, 模型连接: adapter, 拼提示: prompt }), { message: 'ASYNC_FAKE_CORE_DEPENDENCY_INVALID' }); assert.equal(calls, 0); await core.关闭()
})
test('HTTP失败记录unknown，不保存聊天或记忆', async () => {
  const a = await start(), f = await seed(a), { core, adapter } = await setup(a, async () => new Response('fixture', { status: 429 })); await assert.rejects(core.处理(msg, ctx), { message: 'CORE_RATE_LIMITED' }); assert.deepEqual((await adapter.读取用量()).数据.map(x => x.状态), ['started', 'unknown']); assert.equal((await f.会话.取统计()).轮次数, 0); assert.equal((await f.记忆.取统计()).长期数, 0); await core.关闭()
})
test('模型成功后记忆版本竞争，失败轮次不能再次自动请求', async () => {
  const a = await start(), f = await seed(a); let ready, release, calls = 0; const begun = new Promise(r => { ready = r }), wait = new Promise(r => { release = r }); const { core, adapter } = await setup(a, async () => { calls++; ready(); await wait; return response() })
  const p = core.处理(msg, ctx), bad = assert.rejects(p, { message: 'SQLITE_MEMORY_VERSION_CONFLICT' }); await begun; await f.记忆.新增长期({ 操作编号: 'chain-competition', 时间: time, 预期版本: 0, 类别: '事实', 内容: '你喜欢茶' }); release(); await bad; await assert.rejects(core.处理(msg, ctx), { message: 'ASYNC_FAKE_CORE_STORE_UNKNOWN' }); assert.equal(calls, 1); assert.equal((await f.会话.取统计()).轮次数, 0); assert.equal((await f.记忆.取统计()).长期数, 1); assert.deepEqual((await adapter.读取用量()).数据.map(x => x.状态), ['started', 'succeeded']); await core.关闭()
})
for (const stage of ['before', 'after']) for (const terminal of [false, true]) test((terminal ? '终态' : '开始') + stage + '中断保留可查回执且不写聊天记忆', async () => {
  const o = fresh(), initial = await start(o); const seedFacade = await seed(initial); await seedFacade.会话.登记对话('fixture-target', { 建于: time }, { 操作编号: 'fault-seed' }); await initial.关闭(); injection = { stage, ...(terminal ? { skip: 1 } : {}) }; const a = await start(o); let calls = 0, failure; const { core } = await setup(a, async () => { calls++; return response() })
  const p = core.处理(msg, ctx), bad = assert.rejects(p, e => { failure = e; return e.状态 === 'unknown' && !!e.请求编号 }); void bad.catch(() => {}); await phase(a); await 内部Worker测试(a).worker.terminate(); await bad; assert.equal(calls, terminal ? 1 : 0); await a.恢复(); assert.equal(!!(await a.查询回执(操作编号(failure.请求编号, failure.记账阶段))), stage === 'after'); await assert.rejects(core.处理(msg, ctx), { message: 'ASYNC_FAKE_CORE_STORE_UNKNOWN' }); const f = 创建异步仓储门面(a); assert.equal((await f.会话.取统计()).轮次数, 0); assert.equal((await f.记忆.取统计()).长期数, 0); await assert.rejects(core.关闭(), { message: 'SQLITE_STATE_CAPABILITY_INVALID' })
})
test('关闭期间迟到HTTP不保存聊天或记忆', async () => {
  const a = await start(), f = await seed(a); let ready, release; const begun = new Promise(r => { ready = r }), wait = new Promise(r => { release = r }), { core } = await setup(a, async () => { ready(); await wait; return response() }); const p = core.处理(msg, ctx), bad = assert.rejects(p, { message: 'ASYNC_FAKE_CORE_ABORTED' }); await begun; await core.关闭(); await bad; release(); await new Promise(setImmediate); assert.equal((await f.会话.取统计()).轮次数, 0); assert.equal((await f.记忆.取统计()).长期数, 0)
})
;(async () => { let passed = 0; try { for (const [name, fn] of tests) { try { await fn(); passed++; console.log('PASS ' + name) } catch (e) { process.exitCode = 1; console.error('FAIL ' + name, e) } } console.log(`S16D3 isolated real model conversation: ${passed}/${tests.length}; fake HTTP only`) } finally { for (const a of actors) try { await a.关闭() } catch {} for (const dir of roots) { const real = fs.realpathSync(dir); if (path.dirname(real) !== fs.realpathSync(os.tmpdir()) || !/^elysia-(sqlite-disk|S16D3-chain-fixture)-[a-zA-Z0-9]+$/u.test(path.basename(real)) || fs.lstatSync(dir).isSymbolicLink()) throw Error('CLEANUP_OUTSIDE'); fs.rmSync(real, { recursive: true, force: true }) } wt.Worker = NativeWorker } })()
