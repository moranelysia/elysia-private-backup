'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), wt = require('node:worker_threads'), cp = require('node:child_process')
const envRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elysia-S16-graph-fixture-'))
for (const [k, v] of Object.entries({ ELYSIA_WORKSPACE_ROOT: envRoot, ELYSIA_CONFIG_FILE: path.join(envRoot, 'absent.json'), ELYSIA_DATA_DIR: path.join(envRoot, 'data'), ELYSIA_CACHE_DIR: path.join(envRoot, 'cache') })) process.env[k] = v
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
const { 新建隔离盘库 } = require('../storage/sqlite-disk.cjs'), { 启动隔离存储Worker, 内部Worker测试 } = require('../storage/sqlite-worker.cjs'), { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs'), { 创建异步关系图 } = require('../core/异步关系图.cjs'), { 创建关系图库 } = require('../脑/记忆关系图.cjs')
const roots = new Set([envRoot]), actors = new Set(), tests = [], test = (n, f) => tests.push([n, f]), time = '2026-10-27T00:00:00.000Z'
function fresh() { const d = 新建隔离盘库({ 用途: 'synthetic-sqlite-disk' }); d.关闭(); roots.add(d.目录); return { 用途: 'synthetic-sqlite-disk', 目录: d.目录 } }
async function start(o = fresh()) { const a = await 启动隔离存储Worker(o); actors.add(a); return a }
async function add(f, id, 类别 = '事实') { const s = await f.记忆.取统计(); return f.记忆.新增长期({ 操作编号: id, 时间: time, 预期版本: s.版本, 类别, 内容: '我们一起听了曲子 ' + id }) }
async function setup(o) {
  const a = await start(o), f = 创建异步仓储门面(a), x = await add(f, 'long-a'), y = await add(f, 'long-b', '经历')
  let count = 0; const options = { 创建关系图库, 现在: () => new Date(time), 造编号: () => 'relation-fixture-' + (++count) }
  const g = await 创建异步关系图(a, options), edge = { 类型: '先于', 从: { 类别: '事实', 编号: x.目标编号 }, 到: { 类别: '经历', 编号: y.目标编号 } }
  return { a, f, x, y, g, edge, options }
}
async function phase(a) { const w = 内部Worker测试(a).worker; if (w.fixture.some(x => x.kind === 'phase')) return; await new Promise((resolve, reject) => { const t = setTimeout(() => reject(Error('PHASE_TIMEOUT')), 10000); w.on('fixture', function got(m) { if (m.kind === 'phase') { clearTimeout(t); w.off('fixture', got); resolve() } }) }) }
test('旧图库规则执行新增、查询、一跳、修改、删除及抑制', async () => {
  const { g, edge } = await setup(), p = await g.准备('新增', edge), added = await g.提交(p, { 操作编号: 'edge-add' }); assert.equal(added.好, true)
  let view = await g.读取('查询'); assert.equal(view.节点.length, 2); assert.equal(view.关系.length, 1); const n = await g.读取('读取已保存一跳', { 种子: [edge.从] }); assert.equal(n.邻接.length, 1)
  const change = await g.准备('修改', { 编号: added.关系.编号, 类型: '后续发展' }); assert.equal((await g.提交(change, { 操作编号: 'edge-edit' })).关系.类型, '后续发展')
  await g.提交(await g.准备('删除', added.关系.编号), { 操作编号: 'edge-delete' }); view = await g.读取('查询'); assert.equal(view.关系.length, 0)
  assert.deepEqual(await g.提交(p, { 操作编号: 'edge-add' }), added); assert.equal((await g.读取('查询')).关系.length, 0)
})
test('布局和自动候选规则保留，错误/低置信度候选不写入', async () => {
  const { g, edge } = await setup(), bad = await g.准备('应用自动候选', { 候选们: [{ ...edge, 置信度: 0.5 }] }); assert.equal(bad.改变, false); assert.equal((await g.提交(bad, { 操作编号: 'noop' })).新增数, 0)
  const layout = await g.准备('保存布局', { 节点: { ['事实:' + edge.从.编号]: { x: 45, y: 55 } }, 视图: { x: 2, y: 3, 缩放: 1 } }); await g.提交(layout, { 操作编号: 'layout-save' }); assert.equal((await g.读取('查询')).布局.节点['事实:' + edge.从.编号].x, 45)
  const ok = await g.准备('应用自动候选', { 候选们: [{ ...edge, 置信度: 1, 关联置信度: 0.9 }], 规则版本: 'fixture' }); assert.equal((await g.提交(ok, { 操作编号: 'auto-edge' })).新增数, 1)
})
test('准备后长期记忆改变，图谱事务内拒绝旧版本且不留回执', async () => {
  const { a, f, g, edge, y } = await setup(), p = await g.准备('新增', edge), stat = await f.记忆.取统计()
  await f.记忆.人工遗忘长期({ 操作编号: 'forget-b', 时间: time, 预期版本: stat.版本, 类别: '经历', 编号: y.目标编号 })
  await assert.rejects(g.提交(p, { 操作编号: 'stale-memory' }), { message: 'SQLITE_STATE_MEMORY_VERSION_CONFLICT' }); assert.equal(await a.查询回执('stale-memory'), null); assert.equal((await g.读取('查询')).关系.length, 0)
})
test('并发图谱版本冲突不覆盖已保存关系', async () => {
  const { a, f, g, edge } = await setup(), p = await g.准备('新增', edge), raw = await f.状态.打开后端('relations')
  await raw.保存快照({ 格式版本: 2, 关系: [], 自动抑制: [], 扩展: true }, { 预期版本: 0, 操作编号: 'concurrent-graph' })
  await assert.rejects(g.提交(p, { 操作编号: 'stale-graph' }), { message: 'SQLITE_STATE_VERSION_CONFLICT' }); assert.equal(await a.查询回执('stale-graph'), null); assert.equal((await raw.读取快照()).数据.扩展, true)
})
test('大关系快照分段读写并保留历史未知字段', async () => {
  const { f, g, edge } = await setup(), raw = await f.状态.打开后端('relations'), value = { 格式版本: 2, 关系: [], 自动抑制: [], 扩展: '花'.repeat(100000) }
  await raw.保存分段快照(value, { 预期版本: 0, 操作编号: 'large-graph-seed' }); await g.提交(await g.准备('新增', edge), { 操作编号: 'large-graph-edit' }); assert.equal((await raw.读取分段快照()).数据.扩展, value.扩展)
})
test('长期记忆分页遍历超过50条，不猜编号、不漏条', async () => {
  const a = await start(), f = 创建异步仓储门面(a); for (let i = 0; i < 52; i++) await add(f, 'page-' + i)
  const g = await 创建异步关系图(a, { 创建关系图库 }); assert.equal((await g.读取('查询')).节点.length, 52)
  const raw = await f.状态.打开后端('relations'), first = await raw.读取图谱记忆页(); assert.equal(first.还有, true); await add(f, 'page-later')
  await assert.rejects(raw.读取图谱记忆页({ 版本: first.版本, 游标: first.游标 }), { message: 'SQLITE_STATE_MEMORY_VERSION_CONFLICT' })
})
test('图谱节点沿用旧长期记忆时间和编号排序', async () => {
  const a = await start(), f = 创建异步仓储门面(a), dates = ['2026-01-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z']
  for (let i = 0; i < dates.length; i++) await f.记忆.新增长期({ 操作编号: 'date-' + i, 时间: dates[i], 预期版本: i, 类别: i === 1 ? '经历' : '事实', 内容: '我们一起记下日期 ' + i })
  const g = await 创建异步关系图(a, { 创建关系图库 }), view = await g.读取('查询'); assert.deepEqual(view.节点.map(x => x.时间), [dates[1], dates[2], dates[0]])
})
test('无变化计划在长期记忆变更后不能当成当前结果', async () => {
  const { a, f, g, edge } = await setup(), p = await g.准备('新增', edge); await g.提交(p, { 操作编号: 'initial-edge' })
  const noChange = await g.准备('新增', edge); assert.equal(noChange.改变, false); await add(f, 'later-long')
  await assert.rejects(g.提交(noChange, { 操作编号: 'stale-noop' }), { message: 'ASYNC_GRAPH_VERSION_CONFLICT' }); assert.equal(await a.查询回执('stale-noop'), null)
})
test('隔离Worker审计阻断业务配置、模型、网络和根外正文读取', async () => {
  injection = { audit: true }; const { g, edge } = await setup(); await g.提交(await g.准备('新增', edge), { 操作编号: 'audit-graph' }); assert.equal((await g.读取('查询')).关系.length, 1)
})
test('非法方法、伪造计划、错误目标记忆页及关闭均拒绝', async () => {
  const { a, f, g } = await setup(); await assert.rejects(g.准备('不存在', {})); await assert.rejects(g.提交({}, { 操作编号: 'forged' })); const b = await f.状态.打开后端('relation-layout'); await assert.rejects(b.读取图谱记忆页()); assert.equal(await a.查询回执('forged'), null); await g.关闭(); await assert.rejects(g.读取('查询'), { message: 'ASYNC_GRAPH_CLOSED' })
})
test('同一Worker并发准备的计划有上限，释放后不可再提交', async () => {
  const { g } = await setup(), results = await Promise.allSettled(Array.from({ length: 17 }, () => g.准备('删除', '不存在')))
  const ok = results.filter(x => x.status === 'fulfilled'); assert.equal(ok.length, 16); assert.equal(results.filter(x => x.status === 'rejected' && x.reason.message === 'ASYNC_GRAPH_PLAN_LIMIT').length, 1)
  g.释放计划(ok[0].value); await assert.rejects(g.提交(ok[0].value, { 操作编号: 'released' }), { message: 'ASYNC_GRAPH_PLAN_INVALID' }); assert.ok(await g.准备('删除', '不存在'))
})
test('独立Node重开后图谱和记忆仍可一起读取', async () => {
  const o = fresh(), { a, g, edge } = await setup(o); await g.提交(await g.准备('新增', edge), { 操作编号: 'graph-reopen' }); await a.关闭()
  const source = "const {启动隔离存储Worker}=require('./storage/sqlite-worker.cjs'),{创建异步关系图}=require('./core/异步关系图.cjs'),{创建关系图库}=require('./脑/记忆关系图.cjs');(async()=>{const a=await 启动隔离存储Worker({用途:'synthetic-sqlite-disk',目录:process.argv[1]});try{const g=await 创建异步关系图(a,{创建关系图库}),x=await g.读取('查询');process.stdout.write(JSON.stringify({节点:x.节点.length,关系:x.关系.length}))}finally{await a.关闭()}})().catch(()=>{process.stderr.write('GRAPH_READER_FAILED');process.exitCode=1})"
  const child = cp.spawnSync(process.execPath, ['-e', source, o.目录], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 15000 }); assert.equal(child.status, 0, child.stderr); assert.deepEqual(JSON.parse(child.stdout), { 节点: 2, 关系: 1 })
})
for (const stage of ['before', 'after']) test('图谱提交'+stage+'实际终止后查回执并重传旧计划', async () => {
  const o = fresh(), initial = await setup(o); await initial.f.会话.登记对话('fixture-target', { 建于: time }, { 操作编号: 'fixture' }); await initial.a.关闭(); injection = { stage }
  const a = await start(o), f = 创建异步仓储门面(a), g = await 创建异步关系图(a, initial.options), p = await g.准备('新增', initial.edge), pending = g.提交(p, { 操作编号: 'graph-unknown' }), bad = assert.rejects(pending, e => e.状态 === 'unknown')
  await phase(a); await 内部Worker测试(a).worker.terminate(); await bad; await a.恢复(); const receipt = await a.查询回执('graph-unknown'); assert.equal(receipt !== null, stage === 'after')
  const next = await 创建异步关系图(a, initial.options); assert.equal((await next.提交(p, { 操作编号: 'graph-unknown' })).好, true); assert.equal((await next.读取('查询')).关系.length, 1)
})
;(async () => { let pass = 0; try { for (const [n, f] of tests) { try { await f(); pass++; console.log('PASS ' + n) } catch (e) { console.error('FAIL ' + n, e); process.exitCode = 1 } } console.log(`SQLite S-16D2B3B: ${pass}/${tests.length}; async graph domain only`) } finally { for (const a of actors) try { await a.关闭() } catch {} for (const r of roots) { const real = fs.realpathSync(r); if (path.dirname(real) !== fs.realpathSync(os.tmpdir()) || !/^elysia-(sqlite-disk|S16-graph-fixture)-[a-zA-Z0-9]+$/u.test(path.basename(real)) || fs.lstatSync(r).isSymbolicLink()) throw Error('CLEANUP_OUTSIDE'); fs.rmSync(real, { recursive: true, force: true }) } wt.Worker = NativeWorker } })()
