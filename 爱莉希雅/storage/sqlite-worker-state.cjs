/** D2A：仅Worker内的登记状态命令。租约不持久化，批量写与回执共用一个事务。 */
'use strict'
const { randomUUID, createHash } = require('node:crypto')
const { 原子执行 } = require('./sqlite-context.cjs')
const { 内部状态操作, 纯数据 } = require('./sqlite-state.cjs')
const { 固定状态来源 } = require('./sqlite-sources.cjs')
const 契约 = require('../脑/渠道契约.cjs')
const { 校验渠道映射存档 } = require('../脑/渠道会话映射.cjs')
const { 校验渠道任务存档 } = require('../脑/渠道任务调度.cjs')
const { 校验后台缓冲 } = require('../core/后台缓冲格式.cjs')
const { exact } = require('./sqlite-worker-protocol.cjs')
const fail = code => { throw Error('SQLITE_STATE_' + code) }
const MAX_HANDLES = 64
function target(kind, id) {
  if (typeof kind !== 'string' || typeof id !== 'string') fail('TARGET_FORBIDDEN')
  const key = kind + ':' + id
  if (!Object.hasOwn(固定状态来源, key) && !(['channel-map', 'channel-tasks'].includes(kind) && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.exec(id)?.[0] === id)) fail('TARGET_FORBIDDEN')
  return key
}
function 创建Worker状态命令(ctx) {
  const state = 内部状态操作(ctx), handles = new Map()
  let upload = null
  function dropUpload() { if (upload) { clearTimeout(upload.timer); upload = null } }
  function staged(q) {
    if (!upload || q.上传 !== upload.id) fail('UPLOAD_INVALID')
    for (const x of upload.items) capability({ 令牌: x.令牌, 类型: x.类型, 编号: x.编号 })
    return upload
  }
  function descriptors(q) {
    exact(q, ['写入'])
    if (!Array.isArray(q.写入) || !q.写入.length || q.写入.length > 16) fail('BATCH_LIMIT')
    const seen = new Set(); let size = 0
    for (const x of q.写入) {
      exact(x, ['令牌', '类型', '编号', '预期版本', '字节数', '指纹'])
      capability({ 令牌: x.令牌, 类型: x.类型, 编号: x.编号 })
      const key = target(x.类型, x.编号); if (seen.has(key)) fail('DUPLICATE_TARGET'); seen.add(key)
      if (!Number.isSafeInteger(x.预期版本) || x.预期版本 < 0 || !Number.isSafeInteger(x.字节数) || x.字节数 < 2 || x.字节数 > 8 * 1024 * 1024 || typeof x.指纹 !== 'string' || !/^[a-f0-9]{64}$/u.test(x.指纹)) fail('INPUT_INVALID')
      size += x.字节数
    }
    if (size > 8 * 1024 * 1024) fail('UPLOAD_LIMIT')
  }
  function checkComplete(q) {
    exact(q, ['上传', '写入']); descriptors({ 写入: q.写入 })
    const u = staged(q)
    if (q.写入.length !== u.items.length || q.写入.some((x, i) => Object.keys(x).some(k => x[k] !== u.items[i].spec[k]))) fail('UPLOAD_MISMATCH')
    for (const x of u.items) if (x.used !== x.字节数 || createHash('sha256').update(x.bytes).digest('hex') !== x.指纹) fail('UPLOAD_INCOMPLETE')
    return u
  }
  function capability(q) {
    exact(q, ['令牌', '类型', '编号'])
    const h = handles.get(q.令牌)
    if (!h || h.类型 !== q.类型 || h.编号 !== q.编号) fail('CAPABILITY_INVALID')
    return h
  }
  function openInput(q) {
    exact(q, ['类型', '编号', '独占']); const key = target(q.类型, q.编号)
    if (typeof q.独占 !== 'boolean' || (q.类型 === 'channel-tasks' && !q.独占)) fail('EXCLUSIVE_REQUIRED')
    return key
  }
  function batchInput(q) {
    exact(q, ['写入'])
    if (!Array.isArray(q.写入) || !q.写入.length || q.写入.length > 16) fail('BATCH_LIMIT')
    const seen = new Set()
    for (const x of q.写入) {
      exact(x, ['令牌', '类型', '编号', '预期版本', '数据'])
      capability({ 令牌: x.令牌, 类型: x.类型, 编号: x.编号 })
      const key = target(x.类型, x.编号)
      if (seen.has(key)) fail('DUPLICATE_TARGET'); seen.add(key)
      if (!Number.isSafeInteger(x.预期版本) || x.预期版本 < 0) fail('INPUT_INVALID')
    }
  }
  function validate(kind, data) {
    if (kind === 'channel-map') 校验渠道映射存档(data)
    if (kind === 'channel-tasks') {
      // 复用端点契约，即使任务为空也校验；这组固定校验参数不保存、不授予接收许可。
      契约.会话定位键({ 端点: data.端点, 会话: { 类型: 'private', 编号: 'state-validation' }, 发送者编号: 'state-validation' })
      校验渠道任务存档(data, data.端点)
    }
    if (kind === 'extraction-buffer') 校验后台缓冲(data)
  }
  function checkChannels(db, ids) {
    for (const id of ids) {
      const m = state.读(db, 'channel-map', id).数据, t = state.读(db, 'channel-tasks', id).数据
      for (const x of t?.记录 ?? []) if (!m?.记录.some(y => y.内部对话编号 === x.内部对话编号 && y.端点.渠道 === x.来源.端点.渠道 && y.端点.账号 === x.来源.端点.账号 && y.会话.类型 === x.来源.会话.类型 && y.会话.编号 === x.来源.会话.编号 && y.发送者编号 === x.来源.发送者编号)) fail('CHANNEL_MAP_MISSING')
    }
  }
  function memoryVersion(db) {
    const text = db.prepare("SELECT value FROM repository_meta WHERE key='memory_revision'").get()?.value, n = Number(text)
    if (!Number.isSafeInteger(n) || n < 0 || n >= Number.MAX_SAFE_INTEGER || String(n) !== text) fail('MEMORY_VERSION_INVALID')
    return n
  }
  function commitUpload(q, expectedMemory) {
    const u = checkComplete({ 上传: q.上传, 写入: q.写入 })
    const result = 原子执行(ctx, db => {
      if (expectedMemory !== undefined && memoryVersion(db) !== expectedMemory) fail('MEMORY_VERSION_CONFLICT')
      const ids = new Set(), results = []
      for (const x of u.items) {
        const text = x.bytes.toString('utf8'); if (!Buffer.from(text, 'utf8').equals(x.bytes)) fail('INPUT_INVALID')
        const data = 纯数据(JSON.parse(text)); validate(x.类型, data)
        const version = state.写(db, x.类型, x.编号, data, x.预期版本)
        results.push({ 类型: x.类型, 编号: x.编号, 版本: version })
        if (['channel-map', 'channel-tasks'].includes(x.类型)) ids.add(x.编号)
      }
      checkChannels(db, ids); return { 好: true, 结果: results }
    })
    dropUpload(); return result
  }
  return Object.freeze({
    授权(c) {
      if (!c.q.操作.startsWith('状态.')) return
      const q = c.q.参数[0]
      switch (c.q.操作) {
        case '状态.打开后端': openInput(q); break
        case '状态.读取快照': capability(q); break
        case '状态.读取片段':
          exact(q, ['令牌', '类型', '编号', '版本', '偏移'])
          capability({ 令牌: q.令牌, 类型: q.类型, 编号: q.编号 })
          if ((q.版本 !== null && (!Number.isSafeInteger(q.版本) || q.版本 < 0)) || !Number.isSafeInteger(q.偏移) || q.偏移 < 0 || (q.版本 === null && q.偏移 !== 0)) fail('INPUT_INVALID')
          break
        case '状态.读取图谱记忆页':
          exact(q, ['令牌', '类型', '编号', '版本', '游标'])
          capability({ 令牌: q.令牌, 类型: q.类型, 编号: q.编号 })
          if (q.类型 !== 'relations' || q.编号 !== 'main' || (q.版本 !== null && (!Number.isSafeInteger(q.版本) || q.版本 < 0)) || !Number.isSafeInteger(q.游标) || q.游标 < 0 || (q.版本 === null && q.游标 !== 0)) fail('INPUT_INVALID')
          break
        case '状态.关闭后端': exact(q, ['令牌']); if (!handles.has(q.令牌)) fail('CAPABILITY_INVALID'); break
        case '状态.保存快照组': batchInput(q); break
        case '状态.开始分段': descriptors(q); break
        case '状态.写入分段': exact(q, ['上传', '序号', '偏移', '内容']); staged(q); break
        case '状态.取消分段': exact(q, ['上传']); staged(q); break
        case '状态.提交分段': checkComplete(q); break
        case '状态.提交图谱分段':
          exact(q, ['上传', '写入', '记忆版本'])
          if (!Number.isSafeInteger(q.记忆版本) || q.记忆版本 < 0 || q.写入.some(x => !['relations', 'relation-layout'].includes(x.类型) || x.编号 !== 'main')) fail('INPUT_INVALID')
          checkComplete({ 上传: q.上传, 写入: q.写入 }); break
        default: fail('OPERATION_FORBIDDEN')
      }
    },
    打开后端(q) {
      const key = openInput(q)
      if (handles.size >= MAX_HANDLES) fail('HANDLE_LIMIT')
      for (const h of handles.values()) if (h.key === key && (q.独占 || h.独占)) fail('LEASE_BUSY')
      const token = randomUUID(); handles.set(token, { ...q, key })
      return { 好: true, 令牌: token, 类型: q.类型, 编号: q.编号 }
    },
    读取快照(q) {
      const h = capability(q), x = state.读(state.连接(), h.类型, h.编号)
      if (x.数据 !== null) validate(h.类型, x.数据)
      return 纯数据(x)
    },
    读取片段(q) {
      const h = capability({ 令牌: q.令牌, 类型: q.类型, 编号: q.编号 })
      const x = state.读(state.连接(), h.类型, h.编号)
      if (q.版本 !== null && q.版本 !== x.版本) fail('VERSION_CONFLICT')
      if (x.数据 === null) {
        if (q.偏移 !== 0) fail('INPUT_INVALID')
        return { 版本: x.版本, 总字节: 0, 指纹: null, 偏移: 0, 内容: '', 完成: true }
      }
      validate(h.类型, x.数据)
      const bytes = Buffer.from(JSON.stringify(x.数据), 'utf8')
      if (bytes.length > 8 * 1024 * 1024 || q.偏移 >= bytes.length) fail('INPUT_INVALID')
      const end = Math.min(bytes.length, q.偏移 + 24576)
      return { 版本: x.版本, 总字节: bytes.length, 指纹: createHash('sha256').update(bytes).digest('hex'), 偏移: q.偏移, 内容: bytes.subarray(q.偏移, end).toString('base64'), 完成: end === bytes.length }
    },
    读取图谱记忆页(q) {
      const db = state.连接(), version = memoryVersion(db)
      if (q.版本 !== null && q.版本 !== version) fail('MEMORY_VERSION_CONFLICT')
      const rows = db.prepare('SELECT rowid AS seq,record_json FROM memory_long WHERE rowid>? ORDER BY rowid LIMIT 51').all(q.游标)
      const list = []; let size = 0, cursor = q.游标
      for (const row of rows) {
        const bytes = Buffer.byteLength(row.record_json)
        if (bytes > 100000) fail('MEMORY_ROW_LIMIT')
        if (list.length >= 50 || size + bytes > 100000) break
        list.push(JSON.parse(row.record_json)); size += bytes; cursor = row.seq
      }
      return { 版本: version, 记录: list, 游标: cursor, 还有: list.length < rows.length }
    },
    开始分段(q) {
      descriptors(q); if (upload) fail('UPLOAD_BUSY')
      const items = q.写入.map(spec => ({ ...spec, spec, bytes: Buffer.alloc(spec.字节数), used: 0 }))
      const id = randomUUID(), timer = setTimeout(() => { if (upload?.id === id) dropUpload() }, 120000); timer.unref()
      upload = { id, items, timer }; return { 好: true, 上传: id }
    },
    写入分段(q) {
      const u = staged(q)
      if (!Number.isSafeInteger(q.序号) || q.序号 < 0 || q.序号 >= u.items.length || !Number.isSafeInteger(q.偏移) || typeof q.内容 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(q.内容)) fail('INPUT_INVALID')
      const x = u.items[q.序号], bytes = Buffer.from(q.内容, 'base64')
      if (!bytes.length || bytes.length > 24576 || bytes.toString('base64') !== q.内容 || q.偏移 !== x.used || x.used + bytes.length > x.字节数) fail('INPUT_INVALID')
      bytes.copy(x.bytes, x.used); x.used += bytes.length; return { 好: true, 偏移: x.used }
    },
    取消分段(q) { staged(q); dropUpload(); return { 好: true } },
    提交分段(q) { return commitUpload(q) },
    提交图谱分段(q) { return commitUpload(q, q.记忆版本) },
    保存快照组(q) {
      batchInput(q)
      return 原子执行(ctx, db => {
        const ids = new Set(), results = []
        for (const x of q.写入) {
          validate(x.类型, x.数据)
          const version = state.写(db, x.类型, x.编号, x.数据, x.预期版本)
          results.push({ 类型: x.类型, 编号: x.编号, 版本: version })
          if (['channel-map', 'channel-tasks'].includes(x.类型)) ids.add(x.编号)
        }
        checkChannels(db, ids)
        return { 好: true, 结果: results }
      })
    },
    关闭后端(q) { exact(q, ['令牌']); if (!handles.delete(q.令牌)) fail('CAPABILITY_INVALID'); if (upload?.items.some(x => x.令牌 === q.令牌)) dropUpload(); return { 好: true } },
  })
}
module.exports = { 创建Worker状态命令, MAX_HANDLES }
