/**
 * 私密日记调度.cjs —— 私密日记的生产调度与双重启用门。
 *
 * 开关默认关闭；关闭时不建生成器、不读来源、也不创建计时器。打开后，生成器还会
 * 再核对配置模块中的同一开关与正式数据目录，避免单一调用参数越过生产边界。
 */
'use strict'

const path = require('node:path')
const 配置 = require('./配置.cjs')
const { 创建私密日记生成器 } = require('./私密日记.cjs')
const { 默认取来源 } = require('./记忆日记.cjs')

function 正常日期(值) {
  const 日期 = 值 instanceof Date ? new Date(值) : new Date(值)
  if (!Number.isFinite(日期.getTime())) throw new Error('私密日记调度时间无效')
  return 日期
}

function 前一自然日(现在) {
  const 当前 = 正常日期(现在)
  return new Date(当前.getFullYear(), 当前.getMonth(), 当前.getDate() - 1, 12, 0, 0)
}

function 周期字(日期) {
  const 补二 = (数) => String(数).padStart(2, '0')
  return `${日期.getFullYear()}-${补二(日期.getMonth() + 1)}-${补二(日期.getDate())}`
}

function 创建私密日记调度(选项 = {}) {
  const 已启用 = 选项.已启用 === true
  const 数据目录 = path.resolve(选项.数据目录 || 配置.数据目录)
  const 取现在 = typeof 选项.现在 === 'function' ? 选项.现在 : () => new Date()
  const 取连接 = typeof 选项.取连接 === 'function' ? 选项.取连接 : () => ({})
  const 建生成器 = typeof 选项.创建生成器 === 'function'
    ? 选项.创建生成器
    : ({ 数据目录: 目录 }) => 创建私密日记生成器({
      数据目录: 目录,
      允许正式写入: true,
      取来源: (期间) => 默认取来源(期间, 目录),
    })
  const 设延时 = typeof 选项.设延时 === 'function' ? 选项.设延时 : setTimeout
  const 清延时 = typeof 选项.清延时 === 'function' ? 选项.清延时 : clearTimeout
  const 设间隔 = typeof 选项.设间隔 === 'function' ? 选项.设间隔 : setInterval
  const 清间隔 = typeof 选项.清间隔 === 'function' ? 选项.清间隔 : clearInterval
  const 记录 = typeof 选项.记录 === 'function' ? 选项.记录 : (文字) => console.log(文字)
  const 首次延迟 = Math.max(1000, Number(选项.首次延迟) || 45 * 1000)
  const 检查间隔 = Math.max(60 * 1000, Number(选项.检查间隔) || 30 * 60 * 1000)

  let 生成器 = null
  let 首次计时器 = null
  let 检查计时器 = null
  let 已启动 = false
  let 运行中 = null
  let 运行周期 = ''
  const 本次已检查 = new Set()

  function 取生成器() {
    if (!生成器) 生成器 = 建生成器({ 数据目录 })
    if (!生成器 || typeof 生成器.整理一天 !== 'function') throw new Error('私密日记生成器不可用')
    return 生成器
  }

  function 唤醒() {
    if (!已启用) return Promise.resolve({ 好: true, 已排队: false, 状态: '私密日记自动生成已关闭' })
    let 日期
    try { 日期 = 前一自然日(取现在()) } catch { return Promise.resolve({ 好: false, 已排队: false, 状态: '调度时间无效' }) }
    const 周期 = 周期字(日期)
    if (本次已检查.has(周期)) return Promise.resolve({ 好: true, 已排队: false, 状态: '本次运行已经检查', 周期 })
    if (运行中 && 运行周期 === 周期) return 运行中

    运行周期 = 周期
    运行中 = (async () => {
      try {
        const 结果 = await 取生成器().整理一天({ 日期, 连接: 取连接() })
        本次已检查.add(周期)
        if (结果 && 结果.写入 === true) 记录(`  🔒 私密日记后台完成了 ${周期} 的本机整理`)
        return { ...(结果 || { 好: true }), 已排队: true, 周期 }
      } catch {
        // 不输出原始异常，避免来源、路径或模型响应被带进普通日志；下一次检查可以重试。
        记录('⚠ 私密日记后台失败（不影响启动或聊天）')
        return { 好: false, 已排队: true, 状态: '后台处理失败', 周期 }
      } finally {
        运行中 = null
        运行周期 = ''
      }
    })()
    return 运行中
  }

  function 启动() {
    if (!已启用) return { 已启动: false, 状态: '私密日记自动生成已关闭' }
    if (已启动) return { 已启动: true, 重复: true }
    已启动 = true
    首次计时器 = 设延时(() => { void 唤醒() }, 首次延迟)
    检查计时器 = 设间隔(() => { void 唤醒() }, 检查间隔)
    if (首次计时器 && typeof 首次计时器.unref === 'function') 首次计时器.unref()
    if (检查计时器 && typeof 检查计时器.unref === 'function') 检查计时器.unref()
    return { 已启动: true, 重复: false }
  }

  function 停止() {
    if (首次计时器) 清延时(首次计时器)
    if (检查计时器) 清间隔(检查计时器)
    首次计时器 = null
    检查计时器 = null
    已启动 = false
  }

  function 状态() {
    return { 已启用, 已启动, 正在运行: !!运行中, 运行周期, 本次已检查: [...本次已检查] }
  }

  return { 启动, 停止, 唤醒, 状态 }
}

module.exports = { 创建私密日记调度, 前一自然日 }

