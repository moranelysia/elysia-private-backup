/** Synthetic-only logical snapshot; restored state remains quarantined. */
'use strict'
const { createHash } = require('node:crypto')
const { 纯数据 } = require('./sqlite-state.cjs')
const { 原子执行, 取内部 } = require('./sqlite-context.cjs')
const { 创建虚构轮次仓储, 内部备份测试 } = require('./sqlite-backup.cjs')
const { validateLog } = require('./sqlite-worker-protocol.cjs')
const fail = code => { throw Error('SQLITE_BACKUP_TURN_' + code) }
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const fields = (value, names) => { if (!value || Object.getPrototypeOf(value) !== Object.prototype || !same(Object.keys(value).sort(), [...names].sort())) fail('INPUT_INVALID') }
function 创建虚构轮次快照(store, log, scope) {
  scope = 纯数据(scope); fields(scope, ['用途']); if (scope.用途 !== 'synthetic-turn-snapshot') fail('SCOPE_REQUIRED')
  const i = 内部备份测试(store); if (!i || !取内部(i.上下文).磁盘 || !取内部(i.上下文).虚构轮次) fail('SCOPE_REQUIRED')
  return 原子执行(i.上下文, () => {
    const 内容 = { 版本: 1, 用途: 'synthetic-turn-snapshot', 快照: i.取快照(), 元数据: i.取持久元数据(), 回执: validateLog(纯数据(log)) }
    return 纯数据({ ...内容, 指纹: digest(内容) })
  })
}
function 恢复虚构轮次快照(raw) {
  const pack = 纯数据(raw); fields(pack, ['版本', '用途', '快照', '元数据', '回执', '指纹'])
  const { 指纹, ...content } = pack
  if (pack.版本 !== 1 || pack.用途 !== 'synthetic-turn-snapshot' || typeof 指纹 !== 'string' || digest(content) !== 指纹) fail('PACKAGE_INVALID')
  validateLog(pack.回执)
  const store = 创建虚构轮次仓储(), i = 内部备份测试(store), { db, 上下文, 表们 } = i
  try {
    const expected = i.取快照(); fields(pack.快照, ['架构指纹', '表'])
    if (pack.快照.架构指纹 !== expected.架构指纹 || !Array.isArray(pack.快照.表) || pack.快照.表.length !== 表们.length) fail('SCHEMA_INVALID')
    for (let n = 0; n < 表们.length; n++) {
      const actual = pack.快照.表[n], template = 表们[n]; fields(actual, ['名称', '列', '行'])
      if (actual.名称 !== template.名称 || !same(actual.列, template.列) || !Array.isArray(actual.行) || actual.行.some(row => !Array.isArray(row) || row.length !== template.列.length || row.some(v => v !== null && typeof v !== 'string' && typeof v !== 'number'))) fail('TABLE_INVALID')
      if (actual.名称 === 'repository_meta' && actual.行.some(row => typeof row[0] === 'string' && row[0].startsWith('disk_'))) fail('TABLE_INVALID')
    }
    原子执行(上下文, () => {
      db.exec('PRAGMA defer_foreign_keys=ON')
      for (const table of 表们) db.exec(`DELETE FROM "${table.名称}"`)
      for (const table of pack.快照.表.filter(x => x.名称 !== 'sqlite_sequence')) {
        const q = db.prepare(`INSERT INTO "${table.名称}"(${table.列.map(x => '"' + x + '"').join(',')}) VALUES(${table.列.map(() => '?').join(',')})`)
        for (const row of table.行) q.run(...row)
      }
      db.exec('DELETE FROM sqlite_sequence')
      const seq = pack.快照.表.find(x => x.名称 === 'sqlite_sequence'); if (!seq) fail('TABLE_INVALID')
      for (const row of seq.行) db.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)').run(...row)
      db.prepare("INSERT INTO repository_meta(key,value) VALUES('synthetic_restore_fence','quarantined') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run()
      store.核验(); i.设置持久元数据(pack.元数据)
    })
    return { 仓储: store, 回执: pack.回执 }
  } catch (e) { store.关闭(); throw Error(/^SQLITE_(BACKUP|STATE|CONTEXT)_[A-Z_]+$/u.test(e.message) ? e.message : 'SQLITE_BACKUP_TURN_RESTORE_REJECTED') }
}
module.exports = { 创建虚构轮次快照, 恢复虚构轮次快照 }
