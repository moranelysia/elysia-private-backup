'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), wt = require('node:worker_threads'), { createHash } = require('node:crypto')
const envRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elysia-S16D2A-fixture-'))
for (const [key, value] of Object.entries({ ELYSIA_WORKSPACE_ROOT: envRoot, ELYSIA_CONFIG_FILE: path.join(envRoot, 'absent.json'), ELYSIA_DATA_DIR: path.join(envRoot, 'data'), ELYSIA_CACHE_DIR: path.join(envRoot, 'cache') })) process.env[key] = value
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
const { 新建隔离盘库 } = require('../storage/sqlite-disk.cjs'), { 启动隔离存储Worker, 内部Worker测试 } = require('../storage/sqlite-worker.cjs'), { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs'), { 场景 } = require('./fixtures/sqlite-backup-scenario.cjs')
const roots = new Set([envRoot]), actors = new Set(), tests = [], test = (name, fn) => tests.push([name, fn]), time = '2026-10-27T00:00:00.000Z'
const graph = () => ({ 格式版本: 2, 关系: [], 自动抑制: [], 扩展: { 空值: null, 原时间: '2026-09-01 19:03', 空串: '' } })
const layout = () => ({ 格式版本: 1, 节点: {}, 视图: { x: 18, y: 18, 缩放: 0.82 } })
function fresh() { const d = 新建隔离盘库({ 用途: 'synthetic-sqlite-disk' }); d.关闭(); roots.add(d.目录); return { 用途: 'synthetic-sqlite-disk', 目录: d.目录 } }
async function start(o = fresh()) { const a = await 启动隔离存储Worker(o); actors.add(a); return a }
async function setup(o) { const a = await start(o), f = 创建异步仓储门面(a), g = await f.状态.打开后端('relations'), l = await f.状态.打开后端('relation-layout'); return { a, f, g, l } }
const row = (b, 数据, 预期版本 = 0) => ({ 后端: b, 数据, 预期版本 })
async function phase(a) { const w = 内部Worker测试(a).worker; if (w.fixture.some(x => x.kind === 'phase')) return; await new Promise((resolve, reject) => { const t = setTimeout(() => reject(Error('PHASE_TIMEOUT')), 10000); w.on('fixture', function got(m) { if (m.kind === 'phase') { clearTimeout(t); w.off('fixture', got); resolve() } }) }) }
async function seed(a) { await 创建异步仓储门面(a).会话.登记对话('fixture-target', { 建于: time }, { 操作编号: 'register-fixture' }) }
let channels
async function channelData() {
  if (!channels) { const s = await 场景(); try { channels = ['channel-map', 'channel-tasks'].map(k => s.仓.状态.读取快照(k, 'fake').数据) } finally { s.仓.关闭() } }
  return structuredClone(channels)
}
test('只给登记目标和显式异步快照，不提供旧同步读取/保存或任意路径', async () => {
  const { f, g } = await setup(); assert.ok(Object.isFrozen(f.状态) && Object.isFrozen(g)); assert.equal(g.读取, undefined); assert.equal(g.保存, undefined)
  const p = g.读取快照(); assert.ok(p instanceof Promise); assert.deepEqual(await p, { 版本: 0, 数据: null })
  for (const [kind, id] of [['relations', '../secret'], ['private-diary', 'main'], ['background-state', 'private'], ['learning-index', 'main'], ['channel-tasks', 'fake\n']]) await assert.rejects(f.状态.打开后端(kind, id), { message: 'SQLITE_STATE_TARGET_FORBIDDEN' })
})
test('登记的辅助状态保留未知字段/旧时间/null，返回副本不能改盘', async () => {
  const { f, g } = await setup(), cases = [['extraction-buffer', 'main', { 版本: 1, 轮次: [], 扩展: null }], ['usage', 'headless', [{ 状态: 'ok', 扩展: null }]], ['work-index', 'main', [{ 扩展: '' }]], ['background-state', 'relations', { 原时间: '2026-10-01 19:03', 扩展: null }], ['cluster-state', 'timeline', { 扩展: null }]]
  await g.保存快照(graph(), { 预期版本: 0, 操作编号: 'graph-copy' }); const x = await g.读取快照(); x.数据.扩展.空值 = 'changed'; assert.equal((await g.读取快照()).数据.扩展.空值, null)
  for (let i = 0; i < cases.length; i++) { const [kind, id, data] = cases[i], b = await f.状态.打开后端(kind, id); await b.保存快照(data, { 预期版本: 0, 操作编号: 'aux-' + i }); assert.deepEqual((await b.读取快照()).数据, data) }
})
test('同版本竞争只一成功，成功回执幂等且无变更不增加版本', async () => {
  const { a, f, g } = await setup(), h = await f.状态.打开后端('relations'), m = { 预期版本: 0, 操作编号: 'cas-a' }, first = await g.保存快照(graph(), m)
  assert.deepEqual(await g.保存快照(graph(), m), first); const noChange = await h.保存快照(graph(), { 预期版本: 1, 操作编号: 'no-change' }); assert.equal(noChange.结果[0].版本, 1)
  const all = await Promise.allSettled([g.保存快照({ ...graph(), 标记: 'a' }, { 预期版本: 1, 操作编号: 'race-a' }), h.保存快照({ ...graph(), 标记: 'b' }, { 预期版本: 1, 操作编号: 'race-b' })]); assert.equal(all.filter(x => x.status === 'fulfilled').length, 1)
  const lost = all[0].status === 'rejected' ? 'race-a' : 'race-b'; assert.equal(await a.查询回执(lost), null); assert.equal((await g.读取快照()).版本, 2)
})
test('多文档一次提交并保存整个原结果，重复返回首次结果', async () => {
  const { a, f, g, l } = await setup(), q = [row(g, graph()), row(l, layout())], r = await f.状态.保存快照组(q, { 操作编号: 'multi' })
  assert.deepEqual(r.结果.map(x => x.版本), [1, 1]); assert.deepEqual((await a.查询回执('multi')).结果, r); assert.deepEqual(await f.状态.保存快照组(q, { 操作编号: 'multi' }), r)
})
test('后项版本冲突回滚前项、投影、版本和整组运行回执', async () => {
  const { a, f, g, l } = await setup(); await l.保存快照(layout(), { 预期版本: 0, 操作编号: 'layout-first' })
  await assert.rejects(f.状态.保存快照组([row(g, graph()), row(l, { ...layout(), 扩展: null })], { 操作编号: 'conflict-group' }), { message: 'SQLITE_STATE_VERSION_CONFLICT' }); assert.deepEqual(await g.读取快照(), { 版本: 0, 数据: null }); assert.equal((await l.读取快照()).版本, 1); assert.equal(await a.查询回执('conflict-group'), null)
})
test('后项非法结构不会留下前项，原校验器拒绝无效缓冲和渠道数据', async () => {
  const { a, f, g } = await setup(), b = await f.状态.打开后端('extraction-buffer')
  await assert.rejects(f.状态.保存快照组([row(g, graph()), row(b, { 版本: 1, 轮次: [{}] })], { 操作编号: 'bad-buffer' })); assert.equal((await g.读取快照()).版本, 0); assert.equal(await a.查询回执('bad-buffer'), null)
  const m = await f.状态.打开后端('channel-map', 'fake'); await assert.rejects(m.保存快照({ 版本: 1, 记录: [{}] }, { 预期版本: 0, 操作编号: 'bad-map' })); assert.equal((await m.读取快照()).数据, null)
  const t = await f.状态.打开后端('channel-tasks', 'fake'); await assert.rejects(t.保存快照({ 版本: 1, 端点: { 渠道: 'fake', 账号: 123 }, 最近发送于: null, 记录: [], 日志: [] }, { 预期版本: 0, 操作编号: 'bad-empty-endpoint' })); assert.equal((await t.读取快照()).数据, null)
})
test('同ID异内容/异目标拒绝，不以新令牌制造新业务身份', async () => {
  const { f, g, l } = await setup(); await g.保存快照(graph(), { 预期版本: 0, 操作编号: 'stable' }); await assert.rejects(g.保存快照({ ...graph(), 标记: 1 }, { 预期版本: 0, 操作编号: 'stable' }), { message: 'SQLITE_WORKER_ID_CONFLICT' }); await assert.rejects(l.保存快照(layout(), { 预期版本: 0, 操作编号: 'stable' }), { message: 'SQLITE_WORKER_ID_CONFLICT' })
})
test('重复目标/过大组/伪造或异门面后端均拒绝且不写盘', async () => {
  const { a, f, g } = await setup(); await assert.rejects(f.状态.保存快照组([row(g, graph()), row(g, graph())], { 操作编号: 'duplicate-target' }), { message: 'SQLITE_STATE_DUPLICATE_TARGET' }); await assert.rejects(f.状态.保存快照组(Array.from({ length: 17 }, () => row(g, graph())), { 操作编号: 'large' })); await assert.rejects(f.状态.保存快照组([row({}, graph())], { 操作编号: 'fake' })); await assert.rejects(创建异步仓储门面(a).状态.保存快照组([row(g, graph())], { 操作编号: 'foreign' })); assert.equal((await g.读取快照()).版本, 0)
})
test('任务强制独占，跨门面及原始命令不能开第二写者', async () => {
  const { a, f } = await setup(), b = await f.状态.打开后端('channel-tasks', 'fake'); assert.deepEqual(await b.读取快照(), { 版本: 0, 数据: null })
  await assert.rejects(f.状态.打开后端('channel-tasks', 'fake', { 独占: false }), { message: 'SQLITE_STATE_EXCLUSIVE_REQUIRED' }); await assert.rejects(创建异步仓储门面(a).状态.打开后端('channel-tasks', 'fake'), { message: 'SQLITE_STATE_LEASE_BUSY' }); await assert.rejects(a.调用({ 操作: '状态.打开后端', 参数: [{ 类型: 'channel-tasks', 编号: 'fake', 独占: true }] }), { message: 'SQLITE_STATE_LEASE_BUSY' })
  const p = b.关闭(); assert.equal(p, b.关闭()); await p; await assert.rejects(b.读取快照()); await f.状态.打开后端('channel-tasks', 'fake')
})
test('其他目标的显式独占也与现有非独占句柄互斥', async () => {
  const { f, g } = await setup(); await assert.rejects(f.状态.打开后端('relations', 'main', { 独占: true }), { message: 'SQLITE_STATE_LEASE_BUSY' }); await g.关闭(); const b = await f.状态.打开后端('relations', 'main', { 独占: true }); await assert.rejects(f.状态.打开后端('relations'), { message: 'SQLITE_STATE_LEASE_BUSY' }); await b.关闭(); await f.状态.打开后端('relations')
})
test('能力在回执重放前验证，关闭令牌/伪造/偷换目标不能读写', async () => {
  const a = await start(), opened = await a.调用({ 操作: '状态.打开后端', 参数: [{ 类型: 'relations', 编号: 'main', 独占: false }] }), scope = { 令牌: opened.令牌, 类型: 'relations', 编号: 'main' }, q = { 操作: '状态.保存快照组', 参数: [{ 写入: [{ ...scope, 数据: graph(), 预期版本: 0 }] }], 操作编号: 'raw-write' }
  await a.调用(q); await assert.rejects(a.调用({ 操作: '状态.读取快照', 参数: [{ ...scope, 类型: 'relation-layout' }] })); await a.调用({ 操作: '状态.关闭后端', 参数: [{ 令牌: scope.令牌 }] }); await assert.rejects(a.调用(q), { message: 'SQLITE_STATE_CAPABILITY_INVALID' }); await assert.rejects(a.调用({ 操作: '状态.读取快照', 参数: [{ ...scope, 令牌: 'guess' }] }))
})
test('能力数量有界，明确关闭后可重新分配', async () => {
  const a = await start(), f = 创建异步仓储门面(a), list = []
  for (let i = 0; i < 64; i++) list.push(await f.状态.打开后端('relations'))
  await assert.rejects(f.状态.打开后端('relations'), { message: 'SQLITE_STATE_HANDLE_LIMIT' }); await list[0].关闭(); await f.状态.打开后端('relations')
})
test('渠道映射/任务复用原契约，同组先写任务再写映射也原子一致', async () => {
  const { f } = await setup(), m = await f.状态.打开后端('channel-map', 'fake'), t = await f.状态.打开后端('channel-tasks', 'fake'), [md, td] = await channelData()
  await f.状态.保存快照组([row(t, td), row(m, md)], { 操作编号: 'channel-group' }); assert.deepEqual((await t.读取快照()).数据, td); assert.deepEqual((await m.读取快照()).数据, md)
})
test('缺映射或删仍被任务引用的映射拒绝，整组回滚', async () => {
  const { a, f, g } = await setup(), m = await f.状态.打开后端('channel-map', 'fake'), t = await f.状态.打开后端('channel-tasks', 'fake'), [md, td] = await channelData()
  await assert.rejects(f.状态.保存快照组([row(g, graph()), row(t, td)], { 操作编号: 'missing-map' }), { message: 'SQLITE_STATE_CHANNEL_MAP_MISSING' }); assert.equal((await g.读取快照()).版本, 0); assert.equal(await a.查询回执('missing-map'), null)
  await f.状态.保存快照组([row(m, md), row(t, td)], { 操作编号: 'linked' }); await assert.rejects(m.保存快照({ 版本: 1, 记录: [] }, { 预期版本: 1, 操作编号: 'erase-linked' }), { message: 'SQLITE_STATE_CHANNEL_MAP_MISSING' }); assert.deepEqual((await m.读取快照()).数据, md)
})
test('完整快照跨独立Node重开一致，不依赖旧租约或文件回落', async () => {
  const o = fresh(), a = await start(o), f = 创建异步仓储门面(a), [md, td] = await channelData(), list = [['relations', 'main', graph()], ['relation-layout', 'main', layout()], ['extraction-buffer', 'main', { 版本: 1, 轮次: [] }], ['usage', 'headless', [{ 状态: 'ok' }]], ['channel-map', 'fake', md], ['channel-tasks', 'fake', td]], entries = []
  for (const [k, id, data] of list) entries.push(row(await f.状态.打开后端(k, id), data)); await f.状态.保存快照组(entries, { 操作编号: 'persist-all' })
  const expected = []; for (const e of entries) expected.push(await e.后端.读取快照()); await a.关闭()
  const child = cp.spawnSync(process.execPath, [path.join(__dirname, 'fixtures/sqlite-state-worker-reader.cjs'), o.目录], { encoding: 'utf8', timeout: 15000 }); assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout).指纹, createHash('sha256').update(JSON.stringify(expected)).digest('hex'))
})
test('回执写入处故障使两份业务状态、投影和运行回执共同回滚', async () => {
  const o = fresh(), a = await start(o); await seed(a); await a.关闭(); injection = { stage: 'journal-fail' }; const { a: b, f, g, l } = await setup(o)
  await assert.rejects(f.状态.保存快照组([row(g, graph()), row(l, layout())], { 操作编号: 'journal-failure' })); assert.equal((await g.读取快照()).版本, 0); assert.equal((await l.读取快照()).版本, 0); assert.equal(await b.查询回执('journal-failure'), null)
})
for (const stage of ['before', 'after']) test('整组提交' + stage + '实际终止后unknown，旧能力失效，新能力可查回执并同ID续做', async () => {
  const o = fresh(), a = await start(o); await seed(a); await a.关闭(); injection = { stage }; const { a: b, f, g, l } = await setup(o), input = [row(g, graph()), row(l, layout())], pending = f.状态.保存快照组(input, { 操作编号: 'state-unknown' }), bad = assert.rejects(pending, e => e.状态 === 'unknown')
  await phase(b); await 内部Worker测试(b).worker.terminate(); await bad; await b.恢复(); await assert.rejects(g.读取快照(), { message: 'SQLITE_STATE_CAPABILITY_INVALID' }); await assert.rejects(f.状态.保存快照组(input, { 操作编号: 'state-unknown' }), { message: 'SQLITE_STATE_CAPABILITY_INVALID' })
  const r = await b.查询回执('state-unknown'); assert.equal(r !== null, stage === 'after'); const ng = await f.状态.打开后端('relations'), nl = await f.状态.打开后端('relation-layout'); assert.equal((await ng.读取快照()).版本, stage === 'after' ? 1 : 0)
  const retry = await f.状态.保存快照组([row(ng, graph()), row(nl, layout())], { 操作编号: 'state-unknown' }); assert.equal(retry.好, true); if (r) assert.deepEqual(retry, r.结果); assert.equal((await ng.读取快照()).版本, 1); assert.equal((await nl.读取快照()).版本, 1)
})
test('阻断业务配置/模型/网络及根外正文读取后状态写查仍可完成', async () => {
  injection = { audit: true }; const { f, g, l } = await setup(); await f.状态.保存快照组([row(g, graph()), row(l, layout())], { 操作编号: 'audited-states' }); assert.equal((await g.读取快照()).版本, 1)
})
test('既有大状态超过结果上限时明确拒读，不截断/补空或影响其他目标', async () => {
  const { 创建隔离仓储, 备份范围 } = require('../storage/sqlite-backup.cjs'), m = 创建隔离仓储({ 用途: 'synthetic-sqlite-repository' }); let pack
  try { const b = m.状态.创建后端('background-state', 'relations'); b.读取(); b.保存({ 虚构大样本: 'x'.repeat(270000) }); b.关闭(); pack = m.创建备份({ 时间: time, 外部文件: [], 必须文件: [] }, 备份范围) } finally { m.关闭() }
  const d = 新建隔离盘库({ 用途: 'synthetic-sqlite-disk' }, pack, 备份范围); d.关闭(); roots.add(d.目录)
  const a = await start({ 用途: 'synthetic-sqlite-disk', 目录: d.目录 }), f = 创建异步仓储门面(a), b = await f.状态.打开后端('background-state', 'relations'); await assert.rejects(b.读取快照(), { message: 'SQLITE_WORKER_RESULT_LIMIT' }); await assert.rejects(b.读取快照(), { message: 'SQLITE_WORKER_RESULT_LIMIT' }); assert.equal((await (await f.状态.打开后端('relations')).读取快照()).数据, null)
})
test('不执行getter、不造操作ID，超限/缺省/关闭失败不吞掉', async () => {
  const { a, f, g } = await setup(); let touched = 0; const bad = { 后端: g, 预期版本: 0, get 数据() { touched++; return graph() } }
  await assert.rejects(f.状态.保存快照组([bad], { 操作编号: 'getter' })); assert.equal(touched, 0); await assert.rejects(g.保存快照(graph(), { 预期版本: 0 })); await assert.rejects(g.保存快照({ ...graph(), 太长: 'x'.repeat(66000) }, { 预期版本: 0, 操作编号: 'large-state' }), { message: 'SQLITE_WORKER_INPUT_LIMIT' }); assert.equal((await g.读取快照()).版本, 0); await a.关闭(); await assert.rejects(g.读取快照(), { message: 'SQLITE_WORKER_UNAVAILABLE' }); await assert.rejects(g.关闭(), { message: 'SQLITE_WORKER_UNAVAILABLE' })
})
;(async () => {
  let pass = 0
  try { for (const [name, fn] of tests) { try { await fn(); pass++; console.log('PASS ' + name) } catch (e) { console.error('FAIL ' + name); console.error(e); process.exitCode = 1 } } console.log(`SQLite S-16D2A: ${pass}/${tests.length}; bounded state transactions only; no domain/core integration`) }
  finally { for (const a of actors) try { await a.关闭() } catch {} for (const r of roots) { const real = fs.realpathSync(r); if (path.dirname(real) !== fs.realpathSync(os.tmpdir()) || !/^elysia-(sqlite-disk|S16D2A-fixture)-[a-zA-Z0-9]+$/u.test(path.basename(real)) || fs.lstatSync(r).isSymbolicLink()) throw Error('CLEANUP_OUTSIDE'); fs.rmSync(real, { recursive: true, force: true }) } wt.Worker = NativeWorker }
})()
