/** D2A：仅Worker内的登记状态命令。租约不持久化，批量写与回执共用一个事务。 */
'use strict'
const { randomUUID } = require('node:crypto')
const { 原子执行 } = require('./sqlite-context.cjs')
const { 内部状态操作, 纯数据 } = require('./sqlite-state.cjs')
const { 固定状态来源 } = require('./sqlite-sources.cjs')
const 契约 = require('../脑/渠道契约.cjs')
const { 校验渠道映射存档 } = require('../脑/渠道会话映射.cjs')
const { 校验渠道任务存档 } = require('../脑/渠道任务调度.cjs')
const { 校验后台缓冲 } = require('../core/后台缓冲格式.cjs')
const { exact } = require('./sqlite-worker-protocol.cjs')
const fail = code => { throw Error('SQLITE_STATE_' + code) }
const MAX_HANDLES = 64
function target(kind, id) {
  if (typeof kind !== 'string' || typeof id !== 'string') fail('TARGET_FORBIDDEN')
  const key = kind + ':' + id
  if (!Object.hasOwn(固定状态来源, key) && !(['channel-map', 'channel-tasks'].includes(kind) && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.exec(id)?.[0] === id)) fail('TARGET_FORBIDDEN')
  return key
}
function 创建Worker状态命令(ctx) {
  const state = 内部状态操作(ctx), handles = new Map()
  function capability(q) {
    exact(q, ['令牌', '类型', '编号'])
    const h = handles.get(q.令牌)
    if (!h || h.类型 !== q.类型 || h.编号 !== q.编号) fail('CAPABILITY_INVALID')
    return h
  }
  function openInput(q) {
    exact(q, ['类型', '编号', '独占']); const key = target(q.类型, q.编号)
    if (typeof q.独占 !== 'boolean' || (q.类型 === 'channel-tasks' && !q.独占)) fail('EXCLUSIVE_REQUIRED')
    return key
  }
  function batchInput(q) {
    exact(q, ['写入'])
    if (!Array.isArray(q.写入) || !q.写入.length || q.写入.length > 16) fail('BATCH_LIMIT')
    const seen = new Set()
    for (const x of q.写入) {
      exact(x, ['令牌', '类型', '编号', '预期版本', '数据'])
      capability({ 令牌: x.令牌, 类型: x.类型, 编号: x.编号 })
      const key = target(x.类型, x.编号)
      if (seen.has(key)) fail('DUPLICATE_TARGET'); seen.add(key)
      if (!Number.isSafeInteger(x.预期版本) || x.预期版本 < 0) fail('INPUT_INVALID')
    }
  }
  function validate(kind, data) {
    if (kind === 'channel-map') 校验渠道映射存档(data)
    if (kind === 'channel-tasks') {
      // 复用端点契约，即使任务为空也校验；这组固定校验参数不保存、不授予接收许可。
      契约.会话定位键({ 端点: data.端点, 会话: { 类型: 'private', 编号: 'state-validation' }, 发送者编号: 'state-validation' })
      校验渠道任务存档(data, data.端点)
    }
    if (kind === 'extraction-buffer') 校验后台缓冲(data)
  }
  function checkChannels(db, ids) {
    for (const id of ids) {
      const m = state.读(db, 'channel-map', id).数据, t = state.读(db, 'channel-tasks', id).数据
      for (const x of t?.记录 ?? []) if (!m?.记录.some(y => y.内部对话编号 === x.内部对话编号 && y.端点.渠道 === x.来源.端点.渠道 && y.端点.账号 === x.来源.端点.账号 && y.会话.类型 === x.来源.会话.类型 && y.会话.编号 === x.来源.会话.编号 && y.发送者编号 === x.来源.发送者编号)) fail('CHANNEL_MAP_MISSING')
    }
  }
  return Object.freeze({
    授权(c) {
      if (!c.q.操作.startsWith('状态.')) return
      const q = c.q.参数[0]
      switch (c.q.操作) {
        case '状态.打开后端': openInput(q); break
        case '状态.读取快照': capability(q); break
        case '状态.关闭后端': exact(q, ['令牌']); if (!handles.has(q.令牌)) fail('CAPABILITY_INVALID'); break
        case '状态.保存快照组': batchInput(q); break
        default: fail('OPERATION_FORBIDDEN')
      }
    },
    打开后端(q) {
      const key = openInput(q)
      if (handles.size >= MAX_HANDLES) fail('HANDLE_LIMIT')
      for (const h of handles.values()) if (h.key === key && (q.独占 || h.独占)) fail('LEASE_BUSY')
      const token = randomUUID(); handles.set(token, { ...q, key })
      return { 好: true, 令牌: token, 类型: q.类型, 编号: q.编号 }
    },
    读取快照(q) {
      const h = capability(q), x = state.读(state.连接(), h.类型, h.编号)
      if (x.数据 !== null) validate(h.类型, x.数据)
      return 纯数据(x)
    },
    保存快照组(q) {
      batchInput(q)
      return 原子执行(ctx, db => {
        const ids = new Set(), results = []
        for (const x of q.写入) {
          validate(x.类型, x.数据)
          const version = state.写(db, x.类型, x.编号, x.数据, x.预期版本)
          results.push({ 类型: x.类型, 编号: x.编号, 版本: version })
          if (['channel-map', 'channel-tasks'].includes(x.类型)) ids.add(x.编号)
        }
        checkChannels(db, ids)
        return { 好: true, 结果: results }
      })
    },
    关闭后端(q) { exact(q, ['令牌']); if (!handles.delete(q.令牌)) fail('CAPABILITY_INVALID'); return { 好: true } },
  })
}
module.exports = { 创建Worker状态命令, MAX_HANDLES }
