'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), wt = require('node:worker_threads'), { randomUUID } = require('node:crypto')
const envRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elysia-S16-usage-fixture-'))
for (const [k, v] of Object.entries({ ELYSIA_WORKSPACE_ROOT: envRoot, ELYSIA_CONFIG_FILE: path.join(envRoot, 'absent.json'), ELYSIA_DATA_DIR: path.join(envRoot, 'data'), ELYSIA_CACHE_DIR: path.join(envRoot, 'cache'), TZ: 'Asia/Shanghai' })) process.env[k] = v
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
const { 新建隔离盘库 } = require('../storage/sqlite-disk.cjs'), { 启动隔离存储Worker, 内部Worker测试 } = require('../storage/sqlite-worker.cjs'), { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs'), { 创建异步用量 } = require('../core/异步用量.cjs'), 原用量 = require('../脑/用量.cjs')
const roots = new Set([envRoot]), actors = new Set(), tests = [], test = (n, f) => tests.push([n, f]), iso = '2026-10-27T00:00:00.000Z', local = '2026-10-27 08:00'
const usage = { prompt_tokens: 10000, prompt_cache_hit_tokens: 8000, completion_tokens: 2000 }
const event = (状态 = 'started', 用量 = null, 代码 = null, 请求编号 = randomUUID()) => ({ 请求编号, 模型: 'deepseek-flash', 状态, 代码, 用量 })
const desktop = a => 创建异步用量(a, { 用途: 'desktop', 算钱: 原用量.算钱, 哪一天: 原用量.哪一天 })
const headless = a => 创建异步用量(a, { 用途: 'headless' })
function fresh() { const d = 新建隔离盘库({ 用途: 'synthetic-sqlite-disk' }); d.关闭(); roots.add(d.目录); return { 用途: 'synthetic-sqlite-disk', 目录: d.目录 } }
async function start(o = fresh()) { const a = await 启动隔离存储Worker(o); actors.add(a); return a }
async function seed(a) { await 创建异步仓储门面(a).会话.登记对话('fixture-target', { 建于: iso }, { 操作编号: 'seed-fixture' }) }
async function phase(a) { const w = 内部Worker测试(a).worker; if (w.fixture.some(x => x.kind === 'phase')) return; await new Promise((resolve, reject) => { const t = setTimeout(() => reject(Error('PHASE_TIMEOUT')), 10000); w.on('fixture', function got(m) { if (m.kind === 'phase') { clearTimeout(t); w.off('fixture', got); resolve() } }) }) }
test('桌面记录复用现有算钱规则和本地时间，原ID重试不重复', async () => {
  const a = await start(), d = await desktop(a), p = await d.准备记录(usage, { 时间: local }), r = await d.提交(p, { 操作编号: 'desktop-one' }); assert.deepEqual(r.账, 原用量.算钱(usage)); assert.equal(r.版本, 1); assert.deepEqual(await d.提交(p, { 操作编号: 'desktop-one' }), r)
  const rows = (await d.读取()).数据; assert.equal(rows.length, 1); assert.equal(rows[0].时间, local); assert.equal(rows[0].元, Number(原用量.算钱(usage).合计.toFixed(8)))
})
test('真实原桌面汇总规则与隔离账本一致，保留旧ISO/本地时间及未知字段', async () => {
  const a = await start(), f = 创建异步仓储门面(a), raw = await f.状态.打开后端('usage', 'desktop'), today = 原用量.哪一天(new Date()), rows = [{ 时间: today + ' 08:00', 输入: 100, 命中: 40, 未命中: 60, 输出: 2, 元: 0.1, 扩展: null }, { 时间: today + 'T00:00:00.000Z', 输入: 10, 命中: 0, 未命中: 10, 输出: 1, 元: 0.01 }, { 时间: '2020-01-01 01:01', 输入: 5, 命中: 1, 未命中: 4, 输出: 1, 元: 0.005 }, { 不计费: true }]
  await raw.保存分段快照(rows, { 预期版本: 0, 操作编号: 'history' }); const d = await desktop(a); fs.mkdirSync(path.dirname(原用量.用量文件), { recursive: true }); fs.writeFileSync(原用量.用量文件, rows.map(x => JSON.stringify(x)).join('\n') + '\n')
  assert.deepEqual(await d.汇总({ 当前日期: today, 最近一次: 原用量.算钱(usage) }), 原用量.汇总(原用量.算钱(usage))); assert.deepEqual((await d.读取()).数据[0].扩展, null)
})
test('无界面started/succeeded/unknown保留原格式，不编造金额或零用量', async () => {
  const a = await start(), h = await headless(a), id = randomUUID(), a1 = event('started', null, null, id), a2 = event('succeeded', { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 }, null, id), a3 = event('unknown', null, 'CORE_TIMEOUT', randomUUID()), a4 = event('succeeded', null, null, randomUUID())
  for (const [i, x] of [a1, a2, a3, a4].entries()) await h.提交(await h.准备记录(x, { 时间: iso }), { 操作编号: 'headless-' + i })
  const rows = (await h.读取()).数据; assert.deepEqual(rows.map(x => x.状态), ['started', 'succeeded', 'unknown', 'succeeded']); assert.equal(rows[2].用量, null); assert.equal(rows[3].用量, null); assert.equal(Object.hasOwn(rows[2], '元'), false); assert.equal(h.汇总, undefined)
})
test('并发追加版本冲突，确认未提交后重新准备；旧成功重试不覆盖后来记录', async () => {
  const a = await start(), x = await desktop(a), y = await desktop(a), p = await x.准备记录(usage, { 时间: local }), q = await y.准备记录(usage, { 时间: local }), saved = await x.提交(p, { 操作编号: 'race-a' })
  await assert.rejects(y.提交(q, { 操作编号: 'race-b' }), { message: 'SQLITE_STATE_VERSION_CONFLICT' }); assert.equal(await a.查询回执('race-b'), null); await y.提交(await y.准备记录(usage, { 时间: local }), { 操作编号: 'race-b' }); assert.deepEqual(await x.提交(p, { 操作编号: 'race-a' }), saved); assert.equal((await x.读取()).数据.length, 2)
})
test('两种账本隔离、跨用途计划/同ID异内容拒绝', async () => {
  const a = await start(), d = await desktop(a), h = await headless(a), p = await d.准备记录(usage, { 时间: local }); await assert.rejects(h.提交(p, { 操作编号: 'wrong-scope' }), { message: 'ASYNC_USAGE_PLAN_INVALID' })
  await d.提交(p, { 操作编号: 'shared-id' }); await assert.rejects(h.提交(await h.准备记录(event(), { 时间: iso }), { 操作编号: 'shared-id' }), { message: 'SQLITE_WORKER_ID_CONFLICT' }); assert.equal((await h.读取()).数据.length, 0); assert.equal((await d.读取()).数据.length, 1)
})
test('超过单次读取上限的历史账本可追加并汇总，不丢未知字段', async () => {
  const a = await start(), f = 创建异步仓储门面(a), raw = await f.状态.打开后端('usage', 'desktop'), rows = Array.from({ length: 800 }, () => ({ 时间: local, 输入: 1, 命中: 1, 未命中: 0, 输出: 1, 元: 0.01, 扩展: '花'.repeat(120) }))
  await raw.保存分段快照(rows, { 预期版本: 0, 操作编号: 'large-seed' }); await assert.rejects(raw.读取快照(), { message: 'SQLITE_WORKER_RESULT_LIMIT' }); const d = await desktop(a); await d.提交(await d.准备记录(usage, { 时间: local }), { 操作编号: 'large-add' }); const x = await d.读取(); assert.equal(x.数据.length, 801); assert.equal(x.数据[0].扩展, rows[0].扩展); assert.equal((await d.汇总({ 当前日期: '2026-10-27' })).今天.次数, 801)
})
test('不合约事件、错误时间、伪造计划、getter及关闭失败均不写', async () => {
  const a = await start(), h = await headless(a), d = await desktop(a); await assert.rejects(h.准备记录({ ...event(), 私密: '不应记录' }, { 时间: iso })); await assert.rejects(h.准备记录(event('unknown', { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }), { 时间: iso })); await assert.rejects(h.准备记录(event('unknown', null, 'CORE_UNLISTED'), { 时间: iso })); await assert.rejects(d.准备记录(usage, { 时间: '2026-02-30 10:10' })); await assert.rejects(d.提交({}, { 操作编号: 'forged' })); let calls = 0; await assert.rejects(d.准备记录(usage, { get 时间() { calls++; return local } })); assert.equal(calls, 0); assert.equal((await h.读取()).数据.length, 0); await d.关闭(); await assert.rejects(d.读取(), { message: 'ASYNC_USAGE_CLOSED' })
})
test('每Worker最多16份未释放计划，释放后旧计划失效', async () => {
  const a = await start(), d = await desktop(a), list = []; for (let i = 0; i < 16; i++) list.push(await d.准备记录(usage, { 时间: local })); await assert.rejects(d.准备记录(usage, { 时间: local }), { message: 'ASYNC_USAGE_PLAN_LIMIT' }); d.释放计划(list[0]); await assert.rejects(d.提交(list[0], { 操作编号: 'released' }), { message: 'ASYNC_USAGE_PLAN_INVALID' }); assert.ok(await d.准备记录(usage, { 时间: local }))
})
test('隔离Worker审计阻断业务配置、模型、网络及根外正文读取', async () => {
  injection = { audit: true }; const a = await start(), h = await headless(a); await h.提交(await h.准备记录(event(), { 时间: iso }), { 操作编号: 'usage-audit' }); assert.equal((await h.读取()).数据.length, 1)
})
test('独立Node重开后保留事件和状态，读取不触发模型', async () => {
  const o = fresh(), a = await start(o), h = await headless(a); await h.提交(await h.准备记录(event(), { 时间: iso }), { 操作编号: 'usage-reopen' }); await a.关闭()
  const src = "const {启动隔离存储Worker}=require('./storage/sqlite-worker.cjs'),{创建异步用量}=require('./core/异步用量.cjs');(async()=>{const a=await 启动隔离存储Worker({用途:'synthetic-sqlite-disk',目录:process.argv[1]});try{const b=await 创建异步用量(a,{用途:'headless'}),x=await b.读取();process.stdout.write(JSON.stringify({版本:x.版本,状态:x.数据.map(y=>y.状态)}))}finally{await a.关闭()}})().catch(()=>{process.stderr.write('USAGE_READER_FAILED');process.exitCode=1})"
  const child = cp.spawnSync(process.execPath, ['-e', src, o.目录], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 15000 }); assert.equal(child.status, 0, child.stderr); assert.deepEqual(JSON.parse(child.stdout), { 版本: 1, 状态: ['started'] })
})
for (const stage of ['before', 'after']) test('提交'+stage+'真实终止后查回执，新适配器重传旧计划', async () => {
  const o = fresh(), first = await start(o); await seed(first); await first.关闭(); injection = { stage }; const a = await start(o), h = await headless(a), p = await h.准备记录(event(), { 时间: iso }), pending = h.提交(p, { 操作编号: 'usage-unknown' }), bad = assert.rejects(pending, e => e.状态 === 'unknown')
  await phase(a); await 内部Worker测试(a).worker.terminate(); await bad; await a.恢复(); const receipt = await a.查询回执('usage-unknown'); assert.equal(receipt !== null, stage === 'after'); const next = await headless(a); assert.equal((await next.提交(p, { 操作编号: 'usage-unknown' })).版本, 1); assert.equal((await next.读取()).数据.length, 1)
})
;(async () => { let pass = 0; try { for (const [n, f] of tests) { try { await f(); pass++; console.log('PASS ' + n) } catch (e) { console.error('FAIL ' + n, e); process.exitCode = 1 } } console.log(`SQLite S-16D2B3C: ${pass}/${tests.length}; async usage domain only`) } finally { for (const a of actors) try { await a.关闭() } catch {} for (const r of roots) { const real = fs.realpathSync(r); if (path.dirname(real) !== fs.realpathSync(os.tmpdir()) || !/^elysia-(sqlite-disk|S16-usage-fixture)-[a-zA-Z0-9]+$/u.test(path.basename(real)) || fs.lstatSync(r).isSymbolicLink()) throw Error('CLEANUP_OUTSIDE'); fs.rmSync(real, { recursive: true, force: true }) } wt.Worker = NativeWorker } })()
