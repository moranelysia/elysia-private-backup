/** Isolated fake-model core. Never used by the default JSON core or real model. */
'use strict'
const { createHash, randomUUID } = require('node:crypto')
const { 校验接收消息 } = require('../脑/渠道契约.cjs')
const { 是假模型连接 } = require('../脑/模型连接.cjs')
const { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs')
const { 纯数据 } = require('../storage/sqlite-state.cjs')
const fail = code => { throw Error('ASYNC_FAKE_CORE_' + code) }
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex')
function ids(m, conversation) {
  const source = hash([conversation, m.端点.渠道, m.端点.账号, m.会话.类型, m.会话.编号, m.发送者编号, m.消息编号])
  const fingerprint = hash([m.发生于, m.回复消息编号, m.正文, m.附件])
  return { operation: 'fake-turn-' + source, turn: 't-' + source + '-' + fingerprint.slice(0, 32) }
}
function 创建异步假对话核心({ actor, 模型连接, 拼提示, 取现在 = () => new Date() } = {}) {
  if (!是假模型连接(模型连接) || typeof 拼提示 !== 'function' || typeof 取现在 !== 'function') fail('DEPENDENCY_INVALID')
  const f = 创建异步仓储门面(actor), abort = new AbortController(); let closed = false, closing = null, tail = Promise.resolve(), pending = new Set(), fault = false
  function check(signal) { if (closed || signal?.aborted) fail('ABORTED'); if (fault) fail('STORE_UNKNOWN') }
  function now() { const d = 取现在(); if (!(d instanceof Date) || !Number.isFinite(d.getTime())) fail('CLOCK_INVALID'); return d.toISOString() }
  async function wait(promise, signal) {
    check(signal); let listener
    const cancelled = new Promise((_, reject) => { listener = () => reject(Error('ASYNC_FAKE_CORE_ABORTED')); signal.addEventListener('abort', listener, { once: true }) })
    try { return await Promise.race([promise, cancelled]) } finally { signal.removeEventListener('abort', listener) }
  }
  async function history(conversation, pages = 2) {
    const chunks = []; let cursor = null
    for (let i = 0; i < pages; i++) {
      const p = await f.旧格式.读消息页({ 对话: conversation, 大小: 200, 游标: cursor }); chunks.unshift(...p.消息.map(x => x.原始)); cursor = p.下一页
      if (!cursor) break
    }
    return { rows: chunks, more: !!cursor }
  }
  async function duplicate(conversation, id, receipt) {
    const wanted = receipt?.结果?.消息编号
    if (!Array.isArray(wanted) || wanted.length !== 2) fail('RECEIPT_INVALID')
    let cursor = null, user, assistant
    for (let i = 0; i < 20; i++) {
      const p = await f.旧格式.读消息页({ 对话: conversation, 大小: 200, 游标: cursor })
      for (const x of p.消息) if (x.来源 === 'native') { if (x.内部定位 === wanted[0]) user = x.原始; if (x.内部定位 === wanted[1]) assistant = x.原始 }
      if (user && assistant) break
      cursor = p.下一页; if (!cursor) break
    }
    if (!user || !assistant || user.轮次 !== id.turn || assistant.轮次 !== id.turn || user.角色 !== 'user' || assistant.角色 !== 'assistant' || typeof assistant.内容 !== 'string') fail('DUPLICATE_CONFLICT_OR_UNAVAILABLE')
    return { 可见性: 'shared', 正文: assistant.内容, 附件: [] }
  }
  async function run(msg, ctx) {
    const signal = ctx.中止 ? AbortSignal.any([abort.signal, ctx.中止]) : abort.signal; check(signal)
    const id = ids(msg, ctx.内部对话编号), old = await actor.查询回执(id.operation); check(signal)
    if (old) { const answer = await duplicate(ctx.内部对话编号, id, old); check(signal); return answer }
    const existing = await f.会话.读取对话(ctx.内部对话编号); check(signal)
    if (!existing) { const registered = await f.会话.登记对话(ctx.内部对话编号, { 模型: 'fake', 建于: msg.接收于 }, { 操作编号: 'fake-reg-' + randomUUID() }); if (!registered.好) fail('REGISTER_FAILED'); check(signal) }
    const h = await history(ctx.内部对话编号); check(signal)
    const rows = h.rows.filter(x => x && ['user', 'assistant'].includes(x.角色) && typeof x.内容 === 'string').map(x => ({ role: x.角色, content: x.内容, 时间: typeof x.时间 === 'string' ? x.时间 : '' }))
    if (Buffer.byteLength(JSON.stringify(rows)) > 131072) fail('HISTORY_LIMIT')
    const built = await wait(Promise.resolve().then(() => { check(signal); return 拼提示(纯数据({ 历史: rows, 输入: msg.正文 })) }), signal); check(signal)
    const prompts = 纯数据({ 消息: built }).消息
    if (!Array.isArray(prompts) || prompts.length < 1 || prompts.length > 402 || prompts.some(x => !x || Object.keys(x).sort().join(',') !== 'content,role' || !['system', 'user', 'assistant'].includes(x.role) || typeof x.content !== 'string') || Buffer.byteLength(JSON.stringify(prompts)) > 131072) fail('PROMPT_INVALID')
    const answer = await wait(模型连接.要一轮({ 消息们: prompts, 中止: signal }), signal)
    check(signal)
    const saved = await f.会话.存对话一轮({ 对话: ctx.内部对话编号, 轮次: id.turn, 用户正文: msg.正文, 回复正文: answer.全文, 发生于: msg.发生于, 接收于: msg.接收于, 完成于: now() }, { 操作编号: id.operation })
    if (!saved.好 || saved.状态 !== 'saved') fail('TURN_SAVE_FAILED')
    check(signal); return { 可见性: 'shared', 正文: answer.全文, 附件: [] }
  }
  async function 处理(input, ctx) {
    check(); const msg = 校验接收消息(input)
    if (msg.端点.渠道 !== 'fake' || msg.附件.length || !ctx || typeof ctx.内部对话编号 !== 'string' || !/^channel-[a-zA-Z0-9_-]{1,100}$/u.test(ctx.内部对话编号) || Object.keys(ctx).some(k => !['内部对话编号', '中止'].includes(k)) || (ctx.中止 !== undefined && !(ctx.中止 instanceof AbortSignal))) fail('INPUT_INVALID')
    if (pending.size >= 32) fail('QUEUE_FULL')
    const context = { 内部对话编号: ctx.内部对话编号, 中止: ctx.中止 }
    const task = tail.then(async () => { try { return await run(msg, context) } catch (e) { if (e.状态 === 'unknown' || e.状态 === 'interrupted') fault = true; throw e } })
    pending.add(task); tail = task.catch(() => {}); try { return await task } finally { pending.delete(task) }
  }
  function 关闭() { if (closing) return closing; closed = true; abort.abort(); closing = Promise.allSettled([...pending]).then(() => undefined); return closing }
  return Object.freeze({ 处理, 关闭 })
}
module.exports = { 创建异步假对话核心 }
