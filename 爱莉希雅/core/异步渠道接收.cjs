/** Isolated atomic receive boundary; no processing, sending, or real channel. */
'use strict'
const { createHash, randomUUID } = require('node:crypto')
const 契约 = require('../脑/渠道契约.cjs')
const { 校验渠道映射存档 } = require('../脑/渠道会话映射.cjs')
const { 校验渠道任务存档 } = require('../脑/渠道任务调度.cjs')
const { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs')
const { 纯数据 } = require('../storage/sqlite-state.cjs')
const { exact } = require('../storage/sqlite-worker-protocol.cjs')
const fail = code => { throw Error('ASYNC_CHANNEL_RECEIVE_' + code) }
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex')
const addr = x => 契约.会话定位键({ 端点: x.端点, 会话: x.会话, 发送者编号: x.发送者编号 })
const fingerprint = x => hash([x.端点.渠道, x.端点.账号, x.会话.类型, x.会话.编号, x.发送者编号, x.消息编号, x.发生于, x.回复消息编号, x.正文, x.附件.map(a => [a.编号, a.类型, a.名称, a.媒体类型, a.字节数])])
async function 创建异步渠道接收(actor, { 编号, 端点, 权限, 取现在 = () => new Date() } = {}) {
  if (!权限 || typeof 权限.核对接收许可 !== 'function' || typeof 取现在 !== 'function') fail('DEPENDENCY_INVALID')
  const ep = 契约.校验接收消息({ 版本: 1, 端点, 会话: { 类型: 'private', 编号: 'fixture' }, 发送者编号: 'fixture', 消息编号: 'fixture', 发生于: null, 接收于: '2026-01-01T00:00:00.000Z', 回复消息编号: null, 正文: 'fixture', 附件: [] }).端点
  const f = 创建异步仓储门面(actor), map = await f.状态.打开后端('channel-map', 编号)
  let tasks
  try { tasks = await f.状态.打开后端('channel-tasks', 编号) } catch (e) { await map.关闭(); throw e }
  let closed = false, closing = null, active = null, fault = false
  const plans = new WeakMap(), pending = new Set()
  function check() { if (closed) fail('CLOSED'); if (fault) fail('STORE_UNKNOWN') }
  function permit(m, ctx) { if (!权限.核对接收许可(m, ctx)?.允许) fail('FORBIDDEN') }
  function now() { const d = 取现在(); if (!(d instanceof Date) || !Number.isFinite(d.getTime())) fail('CLOCK_INVALID'); return d.toISOString() }
  async function 准备接收(input, ctx = {}) {
    check(); const msg = 契约.校验接收消息(input)
    if (msg.端点.渠道 !== ep.渠道 || msg.端点.账号 !== ep.账号) fail('ENDPOINT_MISMATCH')
    permit(msg, ctx); if (active) fail('PLAN_IN_USE')
    const token = {}; active = token
    try {
      const m = await map.读取分段快照(), t = await tasks.读取分段快照(); check(); permit(msg, ctx)
      const md = m.数据 ?? { 版本: 1, 记录: [] }, td = t.数据 ?? { 版本: 1, 端点: ep, 最近发送于: null, 记录: [], 日志: [] }
      const index = 校验渠道映射存档(md); 校验渠道任务存档(td, ep)
      const key = hash(契约.接收去重键(msg)), fp = fingerprint(msg), existing = td.记录.find(x => x.来源键 === key), mapping = index.get(addr(msg))
      if (existing) {
        if (!mapping || existing.内部对话编号 !== mapping.内部对话编号) fail('MAPPING_INCONSISTENT')
        if (existing.输入指纹 !== fp) fail('MESSAGE_CONFLICT')
        active = null; return Object.freeze({ 重复: true, 状态: existing.状态, 任务编号: existing.编号 })
      }
      if (td.记录.length >= 4096 || (!mapping && md.记录.length >= 4096)) fail('FULL')
      const id = mapping?.内部对话编号 ?? 'channel-' + randomUUID(), taskId = 'task-' + randomUUID(), at = now()
      if (!mapping) md.记录.push({ 端点: msg.端点, 会话: msg.会话, 发送者编号: msg.发送者编号, 内部对话编号: id })
      const task = { 编号: taskId, 来源键: key, 输入指纹: fp, 来源: { 端点: msg.端点, 会话: msg.会话, 发送者编号: msg.发送者编号, 消息编号: msg.消息编号 }, 内部对话编号: id, 状态: 'processing', 发送: null, 尝试: 0, 下次尝试于: null, 代码: null, 创建于: at, 更新于: at, 回执: null }
      td.记录.push(task); td.日志.push({ 于: at, 事件: 'received', 任务: taskId, 代码: null, 尝试: 0 }); if (td.日志.length > 100) td.日志.splice(0, td.日志.length - 100)
      校验渠道映射存档(md); 校验渠道任务存档(td, ep)
      const plan = Object.freeze({ 重复: false, 任务编号: taskId, 内部对话编号: id })
      plans.set(plan, { msg, ctx, m, t, md, td, newMap: !mapping }); active = plan; return plan
    } catch (e) { if (active === token) active = null; throw e }
  }
  function 提交(plan, meta) {
    check(); const p = plans.get(plan); if (!p || active !== plan) fail('PLAN_INVALID')
    const x = 纯数据(meta); exact(x, ['操作编号']); permit(p.msg, p.ctx)
    const writes = [{ 后端: tasks, 数据: p.td, 预期版本: p.t.版本 }]
    if (p.newMap) writes.push({ 后端: map, 数据: p.md, 预期版本: p.m.版本 })
    const operation = f.状态.保存分段快照组(writes, x)
    pending.add(operation); operation.finally(() => pending.delete(operation)).catch(() => {})
    return operation.then(() => {
      if (closed || !权限.核对接收许可(p.msg, p.ctx)?.允许) { const e = Error('ASYNC_CHANNEL_RECEIVE_COMMITTED_BUT_NOT_AUTHORIZED'); e.操作编号 = x.操作编号; throw e }
      return { 好: true, 重复: false, 任务编号: plan.任务编号, 内部对话编号: plan.内部对话编号 }
    }, e => { fault = true; throw e })
  }
  function 释放计划(plan) { if (active !== plan || !plans.has(plan)) fail('PLAN_INVALID'); plans.delete(plan); active = null }
  function 关闭() { if (closing) return closing; closed = true; closing = (async () => { await Promise.allSettled([...pending]); if (active && plans.has(active)) plans.delete(active); active = null; await tasks.关闭(); await map.关闭() })(); return closing }
  return Object.freeze({ 准备接收, 提交, 释放计划, 关闭 })
}
module.exports = { 创建异步渠道接收 }
