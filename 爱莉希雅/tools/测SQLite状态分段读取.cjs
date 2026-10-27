'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { 创建隔离仓储, 备份范围 } = require('../storage/sqlite-backup.cjs')
const { 新建隔离盘库 } = require('../storage/sqlite-disk.cjs')
const { 启动隔离存储Worker } = require('../storage/sqlite-worker.cjs')
const { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs')
const roots = new Set(), actors = new Set(), tests = [], test = (n, f) => tests.push([n, f])
const big = { 扩展: null, 原时间: '2026-09-01 19:03', 文本: '樱花🌸'.repeat(80000) }
function fresh() {
  const m = 创建隔离仓储({ 用途: 'synthetic-sqlite-repository' }); let pack
  try { const b = m.状态.创建后端('background-state', 'relations'); b.读取(); b.保存(big); b.关闭(); pack = m.创建备份({ 时间: '2026-10-27T00:00:00.000Z', 外部文件: [], 必须文件: [] }, 备份范围) } finally { m.关闭() }
  const d = 新建隔离盘库({ 用途: 'synthetic-sqlite-disk' }, pack, 备份范围); d.关闭(); roots.add(d.目录); return { 用途: 'synthetic-sqlite-disk', 目录: d.目录 }
}
async function start(o = fresh()) { const a = await 启动隔离存储Worker(o); actors.add(a); return a }
test('超过旧结果上限的多字节虚构状态分段完整读回，原接口仍拒绝', async () => {
  const a = await start(), f = 创建异步仓储门面(a), b = await f.状态.打开后端('background-state', 'relations')
  await assert.rejects(b.读取快照(), { message: 'SQLITE_WORKER_RESULT_LIMIT' })
  assert.deepEqual(await b.读取分段快照(), { 版本: 1, 数据: big })
  const empty = await f.状态.打开后端('relations'); assert.deepEqual(await empty.读取分段快照(), { 版本: 0, 数据: null })
})
test('分段间发生版本变化时拒绝拼接，不返回旧新混合内容', async () => {
  const a = await start(), f = 创建异步仓储门面(a), b = await f.状态.打开后端('background-state', 'relations')
  const raw = await a.调用({ 操作: '状态.打开后端', 参数: [{ 类型: 'background-state', 编号: 'relations', 独占: false }] })
  const q = { 令牌: raw.令牌, 类型: raw.类型, 编号: raw.编号, 版本: null, 偏移: 0 }
  const first = await a.调用({ 操作: '状态.读取片段', 参数: [q] }); assert.equal(first.完成, false)
  await b.保存快照({ 更新: true }, { 预期版本: first.版本, 操作编号: 'segment-change' })
  await assert.rejects(a.调用({ 操作: '状态.读取片段', 参数: [{ ...q, 版本: first.版本, 偏移: Buffer.from(first.内容, 'base64').length }] }), { message: 'SQLITE_STATE_VERSION_CONFLICT' })
  assert.deepEqual(await b.读取分段快照(), { 版本: 2, 数据: { 更新: true } })
})
test('片段接口验证能力和偏移，不能用伪造或关闭的令牌读取', async () => {
  const a = await start(), raw = await a.调用({ 操作: '状态.打开后端', 参数: [{ 类型: 'background-state', 编号: 'relations', 独占: false }] })
  const q = { 令牌: raw.令牌, 类型: raw.类型, 编号: raw.编号, 版本: null, 偏移: 0 }
  await assert.rejects(a.调用({ 操作: '状态.读取片段', 参数: [{ ...q, 偏移: 1 }] }))
  await assert.rejects(a.调用({ 操作: '状态.读取片段', 参数: [{ ...q, 令牌: 'forged' }] }))
  await a.调用({ 操作: '状态.关闭后端', 参数: [{ 令牌: q.令牌 }] })
  await assert.rejects(a.调用({ 操作: '状态.读取片段', 参数: [q] }), { message: 'SQLITE_STATE_CAPABILITY_INVALID' })
})
test('关闭后拒绝继续分段读取，读取不会产生写入回执', async () => {
  const a = await start(), f = 创建异步仓储门面(a), b = await f.状态.打开后端('background-state', 'relations')
  await b.读取分段快照(); assert.equal(await a.查询回执('segment-read'), null); await b.关闭(); await assert.rejects(b.读取分段快照())
})
;(async () => {
  let pass = 0
  try { for (const [n, f] of tests) { try { await f(); pass++; console.log('PASS ' + n) } catch (e) { console.error('FAIL ' + n, e); process.exitCode = 1 } } console.log(`SQLite S-16D2B1: ${pass}/${tests.length}; segmented read only`) }
  finally { for (const a of actors) try { await a.关闭() } catch {} for (const r of roots) { const real = fs.realpathSync(r); if (path.dirname(real) !== fs.realpathSync(os.tmpdir()) || !/^elysia-sqlite-disk-[a-zA-Z0-9]+$/u.test(path.basename(real)) || fs.lstatSync(r).isSymbolicLink()) throw Error('CLEANUP_OUTSIDE'); fs.rmSync(real, { recursive: true, force: true }) } }
})()
