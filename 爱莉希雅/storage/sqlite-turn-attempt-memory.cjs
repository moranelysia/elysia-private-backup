/** C3A: synthetic in-memory state machine only; no model, disk, IPC or production data. */
'use strict'
const { 取内部, 原子执行 } = require('./sqlite-context.cjs')
const { 纯数据 } = require('./sqlite-state.cjs')
const fail = code => { throw Error('SQLITE_STATE_ATTEMPT_' + code) }
const 事务句柄 = new WeakMap()
const schema = `CREATE TABLE synthetic_turn_attempts (
  turn_key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE,
  model TEXT NOT NULL, phase TEXT NOT NULL CHECK(phase IN ('reserved','dispatch_possible','result_ready','unknown','committed')),
  version INTEGER NOT NULL CHECK(version>0), result_text TEXT,
  CHECK((phase='result_ready' AND result_text IS NOT NULL) OR (phase<>'result_ready' AND result_text IS NULL))
) STRICT`
const keys = (o, expected) => { const x = 纯数据(o); if (Object.keys(x).sort().join(',') !== expected.slice().sort().join(',')) fail('INPUT_INVALID'); return x }
const key = x => { if (typeof x !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(x)) fail('INPUT_INVALID'); return x }
const version = x => { if (!Number.isSafeInteger(x) || x < 1 || x >= Number.MAX_SAFE_INTEGER) fail('INPUT_INVALID'); return x }
const digest = x => { if (typeof x !== 'string' || !/^[a-f0-9]{64}$/u.test(x)) fail('INPUT_INVALID'); return x }
const uuid = x => { if (typeof x !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(x)) fail('INPUT_INVALID'); return x }
const summary = x => ({ 轮次键: x.turn_key, 指纹: x.fingerprint, 请求编号: x.request_id, 模型: x.model, 状态: x.phase, 版本: x.version })
function 创建隔离内存轮次执行仓储(ctx) {
  const state = 取内部(ctx)
  if (state.本机 || state.磁盘) fail('SCOPE_REQUIRED')
  const normal = s => s.replace(/\s+/gu, ' ').trim()
  function db() {
    const s = 取内部(ctx); if (s.本机 || s.磁盘) fail('SCOPE_REQUIRED')
    const row = s.db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='synthetic_turn_attempts'").get()
    if (!row || normal(row.sql) !== normal(schema) || s.db.prepare("SELECT value FROM repository_meta WHERE key='synthetic_attempt_schema'").get()?.value !== '1') fail('SCHEMA_INVALID')
    return s.db
  }
  if (state.db.prepare("SELECT value FROM repository_meta WHERE key='synthetic_attempt_schema'").get()) db()
  else 原子执行(ctx, sql => {
    if (sql.prepare("SELECT 1 FROM sqlite_schema WHERE name='synthetic_turn_attempts'").get()) fail('SCHEMA_INVALID')
    sql.exec(schema); sql.prepare('INSERT INTO repository_meta(key,value) VALUES(?,?)').run('synthetic_attempt_schema', '1')
  })
  function row(sql, id) { return sql.prepare('SELECT * FROM synthetic_turn_attempts WHERE turn_key=?').get(id) }
  function change(sql, input, from, to, text = null) {
    const x = keys(input, ['轮次键', '预期版本']); key(x.轮次键); version(x.预期版本)
    const old = row(sql, x.轮次键); if (!old) fail('NOT_FOUND')
    if (old.version !== x.预期版本) fail('VERSION_CONFLICT')
    if (old.phase !== from) fail('TRANSITION_INVALID')
    sql.prepare('UPDATE synthetic_turn_attempts SET phase=?, version=version+1, result_text=? WHERE turn_key=?').run(to, text, x.轮次键)
    return summary(row(sql, x.轮次键))
  }
  const operations = Object.freeze({
    预留(sql, input) {
      const x = keys(input, ['轮次键', '指纹', '请求编号', '模型', '用途']); key(x.轮次键); digest(x.指纹); uuid(x.请求编号)
      if (x.用途 !== 'synthetic-shared' || !['deepseek-flash', 'deepseek-v4-pro'].includes(x.模型)) fail('INPUT_INVALID')
      const old = row(sql, x.轮次键)
      if (old) { if (old.fingerprint !== x.指纹 || old.model !== x.模型) fail('IDENTITY_CONFLICT'); return { ...summary(old), 已有: true } }
      if (sql.prepare('SELECT 1 FROM synthetic_turn_attempts WHERE request_id=?').get(x.请求编号)) fail('REQUEST_CONFLICT')
      if (sql.prepare('SELECT COUNT(*) AS n FROM synthetic_turn_attempts').get().n >= 10000) fail('LIMIT')
      sql.prepare("INSERT INTO synthetic_turn_attempts VALUES(?,?,?,?,'reserved',1,NULL)").run(x.轮次键, x.指纹, x.请求编号, x.模型)
      return { ...summary(row(sql, x.轮次键)), 已有: false }
    },
    标记可能发送: (sql, input) => change(sql, input, 'reserved', 'dispatch_possible'),
    标记未知: (sql, input) => change(sql, input, 'dispatch_possible', 'unknown'),
    暂存结果(sql, input) {
      const x = keys(input, ['轮次键', '预期版本', '正文'])
      if (typeof x.正文 !== 'string' || !x.正文.trim() || x.正文.length > 8000 || Buffer.byteLength(x.正文) > 32000 || Buffer.from(x.正文).toString('utf8') !== x.正文) fail('INPUT_INVALID')
      return change(sql, { 轮次键: x.轮次键, 预期版本: x.预期版本 }, 'dispatch_possible', 'result_ready', x.正文)
    },
    模拟完成: (sql, input) => change(sql, input, 'result_ready', 'committed'),
  })
  事务句柄.set(ctx, (name, input) => {
    const s = 取内部(ctx)
    if (!s.写入中 || !s.db.isTransaction) fail('TRANSACTION_REQUIRED')
    if (typeof name !== 'string' || !Object.hasOwn(operations, name)) fail('OPERATION_INVALID')
    return operations[name](db(), input)
  })
  const run = (name, input) => 原子执行(ctx, () => 内部事务轮次执行(ctx, name, input))
  return Object.freeze({
    预留: input => run('预留', input),
    读取(id) { key(id); const r = row(db(), id); return r ? summary(r) : null },
    标记可能发送: input => run('标记可能发送', input),
    标记未知: input => run('标记未知', input),
    暂存结果: input => run('暂存结果', input),
    取暂存结果(id) { key(id); const r = row(db(), id); if (!r) fail('NOT_FOUND'); if (r.phase !== 'result_ready') fail('TRANSITION_INVALID'); return r.result_text },
    模拟完成: input => run('模拟完成', input),
  })
}
function 内部事务轮次执行(ctx, 操作, input) {
  const handle = 事务句柄.get(ctx); if (!handle) fail('TRANSACTION_CAPABILITY_REQUIRED')
  return handle(操作, input)
}
module.exports = { 创建隔离内存轮次执行仓储, 内部事务轮次执行 }
