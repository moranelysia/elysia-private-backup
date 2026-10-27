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
      const b = live(d.后端.value), values = 纯数据({ 数据: d.数据.value, 预期版本: d.预期版本.value })
      return { ...b.scope, ...values }
    })
  }
  async function 保存快照组(input, meta) {
    const m = 纯数据(meta); exact(m, ['操作编号'])
    const 写入 = batchEntries(input)
    return actor.调用({ 操作: '状态.保存快照组', 参数: [{ 写入 }], 操作编号: m.操作编号 })
  }
  async function 打开后端(kind, id = 'main', options = {}) {
    const o = 纯数据(options)
    if (Object.keys(o).some(k => k !== '独占') || (Object.hasOwn(o, '独占') && typeof o.独占 !== 'boolean')) fail('INPUT_INVALID')
    const opened = await read('状态.打开后端', [{ 类型: kind, 编号: id, 独占: o.独占 ?? (kind === 'channel-tasks') }])
    const b = { scope: { 令牌: opened.令牌, 类型: opened.类型, 编号: opened.编号 }, closed: false, closing: null }
    const api = Object.freeze({
      读取快照: async () => { live(api); return read('状态.读取快照', [b.scope]) },
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
      关闭() {
        if (b.closing) return b.closing
        b.closed = true
        b.closing = read('状态.关闭后端', [{ 令牌: b.scope.令牌 }]); return b.closing
      },
    })
    backends.set(api, b); return api
  }
  return Object.freeze({ 打开后端, 保存快照组 })
}
module.exports = { 创建异步状态接口 }
