/** Original chat prompt + temporary recall, fed only by an explicit Worker snapshot. */
'use strict'
const { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs')
const { 纯数据 } = require('../storage/sqlite-state.cjs')
const { 规范记忆结构 } = require('../脑/记忆结构.cjs')
const 叙述 = require('../脑/记忆叙述.cjs')
const fail = code => { throw Error('ASYNC_CHARACTER_PROMPT_' + code) }
function 创建异步角色提示({ actor, 原提示词, 创建临时召回器, 挑历史, 历史内容, 估算, 默认线, 取现在 = () => new Date() } = {}) {
  if (!原提示词 || typeof 原提示词.拼 !== 'function' || typeof 原提示词.拼时间 !== 'function' || typeof 创建临时召回器 !== 'function' || typeof 挑历史 !== 'function' || typeof 历史内容 !== 'function' || typeof 估算 !== 'function' || !Number.isSafeInteger(默认线) || 默认线 < 2000 || typeof 取现在 !== 'function') fail('DEPENDENCY_INVALID')
  const f = 创建异步仓储门面(actor)
  async function snapshot() {
    const before = await f.记忆.取统计(), data = {}
    for (const type of ['事实', '经历', '小本子']) {
      const p = await f.记忆.列长期({ 类别: type, 上限: 1000 })
      if (p.版本 !== before.版本) fail('VERSION_CONFLICT')
      if (p.还有) fail('MEMORY_LIMIT')
      data[type] = p.列表
    }
    const temporary = await f.记忆.查询临时({ 生命周期: '有效', 确认状态: '已确认', 限量: 1000 })
    const after = await f.记忆.取统计()
    if (temporary.版本 !== before.版本 || after.版本 !== before.版本) fail('VERSION_CONFLICT')
    if (!Array.isArray(temporary.列表)) fail('DATA_INVALID')
    return { data, temporary }
  }
  function format(rows, category, count, withId = false) {
    return rows.slice(-count).map(row => {
      const s = 规范记忆结构(row, category, row.来源), meta = 叙述.面向她的元数据(s.元数据), content = 叙述.整理正文(row.内容, { 人物: s.元数据.person, 修正旧代词: true }), id = withId && row.编号 ? `[事实编号:${row.编号}] ` : ''
      return `· ${id}[${row.时间}] [${s.记忆类型} · ${meta.person} · ${meta.relationship}] ${content}`
    }).join('\n')
  }
  async function 拼提示(input) {
    const x = 纯数据(input); if (Object.keys(x).sort().join(',') !== ['历史', '输入'].sort().join(',') || !Array.isArray(x.历史) || typeof x.输入 !== 'string') fail('INPUT_INVALID')
    const clock = 取现在(); if (!(clock instanceof Date) || !Number.isFinite(clock.getTime())) fail('CLOCK_INVALID')
    const s = await snapshot(), r = 创建临时召回器({ 临时记忆库: { 查询: () => 纯数据(s.temporary) }, 现在: () => clock.getTime() })
    if (!r || typeof r.召回 !== 'function' || typeof r.拼给模型 !== 'function') fail('DEPENDENCY_INVALID')
    const recall = r.召回({ 查询: x.输入 }); if (!recall || !recall.好) fail('RECALL_FAILED')
    const base = 原提示词.拼({ 模式: 'chat', 关于他: format(s.data.事实, '事实', 40, true), 共同经历: format(s.data.经历, '经历', 40), 小本子: format(s.data.小本子, '小本子', 30), 工具说明: '', 环境说明: '', 范围说明: '' })
    const time = 原提示词.拼时间(clock), temporary = r.拼给模型(recall)
    if (![base, time, temporary].every(v => typeof v === 'string')) fail('DEPENDENCY_INVALID')
    const budget = Math.max(2000, Math.floor((默认线 - 估算(base) - 49 - 估算(temporary)) * 0.5))
    const picked = 挑历史(x.历史, { 额度: budget, 最多几轮: 30 }); if (!Array.isArray(picked)) fail('DEPENDENCY_INVALID')
    const messages = [{ role: 'system', content: base }, { role: 'system', content: time }]
    if (temporary) messages.push({ role: 'system', content: temporary })
    for (const row of picked) if (row && row.content) messages.push({ role: row.role === 'assistant' ? 'assistant' : 'user', content: 历史内容(row) })
    messages.push({ role: 'user', content: x.输入 })
    return messages
  }
  return Object.freeze({ 拼提示 })
}
module.exports = { 创建异步角色提示 }
