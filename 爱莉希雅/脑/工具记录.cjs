/**
 * 工具记录.cjs —— 把内部工具结果收成适合界面检查的短记录。
 *
 * 原始结果可能是一整篇文件或很长的命令输出；窗口只需要近期概况，
 * 所以这里只挑名字、参数、成败和一小段结果，不把整份内容复制进 renderer。
 */
'use strict'

const 工具回执 = require('./工具回执.cjs')

function 变成字(值) {
  if (值 === undefined || 值 === null) return ''
  if (typeof 值 === 'string') return 值
  try {
    return JSON.stringify(值)
  } catch {
    return String(值)
  }
}

function 截短(值, 最多) {
  const 字 = 变成字(值).replace(/\r/g, '').trim()
  if (字.length <= 最多) return 字
  return 字.slice(0, Math.max(0, 最多 - 1)) + '…'
}

function 结果摘要(结果) {
  if (!结果) return '没有收到结果'
  const 候选 = 结果.说明 || 结果.摘要 || 结果.内容 || 结果.路径 || 结果.文件 || ''
  return 截短(候选, 360) || (结果.好 ? '已完成' : '没有更多说明')
}

function 状态说明(结果, 回执) {
  const 原 = 结果 && typeof 结果 === 'object' ? 结果 : {}
  const 说明们 = []
  if (原.材料门槛 && 原.材料门槛.通过 === false && Array.isArray(原.材料门槛.缺少)) {
    说明们.push('材料不足：' + 原.材料门槛.缺少.map((一) => 截短(一, 120)).filter(Boolean).join('；'))
  }
  if (原.冲突检查 && 原.冲突检查.有冲突 && Array.isArray(原.冲突检查.冲突们)) {
    for (const 冲突 of 原.冲突检查.冲突们.slice(0, 3)) {
      const 说明 = 截短(冲突 && 冲突.说明, 240)
      if (说明) 说明们.push('来源冲突：' + 说明)
    }
  }
  if (!说明们.length && 回执 && 回执.错误 && 回执.错误.说明) 说明们.push(回执.错误.说明)
  if (!说明们.length && 回执 && 回执.错误 && 回执.错误.类别) 说明们.push(回执.错误.类别)
  return 截短([...new Set(说明们)].join('\n'), 520)
}

function 整理(工具们, 此刻 = Date.now()) {
  if (!Array.isArray(工具们)) return []
  const 时间 = new Date(此刻).toISOString()
  return 工具们.slice(0, 12).map((一件, 序号) => {
    const 回执 = 工具回执.取(一件)
    return {
    编号: `${此刻}-${序号}`,
    时间,
    名字: 截短(一件 && (一件.名字 || (一件.工具 && 一件.工具.名字)), 40) || '未知工具',
    参数: 截短(一件 && 一件.参数, 240) || '（无参数）',
    成功: 回执.执行状态 === '成功',
    执行状态: 回执.执行状态,
    验证状态: 回执.验证状态,
    目标完成: 回执.目标完成,
    来源: 回执.来源,
    可重试: 回执.可重试,
    重试次数: 回执.重试次数,
    截断: 回执.截断,
    错误类别: 回执.错误.类别,
    状态说明: 状态说明(一件 && 一件.结果, 回执),
    结果摘要: 结果摘要(一件 && 一件.结果),
    }
  })
}

module.exports = { 整理, 截短, 结果摘要, 状态说明 }
