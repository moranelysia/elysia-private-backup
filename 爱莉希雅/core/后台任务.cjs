/** 单实例单时钟拥有所有Node后台触发；执行函数必须在提交前调用检查写入。 */
'use strict'
const { 等待有界 } = require('../脑/任务控制.cjs')
const 所有者们 = new WeakSet()
function 创建后台任务({ 所有者, 任务们 = [], 检查写入 = () => {}, 现在 = Date.now, 设延时 = setTimeout, 清延时 = clearTimeout } = {}) {
  if (!所有者 || typeof 所有者 !== 'object' || 所有者们.has(所有者)) throw new Error('BACKGROUND_OWNER_IN_USE')
  if (!Array.isArray(任务们) || new Set(任务们.map((一) => 一.名字)).size !== 任务们.length || 任务们.some((一) => !/^[a-z][a-z-]{0,31}$/u.test(一.名字) || typeof 一.执行 !== 'function' || !Number.isSafeInteger(一.间隔) || 一.间隔 < 1 || !Number.isSafeInteger(一.首次) || 一.首次 < 0)) throw new Error('BACKGROUND_TASK_INVALID')
  所有者们.add(所有者)
  const 控制 = new AbortController(), 项们 = 任务们.map((一) => ({ ...一, 下次: Infinity, 上次: -Infinity, 待办: false, 次数: 0, 失败数: 0 }))
  let 已启动 = false, 已停止 = false, 计时器 = null, 在途 = null, 停止承诺 = null
  function 清计划() { if (计时器 !== null) 清延时(计时器); 计时器 = null }
  function 检查() { if (已停止 || 控制.signal.aborted) throw new Error('BACKGROUND_STOPPED'); 检查写入() }
  function 安排() {
    清计划(); if (!已启动 || 已停止 || 在途 || !项们.length) return
    const 下次 = Math.min(...项们.map((一) => 一.待办 ? 现在() : 一.下次))
    if (!Number.isFinite(下次)) return
    计时器 = 设延时(() => { 计时器 = null; void 推进() }, Math.max(0, 下次 - 现在()))
    计时器?.unref?.()
  }
  function 推进() {
    if (已停止) return Promise.resolve({ 已停止: true })
    if (在途) return 在途
    const 一 = 项们.find((项) => 项.待办 || (已启动 && 项.下次 <= 现在()))
    if (!一) { 安排(); return Promise.resolve({ 已执行: false }) }
    清计划(); 一.待办 = false; 一.下次 = Infinity; 一.上次 = 现在()
    在途 = Promise.resolve().then(async () => {
      try { 检查(); await 一.执行(Object.freeze({ 中止: 控制.signal, 检查写入: 检查 })); 检查(); 一.次数++ }
      catch { 一.失败数++ }
      finally { if (!已停止) 一.下次 = Math.min(一.下次, 一.仅通知 ? Infinity : 现在() + 一.间隔); 在途 = null; 安排() }
      return { 已执行: true }
    })
    return 在途
  }
  return Object.freeze({
    启动() { if (已停止) throw new Error('BACKGROUND_STOPPED'); if (已启动) return; 已启动 = true; for (const 一 of 项们) 一.下次 = 一.仅通知 ? 一.下次 : Math.min(一.下次, 现在() + 一.首次); 安排() },
    通知(名字, { 延迟 = 0 } = {}) {
      if (已停止) return false
      const 一 = 项们.find((项) => 项.名字 === 名字)
      if (!一 || !Number.isSafeInteger(延迟) || 延迟 < 0 || 延迟 > 86400000) return false
      const 目标 = Math.max(现在() + Math.max(延迟, 一.防抖 || 0), 一.上次 + (一.最小间隔 || 0))
      一.下次 = Math.min(一.下次, 目标); if (目标 <= 现在()) 一.待办 = true
      安排(); return true
    },
    推进,
    停止({ 等待毫秒 = 2000 } = {}) {
      if (停止承诺) return 停止承诺
      if (!Number.isSafeInteger(等待毫秒) || 等待毫秒 < 1 || 等待毫秒 > 60000) throw new Error('BACKGROUND_STOP_BUDGET_INVALID')
      已停止 = true; 清计划(); 控制.abort(); for (const 一 of 项们) 一.待办 = false
      const 超时 = new AbortController(), 钟 = setTimeout(() => 超时.abort(), 等待毫秒)
      停止承诺 = 等待有界(在途, 超时.signal).then(() => ({ 已停止: true, 超时: false }), () => ({ 已停止: true, 超时: true }))
        .finally(() => { clearTimeout(钟); 所有者们.delete(所有者) })
      return 停止承诺
    },
    取状态: () => ({ 已启动, 已停止, 计时器: 计时器 === null ? 0 : 1, 在途: 在途 ? 1 : 0, 任务: 项们.map(({ 名字, 次数, 失败数, 待办 }) => ({ 名字, 次数, 失败数, 待办 })) }),
  })
}
module.exports = { 创建后台任务 }
