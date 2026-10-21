/** 主动陪伴文字生成：单轮、无工具、无聊天历史、无日记和长期记忆写入。 */
'use strict'

const 对话 = require('./对话.cjs')
const 提示词 = require('./提示词.cjs')
const 临时记忆 = require('./临时记忆.cjs')
const { 拿钥匙 } = require('./钥匙.cjs')

const 可用分类 = new Set(['近期状态', '近期计划', '未完话题', '关系语境'])

function 少量临时资料(库 = 临时记忆) {
  try {
    const 结果 = 库.查询({ 生命周期: '有效', 确认状态: '已确认', 限量: 50 })
    const 列表 = Array.isArray(结果 && 结果.列表) ? 结果.列表 : []
    return 列表
      .filter((一) => 一 && 可用分类.has(一.类别) && 一.确认状态 === '已确认' && 一.生命周期 === '有效')
      .sort((甲, 乙) => String(乙.更新于 || 乙.创建于 || '').localeCompare(String(甲.更新于 || 甲.创建于 || '')))
      .slice(0, 2)
      .map((一) => ({ 类别: 一.类别, 内容: String(一.内容 || '').slice(0, 180) }))
      .filter((一) => 一.内容)
  } catch {
    return []
  }
}

function 清理正文(原文) {
  const 正文 = 对话.给流式看的(String(原文 || '')).trim()
  if (!正文 || 正文.length > 500) return ''
  return 正文
}

function 创建生成器(依赖 = {}) {
  const 要一轮 = 依赖.要一轮 || 对话.要一轮
  const 记账 = 依赖.记账 || 对话.记一笔账
  const 取钥匙 = 依赖.取钥匙 || 拿钥匙
  const 词 = 依赖.提示词 || 提示词
  const 库 = 依赖.临时记忆 || 临时记忆
  const 现在 = typeof 依赖.现在 === 'function' ? 依赖.现在 : () => new Date()

  async function 生成({ 模式 = 'chat', 模型, 中止, 原因 = '空闲时间到期' } = {}) {
    if (!取钥匙().钥匙) return { 好: false, 说明: '没有可用的模型 API Key' }
    const 资料 = 少量临时资料(库)
    const 消息们 = [
      { role: 'system', content: 词.拼主动陪伴({ 模式, 临时记忆: 资料.length ? JSON.stringify(资料) : '' }) },
      { role: 'system', content: 词.拼时间(现在()) },
      { role: 'user', content: `触发原因：${String(原因 || '空闲时间到期').slice(0, 40)}。请现在发一条自然的陪伴文字。` },
    ]
    try {
      const 结果 = await 要一轮({ 消息们, 模型, 中止, 最多多少字: 220, 温度: 0.7 })
      try { 记账(结果 && 结果.用了, 消息们, '主动陪伴', 模式) } catch { /* 记账失败不伪装成生成失败 */ }
      const 正文 = 清理正文(结果 && 结果.全文)
      if (!正文) return { 好: false, 说明: '模型没有返回可交付的短文字' }
      return { 好: true, 正文, 用了: (结果 && 结果.用了) || null, 临时资料数: 资料.length }
    } catch (错误) {
      return { 好: false, 说明: 错误 && 错误.name === 'AbortError' ? '主动生成已取消' : String(错误 && 错误.message || '生成失败') }
    }
  }

  return { 生成 }
}

module.exports = { 创建生成器, 少量临时资料, 清理正文, 可用分类 }
