/** S-15内存上下文及S-16B隔离盘连接；内部能力只供仓储使用，不接IPC。 */
'use strict'
const { DatabaseSync } = require('node:sqlite')
const { randomBytes, randomUUID } = require('node:crypto')
const 上下文们 = new WeakMap()
function 失败(码) { throw new Error(码) }
function 创建内存上下文(选项) {
  return 创建上下文(选项, false)
}
function 创建本机影子上下文(选项) { return 创建上下文(选项, true) }
function 创建上下文(选项, 本机) {
  if (process.versions.electron) 失败('SQLITE_CONTEXT_NODE_ONLY')
  const 描述 = 选项 && Object.getOwnPropertyDescriptors(选项)
  if (!描述 || Object.getPrototypeOf(选项) !== Object.prototype || Reflect.ownKeys(描述).length !== (本机 ? 2 : 1) || !描述.用途 || !Object.hasOwn(描述.用途, 'value') || 描述.用途.value !== (本机 ? 'local-shadow-repository' : 'synthetic-sqlite-repository') || (本机 && (!描述.包含私密 || !Object.hasOwn(描述.包含私密, 'value') || 描述.包含私密.value !== true))) 失败('SQLITE_CONTEXT_SCOPE_REQUIRED')
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true, enableDoubleQuotedStringLiterals: false, allowExtension: false })
  let sqlite
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA temp_store=MEMORY; PRAGMA user_version=1; CREATE TABLE repository_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;')
    sqlite = db.prepare('SELECT sqlite_version() AS v').get().v
  } catch { db.close(); 失败('SQLITE_CONTEXT_BOOT_FAILED') }
  return 绑定连接(db, 本机)
}
// 内部连接能力：磁盘路径、只读预检及持有锁由sqlite-disk校验；不可传到IPC。
function 接入隔离磁盘连接(db, { 本机, 检查, 关闭后, 虚构轮次 = false } = {}) {
  if (process.versions.electron || !(db instanceof DatabaseSync) || typeof 本机 !== 'boolean' || typeof 检查 !== 'function' || typeof 虚构轮次 !== 'boolean' || (本机 && 虚构轮次) || (关闭后 !== undefined && typeof 关闭后 !== 'function')) 失败('SQLITE_CONTEXT_SCOPE_REQUIRED')
  return 绑定连接(db, 本机, { 磁盘: true, 检查, 关闭后, 虚构轮次 })
}
function 绑定连接(db, 本机, 磁盘选项 = {}) {
  const sqlite = db.prepare('SELECT sqlite_version() AS v').get().v
  const 内部 = { db, 本机, 标识: randomUUID(), 游标密钥: randomBytes(32), 已关闭: false, 可用: true, 写入中: false, ...磁盘选项 }
  const 上下文 = Object.freeze({
    关闭() { if (!内部.已关闭) { try { db.close() } catch { 内部.可用=false; 失败('SQLITE_CONTEXT_CLOSE_FAILED') }; 内部.已关闭 = true; 内部.关闭后?.() } },
    取状态() { return { 模式: 内部.磁盘 ? 'sqlite-disk-isolated' : 'sqlite-memory', sqlite, 已关闭: 内部.已关闭, 可用: 内部.可用 && !内部.已关闭 } },
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
  try { 内部.检查?.() } catch (e) { 内部.可用 = false; throw e }
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
    内部.提交前?.(果)
    正在提交 = true; db.exec('COMMIT')
    return 果
  } catch (错) {
    if (已开始) {
      if (db.isTransaction) {
        try { db.exec('ROLLBACK') } catch { 内部.可用 = false; 失败('SQLITE_CONTEXT_ROLLBACK_FAILED') }
      } else if (正在提交) { 内部.可用 = false; 失败('SQLITE_CONTEXT_COMMIT_UNKNOWN') }
    }
    if (/^SQLITE_(CHAT|MEMORY|STATE|DIARY|BACKUP|LEGACY|CONTEXT|DISK)_[A-Z_]+$/u.test(错?.message || '')) throw 错
    失败('SQLITE_CONTEXT_TRANSACTION_FAILED')
  } finally { 内部.写入中 = false }
}
module.exports = { 创建内存上下文, 创建本机影子上下文, 接入隔离磁盘连接, 取内部, 原子执行 }
