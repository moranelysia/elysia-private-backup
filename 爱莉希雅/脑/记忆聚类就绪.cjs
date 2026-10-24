/**
 * P2 第二层的只读就绪检查器。
 *
 * 它只低频重算聚类候选缓存并给出“等待真实候选 / 待人工审核”门控；不会修改、
 * 压缩、归档或召回任何记忆，也不会因为出现候选就自行开启生产闭环。
 */
'use strict'

const 聚类候选 = require('./记忆聚类候选.cjs')

const 默认防抖毫秒 = 60 * 1000
const 默认最小间隔毫秒 = 10 * 60 * 1000

function 创建检查器({
  候选模块 = 聚类候选,
  现在 = () => new Date(),
  设定时器 = setTimeout,
  清定时器 = clearTimeout,
  防抖毫秒 = 默认防抖毫秒,
  最小间隔毫秒 = 默认最小间隔毫秒,
} = {}) {
  let 计时器 = null
  let 正在检查 = false
  let 待补一次 = false
  let 上次运行毫秒 = 0
  let 最近结果 = null
  const 原因们 = new Set()

  function 检查一次({ 原因 = '后台检查', 强制 = false } = {}) {
    if (正在检查) { 待补一次 = true; return { 好: true, 已排队: true } }
    正在检查 = true
    try {
      const 结果 = 候选模块.生成并保存({ 现在, 强制 })
      上次运行毫秒 = new Date(现在()).getTime()
      最近结果 = { ...结果, 原因: String(原因 || '').slice(0, 160) }
      return 最近结果
    } finally {
      正在检查 = false
      if (待补一次) {
        待补一次 = false
        排队({ 原因: '检查期间记忆再次变化' })
      }
    }
  }

  function 执行计划() {
    计时器 = null
    const 原因 = [...原因们].join('；') || '后台检查'
    原因们.clear()
    try {
      const 结果 = 检查一次({ 原因 })
      if (!结果.跳过 && 结果.报告) {
        console.log(`  🧩 记忆聚类就绪：${结果.报告.就绪门控.状态}（${结果.报告.候选数量} 组）`)
      }
      return 结果
    } catch (错误) {
      console.log('⚠ 记忆聚类就绪检查失败（不影响聊天）：' + 错误.message)
      最近结果 = { 好: false, 说明: 错误.message, 原因 }
      return 最近结果
    }
  }

  function 排队({ 原因 = '记忆变化', 立即 = false } = {}) {
    原因们.add(String(原因 || '记忆变化').slice(0, 160))
    if (正在检查) { 待补一次 = true; return { 已排队: true, 合并到下一轮: true } }
    if (计时器) 清定时器(计时器)
    const 当前 = new Date(现在()).getTime()
    const 等防抖 = 立即 ? 0 : Math.max(0, Number(防抖毫秒) || 0)
    const 等间隔 = 立即 ? 0 : Math.max(0, 上次运行毫秒 + Math.max(0, Number(最小间隔毫秒) || 0) - 当前)
    const 等待毫秒 = Math.max(等防抖, 等间隔)
    计时器 = 设定时器(执行计划, 等待毫秒)
    if (计时器 && typeof 计时器.unref === 'function') 计时器.unref()
    return { 已排队: true, 等待毫秒, 合并到下一轮: false }
  }

  function 取消() {
    if (计时器) 清定时器(计时器)
    计时器 = null
    原因们.clear()
    待补一次 = false
  }

  function 状态() {
    return { 正在检查, 已安排: !!计时器, 还有一轮: 待补一次, 最近结果 }
  }

  return { 检查一次, 排队, 取消, 状态 }
}

const 默认检查器 = 创建检查器()
module.exports = { 默认防抖毫秒, 默认最小间隔毫秒, 创建检查器, ...默认检查器 }
