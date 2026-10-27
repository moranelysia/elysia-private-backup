/** 隔离后台缓冲的异步领域适配；不启动提取任务或调用模型。 */
'use strict'
const { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs')
const { 纯数据 } = require('../storage/sqlite-state.cjs')
const { exact } = require('../storage/sqlite-worker-protocol.cjs')
const { 校验后台缓冲 } = require('./后台缓冲格式.cjs')
const plans = new WeakMap()
const owners = new WeakMap()
const fail = code => { throw Error('ASYNC_BUFFER_' + code) }
const key = x => JSON.stringify([x.对话, x.消息编号])

async function 创建异步后台缓冲(actor) {
  const facade = 创建异步仓储门面(actor)
  const backend = await facade.状态.打开后端('extraction-buffer', 'main')
  if (!owners.has(actor)) owners.set(actor, new Set())
  const owned = owners.get(actor)
  let closed = false
  function check() { if (closed) fail('CLOSED') }
  async function snapshot() {
    check(); const x = await backend.读取分段快照()
    const data = x.数据 === null ? { 版本: 1, 轮次: [] } : 纯数据(x.数据)
    校验后台缓冲(data)
    return { 版本: x.版本, 数据: data }
  }
  function make(s, data, result, changed) {
    if (owned.size >= 16) fail('PLAN_LIMIT')
    const publicResult = Object.freeze({ ...result })
    const plan = Object.freeze({ 改变: changed, 结果: publicResult })
    plans.set(plan, { actor, 版本: s.版本, 数据: 纯数据(data), 结果: publicResult, 改变: changed })
    owned.add(plan)
    return plan
  }
  return Object.freeze({
    async 读取() { return snapshot() },
    async 准备记录(input) {
      const x = 纯数据(input), s = await snapshot()
      const item = { 对话: x.对话, 消息编号: x.消息编号, 用户原话: String(x.用户原话).slice(0, 6000), 她的回复: String(x.她的回复).slice(0, 6000), 消息时间: x.发生于 || x.接收于, 接收于: x.接收于 }
      校验后台缓冲({ 版本: 1, 轮次: [item] })
      if (s.数据.轮次.some(old => key(old) === key(item))) return make(s, s.数据, { 好: true, 新增: false, 数量: s.数据.轮次.length }, false)
      if (s.数据.轮次.length >= 100) fail('FULL')
      const data = { ...s.数据, 轮次: [...s.数据.轮次, item] }; 校验后台缓冲(data)
      return make(s, data, { 好: true, 新增: true, 数量: data.轮次.length }, true)
    },
    async 准备清除(input) {
      const wrapped = 纯数据({ 项: input }), items = wrapped.项
      if (!Array.isArray(items) || !items.length || items.length > 100) fail('INPUT_INVALID')
      const keys = new Set()
      for (const x of items) { exact(x, ['对话', '消息编号']); if (typeof x.对话 !== 'string' || !/^channel-[a-zA-Z0-9_-]+$/u.test(x.对话) || typeof x.消息编号 !== 'string') fail('INPUT_INVALID'); keys.add(key(x)) }
      const s = await snapshot(), remaining = s.数据.轮次.filter(x => !keys.has(key(x))), count = s.数据.轮次.length - remaining.length
      const data = { ...s.数据, 轮次: remaining }; 校验后台缓冲(data)
      return make(s, data, { 好: true, 清除: count, 数量: remaining.length }, count > 0)
    },
    async 提交(plan, meta) {
      check(); const p = plans.get(plan); if (!p || p.actor !== actor) fail('PLAN_INVALID')
      const m = 纯数据(meta); exact(m, ['操作编号'])
      if (typeof m.操作编号 !== 'string' || /^[a-zA-Z0-9_-]{1,100}$/u.exec(m.操作编号)?.[0] !== m.操作编号) fail('INPUT_INVALID')
      if (!p.改变) { const now = await snapshot(); if (now.版本 !== p.版本) fail('VERSION_CONFLICT'); return { ...p.结果, 版本: p.版本 } }
      const saved = await backend.保存分段快照(p.数据, { 预期版本: p.版本, 操作编号: m.操作编号 })
      return { ...p.结果, 版本: saved.结果[0].版本 }
    },
    释放计划(plan) { const p = plans.get(plan); if (!p || p.actor !== actor) fail('PLAN_INVALID'); plans.delete(plan); owned.delete(plan) },
    关闭() { closed = true; return backend.关闭() },
  })
}
module.exports = { 创建异步后台缓冲 }
