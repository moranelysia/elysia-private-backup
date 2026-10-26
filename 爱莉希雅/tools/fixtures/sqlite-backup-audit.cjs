'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), Module = require('node:module')
const 原 = Module._load
Module._load = function (名, ...余) {
  if (/配置|钥匙|rollback-files/u.test(名) || /^(?:node:)?(?:https?|net|tls|child_process)$/u.test(名)) throw Error('BACKUP_DEPENDENCY_FORBIDDEN')
  return 原.call(this, 名, ...余)
}
const { 创建隔离仓储, 恢复隔离仓储, 备份范围 } = require('../../storage/sqlite-backup.cjs')
// Node加载源码完成后阻断业务文件API，SQLite仍只能创建:memory:。
for (const k of ['readFileSync', 'writeFileSync', 'openSync', 'mkdirSync', 'statSync', 'existsSync', 'renameSync', 'unlinkSync']) fs[k] = () => { throw Error('BACKUP_FILE_FORBIDDEN') }
global.fetch = () => { throw Error('BACKUP_NETWORK_FORBIDDEN') }
const 仓 = 创建隔离仓储({ 用途: 'synthetic-sqlite-repository' }), 时间 = '2026-10-26T00:00:00.000Z'
try {
  assert.equal(仓.会话.登记对话('audit', { 建于: 时间 }).好, true)
  assert.equal(仓.会话.存对话一轮({ 对话: 'audit', 轮次: 'one', 用户正文: '明天见', 回复正文: '明天见。', 接收于: 时间, 完成于: 时间 }).好, true)
  const 包 = 仓.创建备份({ 时间, 外部文件: [], 必须文件: [] }, 备份范围), 新 = 恢复隔离仓储(包, 备份范围)
  try { assert.equal(新.会话.取统计().消息数, 2); assert.equal(新.核验().好, true); assert.equal(新.日记.导出共享().length, 0) } finally { 新.关闭() }
  process.stdout.write('SQLITE_BACKUP_AUDIT_OK\n')
} finally { 仓.关闭() }
