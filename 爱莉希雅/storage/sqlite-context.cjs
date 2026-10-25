/** S-15测试后端：单连接、仅内存；内部能力只供仓储/隔离测试使用，不接IPC。 */
'use strict'
const { DatabaseSync } = require('node:sqlite')
const { randomBytes, randomUUID } = require('node:crypto')
const 上下文们 = new WeakMap()
function 失败(码) { throw new Error(码) }
function 创建内存上下文(选项) {
  if (process.versions.electron) 失败('SQLITE_CONTEXT_NODE_ONLY')
  const 描述 = 选项 && Object.getOwnPropertyDescriptors(选项)
  if (!描述 || Object.getPrototypeOf(选项) !== Object.prototype || Reflect.ownKeys(描述).length !== 1 || !描述.用途 || !Object.hasOwn(描述.用途, 'value') || 描述.用途.value !== 'synthetic-sqlite-repository') 失败('SQLITE_CONTEXT_SCOPE_REQUIRED')
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true, enableDoubleQuotedStringLiterals: false, allowExtension: false })
  let sqlite
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA temp_store=MEMORY; PRAGMA user_version=1; CREATE TABLE repository_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;')
    sqlite = db.prepare('SELECT sqlite_version() AS v').get().v
  } catch { db.close(); 失败('SQLITE_CONTEXT_BOOT_FAILED') }
  const 内部 = { db, 标识: randomUUID(), 游标密钥: randomBytes(32), 已关闭: false, 可用: true, 写入中: false }
  const 上下文 = Object.freeze({
    关闭() { if (!内部.已关闭) { 内部.已关闭 = true; db.close() } },
    取状态() { return { 模式: 'sqlite-memory', sqlite, 已关闭: 内部.已关闭, 可用: 内部.可用 && !内部.已关闭 } },
  })
  上下文们.set(上下文, 内部)
  return 上下文
}
// 返回原生连接的能力只在内部文件导出；不能向渲染/聊天/渠道暴露。
function 取内部(上下文) {
  const 内部 = 上下文们.get(上下文)
  if (!内部) 失败('SQLITE_CONTEXT_REQUIRED')
  if (内部.已关闭) 失败('SQLITE_CONTEXT_CLOSED')
  if (!内部.可用) 失败('SQLITE_CONTEXT_UNUSABLE')
  return 内部
}
function 原子执行(上下文, 做) {
  const 内部 = 取内部(上下文), db = 内部.db
  if (内部.写入中 || db.isTransaction) 失败('SQLITE_CONTEXT_NESTED_FORBIDDEN')
  if (typeof 做 !== 'function') 失败('SQLITE_CONTEXT_CALLBACK_INVALID')
  let 已开始 = false, 正在提交 = false
  内部.写入中 = true
  try {
    db.exec('BEGIN IMMEDIATE'); 已开始 = true
    const 果 = 做(db)
    if (果 && typeof 果.then === 'function') 失败('SQLITE_CONTEXT_SYNC_REQUIRED')
    正在提交 = true; db.exec('COMMIT')
    return 果
  } catch (错) {
    if (已开始) {
      if (db.isTransaction) {
        try { db.exec('ROLLBACK') } catch { 内部.可用 = false; 失败('SQLITE_CONTEXT_ROLLBACK_FAILED') }
      } else if (正在提交) { 内部.可用 = false; 失败('SQLITE_CONTEXT_COMMIT_UNKNOWN') }
    }
    if (/^SQLITE_(CHAT|MEMORY|CONTEXT)_[A-Z_]+$/u.test(错?.message || '')) throw 错
    失败('SQLITE_CONTEXT_TRANSACTION_FAILED')
  } finally { 内部.写入中 = false }
}
module.exports = { 创建内存上下文, 取内部, 原子执行 }
