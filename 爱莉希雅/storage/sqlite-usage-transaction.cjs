/** Headless usage append inside an existing synthetic SQLite transaction. */
'use strict'
const { 取内部 } = require('./sqlite-context.cjs')
const { 内部状态操作, 纯数据 } = require('./sqlite-state.cjs')
const { 校验无界面用量事件 } = require('./sqlite-usage-event.cjs')
const handles = new WeakMap()
const fail = code => { throw Error('SQLITE_STATE_USAGE_' + code) }
function 初始化虚构用量事务能力(ctx) {
  const s = 取内部(ctx)
  if (s.本机 || (s.磁盘 && !s.虚构轮次)) fail('SCOPE_REQUIRED')
  if (s.db.prepare("SELECT value FROM repository_meta WHERE key='state_schema'").get()?.value !== '1') fail('CAPABILITY_REQUIRED')
  const state = 内部状态操作(ctx)
  handles.set(ctx, input => {
    const current = 取内部(ctx)
    if (current.本机 || (current.磁盘 && !current.虚构轮次)) fail('SCOPE_REQUIRED')
    if (!current.写入中 || !current.db.isTransaction) fail('TRANSACTION_REQUIRED')
    let x, row
    try {
      x = 纯数据(input)
      if (Object.keys(x).sort().join(',') !== ['事件', '时间', '预期版本'].sort().join(',') || !Number.isSafeInteger(x.预期版本) || x.预期版本 < 0 || x.预期版本 >= Number.MAX_SAFE_INTEGER - 1) fail('INPUT_INVALID')
      row = 校验无界面用量事件(x.事件, x.时间)
    } catch { fail('INPUT_INVALID') }
    const db = state.连接(), previous = state.读(db, 'usage', 'headless'), rows = previous.数据 === null ? [] : previous.数据
    if (!Array.isArray(rows) || rows.length > 10000 || rows.some(v => !v || Object.getPrototypeOf(v) !== Object.prototype)) fail('DATA_INVALID')
    if (previous.版本 !== x.预期版本) fail('VERSION_CONFLICT')
    if (rows.length >= 10000) fail('FULL')
    const 版本 = state.写(db, 'usage', 'headless', [...rows, row], x.预期版本)
    return { 好: true, 状态: row.状态, 版本 }
  })
}
function 内部事务追加无界面用量(ctx, input) {
  const handle = handles.get(ctx); if (!handle) fail('CAPABILITY_REQUIRED')
  return handle(input)
}
module.exports = { 初始化虚构用量事务能力, 内部事务追加无界面用量 }
