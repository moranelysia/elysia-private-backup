/** Synthetic-only dispatcher. The transport is an in-process fixture with no network hook. */
'use strict'
const { randomUUID } = require('node:crypto')
const { 纯数据 } = require('../storage/sqlite-state.cjs')
const { 领取隔离模型通道 } = require('../storage/sqlite-worker.cjs')
const { 等待有界 } = require('../脑/任务控制.cjs')
const { 领取受控模型发送器 } = require('../脑/模型连接.cjs')
const transports = new WeakMap(), claims = new WeakMap(), brokers = new WeakMap()
const fail = code => { throw Error('SYNTHETIC_SEND_' + code) }
function 创建虚构传输({ 回复 = '虚构回复', 用量 = null, 延迟 = false, 失败 = false } = {}) {
  if (typeof 回复 !== 'string' || !回复.trim() || 回复.length > 8000 || Buffer.from(回复).toString('utf8') !== 回复 || typeof 延迟 !== 'boolean' || typeof 失败 !== 'boolean') fail('INPUT_INVALID')
  const result = 纯数据({ 全文: 回复, 用量 }); let count = 0, release, begun
  const pending = new Promise(r => { release = r }), started = new Promise(r => { begun = r })
  const api = Object.freeze({ 等待请求: () => started, 完成: () => release(), 取调用数: () => count })
  transports.set(api, async () => { count++; begun(); if (延迟) await pending; if (失败) fail('TRANSPORT_FAILED'); return 纯数据(result) })
  return api
}
function 创建隔离一次性调度({ actor, send, validate, closeTransport, 真实, 取现在 = () => new Date(), 最大请求 = 1, 超时毫秒 = 20000 } = {}) {
  if (typeof send !== 'function' || typeof 取现在 !== 'function' || !Number.isSafeInteger(最大请求) || 最大请求 < 1 || 最大请求 > 64 || !Number.isSafeInteger(超时毫秒) || 超时毫秒 < 10 || 超时毫秒 > 60000) fail('DEPENDENCY_INVALID')
  const channel = 领取隔离模型通道(actor), owner = Object.freeze({}), abort = new AbortController(), writes = new Set()
  const inflightTransport = new Set(); let closed = false, fault = false, active = null, closing = null, sent = 0
  function check(signal, epoch) { if (closed || signal.aborted) fail('ABORTED'); if (!epoch || channel.取世代() !== epoch) fail('WORKER_CHANGED'); if (fault) fail('UNCERTAIN') }
  function clock() { const d = 取现在(); if (!(d instanceof Date) || !Number.isFinite(d.getTime())) fail('CLOCK_INVALID'); return d.toISOString() }
  function call(operation, data, id) { const p = channel.调用({ 操作: operation, 参数: [data], 操作编号: id }); writes.add(p); void p.finally(() => writes.delete(p)).catch(() => {}); return p }
  function claim(epoch, x) { const token = Object.freeze({}); claims.set(token, { owner, epoch, key: x.轮次键, id: x.请求编号, model: x.模型, used: false }); return token }
  function consume(token, epoch, x, signal) {
    check(signal, epoch); const c = claims.get(token)
    if (!c || c.owner !== owner || c.epoch !== epoch || c.key !== x.轮次键 || c.id !== x.请求编号 || c.model !== x.模型 || c.used || sent >= 最大请求) fail('CLAIM_INVALID')
    c.used = true; claims.delete(token); sent++
  }
  async function run(x, signal, epoch) {
    const id = randomUUID(), q = { 轮次键: x.轮次键, 指纹: x.指纹, 请求编号: id, 模型: x.模型, 用途: 'synthetic-shared', 时间: clock(), 预期用量版本: x.预期用量版本, ...(x.绑定 ? {绑定:x.绑定} : {}) }
    let dispatched = false, stage = 'before-start'
    try {
      check(signal, epoch)
      stage = 'started'; const start = await 等待有界(call(x.绑定 ? '模型事务.开始绑定聊天' : '模型事务.开始', q, 'synth-start-' + id), signal); check(signal, epoch)
      if (!start?.好 || start.回放 !== false || start.轮次?.已有 !== false || start.轮次.请求编号 !== id || start.轮次.轮次键 !== q.轮次键 || start.轮次.指纹 !== q.指纹 || start.轮次.模型 !== q.模型 || start.轮次.状态 !== 'reserved' || start.轮次.版本 !== 1 || !Number.isSafeInteger(start.用量版本) || start.用量版本 !== q.预期用量版本 + 1) fail('RECEIPT_INVALID')
      stage = 'dispatch'; const mark = await 等待有界(call('轮次执行.标记可能发送', { 轮次键: x.轮次键, 预期版本: 1 }, 'synth-dispatch-' + id), signal); check(signal, epoch)
      if (!mark?.好 || mark.回放 !== false || mark.请求编号 !== id || mark.轮次键 !== q.轮次键 || mark.指纹 !== q.指纹 || mark.模型 !== q.模型 || mark.状态 !== 'dispatch_possible' || mark.版本 !== 2) fail('RECEIPT_INVALID')
      const token = claim(epoch, q); consume(token, epoch, q, signal); dispatched = true
      const transport = send(x, signal, id); if (真实) { inflightTransport.add(transport); void transport.finally(() => inflightTransport.delete(transport)).catch(() => {}) }
      const reply = await 等待有界(transport, signal); check(signal, epoch)
      if (!reply || typeof reply.全文 !== 'string' || !reply.全文.trim() || reply.全文.length > 8000) fail('RESPONSE_INVALID')
      const out = { 轮次键: x.轮次键, 预期轮次版本: 2, 请求编号: id, 模型: x.模型, 时间: clock(), 预期用量版本: start.用量版本, 正文: reply.全文, 用量: reply.用量 }
      stage = 'succeeded'; const saved = await 等待有界(call('模型事务.成功', out, 'synth-finish-' + id), signal); check(signal, epoch)
      if (!saved?.好 || saved.回放 !== false || saved.轮次?.状态 !== 'result_ready' || saved.轮次?.请求编号 !== id || saved.轮次.轮次键 !== q.轮次键 || saved.轮次.模型 !== q.模型 || saved.轮次.版本 !== 3 || saved.用量版本 !== start.用量版本 + 1) fail('RECEIPT_INVALID')
      return { 全文: reply.全文, 请求编号: id, 用量: reply.用量 }
    } catch (e) {
      // No automatic retry or terminal write after an uncertain dispatch or ledger write.
      fault = true
      const err = Error(signal.aborted ? 'SYNTHETIC_SEND_ABORTED' : /^SYNTHETIC_SEND_[A-Z_]+$/u.test(e?.message || '') ? e.message : 'SYNTHETIC_SEND_UNCERTAIN')
      err.请求编号 = id; err.阶段 = stage; if (/^CORE_[A-Z_]+$/u.test(e?.message || '')) err.原因 = e.message; if (dispatched || writes.size || e?.状态 === 'unknown') err.状态 = 'unknown'; throw err
    }
  }
  function commit(operation, 输入, 中止, expected) {
    if (closed || abort.signal.aborted) fail('ABORTED'); if (fault) fail('UNCERTAIN'); if (active) fail('BUSY')
    if (中止 !== undefined && !(中止 instanceof AbortSignal)) fail('INPUT_INVALID')
    const q = 纯数据(输入), signal = 中止 ? AbortSignal.any([abort.signal, 中止]) : abort.signal, epoch = channel.取世代()
    const p = (async () => { try { check(signal,epoch); const r = await 等待有界(call(operation,q,q.操作编号),signal); check(signal,epoch); if (!r?.好 || r.状态 !== expected || r.轮次执行?.状态 !== 'committed') fail('RECEIPT_INVALID'); return r } catch (e) { if(!(operation==='模型事务.提交后台提取'&&e?.状态==='rejected'&&e.message==='SQLITE_STATE_BACKGROUND_MEMORY_CONFLICT'&&!signal.aborted&&channel.取世代()===epoch))fault = true; throw e } })()
    active = p; void p.finally(() => { if (active === p) active = null }).catch(() => {}); return p
  }
  const api = Object.freeze({
    要一轮(input) {
      if (closed || abort.signal.aborted) fail('ABORTED'); if (fault) fail('UNCERTAIN'); if (active) fail('BUSY'); if (sent >= 最大请求) fail('BUDGET')
      if (!input || Object.getPrototypeOf(input) !== Object.prototype) fail('INPUT_INVALID')
      const desc = Object.getOwnPropertyDescriptors(input); if (Reflect.ownKeys(desc).some(k => typeof k !== 'string' || !['轮次键','指纹','模型','预期用量版本','中止','绑定',...(真实?['消息们']:[])].includes(k) || !Object.hasOwn(desc[k], 'value') || !desc[k].enumerable)) fail('INPUT_INVALID')
      const { 中止, ...plain } = input; if (中止 !== undefined && !(中止 instanceof AbortSignal)) fail('INPUT_INVALID')
      const x = 纯数据(plain); if (Object.keys(x).sort().join(',') !== ['轮次键','指纹','模型','预期用量版本',...(Object.hasOwn(x,'绑定')?['绑定']:[]),...(真实?['消息们']:[])].sort().join(',')) fail('INPUT_INVALID')
      if (Object.hasOwn(x,'绑定') && (!x.绑定 || Object.getPrototypeOf(x.绑定) !== Object.prototype)) fail('INPUT_INVALID')
      if (真实) { if (x.模型 !== validate.模型) fail('INPUT_INVALID'); validate.验证({ 消息们:x.消息们, 中止 }) }
      const signal = 中止 ? AbortSignal.any([abort.signal, 中止]) : abort.signal, timeout = new AbortController(), timer = setTimeout(() => timeout.abort(), 超时毫秒), combined = AbortSignal.any([signal, timeout.signal]), epoch = channel.取世代()
      const p = run(x, combined, epoch).finally(() => clearTimeout(timer)); active = p; void p.finally(() => { if (active === p) active = null }).catch(() => {}); return p
    },
    提交绑定聊天(输入, 中止) {
      return commit('模型事务.提交绑定聊天',输入,中止,'saved')
    },
    提交后台提取(输入, 中止) { return commit('模型事务.提交后台提取',输入,中止,'committed') },
    关闭() { if (!closing) { closed = true; abort.abort(); closeTransport?.(); closing = Promise.resolve(active).catch(() => {}).then(() => Promise.allSettled([...writes, ...inflightTransport])).then(() => undefined) } return closing },
  })
  brokers.set(api, { actor, claimed:false, 真实 })
  return api
}
function 创建隔离一次性假发送({ 传输, ...options } = {}) { const send = transports.get(传输); if (!send) fail('DEPENDENCY_INVALID'); return 创建隔离一次性调度({ ...options, send, 真实:false }) }
function 创建隔离一次性真实发送({ 模型连接, ...options } = {}) {
  const controlled = 领取受控模型发送器(模型连接)
  try { return 创建隔离一次性调度({ ...options, 真实:true, validate:controlled, closeTransport:controlled.关闭, send:(x, 中止, 请求编号) => controlled.发送({ 消息们:x.消息们, 中止, 请求编号 }) }) }
  catch (e) { controlled.关闭(); throw e }
}
function 领取隔离绑定调度(api, actor) { const entry = brokers.get(api); if (!entry || entry.actor !== actor || entry.claimed || !entry.真实) fail('BINDING_CLAIM_FORBIDDEN'); entry.claimed = true; return api }
function 校验隔离后台调度(api, actor) { const entry = brokers.get(api); if (!entry || entry.actor !== actor || !entry.claimed || !entry.真实) fail('BINDING_CLAIM_FORBIDDEN'); return api }
module.exports = { 创建虚构传输, 创建隔离一次性假发送, 创建隔离一次性真实发送, 领取隔离绑定调度, 校验隔离后台调度 }
