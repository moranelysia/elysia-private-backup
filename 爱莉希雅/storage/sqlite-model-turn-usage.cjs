/** Synthetic Worker-only composition; no transport or send authorization. */
'use strict'
const { 取内部, 原子执行 } = require('./sqlite-context.cjs')
const { 纯数据, 内部状态操作 } = require('./sqlite-state.cjs')
const { 内部事务轮次执行 } = require('./sqlite-turn-attempt-memory.cjs')
const { 初始化虚构用量事务能力, 内部事务追加无界面用量 } = require('./sqlite-usage-transaction.cjs')
const fail = code => { throw Error('SQLITE_STATE_MODEL_TX_' + code) }
function exact(input, fields) { const x = 纯数据(input); if (Object.keys(x).sort().join(',') !== [...fields].sort().join(',')) fail('INPUT_INVALID'); return x }
function 创建虚构模型组合事务(ctx, turn, binding) {
  const s = 取内部(ctx); if (!s.磁盘 || s.本机 || !s.虚构轮次 || !turn) fail('SCOPE_REQUIRED')
  初始化虚构用量事务能力(ctx); const state = 内部状态操作(ctx)
  function history(db, id) {
    const snapshot = state.读(db, 'usage', 'headless'), rows = snapshot.数据 === null ? [] : snapshot.数据
    if (!Array.isArray(rows) || rows.some(x => !x || Object.getPrototypeOf(x) !== Object.prototype)) fail('DATA_INVALID')
    return rows.filter(x => x.请求编号 === id)
  }
  const event = (x, 状态, 代码, 用量) => ({ 请求编号: x.请求编号, 模型: x.模型, 状态, 代码, 用量 })
  function append(x, status, code, usage) { return 内部事务追加无界面用量(ctx, { 事件: event(x, status, code, usage), 时间: x.时间, 预期版本: x.预期用量版本 }) }
  function 开始(input, withBinding = false) {
    const x = exact(input, ['轮次键', '指纹', '请求编号', '模型', '用途', '时间', '预期用量版本', ...(withBinding ? ['绑定'] : [])])
    return 原子执行(ctx, db => {
      if (history(db, x.请求编号).length) fail('USAGE_CONFLICT')
      const t = 内部事务轮次执行(ctx, '预留', { 轮次键: x.轮次键, 指纹: x.指纹, 请求编号: x.请求编号, 模型: x.模型, 用途: x.用途 })
      if (t.已有) fail('TURN_EXISTS')
      const u = append(x, 'started', null, null)
      if (withBinding) {
        if (!binding) fail('SCOPE_REQUIRED')
        const b = exact(x.绑定, ['对话','聊天轮次','预期会话版本','预期记忆版本'])
        binding.内部插入({ 轮次键:x.轮次键, 指纹:x.指纹, 请求编号:x.请求编号, 模型:x.模型, ...b })
      }
      return { 好: true, 回放: false, 轮次: t, 用量版本: u.版本 }
    })
  }
  function 终态(input, success) {
    const x = exact(input, ['轮次键', '预期轮次版本', '请求编号', '模型', '时间', '预期用量版本', ...(success ? ['正文', '用量'] : ['代码'])])
    return 原子执行(ctx, db => {
      const prior = turn.读取(x.轮次键)
      if (!prior || prior.请求编号 !== x.请求编号 || prior.模型 !== x.模型) fail('IDENTITY_CONFLICT')
      const rows = history(db, x.请求编号)
      if (rows.length !== 1 || rows[0].状态 !== 'started' || rows[0].模型 !== x.模型 || rows[0].代码 !== null || rows[0].用量 !== null) fail('USAGE_CONFLICT')
      const t = 内部事务轮次执行(ctx, success ? '暂存结果' : '标记未知', { 轮次键: x.轮次键, 预期版本: x.预期轮次版本, ...(success ? { 正文: x.正文 } : {}) })
      const u = append(x, success ? 'succeeded' : 'unknown', success ? null : x.代码, success ? x.用量 : null)
      return { 好: true, 回放: false, 轮次: t, 用量版本: u.版本 }
    })
  }
  return Object.freeze({ 开始: input => 开始(input), 开始绑定聊天: input => 开始(input, true), 成功: input => 终态(input, true), 未知: input => 终态(input, false) })
}
module.exports = { 创建虚构模型组合事务 }
