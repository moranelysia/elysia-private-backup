'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { 新建隔离盘库 } = require('../storage/sqlite-disk.cjs'), { 启动隔离存储Worker } = require('../storage/sqlite-worker.cjs')
const { 创建渠道权限 } = require('../脑/渠道权限.cjs'), { 创建渠道会话映射 } = require('../脑/渠道会话映射.cjs')
const { 创建异步渠道映射 } = require('../core/异步渠道映射.cjs'), sample = require('./fixtures/渠道契约-v1.json').本人私聊
const msg = { ...sample, 端点: { 渠道: 'fake', 账号: 'local-fixture' } }, binding = { 端点: msg.端点, 本人编号: msg.发送者编号, 私聊会话编号: msg.会话.编号, 允许主动发送: false }
const policy = () => 创建渠道权限({ 绑定: [binding], 取现在: () => new Date('2026-10-25T05:00:10.000Z') })
const tests = [], test = (name, fn) => tests.push([name, fn]), roots = [], actors = []
async function setup() { const disk = 新建隔离盘库({ 用途: 'synthetic-sqlite-disk' }); const dir = disk.目录; disk.关闭(); roots.push(dir); const a = await 启动隔离存储Worker({ 用途: 'synthetic-sqlite-disk', 目录: dir }); actors.push(a); const p = policy(), ctx = { 回复许可: p.审查接收(msg).回复许可 }; return { a, p, ctx, dir } }
test('原许可和原映射结果一致，重复提交幂等', async () => {
  const { a, p, ctx } = await setup(), m = await 创建异步渠道映射(a, { 编号: 'fake', 权限: p, 生成编号: () => 'channel-fixture' }), old = 创建渠道会话映射({ 权限: p, 生成编号: () => 'channel-fixture' })
  assert.equal((await m.查询接收(msg, ctx)).存在, false); const plan = await m.准备接收(msg, ctx), r = await m.提交(plan, { 操作编号: 'map-one' })
  assert.deepEqual({ 好: r.好, 存在: r.存在, 内部对话编号: r.内部对话编号, 新建: r.新建 }, old.解析接收(msg, ctx)); assert.deepEqual(await m.提交(plan, { 操作编号: 'map-one' }), r)
  assert.equal((await m.查询接收(msg, ctx)).内部对话编号, 'channel-fixture'); m.释放计划(plan); await m.关闭(); old.关闭()
})
test('缺失或撤销许可时不能查询或提交', async () => {
  const { a, p, ctx } = await setup(), m = await 创建异步渠道映射(a, { 编号: 'fake', 权限: p })
  await assert.rejects(m.查询接收(msg, {}), { message: 'ASYNC_CHANNEL_MAP_FORBIDDEN' }); const plan = await m.准备接收(msg, ctx); p.更新绑定([])
  assert.throws(() => m.提交(plan, { 操作编号: 'revoked' }), { message: 'ASYNC_CHANNEL_MAP_FORBIDDEN' }); m.释放计划(plan); await m.关闭()
})
test('并发计划通过版本冲突防止覆盖，重新查询可见已有映射', async () => {
  const { a, p, ctx } = await setup(), x = await 创建异步渠道映射(a, { 编号: 'fake', 权限: p }), y = await 创建异步渠道映射(a, { 编号: 'fake', 权限: p })
  const one = await x.准备接收(msg, ctx), two = await y.准备接收(msg, ctx); await x.提交(one, { 操作编号: 'winner' }); await assert.rejects(y.提交(two, { 操作编号: 'loser' })); assert.equal((await y.查询接收(msg, ctx)).内部对话编号, one.内部对话编号)
  x.释放计划(one); y.释放计划(two); await x.关闭(); await y.关闭()
})
test('关闭等待在途提交并拒绝后续使用，重开仍可读取', async () => {
  const { a, p, ctx } = await setup(), m = await 创建异步渠道映射(a, { 编号: 'fake', 权限: p }), plan = await m.准备接收(msg, ctx), write = m.提交(plan, { 操作编号: 'closing' }), close = m.关闭()
  await write; await close; await assert.rejects(m.查询接收(msg, ctx), { message: 'ASYNC_CHANNEL_MAP_CLOSED' }); const again = await 创建异步渠道映射(a, { 编号: 'fake', 权限: p }); assert.equal((await again.查询接收(msg, ctx)).内部对话编号, plan.内部对话编号); await again.关闭()
})
;(async () => { let pass = 0; try { for (const [name, fn] of tests) { try { await fn(); pass++; console.log('PASS ' + name) } catch (e) { console.error('FAIL ' + name, e); process.exitCode = 1 } } console.log(`S16D2C1: ${pass}/${tests.length}`) } finally { for (const a of actors) try { await a.关闭() } catch {} for (const root of roots) { const real = fs.realpathSync(root); if (path.dirname(real) !== fs.realpathSync(os.tmpdir()) || !/^elysia-sqlite-disk-[a-zA-Z0-9]+$/u.test(path.basename(real)) || fs.lstatSync(root).isSymbolicLink()) throw Error('CLEANUP_OUTSIDE'); fs.rmSync(real, { recursive: true, force: true }) } } })()
