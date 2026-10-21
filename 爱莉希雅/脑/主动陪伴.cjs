/**
 * 主动陪伴.cjs —— P1-A 纯本地空闲调度器。
 *
 * 本步只判断“什么时候可以尝试发一条主动文字”，不调用模型、不写聊天记录、
 * 不播放声音。默认关闭；安静时段、每日上限和忙碌避让由程序硬性执行。
 */
'use strict'

const 默认配置 = Object.freeze({
  开启: false,
  最短分钟: 45,
  最长分钟: 120,
  安静时段开启: true,
  安静开始: '23:30',
  安静结束: '08:00',
  每日上限: 3,
  最短间隔分钟: 45,
})

function 整数(值, 默认值, 最小, 最大) {
  const 数 = Math.round(Number(值))
  return Number.isFinite(数) ? Math.max(最小, Math.min(最大, 数)) : 默认值
}

function 时分(值, 默认值) {
  const 命中 = /^(\d{1,2}):(\d{2})$/.exec(String(值 || '').trim())
  if (!命中) return 默认值
  const 时 = Number(命中[1]); const 分 = Number(命中[2])
  if (时 > 23 || 分 > 59) return 默认值
  return `${String(时).padStart(2, '0')}:${String(分).padStart(2, '0')}`
}

function 规范配置(输入 = {}) {
  const 最短 = 整数(输入.最短分钟, 默认配置.最短分钟, 5, 720)
  const 最长 = 整数(输入.最长分钟, 默认配置.最长分钟, 最短, 720)
  return {
    开启: 输入.开启 === true,
    最短分钟: 最短,
    最长分钟: 最长,
    安静时段开启: 输入.安静时段开启 !== false,
    安静开始: 时分(输入.安静开始, 默认配置.安静开始),
    安静结束: 时分(输入.安静结束, 默认配置.安静结束),
    每日上限: 整数(输入.每日上限, 默认配置.每日上限, 1, 12),
    最短间隔分钟: 整数(输入.最短间隔分钟, 默认配置.最短间隔分钟, 5, 720),
  }
}

function 当天(日期) {
  return `${日期.getFullYear()}-${String(日期.getMonth() + 1).padStart(2, '0')}-${String(日期.getDate()).padStart(2, '0')}`
}
function 分钟数(时分值) { const [时, 分] = 时分值.split(':').map(Number); return 时 * 60 + 分 }

function 在安静时段(日期, 配置) {
  if (!配置.安静时段开启) return false
  const 开始 = 分钟数(配置.安静开始); const 结束 = 分钟数(配置.安静结束)
  if (开始 === 结束) return false
  const 现在 = 日期.getHours() * 60 + 日期.getMinutes()
  return 开始 < 结束 ? 现在 >= 开始 && 现在 < 结束 : 现在 >= 开始 || 现在 < 结束
}

function 安静结束时间(日期, 配置) {
  const 结束 = 分钟数(配置.安静结束)
  const 候选 = new Date(日期)
  候选.setHours(Math.floor(结束 / 60), 结束 % 60, 0, 0)
  if (候选.getTime() <= 日期.getTime()) 候选.setDate(候选.getDate() + 1)
  return 候选
}

