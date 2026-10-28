/** Opt-in adapter for the isolated Worker; never retries an uncertain write. */
'use strict'
const { 是真实模型连接 } = require('../脑/模型连接.cjs')
const { 创建异步用量 } = require('./异步用量.cjs')
const owners = new WeakMap()

function 操作编号(请求编号, 阶段) {
  if (typeof 请求编号 !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(请求编号) || !['started', 'succeeded', 'unknown'].includes(阶段)) throw Error('ISOLATED_REAL_USAGE_ID_INVALID')
  return 'real-model-' + 请求编号 + (阶段 === 'started' ? '-start' : '-end')
}
async function 创建隔离真实模型用量适配({ actor, 模型连接, 取现在 = () => new Date() } = {}) {
  if (!是真实模型连接(模型连接) || typeof 取现在 !== 'function') throw Error('ISOLATED_REAL_USAGE_DEPENDENCY_INVALID')
  const usage = await 创建异步用量(actor, { 用途: 'headless' })
  let closing
  try {
    模型连接.绑定异步记录(async event => {
      let plan
      try {
        const date = 取现在()
        if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw Error('ISOLATED_REAL_USAGE_CLOCK_INVALID')
        plan = await usage.准备记录(event, { 时间: date.toISOString() })
        return await usage.提交(plan, { 操作编号: 操作编号(event.请求编号, event.状态) })
      } finally { if (plan) usage.释放计划(plan) }
    })
  } catch (e) { await usage.关闭(); throw e }
  const api = Object.freeze({
    模型: 模型连接.模型,
    要一轮: (options) => 模型连接.要一轮(options),
    读取用量: () => usage.读取(),
    关闭() {
      if (!closing) { 模型连接.关闭(); closing = 模型连接.等待记账排空().then(() => usage.关闭()) }
      return closing
    },
  })
  owners.set(api, { actor, claimed: false }); return api
}
function 领取隔离真实模型用量适配(api, actor) {
  const owner = owners.get(api)
  if (!owner || owner.actor !== actor || owner.claimed) return false
  owner.claimed = true; return true
}
module.exports = { 创建隔离真实模型用量适配, 领取隔离真实模型用量适配, 操作编号 }
