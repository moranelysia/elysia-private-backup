/**
 * 用可解释的本地规则评估临时记忆是否足够重要，可以自主进入长期层。
 * 不调用模型；只使用用户原话、候选结构和既有临时记录。
 */
'use strict'

const crypto = require('node:crypto')

const 自动阈值 = 70

function 归一(值) {
  return String(值 || '').normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '')
}

function 有敏感或内部内容(值) {
  const 文 = String(值 || '')
  return /(?:sk-[a-z0-9_-]{12,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/i.test(文) ||
    /(?:api[ _-]?key|token|密码|口令)\s*[:：=]\s*\S+/i.test(文) ||
    /(?:[a-z]:\\|\\\\[^\\\s]+\\)/i.test(文) ||
    /\[(?:读|写|搜|运行|工具|记住|经历|更正事实)\s*[:：]/.test(文)
}

function 二元组(值) {
  const 文 = 归一(值)
  const 组 = new Set()
  if (文.length < 2) { if (文) 组.add(文); return 组 }
  for (let i = 0; i < 文.length - 1; i++) 组.add(文.slice(i, i + 2))
  return 组
}

function 相似度(甲, 乙) {
  const a = 归一(甲), b = 归一(乙)
  if (!a || !b) return 0
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) >= 4 ? 1 : 0
  const A = 二元组(a), B = 二元组(b)
  let 交 = 0
  for (const 一 of A) if (B.has(一)) 交++
  return 交 / Math.max(1, Math.min(A.size, B.size))
}

function 是同一主题(候选, 记录) {
  if (!候选 || !记录) return false
  if (候选.记忆类型 && 记录.记忆类型 && 候选.记忆类型 !== 记录.记忆类型) return false
  const 甲人 = 候选.元数据 && 候选.元数据.person
  const 乙人 = 记录.元数据 && 记录.元数据.person
  if (甲人 && 乙人 && 甲人 !== 乙人) return false
  return 相似度(候选.内容, 记录.内容) >= 0.62
}

function 命中强烈情感(原话) {
  return /(?:特别|非常|真的很|太(?:喜欢|讨厌|害怕|难过|开心|激动|生气)|最(?:喜欢|讨厌|害怕|在乎)|受不了|崩溃|绝望|愤怒|珍惜|对我很重要|我很在乎|我爱|我恨)/.test(String(原话 || ''))
}

function 命中明确记忆意图(原话) {
  return /(?:请|一定要|你要)?记住|别忘(?:了|记)?|长期记住|以后都要记得|这很重要/.test(String(原话 || ''))
}

function 默认去向(候选) {
  if (候选.记忆类型 === 'episodic') return '经历'
  if (候选.记忆类型 === 'procedural') return '小本子'
  return '事实'
}

function 证据指纹({ 对话 = '', 消息时间 = '', 依据原文 = '' } = {}) {
  return crypto.createHash('sha256').update(JSON.stringify({
    对话: String(对话 || '').trim(),
    消息时间: String(消息时间 || '').trim(),
    依据原文: String(依据原文 || '').trim(),
  })).digest('hex')
}

function 账本证据(候选) {
  const 账本 = 候选 && 候选.评估账本
  return 账本 && Array.isArray(账本.证据) ? 账本.证据.filter((一) => 一 && typeof 一 === 'object') : []
}

function 评估({ 候选, 对话轮次 = [], 已有记录 = [], 既有提及 = 0, 来源对话 = '' } = {}) {
  const 轮次 = Array.isArray(对话轮次) ? 对话轮次 : []
  // 已有记录参数保留为兼容入口，但“另一条相似记录”不再冒充一次用户提及。
  void 已有记录
  const 历史证据 = 账本证据(候选)
  const 已见指纹 = new Set(历史证据.map((一) => String(一.指纹 || '')).filter(Boolean))
  const 新增证据 = []
  let 最高相似度 = 0
  for (const 一 of 轮次) {
    const 相似 = 相似度(候选 && 候选.内容, 一 && 一.用户原话)
    最高相似度 = Math.max(最高相似度, 相似)
    if (相似 < 0.62) continue
    const 本轮原话 = String(一 && 一.用户原话 || '').trim()
    const 候选依据 = String(候选 && 候选.依据原文 || '').trim()
    const 逐字依据 = 候选依据 && 本轮原话.includes(候选依据) ? 候选依据 : 本轮原话.slice(0, 500)
    if (!逐字依据 || 有敏感或内部内容(逐字依据)) continue
    const 证据 = {
      对话: String(一 && 一.对话 || 来源对话 || '').trim().slice(0, 160),
      消息时间: String(一 && 一.消息时间 || '').trim().slice(0, 80),
      依据原文: 逐字依据,
    }
    if (!证据.依据原文) continue
    // 去重按整条来源消息，展示与保存仍只保留最小逐字依据。
    证据.指纹 = 证据指纹({ 对话: 证据.对话, 消息时间: 证据.消息时间, 依据原文: 本轮原话 })
    if (已见指纹.has(证据.指纹)) continue
    已见指纹.add(证据.指纹)
    证据.明确记忆 = 命中明确记忆意图(证据.依据原文)
    证据.强烈情感 = 命中强烈情感(证据.依据原文)
    新增证据.push(证据)
  }
  const 旧账本 = 候选 && 候选.评估账本 && typeof 候选.评估账本 === 'object' ? 候选.评估账本 : null
  const 历史提及基数 = 旧账本
    ? Math.max(0, Math.min(1, Number(旧账本.历史提及基数) || 0))
    : Math.max(0, Math.min(1, Number(既有提及) || 0))
  const 全部证据 = [...历史证据, ...新增证据]
  const 提及次数 = Math.max(1, Math.min(99, 历史提及基数 + 全部证据.length))
  const 原话 = 全部证据.map((一) => String(一.依据原文 || '')).filter(Boolean).join('\n') || String(候选 && 候选.依据原文 || '')
  const 明确记忆 = 全部证据.some((一) => 一.明确记忆 === true) || 命中明确记忆意图(原话)
  const 强烈情感 = 全部证据.some((一) => 一.强烈情感 === true) || 命中强烈情感(原话)
  const 稳定类型 = 候选 && (候选.记忆类型 === 'semantic' || 候选.记忆类型 === 'procedural')
  let 分数 = 10
  const 依据 = []
  if (提及次数 >= 3) { 分数 += 70; 依据.push(`同一主题累计提及 ${提及次数} 次`) }
  else if (提及次数 >= 2) { 分数 += 60; 依据.push(`同一主题累计提及 ${提及次数} 次`) }
  if (明确记忆) { 分数 += 80; 依据.push('用户明确要求记住') }
  if (强烈情感) { 分数 += 50; 依据.push('原话含强烈情感表达') }
  if (稳定类型) { 分数 += 10; 依据.push('属于稳定语义或可复用做法') }
  分数 = Math.min(100, 分数)
  const 关系安全 = !候选.关系 || candidateRelationState(候选.关系) === '当前'
  const 可自主 = 关系安全 && 分数 >= 自动阈值
  return {
    分数,
    重要性: 分数 >= 90 ? 3 : 分数 >= 自动阈值 ? 2 : 分数 >= 40 ? 1 : 0,
    提及次数,
    历史提及基数,
    新增提及次数: 新增证据.length,
    新增证据,
    最高相似度,
    依据,
    去向: 默认去向(候选 || {}),
    可自主,
    说明: 可自主 ? `自动评估达到 ${分数} 分` : `自动评估 ${分数} 分，未达到 ${自动阈值} 分`,
  }
}

function candidateRelationState(关系) {
  return 关系 && typeof 关系 === 'object' && 关系.状态 ? String(关系.状态) : '当前'
}

module.exports = { 自动阈值, 归一, 相似度, 是同一主题, 命中强烈情感, 命中明确记忆意图, 默认去向, 证据指纹, 有敏感或内部内容, 评估 }
