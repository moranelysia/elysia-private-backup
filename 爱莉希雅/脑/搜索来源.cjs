/**
 * 搜索来源.cjs —— 给搜索摘要补上可检查的来源与日期元数据。
 *
 * 这里只根据 URL 域名结构和服务商给出的日期做保守分类。
 * “政府域名”“高校域名”不代表摘要内容已经核实；普通网页也不会因为标题写着
 * “官网”就自动升级为官方来源。正文核对、事实交叉验证和冲突判断留给后续步骤。
 */
'use strict'

const 国际组织域名 = new Set([
  'un.org', 'who.int', 'unesco.org', 'worldbank.org', 'imf.org', 'oecd.org', 'wto.org', 'europa.eu',
])
const 代码平台域名 = new Set(['github.com', 'gitlab.com', 'gitee.com', 'bitbucket.org'])
const 复合公共后缀 = new Set([
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn',
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk',
  'com.au', 'net.au', 'org.au', 'gov.au', 'edu.au',
])

function 是本域或子域(主机, 域名) {
  return 主机 === 域名 || 主机.endsWith('.' + 域名)
}

function 取域名(链接) {
  try {
    const 地址 = new URL(String(链接 || ''))
    if (!['http:', 'https:'].includes(地址.protocol)) return ''
    return 地址小写(地址.hostname)
  } catch { return '' }
}

function 地址小写(值) {
  return String(值 || '').trim().toLowerCase().replace(/\.$/, '')
}

function 来源归属(域名) {
  const 主机 = 地址小写(域名)
  if (!主机) return ''
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(主机) || 主机.includes(':')) return 主机
  const 段 = 主机.split('.').filter(Boolean)
  if (段.length <= 2) return 主机
  const 后两段 = 段.slice(-2).join('.')
  return 复合公共后缀.has(后两段) && 段.length >= 3 ? 段.slice(-3).join('.') : 后两段
}

function 来源类型(域名) {
  const 主机 = 地址小写(域名)
  if (!主机) return '域名无效'
  if (/(^|\.)gov\.[a-z]{2,3}$/.test(主机) || /(^|\.)gov$/.test(主机)) return '政府/公共机构域名'
  if (/(^|\.)(edu|ac)\.[a-z]{2,3}$/.test(主机) || /(^|\.)edu$/.test(主机)) return '高校/科研机构域名'
  if ([...国际组织域名].some((一) => 是本域或子域(主机, 一))) return '国际组织域名'
  if ([...代码平台域名].some((一) => 是本域或子域(主机, 一))) return '代码托管平台'
  return '普通网页（未证明为官网）'
}

function 日期状态(日期) {
  const 文本 = String(日期 || '').trim()
  if (!文本) return '未提供日期'
  if (/(?:刚刚|今天|昨天|前天|\d+\s*(?:分钟|小时|天|周|个月|月|年)前)|(?:just now|today|yesterday|\d+\s*(?:minute|hour|day|week|month|year)s?\s+ago)/i.test(文本)) {
    return '相对日期（待换算）'
  }
  if (/\d{4}\s*[-/.年]\s*\d{1,2}(?:\s*[-/.月]\s*\d{1,2})?/.test(文本) || Number.isFinite(Date.parse(文本))) {
    return '已提供日期（待核对）'
  }
  return '模糊日期（待核对）'
}

function 检查单条(条) {
  const 来源域名 = 取域名(条 && 条.链接)
  return {
    来源域名,
    来源归属: 来源归属(来源域名),
    来源类型: 来源类型(来源域名),
    日期状态: 日期状态(条 && 条.发布日期),
    证据范围: '仅搜索摘要，未读取网页正文',
  }
}

function 评估材料(结果) {
  const 清单 = Array.isArray(结果) ? 结果 : []
  const 检查后 = 清单.map((一) => ({ ...一, ...检查单条(一) }))
  const 域名们 = [...new Set(检查后.map((一) => 一.来源域名).filter(Boolean))]
  const 来源归属们 = [...new Set(检查后.map((一) => 一.来源归属).filter(Boolean))]
  const 有日期数 = 检查后.filter((一) => 一.日期状态 !== '未提供日期').length
  const 类型计数 = {}
  for (const 条 of 检查后) 类型计数[条.来源类型] = (类型计数[条.来源类型] || 0) + 1
  const 日期覆盖 = !检查后.length ? '没有材料'
    : 有日期数 === 0 ? '全部缺日期'
      : 有日期数 === 检查后.length ? '均带日期（仍待核对）' : '部分带日期'
  const 来源覆盖 = 域名们.length <= 1
    ? '单一域名材料'
    : '多域名材料（仍需核对是否独立且结论一致）'
  return {
    结果: 检查后,
    审查: {
      结果数: 检查后.length,
      不同域名数: 域名们.length,
      域名们,
      不同来源数: 来源归属们.length,
      来源归属们,
      有日期数,
      日期覆盖,
      来源覆盖,
      类型计数,
      证据范围: '仅搜索摘要，未读取网页正文',
    },
  }
}

module.exports = { 取域名, 来源归属, 来源类型, 日期状态, 检查单条, 评估材料 }
