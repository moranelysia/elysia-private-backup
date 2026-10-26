/** F2：同库旧格式定位与统一读取。原字段不承载合成身份；无文件/网络入口。 */
'use strict'
const { createHash, createHmac, timingSafeEqual } = require('node:crypto')
const { 取内部, 原子执行 } = require('./sqlite-context.cjs')
const { 创建会话仓储 } = require('./sqlite-chat.cjs')
const { 纯数据 } = require('./sqlite-state.cjs')
const { 创建影子档案 } = require('./sqlite-fixture.cjs')
const { 登记旧来源, 登记旧元数据 } = require('./sqlite-legacy-source.cjs')
const 范围 = Object.freeze({ 用途: 'local-legacy-adapter', 包含私密: true })
const 句柄们 = new WeakMap(), 哈希 = (x) => createHash('sha256').update(x).digest('hex'), 拷 = (x) => JSON.parse(JSON.stringify(x))
const 映射 = { 'data/聊天记录/对话索引.json': 'conversations', 'data/聊天记录/聊天记录.jsonl': 'messages', 'data/事实.json': 'facts', 'data/经历.json': 'episodes', 'data/小本子.json': 'notebook', 'data/临时记忆.json': 'temporary' }
const 定义 = [
  ['legacy_documents', 'CREATE TABLE legacy_documents (path TEXT PRIMARY KEY, kind TEXT NOT NULL, original_text TEXT NOT NULL, sha256 TEXT NOT NULL) STRICT'],
  ['legacy_records', 'CREATE TABLE legacy_records (locator TEXT PRIMARY KEY, path TEXT NOT NULL REFERENCES legacy_documents(path), position INTEGER NOT NULL CHECK(position>=0), kind TEXT NOT NULL, conversation_id TEXT, original_id TEXT, time_raw TEXT, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), sha256 TEXT NOT NULL, UNIQUE(path,position)) STRICT'],
]
function 失败(code) { throw Error('SQLITE_LEGACY_' + code) }
function 授权(x) { const s = 纯数据(x); if (Object.keys(s).length !== 2 || s.用途 !== 范围.用途 || s.包含私密 !== true) 失败('SCOPE_REQUIRED') }
function 精确(x, keys, 必须 = keys) { if (!x || Object.getPrototypeOf(x) !== Object.prototype || Object.keys(x).some((k) => !keys.includes(k)) || 必须.some((k) => !Object.hasOwn(x, k))) 失败('INPUT_INVALID') }
const 文本 = (v) => typeof v === 'string' ? v : null
const 位置键 = (p, n) => 'legacy-' + 哈希(JSON.stringify([p, n]))
function 准备(原) {
  const 包 = 纯数据(原); 精确(包, ['版本', '用途', '文档'])
  if (包.版本 !== 1 || 包.用途 !== 范围.用途 || !Array.isArray(包.文档) || !包.文档.length) 失败('INPUT_INVALID')
  const 已见 = new Set(), 文档 = 包.文档.map((d) => {
    精确(d, ['路径', '类型', '原文'])
    if (!Object.hasOwn(映射, d.路径) || 映射[d.路径] !== d.类型 || 已见.has(d.路径) || typeof d.原文 !== 'string') 失败('SOURCE_UNSUPPORTED')
    已见.add(d.路径); return 拷(d)
  }).sort((a, b) => a.路径 < b.路径 ? -1 : a.路径 > b.路径 ? 1 : 0)
  const 档 = 创建影子档案({ 用途: 'local-readonly-shadow', 包含私密: true })
  try { 档.导入({ 版本: 1, 用途: 'local-readonly-shadow', 文档: 文档.map((d) => ({ 名称: 'legacy-' + 哈希(d.路径), 类型: d.类型, 原文: d.原文 })) }) } finally { 档.关闭() }
  const 行 = [], 元数据 = new Set()
  for (const d of 文档) {
    const v = d.类型 === 'messages' ? d.原文.replace(/^\uFEFF/u, '').split('\n').flatMap((s, i) => s.trim() ? [[i, JSON.parse(s)]] : []) : JSON.parse(d.原文.replace(/^\uFEFF/u, ''))
    const rows = d.类型 === 'messages' ? v : (d.类型 === 'temporary' ? v.记录 : v).map((x, i) => [i, x])
    for (const [i, x] of rows) {
      if (d.类型 === 'conversations') { if (typeof x.编号 !== 'string' || !x.编号 || 元数据.has(x.编号)) 失败('CONVERSATION_INVALID'); 元数据.add(x.编号) }
      const raw = JSON.stringify(x)
      行.push({ locator: 位置键(d.路径, i), path: d.路径, position: i, kind: d.类型, conversation_id: 文本(d.类型 === 'conversations' ? x.编号 : x.对话), original_id: 文本(x.编号), time_raw: 文本(d.类型 === 'conversations' ? x.建于 : x.时间), payload_json: raw, sha256: 哈希(raw) })
    }
  }
  return { 文档, 行, 指纹: 哈希(JSON.stringify(文档)) }
}
function 创建旧格式仓储(上下文) {
  const 会话 = 创建会话仓储(上下文), db = 取内部(上下文).db, 正规 = (x) => x.replace(/\s+/gu, ' ').trim()
  function 架构() {
    取内部(上下文)
    if (db.prepare("SELECT value FROM repository_meta WHERE key='legacy_schema'").get()?.value !== '1') 失败('SCHEMA_INVALID')
    for (const [名, sql] of 定义) if (正规(db.prepare('SELECT sql FROM sqlite_schema WHERE name=?').get(名)?.sql || '') !== 正规(sql)) 失败('SCHEMA_INVALID')
  }
  if (db.prepare("SELECT value FROM repository_meta WHERE key='legacy_schema'").get()) 架构()
  else 原子执行(上下文, () => { if (定义.some(([名]) => db.prepare('SELECT 1 FROM sqlite_schema WHERE name=?').get(名))) 失败('SCHEMA_INVALID'); for (const [, sql] of 定义) db.exec(sql); db.prepare('INSERT INTO repository_meta VALUES(?,?)').run('legacy_schema', '1') })
  function 原包() { return { 版本: 1, 用途: 范围.用途, 文档: db.prepare('SELECT * FROM legacy_documents ORDER BY path').all().map((x) => ({ 路径: x.path, 类型: x.kind, 原文: x.original_text })) } }
  function 核验() {
    架构(); const 包 = 原包(), 指 = db.prepare("SELECT value FROM repository_meta WHERE key='legacy_import_hash'").get()?.value
    if (!包.文档.length) { if (指 || db.prepare('SELECT 1 FROM legacy_records').get() || db.prepare("SELECT 1 FROM repository_meta WHERE key GLOB 'legacy_patch_*'").get()) 失败('INTEGRITY_FAILED'); return { 好: true, 文档数: 0 } }
    const p = 准备(包)
    if (p.指纹 !== 指) 失败('INTEGRITY_FAILED')
    for (const d of db.prepare('SELECT * FROM legacy_documents').all()) if (哈希(d.original_text) !== d.sha256) 失败('INTEGRITY_FAILED')
    const 现 = db.prepare('SELECT * FROM legacy_records ORDER BY path,position').all().map((x) => ({ ...x }))
    if (JSON.stringify(现) !== JSON.stringify(p.行)) 失败('INTEGRITY_FAILED')
    for (const r of db.prepare("SELECT key,value FROM repository_meta WHERE key GLOB 'legacy_patch_*'").all()) {
      let x; try { x = JSON.parse(r.value) } catch { 失败('INTEGRITY_FAILED') }
      if (typeof x.对话 !== 'string' || r.key !== 改键(x.对话)) 失败('INTEGRITY_FAILED')
      补丁(x.对话)
    }
    return { 好: true, 文档数: 包.文档.length, 记录数: 现.length }
  }
  const 旧对话 = (号) => { const r = db.prepare("SELECT payload_json FROM legacy_records WHERE kind='conversations' AND conversation_id=?").get(号); return r ? JSON.parse(r.payload_json) : null }
  const 改键 = (号) => 'legacy_patch_' + 哈希(号)
  function 补丁(号) {
    const x = db.prepare('SELECT value FROM repository_meta WHERE key=?').get(改键(号)); if (!x) return null
    try {
      const p = JSON.parse(x.value), n = 会话.读取对话(号)
      if (!p || p.对话 !== 号 || !旧对话(号) || !n || p.版本 !== n.元数据版本 || 哈希(JSON.stringify(p.字段)) !== p.指纹 || Object.keys(p.字段).some((k) => !['标题', '模型', '模式', '写长期记忆', '扩展'].includes(k) || JSON.stringify(p.字段[k]) !== JSON.stringify(n[k]))) 失败('INTEGRITY_FAILED')
      return p
    } catch { 失败('INTEGRITY_FAILED') }
  }
  function 消息们(号) {
    核验(); 会话.核验()
    const 旧 = db.prepare("SELECT * FROM legacy_records WHERE kind='messages' AND conversation_id=? ORDER BY position").all(号).map((x) => ({ 内部定位: x.locator, 来源: 'legacy', 文件位置: x.position, 原始: JSON.parse(x.payload_json) }))
    const 新 = db.prepare('SELECT message_id,sequence,payload_json FROM chat_messages WHERE conversation_id=? ORDER BY sequence').all(号).map((x) => ({ 内部定位: x.message_id, 来源: 'native', 文件位置: x.sequence, 原始: JSON.parse(x.payload_json) }))
    return 旧.concat(新)
  }
  const cursorTag = 哈希(JSON.stringify(范围)), 密钥 = 取内部(上下文).游标密钥
  function 签名(s) { return createHmac('sha256', 密钥).update(s).digest('base64url') }
  const 编码 = (v) => { const s = Buffer.from(JSON.stringify(v)).toString('base64url'); return s + '.' + 签名(s) }
  function 解码(s) {
    if (typeof s !== 'string' || s.length > 4096 || s.split('.').length !== 2) 失败('CURSOR_INVALID')
    const [body, mac] = s.split('.'), a = Buffer.from(签名(body)), b = Buffer.from(mac)
    if (a.length !== b.length || !timingSafeEqual(a, b)) 失败('CURSOR_INVALID')
    try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) } catch { 失败('CURSOR_INVALID') }
  }
  const api = Object.freeze({
    核验,
    导入(原, scope) {
      授权(scope); const p = 准备(原)
      return 原子执行(上下文, () => {
        核验(); const 已 = db.prepare("SELECT value FROM repository_meta WHERE key='legacy_import_hash'").get()?.value
        if (已) { if (已 !== p.指纹) 失败('IMPORT_CONFLICT'); return { 好: true, 新导入: false, 指纹: 已 } }
        const doc = db.prepare('INSERT INTO legacy_documents VALUES(?,?,?,?)'), row = db.prepare('INSERT INTO legacy_records VALUES(?,?,?,?,?,?,?,?,?)')
        for (const d of p.文档) doc.run(d.路径, d.类型, d.原文, 哈希(d.原文))
        for (const r of p.行) row.run(...Object.values(r))
        db.prepare('INSERT INTO repository_meta VALUES(?,?)').run('legacy_import_hash', p.指纹); 核验()
        return { 好: true, 新导入: true, 指纹: p.指纹 }
      })
    },
    导出旧原文(scope) { 授权(scope); 核验(); return 原包() },
    读取对话(号) { if (typeof 号 !== 'string' || !号 || 号.length > 128) 失败('INPUT_INVALID'); 核验(); return { 原始: 旧对话(号), 新仓储: db.prepare('SELECT 1 FROM chat_sessions WHERE conversation_id=?').get(号) ? 会话.读取对话(号) : null } },
    列对话() {
      核验(); const ids = db.prepare("SELECT conversation_id FROM legacy_records WHERE kind='conversations' ORDER BY position").all().map((x) => x.conversation_id)
      for (const x of db.prepare('SELECT conversation_id FROM chat_sessions ORDER BY registration_sequence').all()) if (!ids.includes(x.conversation_id)) ids.push(x.conversation_id)
      return ids.map((id) => { const r = api.读取对话(id), p = 补丁(id); return { 对话: id, ...r, 当前: r.原始 ? { ...r.原始, ...(p?.字段 || {}) } : r.新仓储 } })
    },
    读消息页(原) {
      const q = 纯数据(原); 精确(q, ['对话', '大小', '游标'], ['对话'])
      if (typeof q.对话 !== 'string' || !q.对话 || q.对话.length > 128) 失败('INPUT_INVALID')
      const size = q.大小 ?? 50; if (!Number.isSafeInteger(size) || size < 1 || size > 200) 失败('INPUT_INVALID')
      const 所有 = 消息们(q.对话), importHash = db.prepare("SELECT value FROM repository_meta WHERE key='legacy_import_hash'").get()?.value ?? null
      const 窗口 = q.游标 !== undefined && q.游标 !== null ? 解码(q.游标) : { v: 1, tag: cursorTag, conv: q.对话, upper: 所有.length, before: 所有.length, source: importHash }
      if (窗口.v !== 1 || 窗口.tag !== cursorTag || 窗口.conv !== q.对话 || 窗口.source !== importHash || !Number.isSafeInteger(窗口.upper) || !Number.isSafeInteger(窗口.before) || 窗口.before < 0 || 窗口.before > 窗口.upper || 窗口.upper > 所有.length) 失败('CURSOR_INVALID')
      const start = Math.max(0, 窗口.before - size), 列 = 所有.slice(start, 窗口.before)
      return { 消息: 列, 下一页: start ? 编码({ ...窗口, before: start }) : null, 上界: 窗口.upper }
    },
    读取旧定位(号) { 核验(); if (typeof 号 !== 'string' || !/^legacy-[a-f0-9]{64}$/u.test(号)) return null; const r = db.prepare('SELECT * FROM legacy_records WHERE locator=?').get(号); return r && r.kind === 'messages' ? { 内部定位: r.locator, 文件位置: r.position, 原始: JSON.parse(r.payload_json) } : null },
    列旧长期() { 核验(); return db.prepare("SELECT * FROM legacy_records WHERE kind IN ('facts','episodes','notebook') ORDER BY path,position").all().map((r) => ({ 内部定位: r.locator, 原始: JSON.parse(r.payload_json) })) },
    合并回退文档(文档, scope) {
      授权(scope); 核验(); const by = new Map(文档.map((d) => [d.路径, 拷(d)]))
      for (const d of 原包().文档) {
        const 当前 = by.get(d.路径); if (!当前) 失败('EXPORT_SOURCE_MISSING')
        const old = d.类型 === 'messages' ? null : JSON.parse(d.原文.replace(/^\uFEFF/u, ''))
        const fresh = d.类型 === 'messages' ? 当前.原文 : JSON.parse(当前.原文)
        let 值, unchanged = false
        if (d.类型 === 'messages') {
          const lines = d.原文.replace(/^\uFEFF/u, '').split('\n').filter((s) => s.trim()).map((s) => JSON.parse(s))
          if (lines.some((x) => !['user', 'assistant', '分隔'].includes(x.角色) || typeof x.时间 !== 'string' || typeof x.内容 !== 'string')) 失败('OLD_READER_INCOMPATIBLE')
          unchanged = !fresh.trim(); 当前.原文 = unchanged ? d.原文 : d.原文 + (d.原文 && !d.原文.endsWith('\n') ? '\n' : '') + fresh; by.set(d.路径, 当前); continue
        }
        if (d.类型 === 'conversations') {
          const ids = new Set(old.map((x) => x.编号)); let changed = false
          const 改 = old.map((x) => { const p = 补丁(x.编号), n = fresh.find((v) => v.编号 === x.编号); if (n && n.元数据版本 > 1 && !p) 失败('METADATA_EDIT_NOT_ADAPTED'); if (p) changed = true; return p ? { ...x, ...p.字段 } : x })
          值 = 改.concat(fresh.filter((x) => !ids.has(x.编号))); unchanged = !changed && 值.length === old.length
        } else {
          const a = d.类型 === 'temporary' ? old.记录 : old, b = d.类型 === 'temporary' ? fresh.记录 : fresh
          const ids = new Set(a.map((x) => x.编号).filter(Boolean)); if (b.some((x) => ids.has(x.编号))) 失败('RECORD_ID_CONFLICT')
          值 = d.类型 === 'temporary' ? { ...old, 记录: a.concat(b) } : a.concat(b); unchanged = !b.length
        }
        当前.原文 = unchanged ? d.原文 : JSON.stringify(值, null, 2) + '\n'; by.set(d.路径, 当前)
      }
      return [...by.values()]
    },
  })
  句柄们.set(上下文, { api, 旧对话 })
  登记旧来源(上下文, (号, 要许可) => 读取旧来源(上下文, 号, 要许可))
  登记旧元数据(上下文, (号, 选项, 版本) => {
    if (!旧对话(号)) return
    核验()
    // 该回调由B更新事务调用，字段由B验证；只覆盖这次明确提交的键。
    const 已 = db.prepare('SELECT value FROM repository_meta WHERE key=?').get(改键(号)), 字段 = 已 ? JSON.parse(已.value).字段 : {}
    for (const k of ['标题', '模型', '模式', '写长期记忆', '扩展']) if (Object.hasOwn(选项, k)) 字段[k] = 拷(选项[k])
    const p = { 对话: 号, 版本, 字段, 指纹: 哈希(JSON.stringify(字段)) }
    return () => db.prepare('INSERT INTO repository_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(改键(号), JSON.stringify(p))
  })
  return api
}
function 读取旧来源(上下文, 号, 要许可) {
  const i = 句柄们.get(上下文); if (!i) return null
  const r = i.api.读取旧定位(号); if (!r || r.原始.角色 !== 'user' || typeof r.原始.内容 !== 'string' || typeof r.原始.时间 !== 'string' || !Number.isFinite(Date.parse(r.原始.时间)) || typeof r.原始.对话 !== 'string') return null
  const native = 取内部(上下文).db.prepare('SELECT write_memory FROM chat_sessions WHERE conversation_id=?').get(r.原始.对话), old = i.旧对话(r.原始.对话)
  if (!old && !native) return null
  if (要许可 && (native ? native.write_memory !== 1 : old.写长期记忆 === false)) 失败('SWITCH_OFF')
  return { ...r.原始, 编号: r.内部定位, 旧档内部定位: r.内部定位 }
}
module.exports = { 创建旧格式仓储, 读取旧来源, 旧格式范围: 范围 }
