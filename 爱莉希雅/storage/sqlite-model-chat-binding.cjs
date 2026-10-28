/** Pre-request synthetic chat context; only identifiers and versions, never message contents. */
'use strict'
const { createHash } = require('node:crypto')
const { 取内部 } = require('./sqlite-context.cjs')
const { 纯数据 } = require('./sqlite-state.cjs')
const fail = code => { throw Error('SQLITE_STATE_CHAT_BINDING_' + code) }
const prefix = 'synthetic_chat_binding_'
const key = id => prefix + createHash('sha256').update(id).digest('hex')
function valid(b) {
  const fields=['轮次键','指纹','请求编号','模型','对话','聊天轮次','预期会话版本','预期记忆版本','预期消息数']; if(b && Object.hasOwn(b,'处理时间')) fields.push('处理时间')
  if (!b || Object.getPrototypeOf(b) !== Object.prototype || Object.keys(b).sort().join(',') !== fields.sort().join(',')) fail('INVALID')
  if (Object.hasOwn(b,'处理时间') && (typeof b.处理时间 !== 'string' || !Number.isFinite(Date.parse(b.处理时间)) || new Date(b.处理时间).toISOString() !== b.处理时间)) fail('INVALID')
  if (typeof b.轮次键 !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/u.test(b.轮次键) || typeof b.对话 !== 'string' || !/^channel-[a-zA-Z0-9_-]{1,100}$/u.test(b.对话) || typeof b.聊天轮次 !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(b.聊天轮次) || typeof b.指纹 !== 'string' || !/^[a-f0-9]{64}$/u.test(b.指纹) || typeof b.请求编号 !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(b.请求编号) || !['deepseek-flash','deepseek-v4-pro'].includes(b.模型) || !Number.isSafeInteger(b.预期会话版本) || b.预期会话版本 < 1 || !Number.isSafeInteger(b.预期记忆版本) || b.预期记忆版本 < 0) fail('INVALID')
  if (!Number.isSafeInteger(b.预期消息数) || b.预期消息数 < 0) fail('INVALID')
  return b
}
function 创建虚构聊天绑定(ctx, turn) {
  const state = 取内部(ctx); if (!state.磁盘 || state.本机 || !state.虚构轮次 || !turn) fail('SCOPE_REQUIRED')
  function read(id) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/u.test(id)) fail('INVALID')
    const row = 取内部(ctx).db.prepare('SELECT value FROM repository_meta WHERE key=?').get(key(id)); if (!row) return null
    let b; try { b = valid(纯数据(JSON.parse(row.value))); if (JSON.stringify(b) !== row.value || b.轮次键 !== id) fail('CORRUPT') } catch { fail('CORRUPT') }
    const t = turn.读取(id); if (!t || t.指纹 !== b.指纹 || t.请求编号 !== b.请求编号 || t.模型 !== b.模型) fail('CORRUPT')
    return b
  }
  function insert(input) {
    const s = 取内部(ctx); if (!s.写入中 || !s.db.isTransaction) fail('TRANSACTION_REQUIRED')
    const b = valid(纯数据(input)), db = s.db
    if (db.prepare('SELECT count(*) AS n FROM repository_meta WHERE key GLOB ?').get(prefix+'*').n >= 2048) fail('LIMIT')
    if (db.prepare('SELECT 1 FROM repository_meta WHERE key=?').get(key(b.轮次键))) fail('EXISTS')
    const session = db.prepare('SELECT metadata_version,message_count FROM chat_sessions WHERE conversation_id=?').get(b.对话)
    if (!session || session.metadata_version !== b.预期会话版本 || session.message_count !== b.预期消息数) fail('SESSION_CONFLICT')
    const revision = db.prepare("SELECT value FROM repository_meta WHERE key='memory_revision'").get()?.value
    if (typeof revision !== 'string' || !Number.isSafeInteger(Number(revision)) || String(Number(revision)) !== revision || Number(revision) !== b.预期记忆版本) fail('MEMORY_CONFLICT')
    const t = turn.读取(b.轮次键); if (!t || t.状态 !== 'reserved' || t.指纹 !== b.指纹 || t.请求编号 !== b.请求编号 || t.模型 !== b.模型) fail('IDENTITY_CONFLICT')
    db.prepare('INSERT INTO repository_meta(key,value) VALUES(?,?)').run(key(b.轮次键),JSON.stringify(b))
  }
  const rows=state.db.prepare('SELECT key,value FROM repository_meta WHERE key GLOB ?').all(prefix+'*')
  if(rows.length>2048)fail('LIMIT')
  for(const row of rows){let id;try{id=JSON.parse(row.value).轮次键}catch{fail('CORRUPT')}if(typeof id!=='string'||row.key!==key(id)||!read(id))fail('CORRUPT')}
  return Object.freeze({读取:read,内部插入:insert})
}
module.exports = { 创建虚构聊天绑定 }
