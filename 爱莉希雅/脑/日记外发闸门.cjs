/**
 * 日记外发闸门 —— M-34。
 *
 * 未来任何渠道、主动分享、失败重试或离线队列，都只能取得这里生成的
 * shared 白名单载荷。private 在形成载荷之前就被丢弃，不会进入回调、日志或队列。
 */
'use strict'

const { 共享日记投影, 模块名们 } = require('./记忆日记.cjs')

function 是对象(值) { return !!值 && typeof 值 === 'object' && !Array.isArray(值) }
function 截(值, 最长) { return String(值 == null ? '' : 值).trim().replace(/\s+/g, ' ').slice(0, 最长) }
function 正文(值, 最长) { return String(值 == null ? '' : 值).replace(/\r\n?/g, '\n').trim().slice(0, 最长) }
function 深拷贝(值) { return JSON.parse(JSON.stringify(值)) }

function 安全渠道名(值) {
  const 名字 = 截(值, 40)
  if (!名字 || !/^[\p{L}\p{N}._-]+$/u.test(名字)) throw new Error('渠道名称无效')
  return 名字
}

/** 只保留外发所需字段；即使 shared 文件里混入额外字段，也不会跟着出去。 */
function 共享外发记录(原值) {
  const 值 = 共享日记投影(原值)
  if (!值) return null
  const 来源 = (Array.isArray(值.来源) ? 值.来源 : []).slice(0, 120).map((一) => ({
    编号: 截(一 && 一.编号, 160),
    类型: 截(一 && 一.类型, 40),
    时间: 截(一 && 一.时间, 40),
    标题: 截(一 && 一.标题, 160),
    摘要: 正文(一 && 一.摘要, 1200),
  })).filter((一) => 一.编号 && 一.类型 && 一.摘要)
  const 来源编号 = new Set(来源.map((一) => 一.编号))
  const 模块 = (Array.isArray(值.模块) ? 值.模块 : []).slice(0, 模块名们.length).map((一) => ({
    名字: 截(一 && 一.名字, 20),
    正文: 正文(一 && 一.正文, 4000),
    来源: [...new Set((Array.isArray(一 && 一.来源) ? 一.来源 : []).slice(0, 30)
      .map((编号) => 截(编号, 160)).filter((编号) => 来源编号.has(编号)))],
  })).filter((一) => 模块名们.includes(一.名字) && 一.正文 && 一.来源.length)
  if (!模块.length) throw new Error('共享日记没有可核对的外发内容')
  return {
    编号: 截(值.编号, 160),
    类型: 值.类型 === '周' ? '周' : '日',
    周期: 截(值.周期, 40),
    标题: 截(值.标题, 120),
    模块,
    来源,
    生成于: 截(值.生成于, 40),
    修改于: 截(值.修改于, 40),
    用户修改: 值.用户修改 === true,
  }
}

function 构建共享外发载荷({ 渠道, 日记们 } = {}) {
  const 安全渠道 = 安全渠道名(渠道)
  if (!Array.isArray(日记们) || 日记们.length > 200) throw new Error('日记外发数量无效')
  const 共享日记 = []
  for (const 一 of 日记们) {
    const 投影 = 共享外发记录(一)
    if (投影) 共享日记.push(投影)
  }
  if (!共享日记.length) return null
  return { 格式版本: 1, 类型: 'shared_diaries', 渠道: 安全渠道, 日记: 共享日记 }
}

function 创建日记外发闸门(选项 = {}) {
  const 发送 = typeof 选项.发送 === 'function' ? 选项.发送 : null
  const 写日志 = typeof 选项.写日志 === 'function' ? 选项.写日志 : async () => {}
  const 写失败重试 = typeof 选项.写失败重试 === 'function' ? 选项.写失败重试 : null
  const 写离线队列 = typeof 选项.写离线队列 === 'function' ? 选项.写离线队列 : null

  async function 安全日志(事件) {
    try { await 写日志({ 事件: 事件.事件, 渠道: 事件.渠道, 条数: 事件.条数, 错误代码: 事件.错误代码 || '' }) } catch { /* 日志不能改变外发结果 */ }
  }

  async function 外发({ 渠道, 日记们, 在线 = true } = {}) {
    let 载荷
    try {
      载荷 = 构建共享外发载荷({ 渠道, 日记们 })
    } catch {
      await 安全日志({ 事件: '日记外发已拒绝', 渠道: 'unknown', 条数: 0, 错误代码: 'DIARY_GATE_REJECTED' })
      return { 好: false, 状态: '已拒绝', 错误代码: 'DIARY_GATE_REJECTED', 条数: 0 }
    }
    // private-only 请求不触发任何外部回调，也不记录其存在或数量。
    if (!载荷) return { 好: true, 状态: '无共享日记', 条数: 0 }
    const 条数 = 载荷.日记.length
    if (在线 !== true) {
      if (!写离线队列) {
        await 安全日志({ 事件: '共享日记离线队列不可用', 渠道: 载荷.渠道, 条数, 错误代码: 'OFFLINE_QUEUE_UNAVAILABLE' })
        return { 好: false, 状态: '排队不可用', 错误代码: 'OFFLINE_QUEUE_UNAVAILABLE', 条数 }
      }
      try {
        await 写离线队列(深拷贝(载荷))
        await 安全日志({ 事件: '共享日记已进入离线队列', 渠道: 载荷.渠道, 条数 })
        return { 好: true, 状态: '已排队', 条数 }
      } catch {
        await 安全日志({ 事件: '共享日记离线排队失败', 渠道: 载荷.渠道, 条数, 错误代码: 'OFFLINE_QUEUE_FAILED' })
        return { 好: false, 状态: '排队失败', 错误代码: 'OFFLINE_QUEUE_FAILED', 条数 }
      }
    }
    if (!发送) {
      await 安全日志({ 事件: '共享日记发送器不可用', 渠道: 载荷.渠道, 条数, 错误代码: 'CHANNEL_UNAVAILABLE' })
      return { 好: false, 状态: '发送器不可用', 错误代码: 'CHANNEL_UNAVAILABLE', 已保存重试: false, 条数 }
    }
    try {
      await 发送(深拷贝(载荷))
      await 安全日志({ 事件: '共享日记发送成功', 渠道: 载荷.渠道, 条数 })
      return { 好: true, 状态: '已发送', 条数 }
    } catch {
      let 已保存重试 = false
      if (写失败重试) {
        try {
          await 写失败重试({ 错误代码: 'CHANNEL_SEND_FAILED', 载荷: 深拷贝(载荷) })
          已保存重试 = true
        } catch { /* 返回固定错误，不传播可能含私密内容的异常文字 */ }
      }
      await 安全日志({ 事件: '共享日记发送失败', 渠道: 载荷.渠道, 条数, 错误代码: 'CHANNEL_SEND_FAILED' })
      return { 好: false, 状态: '发送失败', 错误代码: 'CHANNEL_SEND_FAILED', 已保存重试, 条数 }
    }
  }

  return { 外发 }
}

module.exports = { 创建日记外发闸门, 构建共享外发载荷, 共享外发记录 }
