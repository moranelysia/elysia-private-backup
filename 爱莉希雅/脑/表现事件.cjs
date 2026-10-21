/**
 * 表现事件.cjs —— 情绪、回复阶段和身体动作之间的统一接口。
 *
 * 这里只输出有限字段，不保存用户原话或回复正文。Bongo Cat、未来 Live2D 和界面
 * 都消费同一种事件，避免各自再猜一遍“她现在是什么状态”。
 */
'use strict'

const 类型们 = Object.freeze(['待机', '思考', '执行', '说话', '开心', '关心', '认真', '疑惑', '惊讶'])
const 即时到类型 = Object.freeze({ 开心: '开心', 关心: '关心', 认真: '认真', 疑惑: '疑惑', 惊讶: '惊讶' })
const 自动表情 = Object.freeze({ 开心: '眯眯眼', 疑惑: '疑问', 惊讶: '星星眼' })
const 自动门槛 = Object.freeze({ 开心: 0.35, 疑惑: 0.45, 惊讶: 0.55 })

function 限制(数, 默认值 = 0) {
  const 值 = Number(数)
  return Number.isFinite(值) ? Math.max(0, Math.min(1, 值)) : 默认值
}

function 创建表现层(选项 = {}) {
  const 取现在 = typeof 选项.现在 === 'function' ? 选项.现在 : () => new Date()
  // 同一条即时反应在十分钟衰减期间只驱动一次身体，避免每轮重复按快捷键。
  const 已表现触发 = new Map()

  function 基础事件(对话, 类型, 阶段, 状态 = {}) {
    const 即时 = 状态.即时 || {}
    const 缓慢 = 状态.缓慢 || {}
    const 合法类型 = 类型们.includes(类型) ? 类型 : '待机'
    return {
      版本: 1,
      对话: String(对话 || ''),
      类型: 合法类型,
      阶段: String(阶段 || ''),
      强度: Number(限制(即时.强度, 合法类型 === '待机' ? 0 : 0.2).toFixed(2)),
      温度: Number(限制(即时.温度, 0.72).toFixed(2)),
      活跃度: Number(限制(即时.活跃度, 0.34).toFixed(2)),
      基调: String(缓慢.情绪 || '平稳'),
      基调强度: Number(限制(缓慢.强度).toFixed(2)),
      表情: '',
      表情来源: '',
      产生于: new Date(取现在()).toISOString(),
    }
  }

  function 阶段(对话, 类型, 状态 = {}) {
    const 合法 = ['思考', '执行', '说话', '待机'].includes(类型) ? 类型 : '待机'
    return 基础事件(对话, 合法, 合法, 状态)
  }

  function 回复(对话, 选项2 = {}) {
    const 即时 = 选项2.即时 || {}
    const 缓慢 = 选项2.缓慢 || {}
    const 类型 = 即时到类型[即时.情绪] && Number(即时.强度 || 0) >= 0.08
      ? 即时到类型[即时.情绪]
      : '说话'
    const 事件 = 基础事件(对话, 类型, '完成', { 即时, 缓慢 })
    const 显式 = (选项2.显式表情 || []).map(String).map((一) => 一.trim()).find(Boolean)
    const 文本 = (选项2.文本表情 || []).map(String).map((一) => 一.trim()).find(Boolean)

    if (显式) {
      事件.表情 = 显式
      事件.表情来源 = '她写的标记'
    } else if (文本) {
      事件.表情 = 文本
      事件.表情来源 = '回复内容'
    }

    const 触发 = String(即时.触发于 || '')
    const 是新触发 = !!触发 && 已表现触发.get(事件.对话) !== 触发
    if (是新触发) 已表现触发.set(事件.对话, 触发)
    if (!事件.表情 && 是新触发 && 自动表情[类型] && 事件.强度 >= 自动门槛[类型]) {
      事件.表情 = 自动表情[类型]
      事件.表情来源 = '即时反应'
    }
    return 事件
  }

  function 重置(对话) { 已表现触发.delete(String(对话 || '')) }
  return { 阶段, 回复, 重置 }
}

module.exports = { 创建表现层, 类型们, 即时到类型, 自动表情 }

