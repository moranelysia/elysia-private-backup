/** S-15B：显式会话仓储。只接受sqlite-context提供的内存能力，无生产调用方。 */
'use strict'
const { createHash, createHmac, randomUUID, timingSafeEqual } = require('node:crypto')
const { 取内部, 原子执行 } = require('./sqlite-context.cjs')
const 定义 = [
  ['chat_sessions', `CREATE TABLE chat_sessions (
    registration_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL, model TEXT NOT NULL, mode TEXT NOT NULL,
    write_memory INTEGER NOT NULL CHECK(write_memory IN (0,1)), created_raw TEXT NOT NULL,
    extension_json TEXT NOT NULL CHECK(json_valid(extension_json)), metadata_version INTEGER NOT NULL CHECK(metadata_version>0),
    message_count INTEGER NOT NULL CHECK(message_count>=0), last_sequence INTEGER NOT NULL CHECK(last_sequence>=0), last_raw TEXT
  ) STRICT`],
  ['chat_turns', `CREATE TABLE chat_turns (
    conversation_id TEXT NOT NULL REFERENCES chat_sessions(conversation_id), turn_id TEXT NOT NULL,
    digest TEXT NOT NULL, user_message_id TEXT NOT NULL UNIQUE, assistant_message_id TEXT NOT NULL UNIQUE,
    first_sequence INTEGER NOT NULL CHECK(first_sequence>0), receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json)),
    PRIMARY KEY(conversation_id,turn_id)
  ) STRICT`],
  ['chat_messages', `CREATE TABLE chat_messages (
    message_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES chat_sessions(conversation_id), turn_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK(sequence>0), role TEXT NOT NULL CHECK(role IN ('user','assistant')),
    recorded_raw TEXT NOT NULL, occurred_raw TEXT, received_raw TEXT, content TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), UNIQUE(conversation_id,sequence), UNIQUE(conversation_id,turn_id,role),
    FOREIGN KEY(conversation_id,turn_id) REFERENCES chat_turns(conversation_id,turn_id)
  ) STRICT`],
]
const 模式们 = new Set(['', 'chat', 'work', 'learn'])
function 失败(码 = 'SQLITE_CHAT_INPUT_INVALID') { throw new Error(码) }
function 是对象(一) { return !!一 && Object.getPrototypeOf(一) === Object.prototype }
function 键检查(一, 允许, 必需 = []) {
  if (!是对象(一)) 失败()
  const 描述 = Object.getOwnPropertyDescriptors(一), 键 = Reflect.ownKeys(描述)
  if (键.some((k) => !允许.includes(k) || !Object.hasOwn(描述[k], 'value') || !描述[k].enumerable) || 必需.some((k) => !Object.hasOwn(描述, k))) 失败()
}
function 编号(一) { if (typeof 一 !== 'string' || /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.exec(一)?.[0] !== 一) 失败(); return 一 }
function 字符串(一, 上限) { if (typeof 一 !== 'string' || Buffer.byteLength(一) > 上限 || Buffer.from(一).toString('utf8') !== 一) 失败(); return 一 }
function UTC(一) { if (typeof 一 !== 'string' || !Number.isFinite(Date.parse(一)) || new Date(一).toISOString() !== 一) 失败(); return 一 }
function 整数(一, 小, 大) { if (!Number.isSafeInteger(一) || 一 < 小 || 一 > 大) 失败(); return 一 }
function 扩展JSON(一) {
  if (!是对象(一)) 失败()
  let 节点 = 0
  function 遍历(值, 深 = 0) {
    if (++节点 > 4096 || 深 > 16) 失败()
    if (值 === null || typeof 值 === 'boolean') return
    if (typeof 值 === 'string') { 字符串(值, 65536); return }
    if (typeof 值 === 'number') { if (!Number.isFinite(值) || (Number.isInteger(值) && !Number.isSafeInteger(值))) 失败(); return }
    if (!Array.isArray(值) && !是对象(值)) 失败()
    const 描述 = Object.getOwnPropertyDescriptors(值), 键 = Reflect.ownKeys(描述).filter((k) => !(Array.isArray(值) && k === 'length'))
    if (Array.isArray(值) && (值.length > 4096 || 键.length !== 值.length)) 失败()
    for (const k of 键) { if (typeof k !== 'string' || !Object.hasOwn(描述[k], 'value') || !描述[k].enumerable || (Array.isArray(值) && (/^(0|[1-9]\d*)$/u.exec(k)?.[0] !== k || Number(k) >= 值.length))) 失败(); 遍历(描述[k].value, 深 + 1) }
  }
  遍历(一); const 文 = JSON.stringify(一); if (Buffer.byteLength(文) > 65536) 失败(); return 文
}
const 指纹 = (一) => createHash('sha256').update(JSON.stringify(一)).digest('hex')
function 轮次输入(一) {
  键检查(一, ['对话', '轮次', '用户正文', '回复正文', '发生于', '接收于', '完成于'], ['对话', '轮次', '用户正文', '回复正文', '接收于', '完成于'])
  return { 对话: 编号(一.对话), 轮次: 编号(一.轮次), 用户正文: 字符串(一.用户正文, 262144), 回复正文: 字符串(一.回复正文, 262144), 发生于: 一.发生于 === undefined || 一.发生于 === null ? null : UTC(一.发生于), 接收于: UTC(一.接收于), 完成于: UTC(一.完成于) }
}
function 消息对象(行) {
  const 条 = { 编号: 行.message_id, 时间: 行.recorded_raw, 角色: 行.role, 内容: 行.content, 对话: 行.conversation_id, 轮次: 行.turn_id, 序号: 行.sequence }
  if (行.role === 'user') { 条.发生于 = 行.occurred_raw; 条.接收于 = 行.received_raw }
  if (JSON.stringify(条) !== 行.payload_json) 失败('SQLITE_CHAT_INTEGRITY_FAILED')
  return 条
}
function 对话对象(行) {
  return { 编号: 行.conversation_id, 标题: 行.title, 模型: 行.model, 模式: 行.mode, 写长期记忆: 行.write_memory === 1, 建于: 行.created_raw, 扩展: JSON.parse(行.extension_json), 元数据版本: 行.metadata_version, 条数: 行.message_count, 最后: 行.last_raw ?? 行.created_raw }
}
function 回执对象(行) { return { 好: true, 状态: 'saved', 对话: 行.conversation_id, 轮次: 行.turn_id, 条数: 2, 消息编号: [行.user_message_id, 行.assistant_message_id], 起序: 行.first_sequence, 止序: 行.first_sequence + 1 } }
function 创建会话仓储(上下文) {
  const sql = (文) => 文.replace(/\s+/gu, ' ').trim()
  function 架构核对(db) {
    if (db.prepare("SELECT value FROM repository_meta WHERE key='chat_schema'").get()?.value !== '1') 失败('SQLITE_CHAT_SCHEMA_INVALID')
    for (const [名, 建表] of 定义) {
      const 现 = db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(名)
      if (!现 || sql(现.sql) !== sql(建表)) 失败('SQLITE_CHAT_SCHEMA_INVALID')
    }
  }
  const 初 = 取内部(上下文).db
  try {
    if (初.prepare("SELECT value FROM repository_meta WHERE key='chat_schema'").get()) 架构核对(初)
    else 原子执行(上下文, (db) => {
      if (db.prepare("SELECT 1 FROM sqlite_schema WHERE name IN ('chat_sessions','chat_turns','chat_messages')").get()) 失败('SQLITE_CHAT_SCHEMA_INVALID')
      for (const [, 建表] of 定义) db.exec(建表)
      db.prepare('INSERT INTO repository_meta VALUES(?,?)').run('chat_schema', '1')
    })
  } catch (错) { if (/^SQLITE_(CHAT|CONTEXT)_[A-Z_]+$/u.test(错?.message || '')) throw 错; 失败('SQLITE_CHAT_SCHEMA_INVALID') }
  function 连接() { const db = 取内部(上下文).db; 架构核对(db); return db }
  function 查对话(db, 号) { const 行 = db.prepare('SELECT * FROM chat_sessions WHERE conversation_id=?').get(号); if (!行) 失败('SQLITE_CHAT_CONVERSATION_NOT_FOUND'); return 行 }
  function 核对轮(db, 轮) {
    const 行 = db.prepare('SELECT * FROM chat_messages WHERE conversation_id=? AND turn_id=? ORDER BY sequence').all(轮.conversation_id, 轮.turn_id)
    if (行.length !== 2 || 行[0].role !== 'user' || 行[1].role !== 'assistant' || 行[0].message_id !== 轮.user_message_id || 行[1].message_id !== 轮.assistant_message_id || 行[0].sequence !== 轮.first_sequence || 行[1].sequence !== 轮.first_sequence + 1) 失败('SQLITE_CHAT_INTEGRITY_FAILED')
    行.forEach(消息对象)
    const 规范 = 轮次输入({ 对话: 轮.conversation_id, 轮次: 轮.turn_id, 用户正文: 行[0].content, 回复正文: 行[1].content, 发生于: 行[0].occurred_raw, 接收于: 行[0].received_raw, 完成于: 行[1].recorded_raw })
    if (指纹(规范) !== 轮.digest || JSON.stringify(回执对象(轮)) !== 轮.receipt_json || 行[0].recorded_raw !== (行[0].occurred_raw || 行[0].received_raw) || 行[1].occurred_raw !== null || 行[1].received_raw !== null) 失败('SQLITE_CHAT_INTEGRITY_FAILED')
    return 回执对象(轮)
  }
  function 读(做) { try { return 做(连接()) } catch (错) { if (/^SQLITE_(CHAT|CONTEXT)_[A-Z_]+$/u.test(错?.message || '')) throw 错; 失败('SQLITE_CHAT_READ_FAILED') } }
  function 写(做) {
    try { 连接(); return 做() } catch (错) {
      const 代码 = /^SQLITE_(CHAT|CONTEXT)_[A-Z_]+$/u.test(错?.message || '') ? 错.message : 'SQLITE_CHAT_WRITE_FAILED'
      const 状态 = ['SQLITE_CONTEXT_COMMIT_UNKNOWN', 'SQLITE_CONTEXT_ROLLBACK_FAILED', 'SQLITE_CONTEXT_UNUSABLE'].includes(代码) ? 'unknown' : 代码 === 'SQLITE_CONTEXT_TRANSACTION_FAILED' ? 'rolled-back' : 'rejected'
      return { 好: false, 状态, 代码 }
    }
  }
  function 签游标(内容) { return createHmac('sha256', 取内部(上下文).游标密钥).update(内容).digest() }
  function 编游标(号, 上界, 之前) {
    const 文 = Buffer.from(JSON.stringify({ 版本: 1, 库: 取内部(上下文).标识, 对话: 号, 上界, 之前 })).toString('base64url')
    return 文 + '.' + 签游标(文).toString('base64url')
  }
  function 解游标(游标, 号, 最新) {
    try {
      if (typeof 游标 !== 'string' || 游标.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u.test(游标)) 失败()
      const [文, 签] = 游标.split('.'), 签字节 = Buffer.from(签, 'base64url')
      if (签字节.toString('base64url') !== 签 || !timingSafeEqual(签字节, 签游标(文))) 失败()
      const 原 = Buffer.from(文, 'base64url'); if (原.toString('base64url') !== 文) 失败()
      const 值 = JSON.parse(原.toString('utf8')); 键检查(值, ['版本', '库', '对话', '上界', '之前'], ['版本', '库', '对话', '上界', '之前'])
      if (值.版本 !== 1 || 值.库 !== 取内部(上下文).标识 || 值.对话 !== 号) 失败()
      整数(值.上界, 0, 最新); 整数(值.之前, 1, 值.上界 + 1); return 值
    } catch { 失败('SQLITE_CHAT_CURSOR_INVALID') }
  }
  return Object.freeze({
    登记对话(号, 选项) { return 写(() => {
      编号(号); 键检查(选项, ['建于', '模型', '标题', '模式', '写长期记忆', '扩展'], ['建于'])
      const 有 = (k) => Object.hasOwn(选项, k)
      const 建于 = UTC(选项.建于), 模型 = 字符串(有('模型') ? 选项.模型 : '', 512), 标题 = 字符串(有('标题') ? 选项.标题 : '', 1024), 模式 = 有('模式') ? 选项.模式 : 'chat', 要写 = 有('写长期记忆') ? 选项.写长期记忆 : false, 扩展 = 扩展JSON(有('扩展') ? 选项.扩展 : {})
      if (!模式们.has(模式) || typeof 要写 !== 'boolean') 失败()
      return 原子执行(上下文, (db) => {
        const 已有 = db.prepare('SELECT metadata_version FROM chat_sessions WHERE conversation_id=?').get(号)
        if (已有) return { 好: true, 对话: 号, 新建: false, 元数据版本: 已有.metadata_version }
        db.prepare('INSERT INTO chat_sessions(conversation_id,title,model,mode,write_memory,created_raw,extension_json,metadata_version,message_count,last_sequence) VALUES(?,?,?,?,?,?,?,1,0,0)').run(号, 标题, 模型, 模式, Number(要写), 建于, 扩展)
        return { 好: true, 对话: 号, 新建: true, 元数据版本: 1 }
      })
    }) },
    更新对话(号, 选项) { return 写(() => {
      编号(号); 键检查(选项, ['预期版本', '模型', '标题', '模式', '写长期记忆', '扩展'], ['预期版本']); 整数(选项.预期版本, 1, Number.MAX_SAFE_INTEGER - 1)
      if (Object.keys(选项).length < 2) 失败()
      return 原子执行(上下文, (db) => {
        const 旧 = 查对话(db, 号); if (旧.metadata_version !== 选项.预期版本) 失败('SQLITE_CHAT_VERSION_CONFLICT')
        const 模型 = Object.hasOwn(选项, '模型') ? 字符串(选项.模型, 512) : 旧.model, 标题 = Object.hasOwn(选项, '标题') ? 字符串(选项.标题, 1024) : 旧.title
        const 模式 = Object.hasOwn(选项, '模式') ? 选项.模式 : 旧.mode, 要写 = Object.hasOwn(选项, '写长期记忆') ? 选项.写长期记忆 : 旧.write_memory === 1
        if (!模式们.has(模式) || typeof 要写 !== 'boolean') 失败()
        const 扩展 = Object.hasOwn(选项, '扩展') ? 扩展JSON(选项.扩展) : 旧.extension_json
        db.prepare('UPDATE chat_sessions SET title=?,model=?,mode=?,write_memory=?,extension_json=?,metadata_version=metadata_version+1 WHERE conversation_id=?').run(标题, 模型, 模式, Number(要写), 扩展, 号)
        return { 好: true, 对话: 号, 元数据版本: 旧.metadata_version + 1 }
      })
    }) },
    读取对话(号) { return 读((db) => { 编号(号); const 行 = db.prepare('SELECT * FROM chat_sessions WHERE conversation_id=?').get(号); return 行 ? 对话对象(行) : null }) },
    列对话(选项 = {}) { return 读((db) => {
      键检查(选项, ['上限']); const 上限 = 整数(Object.hasOwn(选项, '上限') ? 选项.上限 : 100, 1, 200), 行 = db.prepare('SELECT * FROM chat_sessions ORDER BY created_raw DESC,registration_sequence DESC LIMIT ?').all(上限 + 1)
      return { 对话们: 行.slice(0, 上限).map(对话对象), 还有: 行.length > 上限 }
    }) },
    存对话一轮(原) { return 写(() => {
      const 一 = 轮次输入(原), 摘要 = 指纹(一)
      return 原子执行(上下文, (db) => {
        const 段 = 查对话(db, 一.对话), 旧 = db.prepare('SELECT * FROM chat_turns WHERE conversation_id=? AND turn_id=?').get(一.对话, 一.轮次)
        if (旧) {
          if (旧.digest !== 摘要) 失败('SQLITE_CHAT_TURN_CONFLICT')
          return 核对轮(db, 旧)
        }
        整数(段.last_sequence, 0, Number.MAX_SAFE_INTEGER - 2); 整数(段.message_count, 0, Number.MAX_SAFE_INTEGER - 2)
        const 起序 = 段.last_sequence + 1, 用户号 = randomUUID(), 回复号 = randomUUID()
        const 回执 = { 好: true, 状态: 'saved', 对话: 一.对话, 轮次: 一.轮次, 条数: 2, 消息编号: [用户号, 回复号], 起序, 止序: 起序 + 1 }
        db.prepare('INSERT INTO chat_turns VALUES(?,?,?,?,?,?,?)').run(一.对话, 一.轮次, 摘要, 用户号, 回复号, 起序, JSON.stringify(回执))
        const 用户 = { 编号: 用户号, 时间: 一.发生于 || 一.接收于, 角色: 'user', 内容: 一.用户正文, 对话: 一.对话, 轮次: 一.轮次, 序号: 起序, 发生于: 一.发生于, 接收于: 一.接收于 }
        const 回复 = { 编号: 回复号, 时间: 一.完成于, 角色: 'assistant', 内容: 一.回复正文, 对话: 一.对话, 轮次: 一.轮次, 序号: 起序 + 1 }
        const 句 = db.prepare('INSERT INTO chat_messages VALUES(?,?,?,?,?,?,?,?,?,?)')
        for (const 条 of [用户, 回复]) 句.run(条.编号, 条.对话, 条.轮次, 条.序号, 条.角色, 条.时间, 条.发生于 ?? null, 条.接收于 ?? null, 条.内容, JSON.stringify(条))
        db.prepare('UPDATE chat_sessions SET message_count=message_count+2,last_sequence=?,last_raw=? WHERE conversation_id=?').run(起序 + 1, 一.完成于, 一.对话)
        return 回执
      })
    }) },
    读最近聊天(最多 = 20, 选项) { return 读((db) => {
      键检查(选项, ['对话'], ['对话']); 编号(选项.对话); 整数(最多, 1, 400); 查对话(db, 选项.对话)
      return db.prepare('SELECT * FROM chat_messages WHERE conversation_id=? ORDER BY sequence DESC LIMIT ?').all(选项.对话, 最多).reverse().map(消息对象)
    }) },
    读消息页(选项) { return 读((db) => {
      键检查(选项, ['对话', '大小', '游标'], ['对话']); const 号 = 编号(选项.对话), 大小 = 整数(Object.hasOwn(选项, '大小') ? 选项.大小 : 50, 1, 200), 段 = 查对话(db, 号)
      const 窗口 = 选项.游标 === undefined || 选项.游标 === null ? { 上界: 段.last_sequence, 之前: 段.last_sequence + 1 } : 解游标(选项.游标, 号, 段.last_sequence)
      const 行 = db.prepare('SELECT * FROM chat_messages WHERE conversation_id=? AND sequence<=? AND sequence<? ORDER BY sequence DESC LIMIT ?').all(号, 窗口.上界, 窗口.之前, 大小 + 1)
      const 本页 = 行.slice(0, 大小).reverse()
      return { 对话: 号, 上界: 窗口.上界, 消息: 本页.map(消息对象), 下一页: 行.length > 大小 ? 编游标(号, 窗口.上界, 本页[0].sequence) : null }
    }) },
    取统计() { return 读((db) => ({ 会话数: db.prepare('SELECT count(*) AS n FROM chat_sessions').get().n, 消息数: db.prepare('SELECT count(*) AS n FROM chat_messages').get().n, 轮次数: db.prepare('SELECT count(*) AS n FROM chat_turns').get().n })) },
    核验() { return 读((db) => {
      if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) 失败('SQLITE_CHAT_INTEGRITY_FAILED')
      for (const 段 of db.prepare('SELECT * FROM chat_sessions').all()) {
        const 计 = db.prepare('SELECT count(*) AS n,coalesce(max(sequence),0) AS last FROM chat_messages WHERE conversation_id=?').get(段.conversation_id)
        if (计.n !== 段.message_count || 计.last !== 段.last_sequence || 计.n !== 计.last) 失败('SQLITE_CHAT_INTEGRITY_FAILED')
      }
      for (const 轮 of db.prepare('SELECT * FROM chat_turns').all()) 核对轮(db, 轮)
      return { 好: true, 会话数: db.prepare('SELECT count(*) AS n FROM chat_sessions').get().n, 消息数: db.prepare('SELECT count(*) AS n FROM chat_messages').get().n }
    }) },
  })
}
module.exports = { 创建会话仓储 }
