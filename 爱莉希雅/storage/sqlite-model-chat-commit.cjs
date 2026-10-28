/** Synthetic shared turn: commit chat, optional memories and consumed model result together. */
'use strict'
const { createHash } = require('node:crypto')
const { 取内部, 原子执行 } = require('./sqlite-context.cjs')
const { exact } = require('./sqlite-worker-protocol.cjs')
const { 内部事务组合轮次 } = require('./sqlite-combined-turn.cjs')
const { 内部事务轮次执行 } = require('./sqlite-turn-attempt-memory.cjs')
function 创建虚构模型聊天提交(ctx, turn, binding) {
  const state = 取内部(ctx)
  if (!state.磁盘 || state.本机 || !state.虚构轮次 || !turn) throw Error('SQLITE_STATE_MODEL_CHAT_SCOPE_REQUIRED')
  return function 提交(x, requireBinding = false) {
    exact(x, ['操作编号', '轮次键', '指纹', '请求编号', '模型', '预期轮次版本', '结果摘要', '轮', '预期会话版本', '预期记忆版本', '标记'])
    if (typeof x.结果摘要 !== 'string' || !/^[a-f0-9]{64}$/u.test(x.结果摘要)) throw Error('SQLITE_STATE_MODEL_CHAT_INPUT_INVALID')
    return 原子执行(ctx, db => {
      const attempt = turn.读取(x.轮次键)
      if (!attempt || attempt.状态 !== 'result_ready' || attempt.版本 !== x.预期轮次版本 || attempt.指纹 !== x.指纹 || attempt.请求编号 !== x.请求编号 || attempt.模型 !== x.模型) throw Error('SQLITE_STATE_MODEL_CHAT_IDENTITY_CONFLICT')
      if (!requireBinding && binding?.读取(x.轮次键)) throw Error('SQLITE_STATE_MODEL_CHAT_BINDING_REQUIRED')
      if (requireBinding) {
        const b = binding?.读取(x.轮次键)
        if (!b || b.轮次键 !== x.操作编号 || b.指纹 !== x.指纹 || b.请求编号 !== x.请求编号 || b.模型 !== x.模型 || b.对话 !== x.轮?.对话 || b.聊天轮次 !== x.轮?.轮次 || b.预期会话版本 !== x.预期会话版本 || b.预期记忆版本 !== x.预期记忆版本) throw Error('SQLITE_STATE_MODEL_CHAT_BINDING_CONFLICT')
      }
      const text = turn.取暂存结果(x.轮次键)
      if (createHash('sha256').update(text, 'utf8').digest('hex') !== x.结果摘要) throw Error('SQLITE_STATE_MODEL_CHAT_RESULT_CONFLICT')
      const revision = db.prepare("SELECT value FROM repository_meta WHERE key='memory_revision'").get()?.value
      if (!Number.isSafeInteger(Number(revision)) || Number(revision) < 0 || String(Number(revision)) !== revision) throw Error('SQLITE_MEMORY_INTEGRITY_FAILED')
      if (Number(revision) !== x.预期记忆版本) throw Error('SQLITE_MEMORY_VERSION_CONFLICT')
      const chat = 内部事务组合轮次(ctx, { 操作编号: x.操作编号, 轮: x.轮, 预期会话版本: x.预期会话版本, 预期记忆版本: x.预期记忆版本, 标记: x.标记 })
      const completed = 内部事务轮次执行(ctx, '模拟完成', { 轮次键: x.轮次键, 预期版本: x.预期轮次版本 })
      return { ...chat, 轮次执行: completed, 回放: false }
    })
  }
}
module.exports = { 创建虚构模型聊天提交 }
