/** D2C2A: isolated durable recovery of channel task archives, no dispatcher. */
'use strict'
const 契约 = require('../脑/渠道契约.cjs')
const { 校验渠道任务存档 } = require('../脑/渠道任务调度.cjs')
const { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs')
const { 纯数据 } = require('../storage/sqlite-state.cjs')
const { exact } = require('../storage/sqlite-worker-protocol.cjs')
const fail = code => { throw Error('ASYNC_CHANNEL_RECOVERY_' + code) }
const validTime = t => typeof t === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(t) && Number.isFinite(Date.parse(t)) && new Date(t).toISOString() === t
async function 创建异步渠道恢复(actor, { 编号, 端点 } = {}) {
  const validated = 契约.校验接收消息({ 版本: 1, 端点, 会话: { 类型: 'private', 编号: 'fixture' }, 发送者编号: 'fixture', 消息编号: 'fixture', 发生于: null, 接收于: '2026-01-01T00:00:00.000Z', 回复消息编号: null, 正文: 'fixture', 附件: [] }).端点
  const backend = await 创建异步仓储门面(actor).状态.打开后端('channel-tasks', 编号)
  let closed = false, closing = null, active = null
  const pending = new Set(), plans = new WeakMap()
  const check = () => { if (closed) fail('CLOSED') }
  async function 读取() {
    check()
    const snap = await backend.读取分段快照()
    check()
    const data = snap.数据 === null ? { 版本: 1, 端点: validated, 最近发送于: null, 记录: [], 日志: [] } : snap.数据
    校验渠道任务存档(data, validated)
    return { 版本: snap.版本, 数据: 纯数据(data) }
  }
  async function 准备恢复({ 时间 } = {}) {
    check(); if (!validTime(时间)) fail('TIME_INVALID')
    if (active) fail('PLAN_IN_USE')
    // Reserve before awaiting so concurrent callers cannot create competing plans.
    const token = {}; active = token
    try {
      const s = await 读取(), data = s.数据, counts = { interrupted: 0, unknown: 0 }
      for (const task of data.记录) {
        if (task.状态 !== 'processing' && task.状态 !== 'sending') continue
        const sending = task.状态 === 'sending'
        task.状态 = sending ? 'unknown' : 'interrupted'
        task.代码 = sending ? 'DELIVERY_UNKNOWN' : 'PROCESSING_INTERRUPTED'
        task.更新于 = 时间
        if (sending) task.回执 = 契约.校验发送结果({ 版本: 1, 端点: validated, 请求编号: task.发送.请求编号, 状态: 'unknown', 渠道消息编号: null, 错误代码: 'DELIVERY_UNKNOWN', 可重试: false, 结束于: 时间 })
        counts[task.状态]++
        data.日志.push({ 于: 时间, 事件: task.状态, 任务: task.编号, 代码: task.代码, 尝试: task.尝试 })
        if (data.日志.length > 100) data.日志.splice(0, data.日志.length - 100)
      }
      校验渠道任务存档(data, validated)
      const plan = Object.freeze({ 中断数量: counts.interrupted, 未知数量: counts.unknown })
      plans.set(plan, { 版本: s.版本, 数据: data }); active = plan
      return plan
    } catch (e) { if (active === token) active = null; throw e }
  }
  function 提交(plan, meta) {
    check(); const p = plans.get(plan); if (!p || active !== plan) fail('PLAN_INVALID')
    const m = 纯数据(meta); exact(m, ['操作编号'])
    const write = backend.保存分段快照(p.数据, { 预期版本: p.版本, 操作编号: m.操作编号 })
    pending.add(write); write.finally(() => pending.delete(write)).catch(() => {})
    return write.then(x => ({ 好: true, 版本: x.结果[0].版本, 中断数量: plan.中断数量, 未知数量: plan.未知数量 }))
  }
  function 释放计划(plan) { if (active !== plan || !plans.has(plan)) fail('PLAN_INVALID'); plans.delete(plan); active = null }
  function 关闭() {
    if (closing) return closing
    closed = true
    closing = (async () => { await Promise.allSettled([...pending]); if (active && plans.has(active)) plans.delete(active); active = null; await backend.关闭() })()
    return closing
  }
  return Object.freeze({ 读取, 准备恢复, 提交, 释放计划, 关闭 })
}
module.exports = { 创建异步渠道恢复 }
