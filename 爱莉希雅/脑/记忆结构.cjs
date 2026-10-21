/** 记忆类型与人物元数据的统一校验。旧记录只在读取时补默认值，不因此改写磁盘。 */
'use strict'

const 记忆类型们 = Object.freeze(['episodic', 'semantic', 'procedural'])
const 类型集合 = new Set(记忆类型们)

function 默认记忆类型(类别) {
  const 名 = String(类别 || '').trim()
  if (['经历', '近期事件', '近期计划', '未完话题'].includes(名)) return 'episodic'
  return 'semantic'
}

function 正常记忆类型(值, 类别, { 严格 = false } = {}) {
  const 类型 = String(值 || '').trim().toLowerCase()
  if (类型集合.has(类型)) return 类型
  if (严格 && 类型) throw new Error('记忆类型只能是 episodic、semantic 或 procedural')
  return 默认记忆类型(类别)
}

function 默认元数据(类别, 来源 = '') {
  if (String(类别 || '') === '经历') {
    return { backstory: '共同经历记录', person: '用户与爱莉希雅', relationship: '共同经历' }
  }
  return {
    backstory: String(来源 || '') === '模型提取' ? '从用户本轮原话提取' : '用户主动记录',
    person: '用户本人',
    relationship: '本人',
  }
}

function 干净字段(值, 上限, 默认值, 名称, 严格) {
  const 文本 = String(值 == null ? '' : 值).trim()
  if (!文本) return 默认值
  if (文本.length > 上限) {
    if (严格) throw new Error(`${名称}不能超过 ${上限} 字`)
    return 文本.slice(0, 上限)
  }
  return 文本
}

function 正常元数据(值, { 类别 = '', 来源 = '', 严格 = false } = {}) {
  const 默认 = 默认元数据(类别, 来源)
  if (值 !== undefined && 值 !== null && (typeof 值 !== 'object' || Array.isArray(值))) {
    if (严格) throw new Error('记忆元数据必须是对象')
    return 默认
  }
  const 原 = 值 && typeof 值 === 'object' ? 值 : {}
  return {
    backstory: 干净字段(原.backstory, 240, 默认.backstory, 'backstory', 严格),
    person: 干净字段(原.person, 80, 默认.person, 'person', 严格),
    relationship: 干净字段(原.relationship, 80, 默认.relationship, 'relationship', 严格),
  }
}

function 规范记忆结构(记录, 类别, 来源 = '') {
  return {
    记忆类型: 正常记忆类型(记录 && 记录.记忆类型, 类别),
    元数据: 正常元数据(记录 && 记录.元数据, { 类别, 来源 }),
  }
}

module.exports = { 记忆类型们, 默认记忆类型, 正常记忆类型, 默认元数据, 正常元数据, 规范记忆结构 }
