/** D2A：明确快照/预期版本的异步接口，不能交给旧同步领域作为读取/保存后端。 */
'use strict'
const { 纯数据 } = require('./sqlite-state.cjs')
const { exact } = require('./sqlite-worker-protocol.cjs')
const { createHash } = require('node:crypto')
const fail = code => { throw Error('SQLITE_STATE_' + code) }
function 创建异步状态接口(actor) {
  const backends = new WeakMap()
  const read = (操作, 参数) => actor.调用({ 操作, 参数 })
  function live(backend) { const b = backends.get(backend); if (!b || b.closed) fail('BACKEND_INVALID'); return b }
  function batchEntries(input) {
    if (!Array.isArray(input) || !input.length || input.length > 16) fail('BATCH_LIMIT')
    const ds = Object.getOwnPropertyDescriptors(input), keys = Reflect.ownKeys(ds).filter(k => k !== 'length')
    if (keys.length !== input.length || keys.some((k, i) => k !== String(i) || !Object.hasOwn(ds[k], 'value') || !ds[k].enumerable)) fail('INPUT_INVALID')
    return keys.map(k => {
      const row = ds[k].value
      if (!row || Object.getPrototypeOf(row) !== Object.prototype) fail('INPUT_INVALID')
      const d = Object.getOwnPropertyDescriptors(row)
      if (Reflect.ownKeys(d).sort().join(',') !== '后端,数据,预期版本' || Object.values(d).some(x => !Object.hasOwn(x, 'value') || !x.enumerable)) fail('INPUT_INVALID')
      const b = live(d.后端.value), 数据 = 纯数据(d.数据.value), values = 纯数据({ 预期版本: d.预期版本.value })
      return { ...b.scope, 数据, ...values }
    })
  }
  async function 保存快照组(input, meta) {
    const m = 纯数据(meta); exact(m, ['操作编号'])
    const 写入 = batchEntries(input)
    return actor.调用({ 操作: '状态.保存快照组', 参数: [{ 写入 }], 操作编号: m.操作编号 })
  }
  async function 保存分段快照组(input, meta, graph = false) {
    const m = 纯数据(meta); exact(m, graph ? ['操作编号', '记忆版本'] : ['操作编号'])
    if (typeof m.操作编号 !== 'string' || /^[a-zA-Z0-9_-]{1,100}$/u.exec(m.操作编号)?.[0] !== m.操作编号) fail('INPUT_INVALID')
    if (graph && (!Number.isSafeInteger(m.记忆版本) || m.记忆版本 < 0)) fail('INPUT_INVALID')
    const rows = batchEntries(input), items = []; let total = 0
    for (const row of rows) {
      const bytes = Buffer.from(JSON.stringify(row.数据), 'utf8'); total += bytes.length
      if (total > 8 * 1024 * 1024) fail('UPLOAD_LIMIT')
      const { 数据, ...scope } = row
      items.push({ bytes, spec: { ...scope, 字节数: bytes.length, 指纹: createHash('sha256').update(bytes).digest('hex') } })
    }
    const specs = items.map(x => x.spec)
    const opened = await read('状态.开始分段', [{ 写入: specs }]); const id = opened.上传
    try {
      for (let i = 0; i < items.length; i++) for (let offset = 0; offset < items[i].bytes.length; offset += 24576) {
        const 内容 = items[i].bytes.subarray(offset, offset + 24576).toString('base64')
        const result = await read('状态.写入分段', [{ 上传: id, 序号: i, 偏移: offset, 内容 }])
        if (result.偏移 !== offset + Buffer.from(内容, 'base64').length) fail('CHUNK_INVALID')
      }
      return await actor.调用({ 操作: graph ? '状态.提交图谱分段' : '状态.提交分段', 参数: [{ 上传: id, 写入: specs, ...(graph ? { 记忆版本: m.记忆版本 } : {}) }], 操作编号: m.操作编号 })
    } finally {
      try { await read('状态.取消分段', [{ 上传: id }]) } catch { /* 未确认提交时保留原错误；Worker退出或超时会回收暂存。 */ }
    }
  }
  async function 打开后端(kind, id = 'main', options = {}) {
    const o = 纯数据(options)
    if (Object.keys(o).some(k => k !== '独占') || (Object.hasOwn(o, '独占') && typeof o.独占 !== 'boolean')) fail('INPUT_INVALID')
    const opened = await read('状态.打开后端', [{ 类型: kind, 编号: id, 独占: o.独占 ?? (kind === 'channel-tasks') }])
    const b = { scope: { 令牌: opened.令牌, 类型: opened.类型, 编号: opened.编号 }, closed: false, closing: null }
    const api = Object.freeze({
      读取快照: async () => { live(api); return read('状态.读取快照', [b.scope]) },
      读取图谱记忆页: async (input = { 版本: null, 游标: 0 }) => { live(api); const q = 纯数据(input); exact(q, ['版本', '游标']); return read('状态.读取图谱记忆页', [{ ...b.scope, ...q }]) },
      读取分段快照: async () => {
        let version = null, offset = 0, total = null, hash = null
        const chunks = []
        for (;;) {
          live(api)
          const x = await read('状态.读取片段', [{ ...b.scope, 版本: version, 偏移: offset }])
          if (!Number.isSafeInteger(x.版本) || x.版本 < 0 || !Number.isSafeInteger(x.总字节) || x.总字节 < 0 || x.总字节 > 8 * 1024 * 1024 || x.偏移 !== offset || typeof x.内容 !== 'string' || typeof x.完成 !== 'boolean') fail('CHUNK_INVALID')
          if (version === null) { version = x.版本; total = x.总字节; hash = x.指纹 }
          if (x.版本 !== version || x.总字节 !== total || x.指纹 !== hash) fail('CHUNK_INVALID')
          if (total === 0) { if (version !== 0 || hash !== null || x.内容 !== '' || !x.完成) fail('CHUNK_INVALID'); return { 版本: version, 数据: null } }
          if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/u.test(hash) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(x.内容)) fail('CHUNK_INVALID')
          const bytes = Buffer.from(x.内容, 'base64')
          if (!bytes.length || bytes.length > 24576 || bytes.toString('base64') !== x.内容 || offset + bytes.length > total || x.完成 !== (offset + bytes.length === total)) fail('CHUNK_INVALID')
          chunks.push(bytes); offset += bytes.length
          if (x.完成) {
            const all = Buffer.concat(chunks, total)
            if (createHash('sha256').update(all).digest('hex') !== hash) fail('CHUNK_INVALID')
            const text = all.toString('utf8'); if (!Buffer.from(text, 'utf8').equals(all)) fail('CHUNK_INVALID')
            return { 版本: version, 数据: 纯数据(JSON.parse(text)) }
          }
        }
      },
      保存快照: async (data, meta) => {
        live(api); const m = 纯数据(meta); exact(m, ['操作编号', '预期版本'])
        return 保存快照组([{ 后端: api, 数据: data, 预期版本: m.预期版本 }], { 操作编号: m.操作编号 })
      },
      保存分段快照: async (data, meta) => {
        live(api); const m = 纯数据(meta); exact(m, ['操作编号', '预期版本'])
        return 保存分段快照组([{ 后端: api, 数据: data, 预期版本: m.预期版本 }], { 操作编号: m.操作编号 })
      },
      关闭() {
        if (b.closing) return b.closing
        b.closed = true
        b.closing = read('状态.关闭后端', [{ 令牌: b.scope.令牌 }]); return b.closing
      },
    })
    backends.set(api, b); return api
  }
  return Object.freeze({ 打开后端, 保存快照组, 保存分段快照组, 保存图谱快照组: (input, meta) => 保存分段快照组(input, meta, true) })
}
module.exports = { 创建异步状态接口 }
