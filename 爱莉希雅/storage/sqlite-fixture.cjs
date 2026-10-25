/** S-15A候选：只接受显式虚构字符串，只建立内存SQLite；无磁盘/业务模块依赖。 */
'use strict'
const { DatabaseSync } = require('node:sqlite')
const { createHash } = require('node:crypto')
const 版本 = 1
const 表定义 = Object.freeze({
  conversations: 'legacy_id TEXT, model TEXT, mode TEXT',
  messages: 'conversation_id TEXT, role TEXT, recorded_raw TEXT, occurred_raw TEXT, received_raw TEXT, content TEXT',
  long_memories: "category TEXT NOT NULL CHECK(category IN ('事实','经历','小本子')), legacy_id TEXT, time_raw TEXT, time_kind TEXT NOT NULL, conversation_id TEXT, temporary_id TEXT, content TEXT",
  temporary_memories: 'legacy_id TEXT, category TEXT, lifecycle TEXT, confirmation TEXT, source_conversation TEXT, source_time_raw TEXT, ledger_json TEXT CHECK(ledger_json IS NULL OR json_valid(ledger_json)), promotion_json TEXT CHECK(promotion_json IS NULL OR json_valid(promotion_json))',
  memory_evidence: "parent_ordinal INTEGER NOT NULL, group_name TEXT NOT NULL CHECK(group_name IN ('证据','评估历史')), evidence_ordinal INTEGER NOT NULL",
  memory_relations: 'legacy_id TEXT, relation_type TEXT, from_category TEXT, from_id TEXT, to_category TEXT, to_id TEXT',
  relation_suppressions: 'signature TEXT, time_raw TEXT',
  diaries: "legacy_id TEXT, visibility TEXT NOT NULL CHECK(visibility IN ('shared','private')), period TEXT, title TEXT, edited INTEGER NOT NULL CHECK(edited IN (0,1))",
  diary_tasks: 'legacy_id TEXT, period TEXT, status TEXT',
  private_evaluations: 'period TEXT, status TEXT',
  private_deletions: 'period TEXT NOT NULL',
  channel_sessions: 'address_key TEXT NOT NULL, internal_id TEXT NOT NULL',
  channel_tasks: 'legacy_id TEXT, internal_id TEXT, status TEXT, source_key TEXT',
  channel_logs: 'task_id TEXT, event TEXT, time_raw TEXT',
  usage_events: 'request_id TEXT, model TEXT, status TEXT, time_raw TEXT',
  extraction_buffer: 'conversation_id TEXT, message_id TEXT, source_time_raw TEXT, received_raw TEXT',
  auxiliary_state: 'state_type TEXT NOT NULL',
})
const 表们 = Object.freeze(Object.keys(表定义))
const 对象 = (值) => !!值 && Object.getPrototypeOf(值) === Object.prototype
const 哈希 = (值) => createHash('sha256').update(值, 'utf8').digest('hex')
function 失败(码 = 'SQLITE_FIXTURE_DATA_INVALID') { throw new Error(码) }
function 精确对象(值, 键们) {
  if (!对象(值)) 失败()
  const 描述 = Object.getOwnPropertyDescriptors(值), 键 = Reflect.ownKeys(描述)
  if (键.length !== 键们.length || 键.some((一) => !键们.includes(一) || !Object.hasOwn(描述[一], 'value') || !描述[一].enumerable)) 失败()
}
function 密数组(值) {
  if (!Array.isArray(值) || 值.length > 10000 || Reflect.ownKeys(值).length !== 值.length + 1) 失败()
  for (let i = 0; i < 值.length; i++) if (!Object.hasOwn(Object.getOwnPropertyDescriptor(值, String(i)) || {}, 'value')) 失败()
  return 值
}
function 文本(值) { if (值 === undefined || 值 === null) return null; if (typeof 值 !== 'string') 失败(); return 值 }
function 编号(值) { const 一 = 文本(值); return 一 === '' ? null : 一 }
function 时间类型(值) {
  if (!值 || !Number.isFinite(Date.parse(值))) return 'unknown'
  if (/Z$/u.test(值)) return 'utc'
  if (/[+-]\d\d:\d\d$/u.test(值)) return 'offset'
  return 'local-or-unspecified'
}
function 安全数值(值, 深度 = 0) {
  if (深度 > 48) 失败('SQLITE_FIXTURE_LIMIT')
  if (typeof 值 === 'number' && (!Number.isFinite(值) || (Number.isInteger(值) && !Number.isSafeInteger(值)))) 失败('SQLITE_FIXTURE_NUMBER_UNSAFE')
  if (值 && typeof 值 === 'object') for (const 一 of Object.values(值)) 安全数值(一, 深度 + 1)
}
function 创建样本库() {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true, enableDoubleQuotedStringLiterals: false, allowExtension: false })
  let 已关闭 = false
  const 检查 = () => { if (已关闭) 失败('SQLITE_FIXTURE_CLOSED') }
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA temp_store=MEMORY; PRAGMA user_version=1;')
    db.exec(`CREATE TABLE fixture_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
      CREATE TABLE source_documents (document_id TEXT PRIMARY KEY, position INTEGER NOT NULL UNIQUE CHECK(position>=0), source_type TEXT NOT NULL, original_text TEXT NOT NULL, sha256 TEXT NOT NULL) STRICT;
      CREATE TABLE migration_issues (position INTEGER PRIMARY KEY, document_id TEXT NOT NULL REFERENCES source_documents(document_id), ordinal INTEGER NOT NULL, code TEXT NOT NULL) STRICT;`)
    for (const [表, 列] of Object.entries(表定义)) db.exec(`CREATE TABLE ${表} (document_id TEXT NOT NULL REFERENCES source_documents(document_id), ordinal INTEGER NOT NULL CHECK(ordinal>=0), payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), ${列}, PRIMARY KEY(document_id,ordinal)${表 === 'memory_evidence' ? ', FOREIGN KEY(document_id,parent_ordinal) REFERENCES temporary_memories(document_id,ordinal)' : ''}) STRICT;`)
    db.exec(`CREATE UNIQUE INDEX conversations_identity ON conversations(legacy_id) WHERE legacy_id IS NOT NULL;
      CREATE UNIQUE INDEX long_identity ON long_memories(category,legacy_id) WHERE legacy_id IS NOT NULL;
      CREATE UNIQUE INDEX temporary_identity ON temporary_memories(legacy_id) WHERE legacy_id IS NOT NULL;
      CREATE UNIQUE INDEX relation_identity ON memory_relations(legacy_id) WHERE legacy_id IS NOT NULL;
      CREATE UNIQUE INDEX diary_identity ON diaries(visibility,legacy_id) WHERE legacy_id IS NOT NULL;
      CREATE UNIQUE INDEX diary_task_identity ON diary_tasks(legacy_id) WHERE legacy_id IS NOT NULL;
      CREATE UNIQUE INDEX channel_task_identity ON channel_tasks(legacy_id) WHERE legacy_id IS NOT NULL;
      CREATE UNIQUE INDEX channel_address ON channel_sessions(address_key);
      CREATE UNIQUE INDEX channel_internal ON channel_sessions(internal_id);
      CREATE INDEX messages_by_conversation ON messages(conversation_id,document_id,ordinal);
      CREATE INDEX temporary_by_lifecycle ON temporary_memories(lifecycle,confirmation);
      CREATE INDEX relations_by_source ON memory_relations(from_category,from_id);
      CREATE INDEX tasks_by_status ON channel_tasks(status);`)
    db.prepare('INSERT INTO fixture_meta VALUES(?,?)').run('schema_version', String(版本))
  } catch { db.close(); 失败('SQLITE_FIXTURE_SCHEMA_FAILED') }
  function 解析JSON(原) {
    try {
      const 文本值 = 原.replace(/^\uFEFF/u, '')
      // JSON.parse不报告重复键；借json_tree检测同一个对象下的重复成员，拒绝歧义。
      if (db.prepare('SELECT 1 AS duplicate FROM json_tree(?) WHERE key IS NOT NULL GROUP BY parent,key HAVING count(*)>1 LIMIT 1').get(文本值)) 失败('SQLITE_FIXTURE_DUPLICATE_KEY')
      const 值 = JSON.parse(文本值); 安全数值(值); return 值
    } catch (错) { if (错.message === 'SQLITE_FIXTURE_DUPLICATE_KEY' || 错.message === 'SQLITE_FIXTURE_NUMBER_UNSAFE' || 错.message === 'SQLITE_FIXTURE_LIMIT') throw 错; 失败('SQLITE_FIXTURE_JSON_INVALID') }
  }
  function 投影(包) {
    精确对象(包, ['版本', '用途', '文档'])
    if (包.版本 !== 1 || 包.用途 !== 'synthetic-sqlite-fixture') 失败('SQLITE_FIXTURE_SCOPE_REQUIRED')
    const 文档 = 密数组(包.文档)
    if (!文档.length || 文档.length > 64) 失败('SQLITE_FIXTURE_LIMIT')
    const 结果 = { sources: [], tables: Object.fromEntries(表们.map((一) => [一, []])), issues: [] }
    let 总字节 = 0, 总行 = 0
    function 加(表, 源, 顺序, 条, 列 = {}) {
      if (++总行 > 10000) 失败('SQLITE_FIXTURE_LIMIT')
      结果.tables[表].push({ document_id: 源, ordinal: 顺序, payload_json: JSON.stringify(条), ...列 })
    }
    function 问题(源, 顺序, 代码) { 结果.issues.push({ position: 结果.issues.length, document_id: 源, ordinal: 顺序, code: 代码 }) }
    function 记录们(值, 源, 表, 映射) {
      密数组(值).forEach((条, i) => { if (!对象(条)) 失败(); const 列 = 映射(条, i); 加(表, 源, i, 条, 列); if (Object.hasOwn(列, 'legacy_id') && 列.legacy_id === null) 问题(源, i, 'LEGACY_ID_MISSING') })
    }
    const 版本对象 = (值, 键, 号) => { if (!对象(值) || 值[键] !== 号) 失败('SQLITE_FIXTURE_VERSION_UNSUPPORTED') }
    for (const [位置, 源] of 文档.entries()) {
      精确对象(源, ['名称', '类型', '原文'])
      if (typeof 源.名称 !== 'string' || /^[a-z0-9][a-z0-9._-]{0,79}$/u.exec(源.名称)?.[0] !== 源.名称 || 源.名称.includes('..') || typeof 源.原文 !== 'string' || Buffer.from(源.原文).toString('utf8') !== 源.原文 || typeof 源.类型 !== 'string') 失败()
      const 字节 = Buffer.byteLength(源.原文); 总字节 += 字节
      if (字节 > 2 * 1024 * 1024 || 总字节 > 8 * 1024 * 1024) 失败('SQLITE_FIXTURE_LIMIT')
      结果.sources.push({ document_id: 源.名称, position: 位置, source_type: 源.类型, original_text: 源.原文, sha256: 哈希(源.原文) })
      const 是行 = ['messages', 'usage'].includes(源.类型)
      const 值 = 是行 ? 源.原文.split('\n').filter((行) => 行.trim()).map(解析JSON) : 解析JSON(源.原文)
      const 名 = 源.名称
      switch (源.类型) {
        case 'conversations': 记录们(值, 名, 'conversations', (条) => ({ legacy_id: 编号(条.编号), model: 文本(条.模型), mode: 文本(条.模式) })); break
        case 'messages': 记录们(值, 名, 'messages', (条, i) => {
          const conversation_id = 文本(条.对话); if (conversation_id === null) 问题(名, i, 'MESSAGE_CONVERSATION_MISSING')
          return { conversation_id, role: 文本(条.角色), recorded_raw: 文本(条.时间), occurred_raw: 文本(条.发生于), received_raw: 文本(条.接收于), content: 文本(条.内容) }
        }); break
        case 'facts': case 'episodes': case 'notebook': {
          const category = { facts: '事实', episodes: '经历', notebook: '小本子' }[源.类型]
          记录们(值, 名, 'long_memories', (条) => ({ category, legacy_id: 编号(条.编号), time_raw: 文本(条.时间), time_kind: 时间类型(条.时间), conversation_id: 文本(条.对话), temporary_id: 文本(条.临时记忆), content: 文本(条.内容) })); break
        }
        case 'temporary': {
          版本对象(值, '版本', 1)
          记录们(值.记录, 名, 'temporary_memories', (条, i) => {
            if (条.评估账本 !== undefined && 条.评估账本 !== null && !对象(条.评估账本)) 失败()
            if (条.来源 !== undefined && 条.来源 !== null && !对象(条.来源)) 失败()
            for (const 组 of ['证据', '评估历史']) if (条.评估账本?.[组] !== undefined) 密数组(条.评估账本[组]).forEach((证据, j) => {
              if (!对象(证据)) 失败(); 加('memory_evidence', 名, 结果.tables.memory_evidence.filter((一) => 一.document_id === 名).length, 证据, { parent_ordinal: i, group_name: 组, evidence_ordinal: j })
            })
            return { legacy_id: 编号(条.编号), category: 文本(条.类别), lifecycle: 文本(条.生命周期), confirmation: 文本(条.确认状态), source_conversation: 文本(条.来源?.对话), source_time_raw: 文本(条.来源?.消息时间), ledger_json: 条.评估账本 === undefined ? null : JSON.stringify(条.评估账本), promotion_json: 条.晋升 === undefined ? null : JSON.stringify(条.晋升) }
          }); break
        }
        case 'relations':
          版本对象(值, '格式版本', 2)
          记录们(值.关系, 名, 'memory_relations', (条) => ({ legacy_id: 编号(条.编号), relation_type: 文本(条.类型), from_category: 文本(条.从?.类别), from_id: 文本(条.从?.编号), to_category: 文本(条.到?.类别), to_id: 文本(条.到?.编号) }))
          记录们(值.自动抑制, 名, 'relation_suppressions', (条) => ({ signature: 文本(条.签名), time_raw: 文本(条.时间) })); break
        case 'diary': case 'private-diary': {
          版本对象(值, '格式版本', 1)
          const visibility = 值.可见性 === undefined ? 'shared' : 值.可见性
          if (!['shared', 'private'].includes(visibility) || (源.类型 === 'private-diary' && visibility !== 'private')) 失败('SQLITE_FIXTURE_VISIBILITY_INVALID')
          加('diaries', 名, 0, 值, { legacy_id: 编号(值.编号), visibility, period: 文本(值.周期), title: 文本(值.标题), edited: 值.用户修改 === true ? 1 : 0 }); break
        }
        case 'diary-index': case 'private-evaluations':
          版本对象(值, '格式版本', 1)
          记录们(值.任务, 名, 源.类型 === 'diary-index' ? 'diary_tasks' : 'private_evaluations', (条) => ({ ...(源.类型 === 'diary-index' ? { legacy_id: 编号(条.编号) } : {}), period: 文本(条.周期), status: 文本(条.状态) })); break
        case 'private-deletions':
          版本对象(值, '格式版本', 1); 密数组(值.周期).forEach((期, i) => { if (typeof 期 !== 'string' || !/^\d{4}-\d\d-\d\d$/u.test(期)) 失败(); 加('private_deletions', 名, i, 期, { period: 期 }) }); break
        case 'channel-map':
          版本对象(值, '版本', 1)
          记录们(值.记录, 名, 'channel_sessions', (条) => {
            const 地址 = [文本(条.端点?.渠道), 文本(条.端点?.账号), 文本(条.会话?.类型), 文本(条.会话?.编号), 文本(条.发送者编号)], id = 文本(条.内部对话编号)
            if (地址.some((一) => 一 === null) || !id) 失败()
            return { address_key: JSON.stringify(地址), internal_id: id }
          }); break
        case 'channel-tasks':
          版本对象(值, '版本', 1)
          记录们(值.记录, 名, 'channel_tasks', (条) => ({ legacy_id: 编号(条.编号), internal_id: 文本(条.内部对话编号), status: 文本(条.状态), source_key: 文本(条.来源键) }))
          记录们(值.日志, 名, 'channel_logs', (条) => ({ task_id: 文本(条.任务), event: 文本(条.事件), time_raw: 文本(条.于) })); break
        case 'usage': 记录们(值, 名, 'usage_events', (条) => ({ request_id: 文本(条.请求编号), model: 文本(条.模型), status: 文本(条.状态), time_raw: 文本(条.时间) })); break
        case 'extraction-buffer':
          版本对象(值, '版本', 1)
          记录们(值.轮次, 名, 'extraction_buffer', (条) => ({ conversation_id: 文本(条.对话), message_id: 文本(条.消息编号), source_time_raw: 文本(条.消息时间), received_raw: 文本(条.接收于) })); break
        case 'auxiliary': if (!对象(值)) 失败(); 加('auxiliary_state', 名, 0, 值, { state_type: 名 }); break
        default: 失败('SQLITE_FIXTURE_TYPE_UNSUPPORTED')
      }
    }
    return 结果
  }
  function 行们(表) { return db.prepare(`SELECT * FROM ${表} ORDER BY document_id,ordinal`).all().map((一) => ({ ...一 })) }
  function 快照() { return { 版本: 1, 用途: 'synthetic-sqlite-fixture', 文档: db.prepare('SELECT * FROM source_documents ORDER BY position').all().map((一) => ({ 名称: 一.document_id, 类型: 一.source_type, 原文: 一.original_text })) } }
  function 核验() {
    检查()
    if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) 失败('SQLITE_FIXTURE_INTEGRITY_FAILED')
    const 包 = 快照(), 指纹 = db.prepare('SELECT value FROM fixture_meta WHERE key=?').get('bundle_hash')?.value
    if (!指纹 || 哈希(JSON.stringify(包)) !== 指纹) 失败('SQLITE_FIXTURE_INTEGRITY_FAILED')
    const 预期 = 投影(包)
    if (JSON.stringify(db.prepare('SELECT * FROM source_documents ORDER BY position').all().map((一) => ({ ...一 }))) !== JSON.stringify(预期.sources) || JSON.stringify(db.prepare('SELECT * FROM migration_issues ORDER BY position').all().map((一) => ({ ...一 }))) !== JSON.stringify(预期.issues)) 失败('SQLITE_FIXTURE_INTEGRITY_FAILED')
    for (const 表 of 表们) {
      const 原 = [...预期.tables[表]].sort((a, b) => a.document_id < b.document_id ? -1 : a.document_id > b.document_id ? 1 : a.ordinal - b.ordinal)
      if (JSON.stringify(行们(表)) !== JSON.stringify(原)) 失败('SQLITE_FIXTURE_INTEGRITY_FAILED')
    }
    return { 好: true, 文档数: 包.文档.length, 指纹 }
  }
  return Object.freeze({
    导入(包) {
      检查(); const 投 = 投影(包), 规范包 = { 版本: 1, 用途: 'synthetic-sqlite-fixture', 文档: 投.sources.map((一) => ({ 名称: 一.document_id, 类型: 一.source_type, 原文: 一.original_text })) }, 指纹 = 哈希(JSON.stringify(规范包)), 已有 = db.prepare('SELECT value FROM fixture_meta WHERE key=?').get('bundle_hash')?.value
      if (已有) { if (已有 !== 指纹) 失败('SQLITE_FIXTURE_NOT_EMPTY'); 核验(); return { 好: true, 新导入: false, 指纹 } }
      db.exec('BEGIN IMMEDIATE')
      try {
        const 源句 = db.prepare('INSERT INTO source_documents VALUES(?,?,?,?,?)')
        for (const 一 of 投.sources) 源句.run(一.document_id, 一.position, 一.source_type, 一.original_text, 一.sha256)
        for (const 表 of 表们) for (const 一 of 投.tables[表]) { const 键 = Object.keys(一); db.prepare(`INSERT INTO ${表}(${键.join(',')}) VALUES(${键.map(() => '?').join(',')})`).run(...Object.values(一)) }
        for (const 一 of 投.issues) db.prepare('INSERT INTO migration_issues VALUES(?,?,?,?)').run(一.position, 一.document_id, 一.ordinal, 一.code)
        db.prepare('INSERT INTO fixture_meta VALUES(?,?)').run('bundle_hash', 指纹)
        核验(); db.exec('COMMIT'); return { 好: true, 新导入: true, 指纹 }
      } catch (错) { db.exec('ROLLBACK'); if (/^SQLITE_FIXTURE_[A-Z_]+$/u.test(错.message)) throw 错; 失败('SQLITE_FIXTURE_IMPORT_FAILED') }
    },
    核验,
    导出回退快照(范围) { 检查(); if (!范围 || 范围.用途 !== 'migration-rollback' || 范围.包含私密 !== true) 失败('SQLITE_FIXTURE_EXPORT_SCOPE_REQUIRED'); 核验(); return 快照() },
    查看映射(表, 范围) { 检查(); if (!表们.includes(表) || 范围?.用途 !== 'migration-audit') 失败('SQLITE_FIXTURE_AUDIT_SCOPE_REQUIRED'); return 行们(表) },
    读取共享日记() { 检查(); return db.prepare("SELECT payload_json FROM diaries WHERE visibility='shared' ORDER BY document_id,ordinal").all().map((一) => { const 条 = JSON.parse(一.payload_json); return { 编号: 条.编号, 标题: 条.标题, 模块: 条.模块, 可见性: 'shared' } }) },
    取统计() { 检查(); return { schema: 版本, sqlite: db.prepare('SELECT sqlite_version() AS v').get().v, 内存库: true, 文档数: db.prepare('SELECT count(*) AS n FROM source_documents').get().n, 各表: Object.fromEntries(表们.map((表) => [表, db.prepare(`SELECT count(*) AS n FROM ${表}`).get().n])), 问题数: db.prepare('SELECT count(*) AS n FROM migration_issues').get().n } },
    关闭() { if (!已关闭) { 已关闭 = true; db.close() } },
  })
}
module.exports = { 创建样本库, 版本, 表们 }
