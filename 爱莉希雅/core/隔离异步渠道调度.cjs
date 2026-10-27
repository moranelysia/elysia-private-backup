/** Fake-channel coordinator; explicit durable barriers and one shared task lease. */
'use strict'
const { createHash, randomUUID } = require('node:crypto')
const 契约 = require('../脑/渠道契约.cjs')
const { 校验渠道任务存档 } = require('../脑/渠道任务调度.cjs')
const { 创建异步渠道恢复 } = require('./异步渠道恢复.cjs')
const { 创建异步渠道接收 } = require('./异步渠道接收.cjs')
const { 创建异步渠道发送关口 } = require('./异步渠道发送关口.cjs')
const { 创建渠道共享存储, 申请渠道共享存储, 关闭渠道共享存储 } = require('./渠道共享存储.cjs')
const { 纯数据 } = require('../storage/sqlite-state.cjs')
const fail = code => { throw Error('ASYNC_CHANNEL_COORDINATOR_' + code) }
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex')
async function 创建隔离异步渠道调度(actor, { 编号, 守卫, 权限, 处理, 取现在 = () => new Date(), 处理超时毫秒 = 30000, 发送超时毫秒 = 30000, 任务有效毫秒 = 600000, 最小间隔毫秒 = 1000, 重试延迟毫秒 = 2000, 最大尝试 = 3 } = {}) {
  if (typeof 处理 !== 'function' || !权限 || typeof 权限.核对接收许可 !== 'function' || typeof 权限.订阅变更 !== 'function' || !守卫 || typeof 守卫.取能力 !== 'function') fail('DEPENDENCY_INVALID')
  for (const [v, max] of [[处理超时毫秒, 300000], [任务有效毫秒, 86400000]]) if (!Number.isSafeInteger(v) || v < 1 || v > max) fail('OPTIONS_INVALID')
  const ep = 契约.校验渠道能力(守卫.取能力()).端点
  function now() { const d = 取现在(); if (!(d instanceof Date) || !Number.isFinite(d.getTime())) fail('CLOCK_INVALID'); return d.toISOString() }
  const recovery = await 创建异步渠道恢复(actor, { 编号, 端点: ep })
  try { const p = await recovery.准备恢复({ 时间: now() }); await recovery.提交(p, { 操作编号: 'coord-recovery-' + randomUUID() }); recovery.释放计划(p) } finally { await recovery.关闭() }
  const scope = await 创建渠道共享存储(actor, 编号); let receive, send, store, unsubscribe
  try {
    store = 申请渠道共享存储(scope, actor, 编号, 'coordinator')
    const initial = await store.tasks.读取分段快照()
    if (!initial.数据) fail('ARCHIVE_MISSING')
    校验渠道任务存档(initial.数据, ep)
    // Another owner might have intervened between recovery and obtaining the exclusive lease.
    if (initial.数据.记录.some(x => ['processing', 'sending'].includes(x.状态))) fail('RECOVERY_REQUIRED')
    receive = await 创建异步渠道接收(actor, { 编号, 端点: ep, 权限, 取现在, 共享存储: scope })
    send = await 创建异步渠道发送关口(actor, { 编号, 守卫, 权限, 取现在, 最小间隔毫秒, 发送超时毫秒, 重试延迟毫秒, 最大尝试, 共享存储: scope })
  } catch (e) { if (receive) await receive.关闭(); store?.释放(); await 关闭渠道共享存储(scope); throw e }
  let closed = false, closing = null, tail = Promise.resolve(), controller = null, epoch = 0, fault = false, revoked = false
  const contexts = new Map(), scheduled = new Set()
  function check() { if (closed) fail('CLOSED'); if (fault) fail('STORE_UNKNOWN') }
  function permitted(m, ctx) { return !!权限.核对接收许可(m, ctx)?.允许 }
  async function snapshot() { const s = await store.tasks.读取分段快照(); if (!s.数据) fail('ARCHIVE_MISSING'); 校验渠道任务存档(s.数据, ep); return s }
  async function change(id, mutate, event) {
    const s = await snapshot(), t = s.数据.记录.find(x => x.编号 === id); if (!t) fail('TASK_MISSING')
    mutate(t, s.数据); t.更新于 = now(); s.数据.日志.push({ 于: t.更新于, 事件: event, 任务: t.编号, 代码: t.代码, 尝试: t.尝试 }); if (s.数据.日志.length > 100) s.数据.日志.splice(0, s.数据.日志.length - 100)
    校验渠道任务存档(s.数据, ep)
    try { await store.tasks.保存分段快照(s.数据, { 预期版本: s.版本, 操作编号: 'coord-step-' + randomUUID() }) } catch (e) { fault = true; throw e }
  }
  async function flushRevoked() {
    if (!revoked || fault) return
    const generation = epoch, s = await snapshot(), at = now(); let changed = false
    for (const t of s.数据.记录) if (t.状态 === 'queued') { t.状态 = 'blocked'; t.代码 = 'FORBIDDEN'; t.下次尝试于 = null; t.更新于 = at; s.数据.日志.push({ 于: at, 事件: 'blocked', 任务: t.编号, 代码: t.代码, 尝试: t.尝试 }); changed = true }
    if (s.数据.日志.length > 100) s.数据.日志.splice(0, s.数据.日志.length - 100)
    if (changed) { 校验渠道任务存档(s.数据, ep); try { await store.tasks.保存分段快照(s.数据, { 预期版本: s.版本, 操作编号: 'coord-revoke-' + randomUUID() }) } catch (e) { fault = true; throw e } }
    if (generation === epoch) revoked = false
  }
  async function blockConflict(msg) {
    const s = await snapshot(), key = hash(契约.接收去重键(msg)), t = s.数据.记录.find(x => x.来源键 === key)
    if (t?.状态 === 'queued') { contexts.delete(t.编号); await change(t.编号, x => { x.状态 = 'blocked'; x.代码 = 'MESSAGE_CONFLICT'; x.下次尝试于 = null }, 'conflict') }
  }
  async function transmit(id, ctx) {
    let r
    try { r = await send.发送(id, ctx) } catch (e) {
      if (!['ASYNC_CHANNEL_SEND_NOT_READY', 'ASYNC_CHANNEL_SEND_NOT_QUEUED', 'ASYNC_CHANNEL_SEND_FORBIDDEN', 'ASYNC_CHANNEL_SEND_ORDER_REQUIRED'].includes(e.message)) fault = true
      throw e
    }
    if (r.状态 !== 'queued') contexts.delete(id)
    return { ...r, 任务编号: id }
  }
  async function process(msg, ctx) {
    check(); msg = 契约.校验接收消息(msg); if (!permitted(msg, ctx)) fail('FORBIDDEN')
    let plan
    try { plan = await receive.准备接收(msg, ctx) } catch (e) { if (e.message === 'ASYNC_CHANNEL_RECEIVE_MESSAGE_CONFLICT') await blockConflict(msg); throw e }
    if (plan.重复) { if (plan.状态 === 'queued') { contexts.set(plan.任务编号, ctx); return transmit(plan.任务编号, ctx) }; return { 好: true, 重复: true, 状态: plan.状态 } }
    try { await receive.提交(plan, { 操作编号: 'coord-receive-' + randomUUID() }) } catch (e) { fault = true; throw e } finally { receive.释放计划(plan) }
    if (closed) return { 好: false, 状态: 'processing' }
    const id = plan.任务编号, generation = epoch
    if (!permitted(msg, ctx)) { await change(id, x => { x.状态 = 'blocked'; x.代码 = 'FORBIDDEN' }, 'blocked'); return { 好: false, 状态: 'blocked' } }
    controller = new AbortController(); let timer, onAbort, draft, handlerFailed = false
    try {
      const abort = new Promise((_, reject) => { onAbort = () => reject(Error('PROCESS_ABORTED')); controller.signal.addEventListener('abort', onAbort, { once: true }) })
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller?.abort(); reject(Error('PROCESS_TIMEOUT')) }, 处理超时毫秒) })
      draft = await Promise.race([处理(msg, Object.freeze({ 内部对话编号: plan.内部对话编号, 中止: controller.signal })), abort, timeout])
    } catch { handlerFailed = true } finally { clearTimeout(timer); if (controller && onAbort) controller.signal.removeEventListener('abort', onAbort); controller = null }
    if (closed) return { 好: false, 状态: 'processing' }
    if (generation !== epoch || !permitted(msg, ctx)) { await change(id, x => { x.状态 = 'blocked'; x.代码 = 'FORBIDDEN' }, 'blocked'); return { 好: false, 状态: 'blocked' } }
    if (handlerFailed) { await change(id, x => { x.状态 = 'failed'; x.代码 = 'PROCESSING_FAILED' }, 'failed'); return { 好: false, 状态: 'failed' } }
    let output, original, at
    const s = await snapshot(); original = s.数据.记录.find(x => x.编号 === id); if (!original || original.状态 !== 'processing') fail('TASK_STATE_INVALID'); at = now()
    if (Date.parse(at) >= Date.parse(original.创建于) + 任务有效毫秒) { await change(id, x => { x.状态 = 'failed'; x.代码 = 'EXPIRED' }, 'failed'); return { 好: false, 状态: 'failed' } }
    try {
      const safe = 纯数据(draft); if (Object.keys(safe).sort().join(',') !== ['可见性', '正文', '附件'].sort().join(',')) throw Error('INVALID')
      output = 契约.校验发送消息({ 版本: 1, 端点: msg.端点, 会话: msg.会话, 接收者编号: msg.发送者编号, 请求编号: 'c15-' + original.来源键, 用途: 'reply', 回复消息编号: msg.消息编号, 创建于: at, 截止于: new Date(Date.parse(original.创建于) + 任务有效毫秒).toISOString(), 可见性: safe.可见性, 正文: safe.正文, 附件: safe.附件 })
    } catch { await change(id, x => { x.状态 = 'failed'; x.代码 = 'INVALID_DRAFT' }, 'failed'); return { 好: false, 状态: 'failed' } }
    await change(id, x => { x.状态 = 'queued'; x.发送 = output; x.下次尝试于 = now(); x.代码 = null }, 'queued')
    if (closed) return { 好: false, 状态: 'queued' }
    contexts.set(id, ctx); return transmit(id, ctx)
  }
  try { unsubscribe = 权限.订阅变更(() => { epoch++; revoked = true; contexts.clear(); controller?.abort() }); if (typeof unsubscribe !== 'function') fail('DEPENDENCY_INVALID') }
  catch (e) { await send.关闭(); await receive.关闭(); store.释放(); await 关闭渠道共享存储(scope); throw e }
  async function one(fn) {
    check(); if (scheduled.size >= 32) fail('QUEUE_FULL')
    const p = tail.then(async () => { check(); await flushRevoked(); check(); return fn() }); scheduled.add(p); tail = p.catch(() => {})
    try { return await p } finally { scheduled.delete(p) }
  }
  function 接收(msg, ctx = {}) { return one(() => process(msg, ctx)) }
  function 推进(id) { return one(async () => { const ctx = contexts.get(id); if (!ctx) fail('FRESH_PERMISSION_REQUIRED'); return transmit(id, ctx) }) }
  function 关闭() {
    if (closing) return closing
    closed = true; epoch++; contexts.clear(); controller?.abort(); unsubscribe(); const stopSend = send.关闭()
    closing = (async () => { await Promise.allSettled([...scheduled]); await stopSend; try { await flushRevoked() } finally { await receive.关闭(); store.释放(); await 关闭渠道共享存储(scope) } })()
    return closing
  }
  return Object.freeze({ 接收, 推进, 关闭 })
}
module.exports = { 创建隔离异步渠道调度 }
