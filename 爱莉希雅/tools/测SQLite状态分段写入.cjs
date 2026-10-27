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
const { 新建隔离盘库 } = require('../storage/sqlite-disk.cjs'), { 启动隔离存储Worker, 内部Worker测试 } = require('../storage/sqlite-worker.cjs'), { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs')
const roots = new Set(), actors = new Set(), tests = [], test = (n, f) => tests.push([n, f])
const big = () => ({ 内容: '樱花🌸'.repeat(50000), 空: null, 旧时间: '2026-09-01 19:03' })
function fresh() { const d = 新建隔离盘库({ 用途: 'synthetic-sqlite-disk' }); d.关闭(); roots.add(d.目录); return { 用途: 'synthetic-sqlite-disk', 目录: d.目录 } }
async function start(o = fresh()) { const a = await 启动隔离存储Worker(o); actors.add(a); return a }
async function setup(o) { const a = await start(o), f = 创建异步仓储门面(a), b = await f.状态.打开后端('background-state', 'relations'), c = await f.状态.打开后端('cluster-state', 'timeline'); return { a, f, b, c } }
const row = (b, data, version = 0) => ({ 后端: b, 数据: data, 预期版本: version })
async function seed(a) { await 创建异步仓储门面(a).会话.登记对话('fixture-target', { 建于: '2026-10-27T00:00:00.000Z' }, { 操作编号: 'register-fixture' }) }
async function phase(a) { const w = 内部Worker测试(a).worker; if (w.fixture.some(x => x.kind === 'phase')) return; await new Promise((resolve, reject) => { const t = setTimeout(() => reject(Error('PHASE_TIMEOUT')), 10000); w.on('fixture', function got(m) { if (m.kind === 'phase') { clearTimeout(t); w.off('fixture', got); resolve() } }) }) }
test('两份大状态一次事务提交，完整读回和原回执幂等', async () => {
  const { a, f, b, c } = await setup(), q = [row(b, big()), row(c, { ...big(), 序号: 2 })], r = await f.状态.保存分段快照组(q, { 操作编号: 'multi-large' })
  assert.deepEqual(r.结果.map(x => x.版本), [1, 1]); assert.deepEqual((await b.读取分段快照()).数据, big()); assert.deepEqual(await f.状态.保存分段快照组(q, { 操作编号: 'multi-large' }), r); const receipt = await a.查询回执('multi-large'); assert.deepEqual(receipt.结果, r); assert.equal(JSON.stringify(receipt).includes('樱花'), false); assert.equal(JSON.stringify(receipt).includes('令牌'), false)
  await assert.rejects(f.状态.保存分段快照组([row(b, { ...big(), 差异: true }), q[1]], { 操作编号: 'multi-large' }), { message: 'SQLITE_WORKER_ID_CONFLICT' })
})
test('后项版本冲突使整组回滚，不留新数据和回执', async () => {
  const { a, f, b, c } = await setup(); await c.保存快照({ 保留: true }, { 预期版本: 0, 操作编号: 'seed-c' })
  await assert.rejects(f.状态.保存分段快照组([row(b, big()), row(c, big())], { 操作编号: 'large-conflict' }), { message: 'SQLITE_STATE_VERSION_CONFLICT' }); assert.equal((await b.读取快照()).版本, 0); assert.deepEqual((await c.读取快照()).数据, { 保留: true }); assert.equal(await a.查询回执('large-conflict'), null)
  await b.保存分段快照(big(), { 预期版本: 0, 操作编号: 'after-reject' }); assert.equal((await b.读取分段快照()).版本, 1)
})
test('片段只存内存：不完整、顺序错误、伪造能力或哈希错误不能提交', async () => {
  const { a } = await setup(), h = await a.调用({ 操作: '状态.打开后端', 参数: [{ 类型: 'relations', 编号: 'main', 独占: false }] }), data = Buffer.from('{"格式版本":2,"关系":[],"自动抑制":[]}'), spec = { 令牌: h.令牌, 类型: h.类型, 编号: h.编号, 预期版本: 0, 字节数: data.length, 指纹: createHash('sha256').update(data).digest('hex') }
  const u = (await a.调用({ 操作: '状态.开始分段', 参数: [{ 写入: [spec] }] })).上传
  await assert.rejects(a.调用({ 操作: '状态.开始分段', 参数: [{ 写入: [spec] }] }), { message: 'SQLITE_STATE_UPLOAD_BUSY' })
  await assert.rejects(a.调用({ 操作: '状态.写入分段', 参数: [{ 上传: u, 序号: 0, 偏移: 1, 内容: data.toString('base64') }] }))
  await assert.rejects(a.调用({ 操作: '状态.提交分段', 参数: [{ 上传: u, 写入: [spec] }], 操作编号: 'incomplete' }), { message: 'SQLITE_STATE_UPLOAD_INCOMPLETE' })
  assert.deepEqual(await a.调用({ 操作: '状态.读取快照', 参数: [{ 令牌: h.令牌, 类型: h.类型, 编号: h.编号 }] }), { 版本: 0, 数据: null })
  await assert.rejects(a.调用({ 操作: '状态.写入分段', 参数: [{ 上传: 'forged', 序号: 0, 偏移: 0, 内容: data.toString('base64') }] }))
  const wrong = Buffer.from(data); wrong[wrong.length - 2] ^= 1
  await a.调用({ 操作: '状态.写入分段', 参数: [{ 上传: u, 序号: 0, 偏移: 0, 内容: wrong.toString('base64') }] })
  await assert.rejects(a.调用({ 操作: '状态.提交分段', 参数: [{ 上传: u, 写入: [spec] }], 操作编号: 'bad-hash' }), { message: 'SQLITE_STATE_UPLOAD_INCOMPLETE' }); assert.equal(await a.查询回执('bad-hash'), null)
  await a.调用({ 操作: '状态.取消分段', 参数: [{ 上传: u }] })
  const good = (await a.调用({ 操作: '状态.开始分段', 参数: [{ 写入: [spec] }] })).上传
  await a.调用({ 操作: '状态.写入分段', 参数: [{ 上传: good, 序号: 0, 偏移: 0, 内容: data.toString('base64') }] })
  await a.调用({ 操作: '状态.提交分段', 参数: [{ 上传: good, 写入: [spec] }], 操作编号: 'reuse-protected' })
  const replay = (await a.调用({ 操作: '状态.开始分段', 参数: [{ 写入: [spec] }] })).上传
  await a.调用({ 操作: '状态.写入分段', 参数: [{ 上传: replay, 序号: 0, 偏移: 0, 内容: wrong.toString('base64') }] })
  await assert.rejects(a.调用({ 操作: '状态.提交分段', 参数: [{ 上传: replay, 写入: [spec] }], 操作编号: 'reuse-protected' }), { message: 'SQLITE_STATE_UPLOAD_INCOMPLETE' })
  await a.调用({ 操作: '状态.取消分段', 参数: [{ 上传: replay }] })
})
test('关闭后端回收暂存，不能继续旧上传', async () => {
  const { a } = await setup(), h = await a.调用({ 操作: '状态.打开后端', 参数: [{ 类型: 'relations', 编号: 'main', 独占: false }] }), data = Buffer.from('{}'), spec = { 令牌: h.令牌, 类型: h.类型, 编号: h.编号, 预期版本: 0, 字节数: data.length, 指纹: createHash('sha256').update(data).digest('hex') }, u = (await a.调用({ 操作: '状态.开始分段', 参数: [{ 写入: [spec] }] })).上传
  await a.调用({ 操作: '状态.关闭后端', 参数: [{ 令牌: h.令牌 }] }); await assert.rejects(a.调用({ 操作: '状态.取消分段', 参数: [{ 上传: u }] }), { message: 'SQLITE_STATE_UPLOAD_INVALID' })
})
test('暂存中途Worker实际退出不会写库，恢复后旧能力失效', async () => {
  const { a, f } = await setup(), h = await a.调用({ 操作: '状态.打开后端', 参数: [{ 类型: 'relations', 编号: 'main', 独占: false }] }), data = Buffer.from(JSON.stringify({ 格式版本: 2, 关系: [], 自动抑制: [], 内容: 'x'.repeat(50000) })), spec = { 令牌: h.令牌, 类型: h.类型, 编号: h.编号, 预期版本: 0, 字节数: data.length, 指纹: createHash('sha256').update(data).digest('hex') }, u = (await a.调用({ 操作: '状态.开始分段', 参数: [{ 写入: [spec] }] })).上传
  await a.调用({ 操作: '状态.写入分段', 参数: [{ 上传: u, 序号: 0, 偏移: 0, 内容: data.subarray(0, 24576).toString('base64') }] })
  await 内部Worker测试(a).worker.terminate(); await a.恢复(); assert.equal(await a.查询回执('not-submitted'), null)
  await assert.rejects(a.调用({ 操作: '状态.取消分段', 参数: [{ 上传: u }] }), { message: 'SQLITE_STATE_UPLOAD_INVALID' })
  assert.deepEqual(await (await f.状态.打开后端('relations')).读取快照(), { 版本: 0, 数据: null })
})
test('总字节上限、操作ID和getter校验不触发业务写入', async () => {
  const { a, f, b, c } = await setup(); let touched = 0
  await assert.rejects(f.状态.保存分段快照组([{ 后端: b, 预期版本: 0, get 数据() { touched++; return {} } }], { 操作编号: 'getter' })); assert.equal(touched, 0)
  const v = { 数据: Array.from({ length: 5 }, () => 'x'.repeat(900000)) }; await assert.rejects(f.状态.保存分段快照组([row(b, v), row(c, v)], { 操作编号: 'too-large' }), { message: 'SQLITE_STATE_UPLOAD_LIMIT' }); await assert.rejects(b.保存分段快照(big(), { 预期版本: 0, 操作编号: 'bad\n' })); assert.equal((await b.读取快照()).版本, 0); assert.equal(await a.查询回执('too-large'), null)
})
test('完成写入后独立Node进程重新打开，版本与内容哈希一致', async () => {
  const o = fresh(), { a, b } = await setup(o), data = big(); await b.保存分段快照(data, { 预期版本: 0, 操作编号: 'reopen-large' }); await a.关闭()
  const child = cp.spawnSync(process.execPath, [path.join(__dirname, 'fixtures/sqlite-segment-write-reader.cjs'), o.目录], { encoding: 'utf8', timeout: 20000 }); assert.equal(child.status, 0, child.stderr); assert.deepEqual(JSON.parse(child.stdout), { 版本: 1, 指纹: createHash('sha256').update(JSON.stringify(data)).digest('hex') })
})
test('回执写入处故障整组回滚，暂存释放后允许新尝试', async () => {
  const o = fresh(), a = await start(o); await seed(a); await a.关闭(); injection = { stage: 'journal-fail' }; const { a: b, f, b: one, c } = await setup(o)
  await assert.rejects(f.状态.保存分段快照组([row(one, big()), row(c, big())], { 操作编号: 'journal-large' })); assert.equal((await one.读取快照()).版本, 0); assert.equal((await c.读取快照()).版本, 0); assert.equal(await b.查询回执('journal-large'), null)
  await assert.rejects(one.保存分段快照(big(), { 预期版本: 0, 操作编号: 'journal-retry' }), e => e.message !== 'SQLITE_STATE_UPLOAD_BUSY')
})
test('阻断业务配置、模型、网络及隔离根外正文读取时仍可分段写查', async () => {
  injection = { audit: true }; const { b } = await setup(); await b.保存分段快照(big(), { 预期版本: 0, 操作编号: 'audited-large' }); assert.deepEqual((await b.读取分段快照()).数据, big())
})
for (const stage of ['before', 'after']) test('提交'+stage+'终止Worker：unknown、查回执、新能力原ID重传', async () => {
  const o = fresh(), first = await start(o); await seed(first); await first.关闭(); injection = { stage }; const { a, f, b, c } = await setup(o), pending = f.状态.保存分段快照组([row(b, big()), row(c, big())], { 操作编号: 'unknown-large' }), bad = assert.rejects(pending, e => e.状态 === 'unknown')
  await phase(a); await 内部Worker测试(a).worker.terminate(); await bad; await a.恢复(); await assert.rejects(b.读取快照(), { message: 'SQLITE_STATE_CAPABILITY_INVALID' }); const receipt = await a.查询回执('unknown-large'); assert.equal(receipt !== null, stage === 'after')
  const nb = await f.状态.打开后端('background-state', 'relations'), nc = await f.状态.打开后端('cluster-state', 'timeline'), r = await f.状态.保存分段快照组([row(nb, big()), row(nc, big())], { 操作编号: 'unknown-large' }); if (receipt) assert.deepEqual(r, receipt.结果); assert.equal((await nb.读取分段快照()).版本, 1); assert.equal((await nc.读取分段快照()).版本, 1)
})
;(async () => { let pass = 0; try { for (const [n, f] of tests) { try { await f(); pass++; console.log('PASS ' + n) } catch (e) { console.error('FAIL ' + n, e); process.exitCode = 1 } } console.log(`SQLite S-16D2B2: ${pass}/${tests.length}; staged atomic state writes only`) } finally { for (const a of actors) try { await a.关闭() } catch {} for (const r of roots) { const real = fs.realpathSync(r); if (path.dirname(real) !== fs.realpathSync(os.tmpdir()) || !/^elysia-sqlite-disk-[a-zA-Z0-9]+$/u.test(path.basename(real)) || fs.lstatSync(r).isSymbolicLink()) throw Error('CLEANUP_OUTSIDE'); fs.rmSync(real, { recursive: true, force: true }) } wt.Worker = NativeWorker } })()
