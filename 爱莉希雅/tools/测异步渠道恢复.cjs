'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { createHash } = require('node:crypto')
const { 新建隔离盘库 } = require('../storage/sqlite-disk.cjs'), { 启动隔离存储Worker } = require('../storage/sqlite-worker.cjs')
const { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs'), { 创建异步渠道恢复 } = require('../core/异步渠道恢复.cjs'), 契约 = require('../脑/渠道契约.cjs')
const endpoint = { 渠道: 'fake', 账号: 'local-fixture' }, time = '2026-10-25T05:00:10.000Z', later = '2026-10-25T05:00:20.000Z'
const base = { ...require('./fixtures/渠道契约-v1.json').本人私聊, 端点: endpoint }
const tests = [], roots = [], actors = [], test = (n, f) => tests.push([n, f])
async function setup() {
  const disk = 新建隔离盘库({ 用途: 'synthetic-sqlite-disk' }), dir = disk.目录; disk.关闭(); roots.push(dir)
  const a = await 启动隔离存储Worker({ 用途: 'synthetic-sqlite-disk', 目录: dir }); actors.push(a); return { a, dir }
}
function fixture() {
  const mapping = { 版本: 1, 记录: [{ 端点: endpoint, 会话: base.会话, 发送者编号: base.发送者编号, 内部对话编号: 'channel-fixture' }] }
  function row(state, i) {
    const msg = { ...base, 消息编号: 'incoming-' + i }, key = createHash('sha256').update(JSON.stringify(契约.接收去重键(msg))).digest('hex')
    const send = state === 'processing' ? null : { 版本: 1, 端点: endpoint, 会话: msg.会话, 接收者编号: msg.发送者编号, 请求编号: 'c15-' + key, 用途: 'reply', 回复消息编号: msg.消息编号, 创建于: time, 截止于: '2026-10-25T06:00:00.000Z', 可见性: 'shared', 正文: '模拟回复', 附件: [] }
    return { 编号: 'task-' + i, 来源键: key, 输入指纹: 'a'.repeat(64), 来源: { 端点: endpoint, 会话: msg.会话, 发送者编号: msg.发送者编号, 消息编号: msg.消息编号 }, 内部对话编号: 'channel-fixture', 状态: state, 发送: send, 尝试: state === 'sending' ? 1 : 0, 下次尝试于: state === 'queued' ? time : null, 代码: null, 创建于: time, 更新于: time, 回执: null }
  }
  return { mapping, tasks: { 版本: 1, 端点: endpoint, 最近发送于: time, 记录: [row('processing', 1), row('sending', 2), row('queued', 3)], 日志: [] } }
}
async function seed(a) {
  const f = 创建异步仓储门面(a), map = await f.状态.打开后端('channel-map', 'fake'), tasks = await f.状态.打开后端('channel-tasks', 'fake'), data = fixture()
  await f.状态.保存分段快照组([{ 后端: map, 数据: data.mapping, 预期版本: 0 }, { 后端: tasks, 数据: data.tasks, 预期版本: 0 }], { 操作编号: 'seed' })
  await tasks.关闭(); await map.关闭()
}
const open = a => 创建异步渠道恢复(a, { 编号: 'fake', 端点: endpoint })
test('恢复处理/发送状态并保留待发，成功计划重试幂等', async () => {
  const { a } = await setup(); await seed(a); const r = await open(a), p = await r.准备恢复({ 时间: later })
  assert.deepEqual(p, { 中断数量: 1, 未知数量: 1 }); assert.deepEqual((await r.读取()).数据.记录.map(x => x.状态), ['processing', 'sending', 'queued'])
  const first = await r.提交(p, { 操作编号: 'recovery' }); assert.deepEqual(await r.提交(p, { 操作编号: 'recovery' }), first)
  const data = (await r.读取()).数据; assert.deepEqual(data.记录.map(x => x.状态), ['interrupted', 'unknown', 'queued']); assert.equal(data.记录[1].回执.可重试, false); assert.equal(data.记录[1].回执.状态, 'unknown'); assert.equal(data.最近发送于, time); assert.deepEqual(data.日志.map(x => x.事件), ['interrupted', 'unknown']); r.释放计划(p); await r.关闭()
})
test('任务后端独占，计划不能同时准备且不可伪造', async () => {
  const { a } = await setup(); const r = await open(a); await assert.rejects(open(a), { message: 'SQLITE_STATE_LEASE_BUSY' })
  const p = await r.准备恢复({ 时间: later }); await assert.rejects(r.准备恢复({ 时间: later }), { message: 'ASYNC_CHANNEL_RECOVERY_PLAN_IN_USE' }); assert.throws(() => r.提交({}, { 操作编号: 'bad' }), { message: 'ASYNC_CHANNEL_RECOVERY_PLAN_INVALID' }); r.释放计划(p); await r.关闭()
})
test('不接受无效时间或错端点，不改动旧档', async () => {
  const { a } = await setup(); await seed(a); const r = await 创建异步渠道恢复(a, { 编号: 'fake', 端点: { 渠道: 'fake', 账号: 'other' } })
  await assert.rejects(r.准备恢复({ 时间: 'invalid' }), { message: 'ASYNC_CHANNEL_RECOVERY_TIME_INVALID' }); await assert.rejects(r.准备恢复({ 时间: later })); await r.关闭()
  const ok = await open(a); assert.deepEqual((await ok.读取()).数据.记录.map(x => x.状态), ['processing', 'sending', 'queued']); await ok.关闭()
})
test('关闭等待在途恢复，重新打开确认落盘', async () => {
  const { a } = await setup(); await seed(a); const r = await open(a), p = await r.准备恢复({ 时间: later }), write = r.提交(p, { 操作编号: 'close-recover' }), closing = r.关闭()
  await write; await closing; await assert.rejects(r.读取(), { message: 'ASYNC_CHANNEL_RECOVERY_CLOSED' }); const next = await open(a); assert.deepEqual((await next.读取()).数据.记录.map(x => x.状态), ['interrupted', 'unknown', 'queued']); await next.关闭()
})
test('空档保持为空任务并生成可查回执', async () => {
  const { a } = await setup(), r = await open(a), p = await r.准备恢复({ 时间: later }); assert.deepEqual(p, { 中断数量: 0, 未知数量: 0 }); await r.提交(p, { 操作编号: 'empty' }); assert(await a.查询回执('empty')); assert.equal((await r.读取()).数据.记录.length, 0); r.释放计划(p); await r.关闭()
})
test('关闭Worker后重新打开同一隔离盘，保留恢复结果', async () => {
  const { a, dir } = await setup(); await seed(a); const r = await open(a), p = await r.准备恢复({ 时间: later }); await r.提交(p, { 操作编号: 'restart' }); r.释放计划(p); await r.关闭(); await a.关闭()
  const b = await 启动隔离存储Worker({ 用途: 'synthetic-sqlite-disk', 目录: dir }); actors.push(b); const again = await open(b)
  assert.deepEqual((await again.读取()).数据.记录.map(x => x.状态), ['interrupted', 'unknown', 'queued']); assert(await b.查询回执('restart')); await again.关闭()
})
;(async () => { let pass = 0; try { for (const [name, fn] of tests) { try { await fn(); pass++; console.log('PASS ' + name) } catch (e) { process.exitCode = 1; console.error('FAIL ' + name, e) } } console.log(`S16D2C2A: ${pass}/${tests.length}`) } finally { for (const a of actors) try { await a.关闭() } catch {} for (const root of roots) { const real = fs.realpathSync(root); if (path.dirname(real) !== fs.realpathSync(os.tmpdir()) || !/^elysia-sqlite-disk-[a-zA-Z0-9]+$/u.test(path.basename(real)) || fs.lstatSync(root).isSymbolicLink()) throw Error('CLEANUP_OUTSIDE'); fs.rmSync(real, { recursive: true, force: true }) } } })()
