/** 仅供隔离核心显式注入旧关系图库；图谱计划依赖长期记忆版本。 */
'use strict'
const { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs')
const { 纯数据 } = require('../storage/sqlite-state.cjs')
const { exact } = require('../storage/sqlite-worker-protocol.cjs')
const { 规范记忆结构 } = require('../脑/记忆结构.cjs')
const plans = new WeakMap(), owners = new WeakMap(), recallHandles = new WeakMap()
const fail = code => { throw Error('ASYNC_GRAPH_' + code) }
const clone = x => x && typeof x === 'object' ? 纯数据(x) : 纯数据({ 值: x }).值
function freeze(x) { if (x && typeof x === 'object') { for (const v of Object.values(x)) freeze(v); Object.freeze(x) } return x }
async function 创建异步关系图(actor, { 创建关系图库, 创建长期关系召回器, 现在, 造编号 } = {}) {
  if (typeof 创建关系图库 !== 'function' || (创建长期关系召回器 !== undefined && typeof 创建长期关系召回器 !== 'function') || (现在 !== undefined && typeof 现在 !== 'function') || (造编号 !== undefined && typeof 造编号 !== 'function')) fail('DEPENDENCY_INVALID')
  const f = 创建异步仓储门面(actor), relation = await f.状态.打开后端('relations', 'main')
  let layout
  try { layout = await f.状态.打开后端('relation-layout', 'main') } catch (e) { await relation.关闭(); throw e }
  if (!owners.has(actor)) owners.set(actor, new Set())
  const owned = owners.get(actor); let closed = false
  const check = () => { if (closed) fail('CLOSED') }
  async function snapshot() {
    check(); const r = await relation.读取分段快照(), l = await layout.读取分段快照()
    let version = null, cursor = 0, bytes = 0; const memories = []
    for (;;) {
      const p = await relation.读取图谱记忆页({ 版本: version, 游标: cursor })
      if (version === null) version = p.版本
      if (p.版本 !== version || !Array.isArray(p.记录) || !Number.isSafeInteger(p.游标) || p.游标 < cursor || typeof p.还有 !== 'boolean' || (p.还有 && p.游标 === cursor)) fail('PAGE_INVALID')
      bytes += Buffer.byteLength(JSON.stringify(p.记录)); memories.push(...p.记录); cursor = p.游标
      if (memories.length > 1000 || bytes > 8 * 1024 * 1024) fail('MEMORY_LIMIT')
      if (!p.还有) break
    }
    const rr = await relation.读取分段快照(), ll = await layout.读取分段快照(), stats = await f.记忆.取统计()
    if (r.版本 !== rr.版本 || l.版本 !== ll.版本 || version !== stats.版本) fail('VERSION_CONFLICT')
    const visible = memories.filter(x => x && typeof x === 'object' && String(x.内容 || '').trim()).map(x => {
      const 来源 = String(x.来源 || '未记录'), normalized = 规范记忆结构(x, x.类别, 来源)
      return { ...x, 编号: String(x.编号 || ''), 时间: String(x.时间 || ''), 内容: String(x.内容 || '').trim(), 来源, 记忆类型: normalized.记忆类型, 元数据: normalized.元数据 }
    }).sort((a, b) => String(b.时间).localeCompare(String(a.时间)) || String(b.编号).localeCompare(String(a.编号)))
    return { r, l, version, memories: visible }
  }
  function engine(s, writes) {
    return 创建关系图库({ 关系文件: __filename, 布局文件: __filename, 长期记忆库: { 全部长期记忆: () => clone(s.memories) },
      存储: { 关系: { 读取: () => clone(s.r.数据), 保存: x => { writes.关系 = clone(x) } }, 布局: { 读取: () => clone(s.l.数据), 保存: x => { writes.布局 = clone(x) } } },
      ...(现在 ? { 现在 } : {}), ...(造编号 ? { 造编号 } : {}) })
  }
  async function invoke(method, input, s, writes) {
    const e = engine(s, writes); if (!e || typeof e[method] !== 'function') fail('DEPENDENCY_INVALID')
    return e[method](clone(input))
  }
  const handle = Object.freeze({
    async 读取(method, input = {}) {
      if (!['查询', '读取已保存一跳'].includes(method)) fail('METHOD_INVALID')
      const s = await snapshot(), writes = {}, result = await invoke(method, input, s, writes)
      if (Object.keys(writes).length) fail('UNEXPECTED_WRITE')
      return result
    },
    async 准备(method, input) {
      if (!['新增', '修改', '删除', '应用自动候选', '保存布局'].includes(method)) fail('METHOD_INVALID')
      if (owned.size >= 16) fail('PLAN_LIMIT')
      const s = await snapshot(), writes = {}, result = await invoke(method, input, s, writes)
      if (owned.size >= 16) fail('PLAN_LIMIT')
      const publicResult = freeze(clone(result)), plan = Object.freeze({ 改变: Object.keys(writes).length > 0, 结果: publicResult })
      plans.set(plan, { actor, version: s.version, r: s.r.版本, l: s.l.版本, writes: clone(writes), result: publicResult }); owned.add(plan); return plan
    },
    async 提交(plan, meta) {
      check(); const p = plans.get(plan); if (!p || p.actor !== actor) fail('PLAN_INVALID')
      const m = 纯数据(meta); exact(m, ['操作编号'])
      if (typeof m.操作编号 !== 'string' || /^[a-zA-Z0-9_-]{1,100}$/u.exec(m.操作编号)?.[0] !== m.操作编号) fail('INPUT_INVALID')
      const rows = []
      if (Object.hasOwn(p.writes, '关系')) rows.push({ 后端: relation, 数据: p.writes.关系, 预期版本: p.r })
      if (Object.hasOwn(p.writes, '布局')) rows.push({ 后端: layout, 数据: p.writes.布局, 预期版本: p.l })
      if (!rows.length) { const now = await snapshot(); if (now.r.版本 !== p.r || now.l.版本 !== p.l || now.version !== p.version) fail('VERSION_CONFLICT'); return p.result }
      await f.状态.保存图谱快照组(rows, { 操作编号: m.操作编号, 记忆版本: p.version }); return p.result
    },
    释放计划(plan) { const p = plans.get(plan); if (!p || p.actor !== actor) fail('PLAN_INVALID'); plans.delete(plan); owned.delete(plan) },
    async 关闭() { closed = true; await Promise.all([relation.关闭(), layout.关闭()]) },
  })
  recallHandles.set(handle, { actor, async 召回(查询) {
    check()
    if (typeof 创建长期关系召回器 !== 'function') fail('RECALL_DEPENDENCY_INVALID')
    if (typeof 查询 !== 'string') fail('INPUT_INVALID')
    const s = await snapshot(), writes = {}, library = engine(s, writes)
    const recall = 创建长期关系召回器({ 长期记忆库: { 全部长期记忆: () => clone(s.memories) }, 关系图库: library })
    if (!recall || typeof recall.召回 !== 'function' || typeof recall.拼给模型 !== 'function') fail('RECALL_DEPENDENCY_INVALID')
    const result = recall.召回({ 查询 })
    if (!result || result.好 !== true) fail('RECALL_FAILED')
    const 提示 = recall.拼给模型(result)
    check()
    if (Object.keys(writes).length) fail('UNEXPECTED_WRITE')
    if (typeof 提示 !== 'string') fail('RECALL_DEPENDENCY_INVALID')
    return { 记忆版本: s.version, 图谱版本: s.r.版本, 提示 }
  } })
  return handle
}
async function 读取同仓一跳(actor, handle, 查询) {
  const binding = recallHandles.get(handle)
  if (!binding || binding.actor !== actor) fail('HANDLE_INVALID')
  return binding.召回(查询)
}
module.exports = { 创建异步关系图, 读取同仓一跳 }