function 创建调度器(选项 = {}) {
  const 取现在 = typeof 选项.现在 === 'function' ? 选项.现在 : () => new Date()
  const 随机 = typeof 选项.随机 === 'function' ? 选项.随机 : Math.random
  const 设定时器 = typeof 选项.设定时器 === 'function' ? 选项.设定时器 : setTimeout
  const 清除时器 = typeof 选项.清除时器 === 'function' ? 选项.清除时器 : clearTimeout
  const 取运行状态 = typeof 选项.运行状态 === 'function' ? 选项.运行状态 : () => ({})
  const 到期 = typeof 选项.到期 === 'function' ? 选项.到期 : async () => false
  const 账本变了 = typeof 选项.账本变了 === 'function' ? 选项.账本变了 : () => {}
  let 配置 = 规范配置(选项.配置)
  let 时器 = null
  let 最后活动 = new Date(取现在()).getTime()
  let 下次到期 = 0
  let 发送日 = String((选项.账本 || {}).发送日 || '')
  let 今日次数 = 整数((选项.账本 || {}).今日次数, 0, 0, 12)
  let 上次发送 = Number((选项.账本 || {}).上次发送) || 0

  function 清时器() { if (时器 !== null) 清除时器(时器); 时器 = null }
  function 翻日(现在) {
    const 今天 = 当天(现在)
    if (发送日 !== 今天) {
      发送日 = 今天
      今日次数 = 0
      账本变了(账本())
    }
  }
  function 随机等待() {
    const 比例 = Math.max(0, Math.min(0.999999, Number(随机()) || 0))
    return Math.round(配置.最短分钟 + (配置.最长分钟 - 配置.最短分钟) * 比例) * 60000
  }
  function 排到(时间) {
    清时器()
    if (!配置.开启) { 下次到期 = 0; return }
    下次到期 = Math.max(new Date(取现在()).getTime(), Number(时间) || 0)
    const 延迟 = Math.max(0, 下次到期 - new Date(取现在()).getTime())
    时器 = 设定时器(() => { 时器 = null; void 检查() }, 延迟)
    if (时器 && typeof 时器.unref === 'function') 时器.unref()
  }
  function 从活动重排(时间 = new Date(取现在()).getTime()) {
    最后活动 = Number(时间) || new Date(取现在()).getTime()
    if (配置.开启) 排到(最后活动 + 随机等待())
    else { 清时器(); 下次到期 = 0 }
    return 状态()
  }
  function 被挡住(运行) {
    return !运行.有正式对话 || !!运行.临时对话 || !!运行.正在回复 || !!运行.正在用工具 ||
      !!运行.正在录音 || !!运行.正在播放语音 || !!运行.正在编辑 || !!运行.全屏 || !!运行.勿扰
  }
  async function 检查() {
    if (!配置.开启) return { 触发: false, 原因: '已关闭' }
    const 现在 = new Date(取现在())
    const 毫秒 = 现在.getTime()
    if (毫秒 < 下次到期) { 排到(下次到期); return { 触发: false, 原因: '还没到时间' } }
    翻日(现在)
    if (在安静时段(现在, 配置)) {
      排到(安静结束时间(现在, 配置).getTime() + 随机等待())
      return { 触发: false, 原因: '安静时段' }
    }
    if (今日次数 >= 配置.每日上限) {
      const 明天 = new Date(现在); 明天.setDate(明天.getDate() + 1); 明天.setHours(0, 0, 0, 0)
      排到(明天.getTime() + 随机等待())
      return { 触发: false, 原因: '达到每日上限' }
    }
    const 最短间隔 = 配置.最短间隔分钟 * 60000
    if (上次发送 && 毫秒 - 上次发送 < 最短间隔) {
      排到(上次发送 + 最短间隔)
      return { 触发: false, 原因: '距离上次太近' }
    }
    if (被挡住(取运行状态() || {})) {
      排到(毫秒 + 5 * 60000)
      return { 触发: false, 原因: '当前忙碌或不适合打扰' }
    }
    let 已发送 = false
    try { 已发送 = (await 到期({ 空闲分钟: Math.floor((毫秒 - 最后活动) / 60000), 计划时间: 下次到期 })) === true }
    catch { 已发送 = false }
    if (已发送) {
      今日次数++
      发送日 = 当天(现在)
      上次发送 = 毫秒
      账本变了(账本())
      排到(毫秒 + 随机等待())
      return { 触发: true, 原因: '已发送' }
    }
    排到(毫秒 + 15 * 60000)
    return { 触发: false, 原因: '发送失败，稍后重试' }
  }
  function 改配置(新的) {
    配置 = 规范配置({ ...配置, ...(新的 || {}) })
    if (配置.开启) 从活动重排(new Date(取现在()).getTime())
    else { 清时器(); 下次到期 = 0 }
    return 状态()
  }
  async function 立即尝试() {
    if (!配置.开启) return { 触发: false, 原因: '已关闭' }
    下次到期 = new Date(取现在()).getTime()
    return await 检查()
  }
  function 启动() { return 从活动重排(new Date(取现在()).getTime()) }
  function 停止() { 配置 = { ...配置, 开启: false }; 清时器(); 下次到期 = 0; return 状态() }
  function 状态() {
    return { 配置: { ...配置 }, 最后活动, 下次到期, 发送日, 今日次数, 上次发送 }
  }
  function 账本() { return { 发送日, 今日次数, 上次发送 } }
  return { 启动, 停止, 改配置, 用户活动: 从活动重排, 立即尝试, 检查, 状态, 账本 }
}

module.exports = { 默认配置, 规范配置, 在安静时段, 安静结束时间, 创建调度器 }

