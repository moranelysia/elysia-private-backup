/** Isolated Worker command: chat, optional model memories and receipts in one transaction. */
'use strict'
const { createHash } = require('node:crypto')
const { 原子执行, 取内部 } = require('./sqlite-context.cjs')
const { 内部事务存轮 } = require('./sqlite-chat.cjs')
const { 内部事务应用标记 } = require('./sqlite-memory.cjs')
const { exact } = require('./sqlite-worker-protocol.cjs')
function 校验组合输入(输入) {
      exact(输入, ['操作编号', '轮', '预期会话版本', '预期记忆版本', '标记'])
      exact(输入.标记, ['记住', '经历', '更正事实'])
      const m = 输入.标记
      if (typeof 输入.操作编号 !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/u.test(输入.操作编号) || !输入.轮 || typeof 输入.轮.对话 !== 'string' || typeof 输入.轮.轮次 !== 'string' || !Number.isSafeInteger(输入.预期会话版本) || 输入.预期会话版本 < 1 || !Number.isSafeInteger(输入.预期记忆版本) || 输入.预期记忆版本 < 0 || !Array.isArray(m.记住) || !Array.isArray(m.经历) || !Array.isArray(m.更正事实) || m.记住.length + m.经历.length + m.更正事实.length > 32) throw Error('SQLITE_CHAT_INPUT_INVALID')
      for (const v of [...m.记住, ...m.经历]) if (typeof v !== 'string' || !v.trim() || v.length > 4000) throw Error('SQLITE_CHAT_INPUT_INVALID')
      for (const v of m.更正事实) { exact(v, ['编号', '内容']); if (typeof v.编号 !== 'string' || !v.编号.trim() || v.编号.length > 120 || typeof v.内容 !== 'string') throw Error('SQLITE_CHAT_INPUT_INVALID') }
}
function 内部事务组合轮次(上下文, 输入) {
  const state = 取内部(上下文)
  if (!state.写入中 || !state.db.isTransaction) throw Error('SQLITE_CHAT_TRANSACTION_REQUIRED')
  校验组合输入(输入)
  const m = 输入.标记, db = state.db, 内部编号 = 'marker-' + createHash('sha256').update(输入.操作编号).digest('hex')
  const 段 = db.prepare('SELECT metadata_version,write_memory FROM chat_sessions WHERE conversation_id=?').get(输入.轮.对话)
  if (!段) throw Error('SQLITE_CHAT_CONVERSATION_NOT_FOUND')
  if (段.metadata_version !== 输入.预期会话版本) throw Error('SQLITE_CHAT_VERSION_CONFLICT')
  // 外层 Worker 回执处理同操作重放；不同操作不能重复使用已有聊天轮次。
  if (db.prepare('SELECT 1 FROM chat_turns WHERE conversation_id=? AND turn_id=?').get(输入.轮.对话, 输入.轮.轮次)) throw Error('SQLITE_CHAT_TURN_ALREADY_EXISTS')
  const 记忆 = 段.write_memory === 1 && m.记住.length + m.经历.length + m.更正事实.length > 0
    ? 内部事务应用标记(上下文, { 操作编号: 内部编号, 时间: 输入.轮.完成于, 预期版本: 输入.预期记忆版本, 对话: 输入.轮.对话, ...m })
    : { 好: true, 状态: 'skipped' }
  const 轮 = 内部事务存轮(上下文, 输入.轮)
  return { ...轮, 记忆 }
}
function 创建组合轮次(上下文) {
  return function 提交(输入) {
    try {
      校验组合输入(输入)
      return 原子执行(上下文, () => 内部事务组合轮次(上下文, 输入))
    } catch (e) {
      const 代码 = /^SQLITE_[A-Z_]+$/u.test(e?.message || '') ? e.message : 'SQLITE_CHAT_WRITE_FAILED'
      return { 好: false, 状态: ['SQLITE_CONTEXT_COMMIT_UNKNOWN', 'SQLITE_CONTEXT_ROLLBACK_FAILED', 'SQLITE_CONTEXT_UNUSABLE'].includes(代码) ? 'unknown' : 代码 === 'SQLITE_CONTEXT_TRANSACTION_FAILED' ? 'rolled-back' : 'rejected', 代码 }
    }
  }
}
module.exports = { 创建组合轮次, 内部事务组合轮次 }
