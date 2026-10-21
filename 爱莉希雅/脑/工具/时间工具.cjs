/**
 * 时间工具.cjs —— 只读本机时钟。
 *
 * 不联网、不写文件。模型在需要判断“现在、今天、明天、周几、早晚”时主动调用，
 * 避免把聊天记录里几小时前或前一天的时段继续当成现在。
 */
'use strict'

function 补零(数) { return String(数).padStart(2, '0') }

function 时区偏移(日期) {
  const 分钟 = -日期.getTimezoneOffset()
  const 符号 = 分钟 >= 0 ? '+' : '-'
  const 绝对值 = Math.abs(分钟)
  return `UTC${符号}${补零(Math.floor(绝对值 / 60))}:${补零(绝对值 % 60)}`
}

function 读取(给定 = new Date()) {
  const 日期 = 给定 instanceof Date ? new Date(给定.getTime()) : new Date(给定)
  if (!Number.isFinite(日期.getTime())) return { 好: false, 说明: '本机时钟返回了无效时间' }
  const 星期 = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][日期.getDay()]
  const 小时 = 日期.getHours()
  const 时段 = 小时 < 5 ? '凌晨' : 小时 < 9 ? '早上' : 小时 < 12 ? '上午'
    : 小时 < 14 ? '中午' : 小时 < 18 ? '下午' : 小时 < 23 ? '晚上' : '深夜'
  const 日期文字 = `${日期.getFullYear()}-${补零(日期.getMonth() + 1)}-${补零(日期.getDate())}`
  const 时间文字 = `${补零(小时)}:${补零(日期.getMinutes())}:${补零(日期.getSeconds())}`
  return {
    好: true,
    内容: `本机当前时间：${日期文字} ${时间文字}（${星期}，${时段}，${时区偏移(日期)}）。这是刚刚读取的时钟；旧聊天里的“今晚、昨天、明天”要按各条消息的记录时间理解。`,
    数据: { 日期: 日期文字, 时间: 时间文字, 星期, 时段, 时区: 时区偏移(日期) },
  }
}

module.exports = { 读取, 时区偏移 }

