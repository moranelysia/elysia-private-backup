/** 隔离用量领域适配：桌面费用与无界面请求事件保持独立。 */
'use strict'
const { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs')
const { 纯数据 } = require('../storage/sqlite-state.cjs')
const { exact } = require('../storage/sqlite-worker-protocol.cjs')
const plans = new WeakMap(), owners = new WeakMap()
const fail = code => { throw Error('ASYNC_USAGE_' + code) }
const errors = new Set(['CORE_AUTH_FAILED', 'CORE_BALANCE_EMPTY', 'CORE_RATE_LIMITED', 'CORE_HTTP_FAILED', 'CORE_RESPONSE_INVALID', 'CORE_RESPONSE_LIMIT', 'CORE_TIMEOUT', 'CORE_ABORTED', 'CORE_MODEL_FAILED'])
function freeze(x) { if (x && typeof x === 'object') { for (const v of Object.values(x)) freeze(v); Object.freeze(x) } return x }
function utc(x) { return typeof x === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x }
async function 创建异步用量(actor, { 用途, 算钱, 哪一天 } = {}) {
  if (!['desktop', 'headless'].includes(用途)) fail('SCOPE_INVALID')
  if (用途 === 'desktop' && (typeof 算钱 !== 'function' || typeof 哪一天 !== 'function')) fail('DEPENDENCY_INVALID')
  const f = 创建异步仓储门面(actor), backend = await f.状态.打开后端('usage', 用途)
  if (!owners.has(actor)) owners.set(actor, new Set())
  const owned = owners.get(actor); let closed = false
  function check() { if (closed) fail('CLOSED') }
  async function snapshot() {
    check(); const x = await backend.读取分段快照(), data = x.数据 === null ? [] : 纯数据(x.数据)
    if (!Array.isArray(data) || data.length > 10000 || data.some(v => !v || Object.getPrototypeOf(v) !== Object.prototype)) fail('DATA_INVALID')
    return { 版本: x.版本, 数据: data }
  }
  function desktopRecord(input, time) {
    if (typeof time !== 'string' || !/^\d{4}-\d\d-\d\d \d\d:\d\d$/u.test(time) || !utc(time.replace(' ', 'T') + ':00.000Z')) fail('TIME_INVALID')
    const usage = input == null ? null : 纯数据(input), bill = 纯数据(算钱(usage))
    if (!['输入', '命中', '未命中', '输出', '合计'].every(k => typeof bill[k] === 'number' && Number.isFinite(bill[k]))) fail('DATA_INVALID')
    return { 条: { 时间: time, 输入: bill.输入, 命中: bill.命中, 未命中: bill.未命中, 输出: bill.输出, 元: Number(bill.合计.toFixed(8)) }, 账: bill }
  }
  function headlessRecord(input, time) {
    if (!utc(time)) fail('TIME_INVALID')
    const x = 纯数据(input); exact(x, ['请求编号', '模型', '状态', '代码', '用量'])
    if (typeof x.请求编号 !== 'string' || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.exec(x.请求编号)?.[0] !== x.请求编号 || !['deepseek-flash', 'deepseek-v4-pro'].includes(x.模型) || !['started', 'succeeded', 'unknown'].includes(x.状态) || (x.代码 !== null && !errors.has(x.代码))) fail('DATA_INVALID')
    if ((x.状态 === 'started' && (x.代码 !== null || x.用量 !== null)) || (x.状态 === 'succeeded' && x.代码 !== null) || (x.状态 === 'unknown' && (x.用量 !== null || x.代码 === null))) fail('DATA_INVALID')
    if (x.用量 !== null) { exact(x.用量, ['prompt_tokens', 'completion_tokens', 'total_tokens']); if (!Object.values(x.用量).every(v => Number.isSafeInteger(v) && v >= 0) || x.用量.total_tokens !== x.用量.prompt_tokens + x.用量.completion_tokens) fail('DATA_INVALID') }
    return { 条: { 时间: time, ...x }, 账: null }
  }
  const api = {
    async 读取() { return snapshot() },
    async 准备记录(input, options = {}) {
      const o = 纯数据(options); exact(o, ['时间'])
      const record = 用途 === 'desktop' ? desktopRecord(input, o.时间) : headlessRecord(input, o.时间), s = await snapshot()
      if (s.数据.length >= 10000) fail('FULL')
      if (owned.size >= 16) fail('PLAN_LIMIT')
      const result = freeze({ 好: true, 账: record.账, 状态: 用途 === 'headless' ? record.条.状态 : null })
      const plan = Object.freeze({ 结果: result })
      plans.set(plan, { actor, 用途, 版本: s.版本, 数据: [...s.数据, record.条], 结果: result }); owned.add(plan); return plan
    },
    async 提交(plan, meta) {
      check(); const p = plans.get(plan); if (!p || p.actor !== actor || p.用途 !== 用途) fail('PLAN_INVALID')
      const m = 纯数据(meta); exact(m, ['操作编号'])
      if (typeof m.操作编号 !== 'string' || /^[a-zA-Z0-9_-]{1,100}$/u.exec(m.操作编号)?.[0] !== m.操作编号) fail('INPUT_INVALID')
      const saved = await backend.保存分段快照(p.数据, { 预期版本: p.版本, 操作编号: m.操作编号 })
      return { ...p.结果, 版本: saved.结果[0].版本 }
    },
    释放计划(plan) { const p = plans.get(plan); if (!p || p.actor !== actor || p.用途 !== 用途) fail('PLAN_INVALID'); plans.delete(plan); owned.delete(plan) },
    关闭() { closed = true; return backend.关闭() },
  }
  if (用途 === 'desktop') api.汇总 = async (options = {}) => {
    const o = 纯数据(options); if (Object.keys(o).some(k => !['当前日期', '最近一次'].includes(k))) fail('INPUT_INVALID')
    const 当前日期 = o.当前日期 ?? 哪一天(new Date()), 最近一次 = o.最近一次 ?? null
    if (typeof 当前日期 !== 'string' || !/^\d{4}-\d\d-\d\d$/u.test(当前日期) || !utc(当前日期 + 'T00:00:00.000Z')) fail('TIME_INVALID')
    const s = await snapshot(), rows = s.数据.filter(x => typeof x.元 === 'number'), zero = { 次数: 0, 输入: 0, 命中: 0, 未命中: 0, 输出: 0, 元: 0 }, today = { ...zero }, total = { ...zero }
    for (const row of rows) {
      for (const target of [total, ...(哪一天(row.时间) === 当前日期 ? [today] : [])]) { target.次数++; for (const k of ['输入', '命中', '未命中', '输出', '元']) target[k] += row[k] || 0 }
    }
    return { 这次: 最近一次, 今天: today, 一共: total, 命中率: total.输入 > 0 ? total.命中 / total.输入 : 0 }
  }
  return Object.freeze(api)
}
module.exports = { 创建异步用量 }
