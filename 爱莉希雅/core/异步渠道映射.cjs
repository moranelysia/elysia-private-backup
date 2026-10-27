/** D2C1: isolated mapping plans; not a synchronous channel-router backend. */
'use strict'
const { randomUUID } = require('node:crypto')
const 契约 = require('../脑/渠道契约.cjs')
const { 校验渠道映射存档 } = require('../脑/渠道会话映射.cjs')
const { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs')
const { 纯数据 } = require('../storage/sqlite-state.cjs')
const { exact } = require('../storage/sqlite-worker-protocol.cjs')
const plans = new WeakMap(), owners = new WeakMap()
const fail = code => { throw Error('ASYNC_CHANNEL_MAP_' + code) }
const key = m => 契约.会话定位键({ 端点: m.端点, 会话: m.会话, 发送者编号: m.发送者编号 })
async function 创建异步渠道映射(actor, { 编号, 权限, 生成编号 = () => 'channel-' + randomUUID() } = {}) {
  if (!权限 || typeof 权限.核对接收许可 !== 'function' || typeof 生成编号 !== 'function') fail('OPTIONS_INVALID')
  const backend = await 创建异步仓储门面(actor).状态.打开后端('channel-map', 编号)
  if (!owners.has(actor)) owners.set(actor, new Set())
  const owned = owners.get(actor), pending = new Set(); let closed = false, closing = null
  function check() { if (closed) fail('CLOSED') }
  function permit(m, ctx) { if (!权限.核对接收许可(m, ctx)?.允许) fail('FORBIDDEN') }
  async function snapshot(m, ctx) {
    check(); permit(m, ctx)
    const s = await backend.读取分段快照()
    check(); permit(m, ctx)
    const data = s.数据 ?? { 版本: 1, 记录: [] }
    return { 版本: s.版本, 数据: data, 表: 校验渠道映射存档(data) }
  }
  function message(input) { return 契约.校验接收消息(input) }
  async function 查询接收(input, ctx = {}) {
    const m = message(input), s = await snapshot(m, ctx), item = s.表.get(key(m))
    return { 好: true, 存在: !!item, 内部对话编号: item?.内部对话编号 ?? null, 新建: false }
  }
  async function 准备接收(input, ctx = {}) {
    const m = message(input), s = await snapshot(m, ctx), found = s.表.get(key(m))
    if (found) return { 好: true, 存在: true, 内部对话编号: found.内部对话编号, 新建: false }
    if (s.表.size >= 4096) fail('FULL')
    if (owned.size >= 16) fail('PLAN_LIMIT')
    const used = new Set([...s.表.values()].map(x => x.内部对话编号)); let id = null
    for (let i = 0; i < 5; i++) {
      const x = 生成编号()
      if (typeof x !== 'string' || /^channel-[a-z0-9][a-z0-9_-]{0,95}$/u.exec(x)?.[0] !== x) fail('ID_CONFLICT')
      if (!used.has(x)) { id = x; break }
    }
    if (!id) fail('ID_CONFLICT')
    const record = { 端点: m.端点, 会话: m.会话, 发送者编号: m.发送者编号, 内部对话编号: id }
    const plan = Object.freeze({ 新建: true, 内部对话编号: id })
    plans.set(plan, { actor, backend, 消息: m, 上下文: ctx, 版本: s.版本, 数据: { 版本: 1, 记录: [...s.数据.记录, record] } }); owned.add(plan)
    return plan
  }
  function 提交(plan, meta) {
    check(); const p = plans.get(plan); if (!p || p.actor !== actor || p.backend !== backend) fail('PLAN_INVALID')
    const m = 纯数据(meta); exact(m, ['操作编号']); permit(p.消息, p.上下文)
    const operation = backend.保存分段快照(p.数据, { 预期版本: p.版本, 操作编号: m.操作编号 })
    pending.add(operation); operation.finally(() => pending.delete(operation)).catch(() => {})
    return operation.then(x => ({ 好: true, 存在: true, 内部对话编号: plan.内部对话编号, 新建: true, 版本: x.结果[0].版本 }))
  }
  function 释放计划(plan) { const p = plans.get(plan); if (!p || p.actor !== actor || p.backend !== backend) fail('PLAN_INVALID'); plans.delete(plan); owned.delete(plan) }
  function 关闭() {
    if (closing) return closing
    closed = true
    closing = (async () => { await Promise.allSettled([...pending]); for (const p of [...owned]) if (plans.get(p)?.backend === backend) { plans.delete(p); owned.delete(p) }; await backend.关闭() })()
    return closing
  }
  return Object.freeze({ 查询接收, 准备接收, 提交, 释放计划, 关闭 })
}
module.exports = { 创建异步渠道映射 }
