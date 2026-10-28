/** S-15C：共用旧状态规则的内存SQLite记忆仓储；无配置/文件/模型依赖。 */
'use strict'
const { randomUUID, createHash } = require('node:crypto')
const { 取内部, 原子执行 } = require('./sqlite-context.cjs')
const { 创建会话仓储, 内部消息对象 } = require('./sqlite-chat.cjs')
const { 读取旧来源, 保留旧长期口吻, 核验旧记忆基线 } = require('./sqlite-legacy-source.cjs')
const 状态 = require('../脑/临时记忆状态.cjs')
const 自评 = require('../脑/临时记忆自主评估.cjs')
const 结构 = require('../脑/记忆结构.cjs')
const 叙述 = require('../脑/记忆叙述.cjs')
const { 晋升到长期 } = require('../脑/临时记忆晋升.cjs')
const 长期分类 = ['事实', '经历', '小本子']
const 标记事务句柄 = new WeakMap()
const 事务内记忆句柄 = new WeakMap()
const 定义 = [
  ['memory_temporary', "CREATE TABLE memory_temporary (memory_id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL, confirmation TEXT NOT NULL, expires_raw TEXT NOT NULL, record_json TEXT NOT NULL CHECK(json_valid(record_json))) STRICT"],
  ['memory_evidence', 'CREATE TABLE memory_evidence (memory_id TEXT NOT NULL REFERENCES memory_temporary(memory_id) ON DELETE CASCADE, fingerprint TEXT NOT NULL, position INTEGER NOT NULL, record_json TEXT NOT NULL CHECK(json_valid(record_json)), PRIMARY KEY(memory_id,fingerprint), UNIQUE(memory_id,position)) STRICT'],
  ['memory_assessments', 'CREATE TABLE memory_assessments (memory_id TEXT NOT NULL REFERENCES memory_temporary(memory_id) ON DELETE CASCADE, position INTEGER NOT NULL, record_json TEXT NOT NULL CHECK(json_valid(record_json)), PRIMARY KEY(memory_id,position)) STRICT'],
  ['memory_long', "CREATE TABLE memory_long (category TEXT NOT NULL CHECK(category IN ('事实','经历','小本子')), memory_id TEXT NOT NULL, source_temporary TEXT UNIQUE, record_json TEXT NOT NULL CHECK(json_valid(record_json)), PRIMARY KEY(category,memory_id)) STRICT"],
  ['memory_operations', 'CREATE TABLE memory_operations (operation_id TEXT PRIMARY KEY, kind TEXT NOT NULL, digest TEXT NOT NULL, receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json)), receipt_hash TEXT NOT NULL) STRICT'],
  ['memory_tombstones', 'CREATE TABLE memory_tombstones (memory_id TEXT PRIMARY KEY, deleted_raw TEXT NOT NULL, record_json TEXT NOT NULL CHECK(json_valid(record_json))) STRICT'],
  ['memory_long_deleted', 'CREATE TABLE memory_long_deleted (category TEXT NOT NULL, memory_id TEXT NOT NULL, deleted_raw TEXT NOT NULL, record_json TEXT NOT NULL CHECK(json_valid(record_json)), PRIMARY KEY(category,memory_id)) STRICT'],
]
function 失败(码 = 'SQLITE_MEMORY_INPUT_INVALID') { throw new Error(码) }
function 编号(一) { if (typeof 一 !== 'string' || /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.exec(一)?.[0] !== 一) 失败(); return 一 }
function UTC(一) { if (typeof 一 !== 'string' || !Number.isFinite(Date.parse(一)) || new Date(一).toISOString() !== 一) 失败(); return 一 }
function 整数(一, 最小 = 0, 最大 = Number.MAX_SAFE_INTEGER - 1) { if (!Number.isSafeInteger(一) || 一 < 最小 || 一 > 最大) 失败(); return 一 }
function 文本(一, 长 = 4000) { if (typeof 一 !== 'string' || !一.trim() || 一.length > 长 || Buffer.from(一).toString('utf8') !== 一) 失败(); return 一 }
function 纯输入(原) {
  let 节点 = 0
  function 复制(一, 深 = 0) {
    if (++节点 > 10000 || 深 > 24) 失败()
    if (一 === null || typeof 一 === 'boolean') return 一
    if (typeof 一 === 'string') { if (一.length > 65536 || Buffer.from(一).toString('utf8') !== 一) 失败(); return 一 }
    if (typeof 一 === 'number') { if (!Number.isFinite(一) || (Number.isInteger(一) && !Number.isSafeInteger(一))) 失败(); return 一 }
    if (!一 || (!Array.isArray(一) && Object.getPrototypeOf(一) !== Object.prototype)) 失败()
    const 描述 = Object.getOwnPropertyDescriptors(一), 键 = Reflect.ownKeys(描述).filter((k) => !(Array.isArray(一) && k === 'length'))
    if (键.some((k) => typeof k !== 'string' || !Object.hasOwn(描述[k], 'value') || !描述[k].enumerable)) 失败()
    if (Array.isArray(一)) { if (一.length > 1000 || 键.length !== 一.length || 键.some((k, i) => k !== String(i))) 失败(); return 键.map((k) => 复制(描述[k].value, 深 + 1)) }
    return Object.fromEntries(键.sort().map((k) => [k, 复制(描述[k].value, 深 + 1)]))
  }
  const 值 = 复制(原); if (!值 || Array.isArray(值) || typeof 值 !== 'object' || Buffer.byteLength(JSON.stringify(值)) > 262144) 失败(); return 值
}
function 键检查(一, 键) { if (!一 || Object.getPrototypeOf(一) !== Object.prototype || Object.keys(一).some((k) => !键.includes(k))) 失败() }
const 克隆 = (一) => JSON.parse(JSON.stringify(一))
const 指纹 = (一) => createHash('sha256').update(JSON.stringify(一)).digest('hex')
function 有敏感(一) {
  if (typeof 一 === 'string') return 自评.有敏感或内部内容(一)
  if (!一 || typeof 一 !== 'object') return false
  return Object.entries(一).some(([k, v]) => 自评.有敏感或内部内容(k + ': ' + (typeof v === 'string' ? v : '')) || 有敏感(v))
}
function 创建记忆仓储(上下文) {
  let 允许事务内调用 = false
  创建会话仓储(上下文)
  const 初 = 取内部(上下文).db, 规范SQL = (文) => 文.replace(/\s+/gu, ' ').trim()
  function 架构(db) {
    if (db.prepare("SELECT value FROM repository_meta WHERE key='memory_schema'").get()?.value !== '1') 失败('SQLITE_MEMORY_SCHEMA_INVALID')
    for (const [名, SQL] of 定义) { const 行 = db.prepare("SELECT sql FROM sqlite_schema WHERE name=? AND type='table'").get(名); if (!行 || 规范SQL(行.sql) !== 规范SQL(SQL)) 失败('SQLITE_MEMORY_SCHEMA_INVALID') }
  }
  try {
    if (初.prepare("SELECT value FROM repository_meta WHERE key='memory_schema'").get()) 架构(初)
    else 原子执行(上下文, (db) => {
      if (定义.some(([名]) => db.prepare('SELECT 1 FROM sqlite_schema WHERE name=?').get(名))) 失败('SQLITE_MEMORY_SCHEMA_INVALID')
      for (const [, SQL] of 定义) db.exec(SQL)
      db.prepare('INSERT INTO repository_meta VALUES(?,?)').run('memory_schema', '1'); db.prepare('INSERT INTO repository_meta VALUES(?,?)').run('memory_revision', '0')
    })
  } catch (错) { if (/^SQLITE_[A-Z_]+$/u.test(错.message || '')) throw 错; 失败('SQLITE_MEMORY_SCHEMA_INVALID') }
  function 连接() { const db = 取内部(上下文).db; 架构(db); 核验旧记忆基线(上下文); return db }
  function 版本(db) { const 文 = db.prepare("SELECT value FROM repository_meta WHERE key='memory_revision'").get()?.value, 数 = Number(文); if (!Number.isSafeInteger(数) || 数 < 0 || 数 >= Number.MAX_SAFE_INTEGER || String(数) !== 文) 失败('SQLITE_MEMORY_INTEGRITY_FAILED'); return 数 }
  function 读数据(db) { return { 版本: 1, 记录: db.prepare('SELECT record_json FROM memory_temporary ORDER BY rowid').all().map((一) => JSON.parse(一.record_json)) } }
  function 保存数据(db, 数据, 时间) {
    const 旧表 = new Map(db.prepare('SELECT memory_id,record_json FROM memory_temporary').all().map((一) => [一.memory_id, 一.record_json])), 已见 = new Set()
    for (const 条 of 数据.记录) {
      编号(条.编号); if (已见.has(条.编号)) 失败('SQLITE_MEMORY_INTEGRITY_FAILED'); 已见.add(条.编号)
      const 原 = JSON.stringify(条); if (旧表.get(条.编号) === 原) continue
      db.prepare('INSERT INTO memory_temporary VALUES(?,?,?,?,?) ON CONFLICT(memory_id) DO UPDATE SET lifecycle=excluded.lifecycle,confirmation=excluded.confirmation,expires_raw=excluded.expires_raw,record_json=excluded.record_json').run(条.编号, 条.生命周期, 条.确认状态, 条.到期于, 原)
      db.prepare('DELETE FROM memory_evidence WHERE memory_id=?').run(条.编号); db.prepare('DELETE FROM memory_assessments WHERE memory_id=?').run(条.编号)
      for (const [i, 一] of (条.评估账本?.证据 || []).entries()) db.prepare('INSERT INTO memory_evidence VALUES(?,?,?,?)').run(条.编号, 一.指纹, i, JSON.stringify(一))
      for (const [i, 一] of (条.评估账本?.评估历史 || []).entries()) db.prepare('INSERT INTO memory_assessments VALUES(?,?,?)').run(条.编号, i, JSON.stringify(一))
    }
    for (const [号, 原] of 旧表) if (!已见.has(号)) {
      db.prepare('INSERT INTO memory_tombstones VALUES(?,?,?)').run(号, 时间, 原)
      db.prepare('DELETE FROM memory_temporary WHERE memory_id=?').run(号)
    }
  }
  function 临时库(db, 时间) { return 状态.创建临时记忆状态({ 文件: ':memory:', 现在: () => new Date(时间), 新编号: randomUUID, 读数据: () => 读数据(db), 写数据: (数据) => 保存数据(db, 数据, 时间) }) }
  function 状态调用(做) {
    try { const 果 = 做(); if (果 === false || 果?.好 === false) 失败('SQLITE_MEMORY_STATE_REJECTED'); return 果 }
    catch (错) { if (/^ERR_SQLITE/u.test(错.code || '') || /^SQLITE_/u.test(错.message || '')) throw 错; 失败('SQLITE_MEMORY_STATE_REJECTED') }
  }
  function 来源(db, 号, 要许可 = false) {
    编号(号); const 行 = db.prepare('SELECT * FROM chat_messages WHERE message_id=?').get(号)
    if (!行) {
      try { const 旧 = 读取旧来源(上下文, 号, 要许可); if (旧) return 旧 }
      catch (错) { if (错.message === 'SQLITE_LEGACY_SWITCH_OFF') 失败('SQLITE_MEMORY_SWITCH_OFF'); throw 错 }
      失败('SQLITE_MEMORY_SOURCE_INVALID')
    }
    if (行.role !== 'user') 失败('SQLITE_MEMORY_SOURCE_INVALID')
    const 条 = 内部消息对象(行), 段 = db.prepare('SELECT write_memory FROM chat_sessions WHERE conversation_id=?').get(条.对话)
    if (要许可 && 段?.write_memory !== 1) 失败('SQLITE_MEMORY_SWITCH_OFF')
    return 条
  }
  function 长期库(db, 时间) { return {
    全部长期记忆: () => db.prepare('SELECT record_json FROM memory_long').all().map((一) => JSON.parse(一.record_json)),
    记一条(类别, 内容, 来源 = '我', 上下文 = {}) {
      if (!长期分类.includes(类别)) 失败()
      const 元数据 = 结构.正常元数据(上下文.元数据, { 类别, 来源, 严格: true }), 正文 = 叙述.整理正文(内容, { 人物: 元数据.person, 修正旧代词: true })
      文本(正文); const 条 = { 编号: randomUUID(), 时间, 类别, 内容: 正文, 来源, 记忆类型: 结构.正常记忆类型(上下文.记忆类型, 类别, { 严格: true }), 元数据 }
      if (上下文.对话) 条.对话 = 上下文.对话
      if (上下文.临时记忆) 条.临时记忆 = 上下文.临时记忆
      if (上下文.自主评估) 条.自主评估 = 克隆(上下文.自主评估)
      db.prepare('INSERT INTO memory_long VALUES(?,?,?,?)').run(类别, 条.编号, 条.临时记忆 ?? null, JSON.stringify(条)); return 条
    },
  } }
  function 晋升(db, 库, 条, 去向, 时间) {
    if (!长期分类.includes(去向)) 失败()
    if (条.生命周期 === '已晋升') {
      const 目标 = db.prepare('SELECT record_json FROM memory_long WHERE source_temporary=?').get(条.编号)
      if (!目标 && db.prepare('SELECT 1 FROM memory_long_deleted WHERE category=? AND memory_id=?').get(条.晋升?.去向, 条.晋升?.目标编号)) 失败('SQLITE_MEMORY_TARGET_FORGOTTEN')
      if (!目标 || JSON.parse(目标.record_json).编号 !== 条.晋升?.目标编号 || 条.晋升.去向 !== 去向) 失败('SQLITE_MEMORY_INTEGRITY_FAILED')
    }
    return 状态调用(() => 晋升到长期({ 临时库: 库, 长期库: 长期库(db, 时间), 编号: 条.编号, 去向 }))
  }
  function 写操作(类型, 原, 允许, 做) {
    try {
      const 一 = 纯输入(原); 键检查(一, ['操作编号', '时间', '预期版本', ...允许]); 编号(一.操作编号); UTC(一.时间); 整数(一.预期版本)
      const 摘要 = 指纹({ 类型, 输入: 一 }); 连接()
      const 执行 = (db) => {
        const 旧 = db.prepare('SELECT * FROM memory_operations WHERE operation_id=?').get(一.操作编号)
        if (旧) { if (旧.kind !== 类型 || 旧.digest !== 摘要) 失败('SQLITE_MEMORY_OPERATION_CONFLICT'); if (指纹(JSON.parse(旧.receipt_json)) !== 旧.receipt_hash) 失败('SQLITE_MEMORY_INTEGRITY_FAILED'); return JSON.parse(旧.receipt_json) }
        const 原版本 = 版本(db); if (原版本 !== 一.预期版本) 失败('SQLITE_MEMORY_VERSION_CONFLICT')
        const 结果 = 做(db, 一, 临时库(db, 一.时间))
        const 新版本 = 原版本 + 1; 整数(新版本)
        db.prepare("UPDATE repository_meta SET value=? WHERE key='memory_revision'").run(String(新版本))
        const 回执 = { 好: true, 状态: 'committed', 操作编号: 一.操作编号, 版本: 新版本, ...结果 }
        db.prepare('INSERT INTO memory_operations VALUES(?,?,?,?,?)').run(一.操作编号, 类型, 摘要, JSON.stringify(回执), 指纹(回执)); return 回执
      }
      return 允许事务内调用 ? 执行(取内部(上下文).db) : 原子执行(上下文, 执行)
    } catch (错) {
      const 代码 = /^SQLITE_(MEMORY|CONTEXT|CHAT|LEGACY)_[A-Z_]+$/u.test(错.message || '') ? 错.message : 'SQLITE_MEMORY_WRITE_FAILED'
      return { 好: false, 状态: ['SQLITE_CONTEXT_COMMIT_UNKNOWN', 'SQLITE_CONTEXT_ROLLBACK_FAILED', 'SQLITE_CONTEXT_UNUSABLE'].includes(代码) ? 'unknown' : 代码 === 'SQLITE_CONTEXT_TRANSACTION_FAILED' ? 'rolled-back' : 'rejected', 代码 }
    }
  }
  标记事务句柄.set(上下文, 原 => {
    const 内部 = 取内部(上下文)
    if (!内部.写入中 || !内部.db.isTransaction) 失败('SQLITE_MEMORY_TRANSACTION_REQUIRED')
    const db = 连接(), 一 = 纯输入(原)
    键检查(一, ['操作编号', '时间', '预期版本', '对话', '记住', '经历', '更正事实'])
    编号(一.操作编号); UTC(一.时间); 整数(一.预期版本); 编号(一.对话)
    if (!Array.isArray(一.记住) || !Array.isArray(一.经历) || !Array.isArray(一.更正事实) || 一.记住.length + 一.经历.length + 一.更正事实.length > 32) 失败()
    for (const 内容 of [...一.记住, ...一.经历]) 文本(内容)
    for (const 更 of 一.更正事实) {
      键检查(更, ['编号', '内容'])
      if (typeof 更.编号 !== 'string' || !更.编号.trim() || 更.编号.length > 120 || typeof 更.内容 !== 'string' || Buffer.from(更.内容).toString('utf8') !== 更.内容) 失败()
    }
    const 段 = db.prepare('SELECT write_memory FROM chat_sessions WHERE conversation_id=?').get(一.对话)
    if (!段) 失败('SQLITE_MEMORY_SOURCE_INVALID')
    if (段.write_memory !== 1) 失败('SQLITE_MEMORY_SWITCH_OFF')
    const 类型 = 'model-markers', 摘要 = 指纹({ 类型, 输入: 一 }), 旧 = db.prepare('SELECT * FROM memory_operations WHERE operation_id=?').get(一.操作编号)
    if (旧) {
      if (旧.kind !== 类型 || 旧.digest !== 摘要) 失败('SQLITE_MEMORY_OPERATION_CONFLICT')
      if (指纹(JSON.parse(旧.receipt_json)) !== 旧.receipt_hash) 失败('SQLITE_MEMORY_INTEGRITY_FAILED')
      return JSON.parse(旧.receipt_json)
    }
    const 原版本 = 版本(db); if (原版本 !== 一.预期版本) 失败('SQLITE_MEMORY_VERSION_CONFLICT')
    const 已更正内容 = new Set(); let 更正数 = 0, 跳过更正数 = 0, 新增数 = 0
    for (const 更 of 一.更正事实) {
      const 内容 = 更.内容.trim(), 号 = 更.编号.trim()
      if (!内容 || 内容.length > 2000) { 跳过更正数++; continue }
      const 行 = db.prepare('SELECT record_json FROM memory_long WHERE category=? AND memory_id=?').get('事实', 号)
      if (!行) { 跳过更正数++; continue }
      const 条 = JSON.parse(行.record_json), 元数据 = 结构.规范记忆结构(条, '事实', 条.来源).元数据
      const 正文 = 叙述.整理正文(内容, { 人物: 元数据.person, 修正旧代词: true })
      已更正内容.add(内容)
      if (正文 === String(条.内容 || '').trim()) continue
      条.内容 = 正文; 条.修改于 = 一.时间; 条.修改来源 = '我'; 条.修改对话 = 一.对话
      db.prepare('UPDATE memory_long SET record_json=? WHERE category=? AND memory_id=?').run(JSON.stringify(条), '事实', 号); 更正数++
    }
    const 库 = 长期库(db, 一.时间)
    for (const 内容 of 一.记住) if (!已更正内容.has(内容.trim())) { 库.记一条('事实', 内容, '她', { 对话: 一.对话 }); 新增数++ }
    for (const 内容 of 一.经历) { 库.记一条('经历', 内容, '她', { 对话: 一.对话 }); 新增数++ }
    const 新版本 = 原版本 + 1; 整数(新版本)
    db.prepare("UPDATE repository_meta SET value=? WHERE key='memory_revision'").run(String(新版本))
    const 回执 = { 好: true, 状态: 'committed', 操作编号: 一.操作编号, 版本: 新版本, 新增数, 更正数, 跳过更正数 }
    db.prepare('INSERT INTO memory_operations VALUES(?,?,?,?,?)').run(一.操作编号, 类型, 摘要, JSON.stringify(回执), 指纹(回执))
    return 回执
  })
  function 读(做) { try { return 做(连接()) } catch (错) { if (/^SQLITE_(MEMORY|CONTEXT|CHAT|LEGACY)_[A-Z_]+$/u.test(错.message || '')) throw 错; 失败('SQLITE_MEMORY_READ_FAILED') } }
  const api = Object.freeze({
    新增临时(原) { return 写操作('create-temp', 原, ['类别', '内容', '细节', '来源消息编号', '依据原文', '扩展'], (db, 一, 库) => {
      if (!状态.固定分类.includes(一.类别)) 失败(); 文本(一.内容)
      const 细节 = 一.细节 === undefined ? {} : 一.细节; 键检查(细节, ['记忆类型', '元数据', '标签', '重要性', '保留天数', '手动'])
      if (细节.手动 !== undefined && typeof 细节.手动 !== 'boolean') 失败()
      const 手动 = 细节.手动 === true, 源 = 一.来源消息编号 === undefined ? null : 来源(db, 一.来源消息编号, !手动)
      if (!手动 && (!源 || !文本(一.依据原文, 500) || !源.内容.includes(一.依据原文) || 有敏感(一))) 失败('SQLITE_MEMORY_EVIDENCE_INVALID')
      const 默认天数 = 状态.默认保留天数[一.类别], 天数 = 细节.保留天数 === undefined ? 默认天数 : 整数(细节.保留天数, 1, 手动 ? 30 : 默认天数)
      const 条 = 状态调用(() => 库.新增(一.类别, 一.内容, { ...细节, 保留天数: 天数, 创建于: 一.时间, 提取方式: 手动 ? '手动' : '模型提取', 来源对话: 源?.对话 ?? '', 来源消息时间: 源?.时间 ?? '' }))
      const 数据 = 读数据(db), 存 = 数据.记录.find((x) => x.编号 === 条.编号)
      if (源) { 存.来源.消息编号 = 源.编号; if (源.旧档内部定位) 存.来源.旧档内部定位 = 源.旧档内部定位 }
      if (一.依据原文 !== undefined) 存.依据原文 = 一.依据原文
      if (一.扩展 !== undefined) 存.扩展 = 一.扩展
      保存数据(db, 数据, 一.时间); return { 临时编号: 条.编号 }
    }) },
    评估并晋升(原) { return 写操作('evaluate-promote', 原, ['编号', '消息编号'], (db, 一, 库) => {
      编号(一.编号); const 条 = 库.取一条(一.编号); if (!条) 失败('SQLITE_MEMORY_NOT_FOUND')
      if (条.生命周期 === '已晋升') { const 回 = 晋升(db, 库, 条, 条.晋升.去向, 一.时间); return { 临时编号: 条.编号, 目标编号: 回.目标编号, 晋升: true, 没变化: true } }
      if (条.确认状态 !== '待确认' || !['有效', '已归档'].includes(条.生命周期) || 状态.读取关系(条.关系).状态 !== '当前' || 有敏感(条)) 失败('SQLITE_MEMORY_AUTOMATION_BLOCKED')
      if (条.生命周期 === '有效' && Date.parse(条.到期于) <= Date.parse(一.时间)) 失败('SQLITE_MEMORY_EXPIRED')
      if (!Array.isArray(一.消息编号) || !一.消息编号.length || 一.消息编号.length > 60) 失败()
      if (条.来源?.消息编号) 来源(db, 条.来源.消息编号, true)
      let 消息们 = 一.消息编号.map((号) => 来源(db, 号, true)), 既有提及 = 0
      if (条.生命周期 === '已归档' && !条.评估账本 && 条.来源?.消息编号) {
        const 原源 = 来源(db, 条.来源.消息编号, true), 老指纹 = 自评.证据指纹({ 对话: 原源.对话, 消息时间: 原源.时间, 依据原文: 原源.内容 })
        消息们 = 消息们.filter((x) => 自评.证据指纹({ 对话: x.对话, 消息时间: x.时间, 依据原文: x.内容 }) !== 老指纹)
        if (!消息们.length) 失败('SQLITE_MEMORY_NO_NEW_EVIDENCE')
        既有提及 = 1
      }
      const 轮次 = 消息们.map((x) => ({ 对话: x.对话, 用户原话: x.内容, 消息时间: x.时间 }))
      const 评估 = 自评.评估({ 候选: 条, 对话轮次: 轮次, 既有提及 })
      if (!评估.新增提及次数 && (条.生命周期 === '已归档' || !条.评估账本)) 失败('SQLITE_MEMORY_NO_NEW_EVIDENCE')
      let 复活 = false
      if (评估.新增提及次数) 复活 = 状态调用(() => 库.记录评估(条.编号, 评估)).复活
      if (!评估.可自主 || !评估.依据.length) return { 临时编号: 条.编号, 分数: 评估.分数, 晋升: false, 复活, 新增证据数: 评估.新增提及次数 }
      状态调用(() => 库.自主确认(条.编号, 评估))
      const 回 = 晋升(db, 库, 库.取一条(条.编号), 评估.去向, 一.时间)
      return { 临时编号: 条.编号, 目标编号: 回.目标编号, 分数: 评估.分数, 晋升: true, 复活, 新增证据数: 评估.新增提及次数 }
    }) },
    人工处理临时(原) { return 写操作('manual-temp', 原, ['动作', '参数'], (db, 一, 库) => {
      const 允许 = ['修改', '删除', '提议替代', '决定替代', '恢复', '提议晋升', '决定晋升', '归档到期']
      if (!允许.includes(一.动作) || !Array.isArray(一.参数) || 一.参数.length > 2) 失败()
      const 果 = 状态调用(() => 一.动作 === '归档到期' ? 库.归档到期(一.时间) : 库[一.动作](...一.参数))
      return { 动作: 一.动作, ...(果?.数量 !== undefined ? { 数量: 果.数量 } : {}) }
    }) },
    人工确认晋升(原) { return 写操作('manual-promote', 原, ['编号', '去向'], (db, 一, 库) => {
      编号(一.编号); const 条 = 库.取一条(一.编号); if (!条) 失败('SQLITE_MEMORY_NOT_FOUND')
      if (条.生命周期 !== '已晋升') 状态调用(() => 库.修改(条.编号, { 确认状态: '已确认' }))
      const 回 = 晋升(db, 库, 库.取一条(条.编号), 一.去向, 一.时间)
      return { 临时编号: 条.编号, 目标编号: 回.目标编号, 晋升: true }
    }) },
    新增长期(原) { return 写操作('manual-long', 原, ['类别', '内容', '上下文'], (db, 一) => {
      文本(一.内容); const 上下文 = 一.上下文 ?? {}; 键检查(上下文, ['对话', '记忆类型', '元数据'])
      if (上下文.对话 !== undefined) 编号(上下文.对话)
      const 条 = 状态调用(() => 长期库(db, 一.时间).记一条(一.类别, 一.内容, '我', 上下文)); return { 类别: 条.类别, 目标编号: 条.编号 }
    }) },
    人工修改长期(原) { return 写操作('edit-long', 原, ['类别', '编号', '内容', '修改对话'], (db, 一) => {
      if (!长期分类.includes(一.类别)) 失败(); 编号(一.编号); 文本(一.内容, 2000)
      if (一.修改对话 !== undefined) 编号(一.修改对话)
      const 行 = db.prepare('SELECT record_json FROM memory_long WHERE category=? AND memory_id=?').get(一.类别, 一.编号); if (!行) 失败('SQLITE_MEMORY_NOT_FOUND')
      const 条 = JSON.parse(行.record_json), 元数据 = 结构.规范记忆结构(条, 一.类别, 条.来源).元数据, 正文 = 叙述.整理正文(一.内容, { 人物: 元数据.person, 修正旧代词: true })
      if (正文 === 条.内容.trim()) return { 类别: 一.类别, 目标编号: 一.编号, 没变化: true }
      条.内容 = 正文; 条.修改于 = 一.时间; 条.修改来源 = '我'; if (一.修改对话) 条.修改对话 = 一.修改对话
      db.prepare('UPDATE memory_long SET record_json=? WHERE category=? AND memory_id=?').run(JSON.stringify(条), 一.类别, 一.编号)
      return { 类别: 一.类别, 目标编号: 一.编号 }
    }) },
    人工遗忘长期(原) { return 写操作('delete-long', 原, ['类别', '编号'], (db, 一) => {
      if (!长期分类.includes(一.类别)) 失败(); 编号(一.编号)
      const 行 = db.prepare('SELECT record_json FROM memory_long WHERE category=? AND memory_id=?').get(一.类别, 一.编号); if (!行) 失败('SQLITE_MEMORY_NOT_FOUND')
      db.prepare('INSERT INTO memory_long_deleted VALUES(?,?,?,?)').run(一.类别, 一.编号, 一.时间, 行.record_json)
      db.prepare('DELETE FROM memory_long WHERE category=? AND memory_id=?').run(一.类别, 一.编号)
      return { 类别: 一.类别, 目标编号: 一.编号, 遗忘: true }
    }) },
    读取临时(号) { return 读((db) => { 编号(号); return { 版本: 版本(db), 条: 临时库(db, '2000-01-01T00:00:00.000Z').取一条(号) } }) },
    查询临时(原 = {}) { return 读((db) => ({ 版本: 版本(db), ...状态调用(() => 临时库(db, '2000-01-01T00:00:00.000Z').查询(纯输入(原))) })) },
    列长期(原 = {}) { return 读((db) => {
      const 一 = 纯输入(原); 键检查(一, ['类别', '上限']); const 上限 = 一.上限 === undefined ? 500 : 整数(一.上限, 1, 1000)
      if (一.类别 !== undefined && !长期分类.includes(一.类别)) 失败()
      const 行 = 一.类别 ? db.prepare('SELECT record_json FROM memory_long WHERE category=? ORDER BY rowid LIMIT ?').all(一.类别, 上限 + 1) : db.prepare('SELECT record_json FROM memory_long ORDER BY rowid LIMIT ?').all(上限 + 1)
      return { 版本: 版本(db), 列表: 行.slice(0, 上限).map((x) => JSON.parse(x.record_json)), 还有: 行.length > 上限 }
    }) },
    取统计() { return 读((db) => ({ 版本: 版本(db), 临时数: db.prepare('SELECT count(*) AS n FROM memory_temporary').get().n, 长期数: db.prepare('SELECT count(*) AS n FROM memory_long').get().n, 证据数: db.prepare('SELECT count(*) AS n FROM memory_evidence').get().n, 历史数: db.prepare('SELECT count(*) AS n FROM memory_assessments').get().n, 操作数: db.prepare('SELECT count(*) AS n FROM memory_operations').get().n, 删除标记数: db.prepare('SELECT count(*) AS n FROM memory_tombstones').get().n, 长期删除标记数: db.prepare('SELECT count(*) AS n FROM memory_long_deleted').get().n })) },
    核验() { return 读((db) => {
      if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) 失败('SQLITE_MEMORY_INTEGRITY_FAILED')
      for (const 行 of db.prepare('SELECT * FROM memory_temporary').all()) {
        const 条 = JSON.parse(行.record_json)
        if (条.编号 !== 行.memory_id || 条.生命周期 !== 行.lifecycle || 条.确认状态 !== 行.confirmation || 条.到期于 !== 行.expires_raw) 失败('SQLITE_MEMORY_INTEGRITY_FAILED')
        const 证据 = db.prepare('SELECT record_json FROM memory_evidence WHERE memory_id=? ORDER BY position').all(条.编号).map((x) => JSON.parse(x.record_json)), 历史 = db.prepare('SELECT record_json FROM memory_assessments WHERE memory_id=? ORDER BY position').all(条.编号).map((x) => JSON.parse(x.record_json))
        if (JSON.stringify(证据) !== JSON.stringify(条.评估账本?.证据 || []) || JSON.stringify(历史) !== JSON.stringify(条.评估账本?.评估历史 || [])) 失败('SQLITE_MEMORY_INTEGRITY_FAILED')
        const 证据行 = db.prepare('SELECT fingerprint,position FROM memory_evidence WHERE memory_id=? ORDER BY position').all(条.编号), 历史行 = db.prepare('SELECT position FROM memory_assessments WHERE memory_id=? ORDER BY position').all(条.编号)
        if (证据行.some((x, i) => x.position !== i || x.fingerprint !== 证据[i].指纹) || 历史行.some((x, i) => x.position !== i)) 失败('SQLITE_MEMORY_INTEGRITY_FAILED')
        if (条.生命周期 === '已晋升') { const 长 = db.prepare('SELECT * FROM memory_long WHERE source_temporary=?').get(条.编号) || db.prepare('SELECT * FROM memory_long_deleted WHERE category=? AND memory_id=?').get(条.晋升?.去向, 条.晋升?.目标编号); if (!长 || 长.memory_id !== 条.晋升?.目标编号 || 长.category !== 条.晋升?.去向) 失败('SQLITE_MEMORY_INTEGRITY_FAILED') }
      }
      const 全长期 = db.prepare('SELECT * FROM memory_long').all().concat(db.prepare('SELECT * FROM memory_long_deleted').all().map((x) => ({ ...x, source_temporary: JSON.parse(x.record_json).临时记忆 ?? null })))
      const 长期身份 = new Set(), 临时来源 = new Set()
      for (const 行 of 全长期) {
        const 身份 = JSON.stringify([行.category, 行.memory_id]); if (长期身份.has(身份) || (行.source_temporary && 临时来源.has(行.source_temporary))) 失败('SQLITE_MEMORY_INTEGRITY_FAILED'); 长期身份.add(身份); if (行.source_temporary) 临时来源.add(行.source_temporary)
        const 条 = JSON.parse(行.record_json); if (条.编号 !== 行.memory_id || 条.类别 !== 行.category || (条.临时记忆 ?? null) !== 行.source_temporary || (叙述.有第三方系统称呼(条.内容) && !保留旧长期口吻(上下文, 行.category, 行.memory_id, 条.内容))) 失败('SQLITE_MEMORY_INTEGRITY_FAILED')
        if (行.source_temporary) {
          const 源 = db.prepare('SELECT record_json FROM memory_temporary WHERE memory_id=?').get(行.source_temporary) || db.prepare('SELECT record_json FROM memory_tombstones WHERE memory_id=?').get(行.source_temporary)
          if (!源) 失败('SQLITE_MEMORY_INTEGRITY_FAILED')
          const 临时 = JSON.parse(源.record_json)
          if (临时.生命周期 !== '已晋升' || 临时.晋升?.目标编号 !== 条.编号 || 临时.晋升?.去向 !== 条.类别 || JSON.stringify(临时.自主评估) !== JSON.stringify(条.自主评估)) 失败('SQLITE_MEMORY_INTEGRITY_FAILED')
        }
      }
      const 已见版本 = new Set()
      for (const 行 of db.prepare('SELECT * FROM memory_operations').all()) { const 回 = JSON.parse(行.receipt_json); if (指纹(回) !== 行.receipt_hash || 回.好 !== true || 回.状态 !== 'committed' || 回.操作编号 !== 行.operation_id || !Number.isSafeInteger(回.版本) || 回.版本 < 1 || 回.版本 > 版本(db) || 已见版本.has(回.版本)) 失败('SQLITE_MEMORY_INTEGRITY_FAILED'); 已见版本.add(回.版本) }
      if (db.prepare('SELECT count(*) AS n FROM memory_operations').get().n !== 版本(db)) 失败('SQLITE_MEMORY_INTEGRITY_FAILED')
      return { 好: true, 版本: 版本(db) }
    }) },
  })
  事务内记忆句柄.set(上下文, (name,input) => {
    const state=取内部(上下文)
    if(!state.写入中||!state.db.isTransaction||允许事务内调用)失败('SQLITE_MEMORY_TRANSACTION_REQUIRED')
    if(!['新增临时','评估并晋升','人工处理临时'].includes(name)||(name==='人工处理临时'&&!['提议替代','归档到期'].includes(input?.动作)))失败('SQLITE_MEMORY_TRANSACTION_CAPABILITY_REQUIRED')
    try{允许事务内调用=true;const result=api[name](input);if(!result?.好)失败(result?.代码||'SQLITE_MEMORY_WRITE_FAILED');return result}finally{允许事务内调用=false}
  })
  return api
}
function 内部事务应用标记(上下文, 原) {
  const 执行 = 标记事务句柄.get(上下文)
  if (!执行) 失败('SQLITE_MEMORY_TRANSACTION_CAPABILITY_REQUIRED')
  return 执行(原)
}
function 内部事务记忆操作(上下文,name,input){const fn=事务内记忆句柄.get(上下文);if(!fn)失败('SQLITE_MEMORY_TRANSACTION_CAPABILITY_REQUIRED');return fn(name,input)}
module.exports = { 创建记忆仓储, 内部事务应用标记, 内部事务记忆操作 }
