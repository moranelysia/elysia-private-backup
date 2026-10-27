'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { createHash } = require('node:crypto')
const { 新建隔离盘库 } = require('../storage/sqlite-disk.cjs'), { 启动隔离存储Worker } = require('../storage/sqlite-worker.cjs'), { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs'), { 创建异步渠道发送关口 } = require('../core/异步渠道发送关口.cjs'), 契约 = require('../脑/渠道契约.cjs')
const sample = require('./fixtures/渠道契约-v1.json'), endpoint = { 渠道: 'fake', 账号: 'local-fixture' }, msg = { ...sample.本人私聊, 端点: endpoint }, time = '2026-10-25T05:00:10.000Z'
const tests = [], roots = [], actors = [], test = (n, f) => tests.push([n, f])
function archives() {
  const key = createHash('sha256').update(JSON.stringify(契约.接收去重键(msg))).digest('hex')
  const send = { 版本: 1, 端点: endpoint, 会话: msg.会话, 接收者编号: msg.发送者编号, 请求编号: 'c15-' + key, 用途: 'reply', 回复消息编号: msg.消息编号, 创建于: time, 截止于: '2026-10-25T06:00:00.000Z', 可见性: 'shared', 正文: '模拟回复', 附件: [] }
  const task = { 编号: 'task-fixture', 来源键: key, 输入指纹: 'a'.repeat(64), 来源: { 端点: endpoint, 会话: msg.会话, 发送者编号: msg.发送者编号, 消息编号: msg.消息编号 }, 内部对话编号: 'channel-fixture', 状态: 'queued', 发送: send, 尝试: 0, 下次尝试于: time, 代码: null, 创建于: time, 更新于: time, 回执: null }
  return { map: { 版本: 1, 记录: [{ 端点: endpoint, 会话: msg.会话, 发送者编号: msg.发送者编号, 内部对话编号: 'channel-fixture' }] }, tasks: { 版本: 1, 端点: endpoint, 最近发送于: null, 记录: [task], 日志: [] } }
}
async function setup() {
  const disk = 新建隔离盘库({ 用途: 'synthetic-sqlite-disk' }), dir = disk.目录; disk.关闭(); roots.push(dir)
  const a = await 启动隔离存储Worker({ 用途: 'synthetic-sqlite-disk', 目录: dir }); actors.push(a)
  const f = 创建异步仓储门面(a), m = await f.状态.打开后端('channel-map', 'fake'), t = await f.状态.打开后端('channel-tasks', 'fake'), data = archives()
  await f.状态.保存分段快照组([{ 后端: m, 数据: data.map, 预期版本: 0 }, { 后端: t, 数据: data.tasks, 预期版本: 0 }], { 操作编号: 'seed' }); await t.关闭(); await m.关闭()
  return { a, dir }
}
function policy() { let listener, allowed = true, count = 0, denyAfter = Infinity; return { 审查发送: () => ({ 允许: allowed && ++count < denyAfter }), 订阅变更: cb => { listener = cb; return () => { listener = null } }, 撤销: () => { allowed = false; listener?.() }, 后续拒绝: () => { denyAfter = 2 } } }
const capability = { ...sample.主动能力未知, 端点: endpoint }
function receipt(send, state = 'sent') { return { 版本: 1, 端点: endpoint, 请求编号: send.请求编号, 状态: state, 渠道消息编号: state === 'sent' ? 'mock-delivered' : null, 错误代码: state === 'sent' ? null : 'DELIVERY_UNKNOWN', 可重试: false, 结束于: time } }
async function stored(a) { const b = await 创建异步仓储门面(a).状态.打开后端('channel-tasks', 'fake'); try { return (await b.读取分段快照()).数据 } finally { await b.关闭() } }
test('先写sending才调用假发送，完成后写入sent，不能再次发送', async () => {
  const { a } = await setup(), p = policy(); let calls = 0
  const guard = { 取能力: () => capability, 发送: async send => { calls++; await assert.rejects(创建异步仓储门面(a).状态.打开后端('channel-tasks', 'fake')); return receipt(send) } }
  const gate = await 创建异步渠道发送关口(a, { 编号: 'fake', 守卫: guard, 权限: p, 取现在: () => new Date(time) })
  assert.deepEqual(await gate.发送('task-fixture', {}), { 好: true, 状态: 'sent', 已调用发送: true }); await assert.rejects(gate.发送('task-fixture', {}), { message: 'ASYNC_CHANNEL_SEND_NOT_QUEUED' }); await gate.关闭()
  const data = await stored(a); assert.deepEqual(data.日志.map(x => x.事件), ['sending', 'sent']); assert.equal(calls, 1)
})
test('写入后许可失效，不调用发送，保守标记unknown', async () => {
  const { a } = await setup(), p = policy(); p.后续拒绝(); let calls = 0
  const gate = await 创建异步渠道发送关口(a, { 编号: 'fake', 守卫: { 取能力: () => capability, 发送: async () => { calls++ } }, 权限: p, 取现在: () => new Date(time) })
  assert.deepEqual(await gate.发送('task-fixture', {}), { 好: false, 状态: 'unknown', 已调用发送: false }); await gate.关闭(); assert.equal(calls, 0); assert.equal((await stored(a)).记录[0].状态, 'unknown')
})
test('许可开始时拒绝，不写sending', async () => {
  const { a } = await setup(), p = policy(); p.撤销()
  const gate = await 创建异步渠道发送关口(a, { 编号: 'fake', 守卫: { 取能力: () => capability, 发送: async () => { throw Error('unexpected') } }, 权限: p, 取现在: () => new Date(time) })
  await assert.rejects(gate.发送('task-fixture', {}), { message: 'ASYNC_CHANNEL_SEND_FORBIDDEN' }); await gate.关闭(); assert.equal((await stored(a)).记录[0].状态, 'queued')
})
test('发送期间关闭会中止并等待，落unknown且不能再次调用', async () => {
  const { a } = await setup(), p = policy(); let ready; const started = new Promise(r => { ready = r })
  const gate = await 创建异步渠道发送关口(a, { 编号: 'fake', 守卫: { 取能力: () => capability, 发送: async (_send, ctx) => { ready(); await new Promise(resolve => ctx.中止.addEventListener('abort', resolve, { once: true })); throw Error('aborted') } }, 权限: p, 取现在: () => new Date(time) })
  const pending = gate.发送('task-fixture', {}); await started; const closed = gate.关闭(); assert.equal((await pending).状态, 'unknown'); await closed; await assert.rejects(gate.发送('task-fixture', {}), { message: 'ASYNC_CHANNEL_SEND_CLOSED' }); assert.equal((await stored(a)).记录[0].状态, 'unknown')
})
test('发送抛错结果未知，重新打开也不重复发送', async () => {
  const { a } = await setup(), p = policy(); let calls = 0; const guard = { 取能力: () => capability, 发送: async () => { calls++; throw Error('lost') } }
  let gate = await 创建异步渠道发送关口(a, { 编号: 'fake', 守卫: guard, 权限: p, 取现在: () => new Date(time) }); assert.equal((await gate.发送('task-fixture', {})).状态, 'unknown'); await gate.关闭()
  gate = await 创建异步渠道发送关口(a, { 编号: 'fake', 守卫: guard, 权限: p, 取现在: () => new Date(time) }); await assert.rejects(gate.发送('task-fixture', {}), { message: 'ASYNC_CHANNEL_SEND_NOT_QUEUED' }); await gate.关闭(); assert.equal(calls, 1)
})
test('发送期间撤权发出中止，并发推进拒绝；迟到成功也按unknown处理', async () => {
  const { a } = await setup(), p = policy(); let ready; const started = new Promise(r => { ready = r }); let aborted = false
  const guard = { 取能力: () => capability, 发送: async (send, ctx) => { ready(); await new Promise(resolve => ctx.中止.addEventListener('abort', () => { aborted = true; resolve() }, { once: true })); return receipt(send) } }
  const gate = await 创建异步渠道发送关口(a, { 编号: 'fake', 守卫: guard, 权限: p, 取现在: () => new Date(time) }), pending = gate.发送('task-fixture', {})
  await started; await assert.rejects(gate.发送('task-fixture', {}), { message: 'ASYNC_CHANNEL_SEND_BUSY' }); p.撤销(); assert.equal((await pending).状态, 'unknown'); await gate.关闭(); assert.equal(aborted, true); assert.equal((await stored(a)).记录[0].状态, 'unknown')
})
test('最近发送时间限制仍有效，不调用发送', async () => {
  const { a } = await setup(), f = 创建异步仓储门面(a), t = await f.状态.打开后端('channel-tasks', 'fake'), s = await t.读取分段快照(); s.数据.最近发送于 = time; await t.保存分段快照(s.数据, { 预期版本: s.版本, 操作编号: 'recent' }); await t.关闭()
  let calls = 0; const gate = await 创建异步渠道发送关口(a, { 编号: 'fake', 守卫: { 取能力: () => capability, 发送: async () => { calls++ } }, 权限: policy(), 取现在: () => new Date(time) })
  await assert.rejects(gate.发送('task-fixture', {}), { message: 'ASYNC_CHANNEL_SEND_NOT_READY' }); await gate.关闭(); assert.equal(calls, 0)
})
;(async () => { let pass = 0; try { for (const [n, fn] of tests) { try { await fn(); pass++; console.log('PASS ' + n) } catch (e) { process.exitCode = 1; console.error('FAIL ' + n, e) } } console.log(`S16D2C2B1: ${pass}/${tests.length}`) } finally { for (const a of actors) try { await a.关闭() } catch {} for (const root of roots) { const real = fs.realpathSync(root); if (path.dirname(real) !== fs.realpathSync(os.tmpdir()) || !/^elysia-sqlite-disk-[a-zA-Z0-9]+$/u.test(path.basename(real)) || fs.lstatSync(root).isSymbolicLink()) throw Error('CLEANUP_OUTSIDE'); fs.rmSync(real, { recursive: true, force: true }) } } })()
