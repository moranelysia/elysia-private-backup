/** S-15D：同步业务状态后端；仅接受显式内存上下文，不含私密日记读取入口。 */
'use strict'
const { createHash } = require('node:crypto')
const { 取内部, 原子执行 } = require('./sqlite-context.cjs')
const 契约 = require('../脑/渠道契约.cjs')
const 类型们 = new Set(['relations', 'relation-layout', 'channel-map', 'channel-tasks', 'diary-index', 'extraction-buffer', 'usage', 'work-index', 'background-state', 'cluster-state', 'learning-index'])
const 租约们 = new WeakMap()
const 定义 = [
  ['state_documents', 'CREATE TABLE state_documents (document_id TEXT PRIMARY KEY, kind TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0), body_json TEXT NOT NULL CHECK(json_valid(body_json)), sha256 TEXT NOT NULL) STRICT'],
  ['state_anchors', 'CREATE TABLE state_anchors (document_id TEXT PRIMARY KEY, last_version INTEGER NOT NULL CHECK(last_version>0)) STRICT'],
  ['state_items', 'CREATE TABLE state_items (document_id TEXT NOT NULL REFERENCES state_documents(document_id) ON DELETE CASCADE, row_kind TEXT NOT NULL, row_key TEXT NOT NULL, position INTEGER NOT NULL CHECK(position>=0), payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), from_key TEXT, to_key TEXT, status TEXT, address_key TEXT, PRIMARY KEY(document_id,row_kind,row_key), UNIQUE(document_id,row_kind,position)) STRICT'],
  ['state_address_identity', "CREATE UNIQUE INDEX state_address_identity ON state_items(document_id,row_kind,address_key) WHERE row_kind IN ('channel-session','channel-task')"],
]
function 失败(码 = 'SQLITE_STATE_INPUT_INVALID') { throw new Error(码) }
const 哈希 = (文) => createHash('sha256').update(文).digest('hex')
const 克隆 = (一) => JSON.parse(JSON.stringify(一))
function 键(一) { if (typeof 一 !== 'string' || /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.exec(一)?.[0] !== 一) 失败(); return 一 }
function 字(一, 长 = 520) { if (typeof 一 !== 'string' || !一 || 一.length > 长) 失败(); return 一 }
function 对象(一) { if (!一 || Object.getPrototypeOf(一) !== Object.prototype) 失败(); return 一 }
function 数组(一) { if (!Array.isArray(一) || 一.length > 10000) 失败(); return 一 }
function 纯数据(原) {
  let 节点 = 0
  function 复制(一, 深 = 0) {
    if (++节点 > 100000 || 深 > 48) 失败('SQLITE_STATE_LIMIT')
    if (一 === null || typeof 一 === 'boolean') return 一
    if (typeof 一 === 'string') { if (Buffer.byteLength(一) > 2 * 1024 * 1024 || Buffer.from(一).toString('utf8') !== 一) 失败(); return 一 }
    if (typeof 一 === 'number') { if (!Number.isFinite(一) || (Number.isInteger(一) && !Number.isSafeInteger(一))) 失败(); return 一 }
    if (!一 || (!Array.isArray(一) && Object.getPrototypeOf(一) !== Object.prototype)) 失败()
    const 描述 = Object.getOwnPropertyDescriptors(一), 键们 = Reflect.ownKeys(描述).filter((k) => !(Array.isArray(一) && k === 'length'))
    if (键们.some((k) => typeof k !== 'string' || !Object.hasOwn(描述[k], 'value') || !描述[k].enumerable)) 失败()
    if (Array.isArray(一)) { if (一.length > 10000 || 键们.length !== 一.length || 键们.some((k, i) => k !== String(i))) 失败(); return 键们.map((k) => 复制(描述[k].value, 深 + 1)) }
    return Object.fromEntries(键们.map((k) => [k, 复制(描述[k].value, 深 + 1)]))
  }
  const 值 = 复制(原), 文 = JSON.stringify(值)
  if ((!值 || typeof 值 !== 'object') || Buffer.byteLength(文) > 8 * 1024 * 1024) 失败('SQLITE_STATE_LIMIT')
  return 值
}
function 投影(类型, 值) {
  const 行们 = [], 加 = (组, key, 条, 列 = {}) => 行们.push({ row_kind: 组, row_key: 字(key), position: 行们.filter((x) => x.row_kind === 组).length, payload_json: JSON.stringify(条), from_key: null, to_key: null, status: null, address_key: null, ...列 })
  const 版 = (键名, 号) => { 对象(值); if (值[键名] !== 号) 失败('SQLITE_STATE_VERSION_UNSUPPORTED') }
  const 端点 = (一) => { 对象(一); if (!['事实', '经历', '小本子'].includes(一.类别)) 失败(); return 一.类别 + ':' + 字(一.编号, 160) }
  switch (类型) {
    case 'relations':
      版('格式版本', 2)
      for (const 一 of 数组(值.关系)) { 对象(一); if (!['同一主题', '后续发展', '更新', '矛盾', '先于', '后于'].includes(一.类型)) 失败(); const 从 = 端点(一.从), 到 = 端点(一.到); if (从 === 到) 失败(); 加('relation', 字(一.编号, 160), 一, { from_key: 从, to_key: 到, status: 一.来源 ?? null }) }
      for (const 一 of 数组(值.自动抑制)) { 对象(一); 加('suppression', 字(一.签名), 一) }
      break
    case 'relation-layout':
      版('格式版本', 1); 对象(值.节点); 对象(值.视图)
      for (const [号, 一] of Object.entries(值.节点)) { 对象(一); if (!Number.isFinite(一.x) || !Number.isFinite(一.y)) 失败(); 加('layout-node', 号, 一) }
      break
    case 'channel-map':
      版('版本', 1)
      for (const 一 of 数组(值.记录)) { 对象(一); const 地址 = 契约.会话定位键({ 端点: 一.端点, 会话: 一.会话, 发送者编号: 一.发送者编号 }); if (一.会话.类型 !== 'private') 失败(); 加('channel-session', 字(一.内部对话编号, 128), 一, { address_key: 地址 }) }
      break
    case 'channel-tasks':
      版('版本', 1); 对象(值.端点)
      for (const 一 of 数组(值.记录)) { 对象(一); if (!['processing', 'queued', 'sending', 'sent', 'failed', 'unknown', 'cancelled', 'interrupted', 'blocked', 'expired'].includes(一.状态)) 失败(); 加('channel-task', 字(一.编号, 160), 一, { status: 一.状态, address_key: 字(一.来源键, 128) }) }
      数组(值.日志).forEach((一, i) => { 对象(一); 加('channel-log', String(i), 一, { status: 一.事件 ?? null }) }); break
    case 'diary-index': 版('格式版本', 1); for (const 一 of 数组(值.任务)) { 对象(一); 加('diary-task', 字(一.编号, 160), 一, { status: 一.状态 ?? null }) }; break
    case 'extraction-buffer': 版('版本', 1); for (const 一 of 数组(值.轮次)) { 对象(一); 加('buffer-turn', JSON.stringify([字(一.对话, 160), 字(一.消息编号, 160)]), 一) }; break
    case 'usage': 数组(值).forEach((一, i) => { 对象(一); 加('usage', String(i), 一, { status: 一.状态 ?? null }) }); break
    case 'work-index': 数组(值).forEach((一, i) => { 对象(一); 加('work-item', String(i), 一, { status: 一.状态 ?? null }) }); break
    default: 对象(值)
  }
  return 行们
}
function 内部状态操作(上下文) {
  const db = 取内部(上下文).db, 正规 = (一) => 一.replace(/\s+/gu, ' ').trim()
  function 架构(连接) {
    if (连接.prepare("SELECT value FROM repository_meta WHERE key='state_schema'").get()?.value !== '1') 失败('SQLITE_STATE_SCHEMA_INVALID')
    for (const [名, SQL] of 定义) { const 一 = 连接.prepare('SELECT sql FROM sqlite_schema WHERE name=?').get(名); if (!一 || 正规(一.sql) !== 正规(SQL)) 失败('SQLITE_STATE_SCHEMA_INVALID') }
  }
  if (db.prepare("SELECT value FROM repository_meta WHERE key='state_schema'").get()) 架构(db)
  else 原子执行(上下文, (连接) => {
    if (定义.some(([名]) => 连接.prepare('SELECT 1 FROM sqlite_schema WHERE name=?').get(名))) 失败('SQLITE_STATE_SCHEMA_INVALID')
    for (const [, SQL] of 定义) 连接.exec(SQL)
    连接.prepare('INSERT INTO repository_meta VALUES(?,?)').run('state_schema', '1')
  })
  const 连接 = () => { const 一 = 取内部(上下文).db; 架构(一); return 一 }
  const 定位 = (类型, 号) => { if (!类型们.has(类型)) 失败(); 键(号); return 类型 + ':' + 号 }
  function 读(一, 类型, 号) {
    const id = 定位(类型, 号), 行 = 一.prepare('SELECT * FROM state_documents WHERE document_id=?').get(id)
    const 锚 = 一.prepare('SELECT last_version FROM state_anchors WHERE document_id=?').get(id)
    if (!行) { if (锚) 失败('SQLITE_STATE_STORE_MISSING'); return { 版本: 0, 数据: null } }
    if (!锚 || 锚.last_version !== 行.version) 失败('SQLITE_STATE_INTEGRITY_FAILED')
    if (行.kind !== 类型 || 哈希(行.body_json) !== 行.sha256) 失败('SQLITE_STATE_INTEGRITY_FAILED')
    const 值 = JSON.parse(行.body_json); 投影(类型, 值); return { 版本: 行.version, 数据: 值 }
  }
  function 写(一, 类型, 号, 原, 预期版本) {
    if (!Number.isSafeInteger(预期版本) || 预期版本 < 0 || 预期版本 >= Number.MAX_SAFE_INTEGER - 1) 失败()
    const id = 定位(类型, 号), 值 = 纯数据(原), 行们 = 投影(类型, 值), 旧 = 读(一, 类型, 号), 文 = JSON.stringify(值)
    if (旧.版本 !== 预期版本) 失败('SQLITE_STATE_VERSION_CONFLICT')
    if (JSON.stringify(旧.数据) === 文) return 旧.版本
    const 版 = 旧.版本 + 1
    一.prepare('INSERT INTO state_documents VALUES(?,?,?,?,?) ON CONFLICT(document_id) DO UPDATE SET version=excluded.version,body_json=excluded.body_json,sha256=excluded.sha256').run(id, 类型, 版, 文, 哈希(文))
    一.prepare('INSERT INTO state_anchors VALUES(?,?) ON CONFLICT(document_id) DO UPDATE SET last_version=excluded.last_version').run(id, 版)
    一.prepare('DELETE FROM state_items WHERE document_id=?').run(id)
    const 句 = 一.prepare('INSERT INTO state_items VALUES(?,?,?,?,?,?,?,?,?)')
    for (const 行 of 行们) 句.run(id, ...Object.values(行))
    return 版
  }
  return { 连接, 读, 写 }
}
function 创建状态仓储(上下文) {
  const 内部 = 内部状态操作(上下文)
  if (!租约们.has(上下文)) 租约们.set(上下文, new Set())
  return Object.freeze({
    创建后端(类型, 号 = 'main', { 独占 = 类型 === 'channel-tasks' } = {}) {
      if (!类型们.has(类型)) 失败(); 键(号); if (typeof 独占 !== 'boolean' || (类型 === 'channel-tasks' && !独占)) 失败()
      const id = 类型 + ':' + 号, 租约 = 租约们.get(上下文); if (独占 && 租约.has(id)) 失败('SQLITE_STATE_LEASE_BUSY')
      if (独占) 租约.add(id)
      let 已关闭 = false, 预期 = null, 曾存在 = false
      const 检查 = () => { if (已关闭) 失败('SQLITE_STATE_CLOSED'); return 内部.连接() }
      return Object.freeze({
        读取() { const 果 = 内部.读(检查(), 类型, 号); if (曾存在 && 果.数据 === null) 失败('SQLITE_STATE_STORE_MISSING'); 预期 = 果.版本; 曾存在 ||= 果.数据 !== null; return 克隆(果.数据) },
        保存(值) { 检查(); if (预期 === null) 失败('SQLITE_STATE_READ_REQUIRED'); const 新版 = 原子执行(上下文, (db) => 内部.写(db, 类型, 号, 值, 预期)); 预期 = 新版; 曾存在 = true; return { 好: true, 版本: 新版 } },
        取版本: () => 预期,
        关闭() { if (!已关闭) { 已关闭 = true; if (独占) 租约.delete(id) } },
      })
    },
    读取快照(类型, 号 = 'main') { return 克隆(内部.读(内部.连接(), 类型, 号)) },
    核验() {
      const db = 内部.连接(); if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) 失败('SQLITE_STATE_INTEGRITY_FAILED')
      if (db.prepare('SELECT 1 FROM state_anchors a LEFT JOIN state_documents d ON a.document_id=d.document_id WHERE d.document_id IS NULL OR a.last_version<>d.version LIMIT 1').get()) 失败('SQLITE_STATE_INTEGRITY_FAILED')
      for (const 一 of db.prepare('SELECT * FROM state_documents').all()) {
        if (哈希(一.body_json) !== 一.sha256) 失败('SQLITE_STATE_INTEGRITY_FAILED')
        if (db.prepare('SELECT last_version FROM state_anchors WHERE document_id=?').get(一.document_id)?.last_version !== 一.version) 失败('SQLITE_STATE_INTEGRITY_FAILED')
        const 预期 = 投影(一.kind, JSON.parse(一.body_json)).map((行) => ({ document_id: 一.document_id, ...行 })).sort((a, b) => a.row_kind.localeCompare(b.row_kind) || a.position - b.position)
        const 现 = db.prepare('SELECT * FROM state_items WHERE document_id=?').all(一.document_id).map((x) => ({ ...x })).sort((a, b) => a.row_kind.localeCompare(b.row_kind) || a.position - b.position)
        if (JSON.stringify(现) !== JSON.stringify(预期)) 失败('SQLITE_STATE_INTEGRITY_FAILED')
      }
      return { 好: true, 文档数: db.prepare('SELECT count(*) AS n FROM state_documents').get().n, 投影数: db.prepare('SELECT count(*) AS n FROM state_items').get().n }
    },
  })
}
module.exports = { 创建状态仓储, 内部状态操作, 纯数据, 哈希 }
