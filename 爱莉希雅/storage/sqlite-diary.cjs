/** S-15D：日记/任务/删除标记同事务。生成策略仍由现有日记生成器负责。 */
'use strict'
const { 取内部, 原子执行 } = require('./sqlite-context.cjs')
const { 内部状态操作, 纯数据, 哈希 } = require('./sqlite-state.cjs')
const 规则 = require('../脑/日记共用规则.cjs')
const 定义 = [
  ['diary_entries', "CREATE TABLE diary_entries (visibility TEXT NOT NULL CHECK(visibility IN ('shared','private')), diary_id TEXT NOT NULL, diary_type TEXT NOT NULL, period TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0), record_json TEXT NOT NULL CHECK(json_valid(record_json)), sha256 TEXT NOT NULL, PRIMARY KEY(visibility,diary_id), UNIQUE(visibility,diary_type,period)) STRICT"],
  ['diary_deleted', "CREATE TABLE diary_deleted (visibility TEXT NOT NULL CHECK(visibility IN ('shared','private')), diary_type TEXT NOT NULL, period TEXT NOT NULL, diary_id TEXT NOT NULL, deleted_raw TEXT NOT NULL, record_json TEXT NOT NULL CHECK(json_valid(record_json)), sha256 TEXT NOT NULL, PRIMARY KEY(visibility,diary_type,period)) STRICT"],
  ['diary_private_evaluations', 'CREATE TABLE diary_private_evaluations (period TEXT PRIMARY KEY, version INTEGER NOT NULL CHECK(version>0), record_json TEXT NOT NULL CHECK(json_valid(record_json)), sha256 TEXT NOT NULL) STRICT'],
]
const 评估状态们 = ['已生成', '已存在', '已删除', '无可用同日对话', '没有微妙情绪波动', '失败待重试']
function 失败(码 = 'SQLITE_DIARY_INPUT_INVALID') { throw new Error(码) }
const 克隆 = (一) => JSON.parse(JSON.stringify(一))
function 文本(一, 长 = 4000) { if (typeof 一 !== 'string' || !一.trim() || 一.length > 长) 失败(); return 一 }
function UTC(一) { if (typeof 一 !== 'string' || !Number.isFinite(Date.parse(一)) || new Date(一).toISOString() !== 一) 失败(); return 一 }
function 版本(一) { if (!Number.isSafeInteger(一) || 一 < 0 || 一 >= Number.MAX_SAFE_INTEGER - 1) 失败(); return 一 }
function 日周期(一) { if (typeof 一 !== 'string' || /^\d{4}-\d\d-\d\d$/u.exec(一)?.[0] !== 一 || new Date(一 + 'T00:00:00.000Z').toISOString().slice(0, 10) !== 一) 失败(); return 一 }
function 校验(原, 可见性) {
  const 条 = 纯数据(原), 规范 = 规则.规范日记记录(条)
  if (条.格式版本 !== 1 || 规范.可见性 !== 可见性 || !['日', '周'].includes(条.类型)) 失败('SQLITE_DIARY_VISIBILITY_INVALID')
  文本(条.编号, 160); 文本(条.周期, 40); 文本(条.标题, 120); UTC(条.开始); UTC(条.结束); UTC(条.生成于)
  if (条.类型 === '日') 日周期(条.周期)
  if (条.类型 === '周' && /^\d{4}-W\d\d$/u.exec(条.周期)?.[0] !== 条.周期) 失败()
  if (可见性 === 'private' && (条.可见性 !== 'private' || 条.类型 !== '日' || 条.编号 !== '私密日:' + 条.周期)) 失败('SQLITE_DIARY_VISIBILITY_INVALID')
  if (!Array.isArray(条.来源) || !条.来源.length || !Array.isArray(条.模块) || !条.模块.length || 条.模块.length > 规则.模块名们.length) 失败('SQLITE_DIARY_SOURCE_INVALID')
  const 来源号 = new Set(), 名字们 = new Set()
  for (const 一 of 条.来源) { 文本(一.编号, 160); if (来源号.has(一.编号)) 失败(); 来源号.add(一.编号) }
  for (const 一 of 条.模块) {
    if (!规则.模块名们.includes(一.名字) || 名字们.has(一.名字) || !Array.isArray(一.来源) || !一.来源.length || 一.来源.some((号) => !来源号.has(号))) 失败('SQLITE_DIARY_SOURCE_INVALID')
    名字们.add(一.名字); 文本(一.正文)
  }
  if (可见性 === 'private') {
    const 人话 = [条.标题, ...条.模块.map((x) => x.正文), ...条.来源.flatMap((x) => [x.标题 || '', x.摘要 || ''])]
    if (人话.some(规则.含敏感信息) || 条.模块.some((x) => 规则.像助手回复(x.正文))) 失败('SQLITE_DIARY_PRIVATE_CONTENT_INVALID')
    const 有禁用字段 = (值) => 值 && typeof 值 === 'object' && Object.entries(值).some(([k, v]) => 规则.含敏感信息(k) || 有禁用字段(v))
    if (有禁用字段(条)) 失败('SQLITE_DIARY_PRIVATE_CONTENT_INVALID')
  }
  return 条
}
function 创建日记仓储(上下文) {
  const 状态 = 内部状态操作(上下文), 初 = 取内部(上下文).db, 规范SQL = (文) => 文.replace(/\s+/gu, ' ').trim()
  function 架构(db) {
    if (db.prepare("SELECT value FROM repository_meta WHERE key='diary_schema'").get()?.value !== '1') 失败('SQLITE_DIARY_SCHEMA_INVALID')
    for (const [名, SQL] of 定义) { const 现 = db.prepare('SELECT sql FROM sqlite_schema WHERE name=?').get(名); if (!现 || 规范SQL(现.sql) !== 规范SQL(SQL)) 失败('SQLITE_DIARY_SCHEMA_INVALID') }
  }
  if (初.prepare("SELECT value FROM repository_meta WHERE key='diary_schema'").get()) 架构(初)
  else 原子执行(上下文, (db) => {
    if (定义.some(([名]) => db.prepare('SELECT 1 FROM sqlite_schema WHERE name=?').get(名))) 失败('SQLITE_DIARY_SCHEMA_INVALID')
    for (const [, SQL] of 定义) db.exec(SQL)
    db.prepare('INSERT INTO repository_meta VALUES(?,?)').run('diary_schema', '1')
  })
  function 连接() { const db = 状态.连接(); 架构(db); return db }
  function 读条(行) { if (!行) return null; if (哈希(行.record_json) !== 行.sha256) 失败('SQLITE_DIARY_INTEGRITY_FAILED'); return JSON.parse(行.record_json) }
  function 检查版本(行, 期望) { 版本(期望); if ((行?.version ?? 0) !== 期望) 失败('SQLITE_DIARY_VERSION_CONFLICT') }
  function 索引状态(db, 条, 新状态, 时间) {
    const 旧 = 状态.读(db, 'diary-index', 'main'), 索引 = 旧.数据 || { 格式版本: 1, 最后调度日期: '', 任务: [] }
    let 任务 = 索引.任务.find((x) => x.编号 === 条.编号)
    if (!任务) { 任务 = { 编号: 条.编号, 类型: 条.类型, 周期: 条.周期, 开始: 条.开始, 结束: 条.结束, 创建于: 时间, 尝试次数: 0 }; 索引.任务.push(任务) }
    if (任务.状态 === '已删除' && 新状态 !== '已删除') 失败('SQLITE_DIARY_DELETED')
    Object.assign(任务, { 状态: 新状态, 更新于: 时间, 错误: '', 下次尝试: '' }); if (新状态 === '已删除') 任务.删除于 = 时间
    状态.写(db, 'diary-index', 'main', 索引, 旧.版本)
  }
  function 评估状态(db, 值) {
    const 周期 = 日周期(值.周期); if (!评估状态们.includes(值.状态)) 失败(); UTC(值.更新于)
    if (Object.keys(值).some((k) => !['周期', '状态', '更新于', '尝试次数', '下次尝试'].includes(k))) 失败('SQLITE_DIARY_EVALUATION_METADATA_ONLY')
    if (值.尝试次数 !== undefined && (!Number.isInteger(值.尝试次数) || 值.尝试次数 < 0 || 值.尝试次数 > 100)) 失败()
    if (值.下次尝试 !== undefined && 值.下次尝试 !== '') UTC(值.下次尝试)
    const 旧 = db.prepare('SELECT * FROM diary_private_evaluations WHERE period=?').get(周期), 原 = 读条(旧)
    if (原 && 原.状态 !== '失败待重试' && 原.状态 !== 值.状态) 失败('SQLITE_DIARY_TERMINAL_STATE')
    const 元数据 = { 周期, 状态: 值.状态, 尝试次数: 值.尝试次数 ?? 原?.尝试次数 ?? 0, 更新于: 值.更新于, 下次尝试: 值.下次尝试 ?? '' }
    if (原 && JSON.stringify(原) === JSON.stringify(元数据)) return 旧.version
    const 新版 = (旧?.version ?? 0) + 1, 文 = JSON.stringify(元数据)
    db.prepare('INSERT INTO diary_private_evaluations VALUES(?,?,?,?) ON CONFLICT(period) DO UPDATE SET version=excluded.version,record_json=excluded.record_json,sha256=excluded.sha256').run(周期, 新版, 文, 哈希(文)); return 新版
  }
  function 存篇(db, 条, 可见性, 预期版本) {
    const 旧 = db.prepare('SELECT * FROM diary_entries WHERE visibility=? AND diary_id=?').get(可见性, 条.编号), 文 = JSON.stringify(条)
    if (旧) { 读条(旧); if (旧.diary_type !== 条.类型 || 旧.period !== 条.周期) 失败('SQLITE_DIARY_PERIOD_IMMUTABLE') }
    if (db.prepare('SELECT 1 FROM diary_deleted WHERE visibility=? AND diary_type=? AND period=?').get(可见性, 条.类型, 条.周期)) 失败('SQLITE_DIARY_DELETED')
    if (可见性 === 'private' && 旧) { if (旧.record_json !== 文) 失败('SQLITE_DIARY_ALREADY_EXISTS'); return { 好: true, 写入: false, 版本: 旧.version } }
    检查版本(旧, 预期版本)
    if (旧 && 读条(旧).用户修改 === true) return { 好: true, 写入: false, 原因: '保留人工修改', 版本: 旧.version }
    const 新版 = (旧?.version ?? 0) + 1
    db.prepare('INSERT INTO diary_entries VALUES(?,?,?,?,?,?,?) ON CONFLICT(visibility,diary_id) DO UPDATE SET version=excluded.version,record_json=excluded.record_json,sha256=excluded.sha256').run(可见性, 条.编号, 条.类型, 条.周期, 新版, 文, 哈希(文))
    if (可见性 === 'shared') 索引状态(db, 条, '已完成', 条.生成于)
    else {
      const 原 = db.prepare('SELECT * FROM diary_private_evaluations WHERE period=?').get(条.周期)
      if (原 && 读条(原).状态 !== '失败待重试') 失败('SQLITE_DIARY_TERMINAL_STATE')
      评估状态(db, { 周期: 条.周期, 状态: '已生成', 更新于: 条.生成于 })
    }
    return { 好: true, 写入: true, 版本: 新版 }
  }
  function 写(做) {
    try { 连接(); return 原子执行(上下文, 做) } catch (错) {
      const 代码 = /^SQLITE_(DIARY|STATE|CONTEXT)_[A-Z_]+$/u.test(错.message || '') ? 错.message : 'SQLITE_DIARY_WRITE_FAILED'
      return { 好: false, 状态: ['SQLITE_CONTEXT_COMMIT_UNKNOWN', 'SQLITE_CONTEXT_ROLLBACK_FAILED', 'SQLITE_CONTEXT_UNUSABLE'].includes(代码) ? 'unknown' : 代码 === 'SQLITE_CONTEXT_TRANSACTION_FAILED' ? 'rolled-back' : 'rejected', 代码 }
    }
  }
  function 删除(db, 可见性, 原) {
    const 一 = 纯数据(原); 文本(一.编号, 160); UTC(一.时间)
    const 行 = db.prepare('SELECT * FROM diary_entries WHERE visibility=? AND diary_id=?').get(可见性, 一.编号); if (!行) 失败('SQLITE_DIARY_NOT_FOUND'); 检查版本(行, 一.预期版本)
    const 条 = 读条(行)
    const 删除标记 = JSON.stringify({ 格式版本: 1, 编号: 条.编号, 类型: 条.类型, 周期: 条.周期, 可见性 })
    db.prepare('INSERT INTO diary_deleted VALUES(?,?,?,?,?,?,?)').run(可见性, 条.类型, 条.周期, 条.编号, 一.时间, 删除标记, 哈希(删除标记))
    db.prepare('DELETE FROM diary_entries WHERE visibility=? AND diary_id=?').run(可见性, 一.编号)
    if (可见性 === 'shared') 索引状态(db, 条, '已删除', 一.时间)
    else {
      const 旧 = db.prepare('SELECT * FROM diary_private_evaluations WHERE period=?').get(条.周期), 版 = (旧?.version ?? 0) + 1, 值 = { 周期: 条.周期, 状态: '已删除', 更新于: 一.时间, 尝试次数: 读条(旧)?.尝试次数 ?? 0, 下次尝试: '' }, 文 = JSON.stringify(值)
      db.prepare('INSERT INTO diary_private_evaluations VALUES(?,?,?,?) ON CONFLICT(period) DO UPDATE SET version=excluded.version,record_json=excluded.record_json,sha256=excluded.sha256').run(条.周期, 版, 文, 哈希(文))
    }
    return { 好: true, 编号: 一.编号 }
  }
  function 本机(范围) { if (范围?.用途 !== 'local-private-diary') 失败('SQLITE_DIARY_LOCAL_SCOPE_REQUIRED') }
  function 共享() { return 连接().prepare("SELECT * FROM diary_entries WHERE visibility='shared' ORDER BY period DESC,diary_id").all().map((x) => {
    const 条 = 规则.共享日记投影(读条(x)); if (!条) 失败('SQLITE_DIARY_INTEGRITY_FAILED')
    const 白名单 = { 格式版本: 条.格式版本, 编号: 条.编号, 类型: 条.类型, 周期: 条.周期, 开始: 条.开始, 结束: 条.结束, 标题: 条.标题, 可见性: 'shared', 模块: 条.模块.map(({ 名字, 正文, 来源 }) => ({ 名字, 正文, 来源 })), 来源: 条.来源.map(({ 编号, 类型, 时间, 标题, 摘要 }) => ({ 编号, 类型, 时间, 标题, 摘要 })), 生成于: 条.生成于, 修改于: 条.修改于 || '', 用户修改: 条.用户修改 === true }
    return { 版本: x.version, 日记: 白名单 }
  }) }
  return Object.freeze({
    写入共享(原) { return 写((db) => { const 一 = 纯数据(原); return 存篇(db, 校验(一.日记, 'shared'), 'shared', 一.预期版本) }) },
    写入私密(原) { return 写((db) => { const 一 = 纯数据(原); 版本(一.预期版本); return 存篇(db, 校验(一.日记, 'private'), 'private', 一.预期版本) }) },
    修改共享(原) { return 写((db) => {
      const 一 = 纯数据(原); UTC(一.时间); const 行 = db.prepare("SELECT * FROM diary_entries WHERE visibility='shared' AND diary_id=?").get(一.编号); if (!行) 失败('SQLITE_DIARY_NOT_FOUND'); 检查版本(行, 一.预期版本)
      const 旧 = 读条(行), 新 = 校验({ ...旧, 标题: 一.标题, 模块: 一.模块, 修改于: 一.时间, 用户修改: true }, 'shared'), 文 = JSON.stringify(新)
      db.prepare("UPDATE diary_entries SET version=version+1,record_json=?,sha256=? WHERE visibility='shared' AND diary_id=?").run(文, 哈希(文), 一.编号); return { 好: true, 版本: 行.version + 1 }
    }) },
    删除共享: (原) => 写((db) => 删除(db, 'shared', 原)),
    删除私密(原, 范围) { return 写((db) => { 本机(范围); return 删除(db, 'private', 原) }) },
    读取共享: 共享,
    导出共享: () => 共享().map((x) => x.日记),
    读取本机私密(范围) { 本机(范围); return 连接().prepare("SELECT * FROM diary_entries WHERE visibility='private' ORDER BY period DESC").all().map((x) => ({ 版本: x.version, 日记: 克隆(读条(x)) })) },
    记录私密评估(原) { return 写((db) => {
      const { 预期版本, ...一 } = 纯数据(原); 日周期(一.周期); 检查版本(db.prepare('SELECT * FROM diary_private_evaluations WHERE period=?').get(一.周期), 预期版本)
      if (['已生成', '已存在', '已删除'].includes(一.状态)) 失败('SQLITE_DIARY_EVALUATION_REQUIRES_ENTRY'); return { 好: true, 版本: 评估状态(db, 一) }
    }) },
    读取本机评估(范围) { 本机(范围); return 连接().prepare('SELECT * FROM diary_private_evaluations ORDER BY period').all().map((x) => ({ 版本: x.version, 评估: 读条(x) })) },
    核验() {
      const db = 连接(); if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) 失败('SQLITE_DIARY_INTEGRITY_FAILED')
      for (const 行 of db.prepare('SELECT * FROM diary_entries').all()) {
        const 条 = 校验(读条(行), 行.visibility)
        if (条.编号 !== 行.diary_id || 条.周期 !== 行.period || 条.类型 !== 行.diary_type || db.prepare('SELECT 1 FROM diary_deleted WHERE visibility=? AND diary_type=? AND period=?').get(行.visibility, 行.diary_type, 行.period)) 失败('SQLITE_DIARY_INTEGRITY_FAILED')
        if (行.visibility === 'private') { const 评 = 读条(db.prepare('SELECT * FROM diary_private_evaluations WHERE period=?').get(行.period)); if (!评 || !['已生成', '已存在'].includes(评.状态)) 失败('SQLITE_DIARY_INTEGRITY_FAILED') }
        else { const 索引 = 状态.读(db, 'diary-index', 'main').数据; if (!索引?.任务.some((x) => x.编号 === 条.编号 && x.状态 === '已完成')) 失败('SQLITE_DIARY_INTEGRITY_FAILED') }
      }
      for (const 行 of db.prepare('SELECT * FROM diary_deleted').all()) {
        const 条 = 读条(行); if (条.格式版本 !== 1 || 条.可见性 !== 行.visibility || 条.编号 !== 行.diary_id || 条.周期 !== 行.period || 条.类型 !== 行.diary_type || Object.keys(条).some((k) => !['格式版本', '编号', '类型', '周期', '可见性'].includes(k))) 失败('SQLITE_DIARY_INTEGRITY_FAILED')
        if (行.visibility === 'private') { if (读条(db.prepare('SELECT * FROM diary_private_evaluations WHERE period=?').get(行.period))?.状态 !== '已删除') 失败('SQLITE_DIARY_INTEGRITY_FAILED') }
        else if (!状态.读(db, 'diary-index', 'main').数据?.任务.some((x) => x.编号 === 行.diary_id && x.状态 === '已删除')) 失败('SQLITE_DIARY_INTEGRITY_FAILED')
      }
      for (const 行 of db.prepare('SELECT * FROM diary_private_evaluations').all()) {
        const 一 = 读条(行); if (一.周期 !== 行.period || !评估状态们.includes(一.状态) || Object.keys(一).some((k) => !['周期', '状态', '更新于', '尝试次数', '下次尝试'].includes(k))) 失败('SQLITE_DIARY_INTEGRITY_FAILED')
        if (['已生成', '已存在'].includes(一.状态) && !db.prepare("SELECT 1 FROM diary_entries WHERE visibility='private' AND period=?").get(行.period)) 失败('SQLITE_DIARY_INTEGRITY_FAILED')
        if (一.状态 === '已删除' && !db.prepare("SELECT 1 FROM diary_deleted WHERE visibility='private' AND period=?").get(行.period)) 失败('SQLITE_DIARY_INTEGRITY_FAILED')
      }
      return { 好: true }
    },
  })
}
module.exports = { 创建日记仓储 }
