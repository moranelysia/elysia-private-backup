/** Only a branded fake model and isolated Worker; never forwards to a real transport. */
'use strict'
const { randomUUID } = require('node:crypto')
const { 是假模型连接 } = require('../脑/模型连接.cjs')
const { 等待有界 } = require('../脑/任务控制.cjs')
const { 创建异步用量 } = require('./异步用量.cjs')
const { 纯数据 } = require('../storage/sqlite-state.cjs')
const fail = code => { throw Error('ISOLATED_MODEL_USAGE_' + code) }
async function 创建隔离异步模型用量关口({ actor, 模型连接, 取现在 = () => new Date() } = {}) {
  if (!是假模型连接(模型连接) || typeof 取现在 !== 'function') fail('DEPENDENCY_INVALID')
  const usage = await 创建异步用量(actor, { 用途: 'headless' }), abort = new AbortController()
  let closed = false, fault = false, pending = null, closing = null
  function check() { if (closed || abort.signal.aborted) fail('CLOSED'); if (fault) fail('LEDGER_UNCERTAIN') }
  function now() { const d = 取现在(); if (!(d instanceof Date) || !Number.isFinite(d.getTime())) fail('CLOCK_INVALID'); return d.toISOString() }
  // This gate never retries; an uncertain result must be reconciled by operation receipt.
  async function persist(event, operation) {
    let plan
    try { plan = await usage.准备记录(event, { 时间: now() }); return await usage.提交(plan, { 操作编号: operation }) }
    catch (e) { fault = true; throw e }
    finally { if (plan) usage.释放计划(plan) }
  }
  async function run(消息们, signal) {
    check(); if (signal.aborted) fail('ABORTED')
    const id = randomUUID(), event = { 请求编号: id, 模型: 'deepseek-flash', 状态: 'started', 代码: null, 用量: null }
    await persist(event, 'fake-model-' + id + '-start')
    check(); if (signal.aborted) fail('ABORTED')
    let answer
    try { answer = await 等待有界(模型连接.要一轮({ 消息们, 中止: signal }), signal) }
    catch (e) {
      const code = signal.aborted ? 'CORE_ABORTED' : 'CORE_MODEL_FAILED'
      await persist({ ...event, 状态: 'unknown', 代码: code }, 'fake-model-' + id + '-end')
      fail(signal.aborted ? 'ABORTED' : 'MODEL_FAILED')
    }
    // A failed or uncertain final write never returns the answer and is not followed by another terminal write.
    await persist({ ...event, 状态: 'succeeded', 用量: null }, 'fake-model-' + id + '-end')
    check(); if (signal.aborted) fail('ABORTED')
    return answer
  }
  return Object.freeze({
    要一轮({ 消息们, 中止 } = {}) {
      check(); if (pending) fail('BUSY')
      if (中止 !== undefined && !(中止 instanceof AbortSignal)) fail('INPUT_INVALID')
      const x = 纯数据({ 消息们 }).消息们
      if (!Array.isArray(x) || !x.length || x.some(v => !v || Object.keys(v).sort().join(',') !== 'content,role' || !['system', 'user', 'assistant'].includes(v.role) || typeof v.content !== 'string') || Buffer.byteLength(JSON.stringify(x)) > 16384) fail('INPUT_INVALID')
      const signal = 中止 ? AbortSignal.any([abort.signal, 中止]) : abort.signal
      const work = run(x, signal); pending = work
      void work.finally(() => { if (pending === work) pending = null }).catch(() => {})
      return work
    },
    读取用量() { return usage.读取() },
    关闭() { if (closing) return closing; closed = true; abort.abort(); closing = Promise.resolve(pending).catch(() => {}).then(() => usage.关闭()); return closing },
  })
}
module.exports = { 创建隔离异步模型用量关口 }
