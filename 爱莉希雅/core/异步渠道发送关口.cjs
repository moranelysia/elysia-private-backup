/** Isolated queued-task send gate. It is not the receiver or complete scheduler. */
'use strict'
const { randomUUID } = require('node:crypto')
const 契约 = require('../脑/渠道契约.cjs')
const { 校验渠道任务存档 } = require('../脑/渠道任务调度.cjs')
const { 创建异步渠道恢复 } = require('./异步渠道恢复.cjs')
const { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs')
const { 纯数据 } = require('../storage/sqlite-state.cjs')
const fail = code => { throw Error('ASYNC_CHANNEL_SEND_' + code) }
async function 创建异步渠道发送关口(actor, { 编号, 守卫, 权限, 取现在 = () => new Date(), 最小间隔毫秒 = 1000 } = {}) {
  if (!守卫 || typeof 守卫.取能力 !== 'function' || typeof 守卫.发送 !== 'function' || !权限 || typeof 权限.审查发送 !== 'function' || typeof 权限.订阅变更 !== 'function' || typeof 取现在 !== 'function') fail('DEPENDENCY_INVALID')
  if (!Number.isSafeInteger(最小间隔毫秒) || 最小间隔毫秒 < 1 || 最小间隔毫秒 > 86400000) fail('OPTIONS_INVALID')
  const 端点 = 契约.校验渠道能力(守卫.取能力()).端点
  function now() { const d = 取现在(); if (!(d instanceof Date) || !Number.isFinite(d.getTime())) fail('CLOCK_INVALID'); return d.toISOString() }
  const recovery = await 创建异步渠道恢复(actor, { 编号, 端点 })
  try { const plan = await recovery.准备恢复({ 时间: now() }); await recovery.提交(plan, { 操作编号: 'send-recovery-' + randomUUID() }); recovery.释放计划(plan) } finally { await recovery.关闭() }
  const backend = await 创建异步仓储门面(actor).状态.打开后端('channel-tasks', 编号)
  let closed = false, fault = null, epoch = 0, running = null, controller = null, closing = null, unsubscribe
  function check() { if (closed) fail('CLOSED'); if (fault) fail('STORE_UNKNOWN') }
  async function read() {
    check(); const s = await backend.读取分段快照(); check()
    if (!s.数据) fail('ARCHIVE_MISSING')
    校验渠道任务存档(s.数据, 端点); return s
  }
  function event(data, task, action, t) { data.日志.push({ 于: t, 事件: action, 任务: task.编号, 代码: task.代码, 尝试: task.尝试 }); if (data.日志.length > 100) data.日志.splice(0, data.日志.length - 100) }
  async function save(s, task, action, t) {
    event(s.数据, task, action, t); 校验渠道任务存档(s.数据, 端点)
    try { await backend.保存分段快照(s.数据, { 预期版本: s.版本, 操作编号: 'send-step-' + randomUUID() }) } catch (e) { fault = true; throw e }
  }
  const unknown = (task, t) => 契约.校验发送结果({ 版本: 1, 端点, 请求编号: task.发送.请求编号, 状态: 'unknown', 渠道消息编号: null, 错误代码: 'DELIVERY_UNKNOWN', 可重试: false, 结束于: t })
  async function execute(id, context) {
    let s = await read(), task = s.数据.记录.find(x => x.编号 === id)
    if (!task || task.状态 !== 'queued') fail('NOT_QUEUED')
    if (s.数据.记录.some(x => ['processing', 'sending'].includes(x.状态))) fail('RECOVERY_REQUIRED')
    if (s.数据.记录.some((x, i) => i < s.数据.记录.indexOf(task) && x.内部对话编号 === task.内部对话编号 && ['queued', 'processing', 'sending'].includes(x.状态))) fail('ORDER_REQUIRED')
    const t = now(); if (task.发送.截止于 <= t || task.下次尝试于 > t || task.尝试 >= 5 || (s.数据.最近发送于 !== null && Date.parse(t) < Date.parse(s.数据.最近发送于) + 最小间隔毫秒)) fail('NOT_READY')
    if (!权限.审查发送(task.发送, context)?.允许) fail('FORBIDDEN')
    const generation = epoch
    task.状态 = 'sending'; task.尝试++; task.回执 = null; task.下次尝试于 = null; task.代码 = null; task.更新于 = t; s.数据.最近发送于 = t
    await save(s, task, 'sending', t)
    // Recheck after the asynchronous durable write and immediately before invoking the guard.
    if (closed || generation !== epoch || !权限.审查发送(task.发送, context)?.允许) {
      s = await backend.读取分段快照(); task = s.数据.记录.find(x => x.编号 === id); const at = now()
      task.状态 = 'unknown'; task.代码 = 'DELIVERY_UNKNOWN'; task.回执 = unknown(task, at); task.更新于 = at
      await save(s, task, 'unknown', at)
      return { 好: false, 状态: 'unknown', 已调用发送: false }
    }
    controller = new AbortController(); let receipt
    try {
      receipt = 契约.校验发送结果(await 守卫.发送(纯数据(task.发送), { ...context, 中止: controller.signal }))
      if (receipt.端点.渠道 !== 端点.渠道 || receipt.端点.账号 !== 端点.账号 || receipt.请求编号 !== task.发送.请求编号) throw Error('RECEIPT_MISMATCH')
    } catch { receipt = unknown(task, now()) }
    finally { controller = null }
    if (closed || generation !== epoch) receipt = unknown(task, now())
    s = await backend.读取分段快照(); task = s.数据.记录.find(x => x.编号 === id); const at = now()
    task.状态 = receipt.状态; task.代码 = receipt.错误代码; task.回执 = receipt; task.更新于 = at; task.下次尝试于 = null
    // A failed attempt is terminal in this isolated gate; retry scheduling remains C2B2.
    await save(s, task, receipt.状态, at)
    return { 好: true, 状态: receipt.状态, 已调用发送: true }
  }
  try { unsubscribe = 权限.订阅变更(() => { epoch++; controller?.abort() }); if (typeof unsubscribe !== 'function') fail('DEPENDENCY_INVALID') }
  catch (e) { await backend.关闭(); throw e }
  async function 发送(id, context = {}) {
    check(); if (running) fail('BUSY')
    const p = execute(id, context); running = p
    try { return await p } finally { running = null }
  }
  function 关闭() {
    if (closing) return closing
    closed = true; epoch++; controller?.abort(); unsubscribe()
    closing = (async () => { if (running) try { await running } catch {} await backend.关闭() })()
    return closing
  }
  return Object.freeze({ 发送, 关闭 })
}
module.exports = { 创建异步渠道发送关口 }
